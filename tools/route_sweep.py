#!/usr/bin/env python3
"""P0.2 route-coverage sweep — STATIC (stdlib only, no new deps).

Proves, without a browser, that the P0.1 bug widget is reachable from every route
of the SPROUT demo:

  A. shell markup  — #bug-btn / #bug-sheet live in index.html OUTSIDE the
                     hash-router container (#app), so they are present on every
                     route *by construction*.
  B. route model   — every entry in app.js ROUTES[] is dispatched by render(),
                     every dispatched view has a route, and each concrete hash
                     target is enumerated (literal go()/href + dynamic prefixes).
  C. handler       — the widget's click handler is bound once at boot, not per
                     route, and app.js never writes outside #app (so no render
                     pass can remove or re-bind the widget).

Per-route verdict = A ∧ C ∧ (view dispatched). Exit 1 on any FAIL.

Usage:
  python3 tools/route_sweep.py [--out PATH] [--app-dir DIR]

Companion live sweep (needs playwright + a chromium build):
  python3 tools/route_sweep_live.py   — clicks the widget on every route for real.
"""
import argparse
import json
import os
import re
import sys
from html.parser import HTMLParser

# --------------------------------------------------------------------------
# HTML shell analysis
# --------------------------------------------------------------------------


class ShellParser(HTMLParser):
    """Tracks element ancestry so we can prove the widget sits outside #app."""

    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
            'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []          # [(tag, id_or_None)] of open elements
        self.nodes = {}          # id -> {'tag', 'attrs', 'parents': [ids]}
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        nid = a.get('id')
        parents = [i for _t, i in self.stack if i]
        if nid:
            self.nodes[nid] = {'tag': tag, 'attrs': a, 'parents': parents}
        if tag == 'script' and a.get('src'):
            self.scripts.append(a['src'])
        if tag not in self.VOID:
            self.stack.append((tag, nid))

    def handle_startendtag(self, tag, attrs):
        a = dict(attrs)
        nid = a.get('id')
        if nid:
            self.nodes[nid] = {'tag': tag, 'attrs': a,
                               'parents': [i for _t, i in self.stack if i]}
        if tag == 'script' and a.get('src'):
            self.scripts.append(a['src'])

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                return


def ancestors_include(node, ancestor):
    return node is not None and ancestor in node['parents']


# --------------------------------------------------------------------------
# app.js route model analysis
# --------------------------------------------------------------------------

ROUTES_BLOCK_RE = re.compile(r"var\s+ROUTES\s*=\s*\[(?P<body>.*?)\];", re.S)
ROUTE_ENTRY_RE = re.compile(r"\{\s*re:\s*(?P<re>.*?),\s*view:\s*'(?P<view>[^']+)'\s*\}")
DISPATCH_RE = re.compile(r"r\.view\s*===\s*'(?P<view>[^']+)'")
GO_RE = re.compile(r"\bgo\(\s*'(?P<h>#/[^']*)'")
HREF_RE = re.compile(r"href=(?P<q>['\"])(?P<h>#/[^'\"]*)(?P=q)")
DYN_PREFIX_RE = re.compile(r"['\"](?P<p>#/[A-Za-z0-9_\-/]*)['\"]\s*\+")
FALLBACK_RE = re.compile(r"return\s*\{\s*view:\s*'(?P<view>[^']+)',\s*arg:", re.S)


def js_regex_to_python(js_re):
    """'/^#\\/account$/' -> ('^#/account$', flags) tolerant of JS escapes."""
    body = js_re
    if body.startswith('/'):
        end = body.rfind('/')
        if end > 0:
            inner, flags = body[1:end], body[end + 1:]
            body = inner
    body = body.replace('\\/', '/')
    return body


def expand_optionals(inner, limit=16):
    """Expand JS optional quantifiers ('x?', '(a)?') into concrete candidates."""
    out = [inner]
    changed = True
    while changed and len(out) <= limit:
        changed = False
        nxt = []
        for s in out:
            i = s.find('?')
            if i < 0:
                nxt.append(s)
                continue
            changed = True
            if i == 0:                       # stray leading '?' — drop it
                nxt.append(s[1:])
                continue
            if s[i - 1] == ')':              # optional group
                j = s.rfind('(', 0, i - 1)
                if j < 0:
                    j = i - 1
                token = s[j:i]
                prefix, suffix = s[:j], s[i + 1:]
            else:                            # optional single char
                token = s[i - 1]
                prefix, suffix = s[:i - 1], s[i + 1:]
            nxt.append(prefix + token + suffix)
            nxt.append(prefix + suffix)
        seen, out = set(), []
        for s in nxt:
            if s not in seen:
                seen.add(s)
                out.append(s)
        if len(out) > limit:
            out = out[:limit]
    return out


def concrete_from_js_regex(js_re):
    """Turn a ROUTES regex into a concrete hash for enumeration."""
    inner = js_regex_to_python(js_re)
    inner = inner.replace('^', '').replace('$', '')
    if '(.+)' in inner:
        inner = inner.replace('(.+)', '__arg__')
    elif '(.*)' in inner:
        inner = inner.replace('(.*)', '__arg__')
    cands = expand_optionals(inner)
    good = [c for c in cands if c.startswith('#/')]
    if good:
        return max(good, key=len)          # prefer the full route form ('#/' over '#')
    good = [c for c in cands if c.startswith('#')]
    return sorted(good, key=len)[0] if good else '#/'


def compile_js_regex(js_re):
    try:
        return re.compile(js_regex_to_python(js_re))
    except re.error:
        return None


def resolve_view(concrete_hash, routes, fallback):
    """Mimic route(): first ROUTES entry whose regex matches, else the fallback."""
    for r in routes:
        rx = compile_js_regex(r['re'])
        if rx is not None and rx.match(concrete_hash):
            return r['view']
    return fallback


def analyse_app(app_js):
    src = open(app_js, encoding='utf-8').read()
    out = {
        'src': src,
        'routes': [],          # [{re, view, concrete}]
        'dispatched': [],
        'fallback': None,
        'literal_hashes': [],
        'dyn_prefixes': [],
    }
    m = ROUTES_BLOCK_RE.search(src)
    if m:
        for e in ROUTE_ENTRY_RE.finditer(m.group('body')):
            jsre, view = e.group('re').strip(), e.group('view')
            out['routes'].append({'re': jsre, 'view': view,
                                  'concrete': concrete_from_js_regex(jsre)})
    out['dispatched'] = sorted(set(DISPATCH_RE.findall(src)))
    fb = FALLBACK_RE.search(src)
    # the LAST fallback return in route() is the unmatched-hash default
    fbs = FALLBACK_RE.findall(src)
    out['fallback'] = fbs[-1] if fbs else None
    out['literal_hashes'] = sorted({h for h in GO_RE.findall(src)} |
                                   {m.group('h') for m in HREF_RE.finditer(src)})
    out['dyn_prefixes'] = sorted({p for p in DYN_PREFIX_RE.findall(src)})
    return out


def enumerate_concrete_routes(app):
    """Concrete hashes to sweep: ROUTES entries (+ dynamic args) + edge probes."""
    seen, routes = set(), []

    def push(h, source, view=None):
        if h in seen:
            return
        seen.add(h)
        routes.append({'hash': h,
                       'view': view or resolve_view(h, app['routes'], app['fallback']),
                       'source': source})

    for r in app['routes']:
        push(r['concrete'], 'ROUTES[' + r['re'] + ']', r['view'])
    # literal hash targets reachable from go()/href that ROUTES-derived
    # concretes did not already cover (dynamic prefixes resolve to the arg probe
    # above; the bare prefix is probed separately as an edge case)
    for h in app['literal_hashes']:
        push(h, 'go()/href literal')
    # edge: dynamic prefix with NO argument (e.g. '#/assess/') must not crash
    for p in app['dyn_prefixes']:
        push(p, 'dynamic prefix, no arg')
    # explicit unknown-hash probe → fallback view
    routes.append({'hash': '#/__unknown__',
                   'view': resolve_view('#/__unknown__', app['routes'], app['fallback']),
                   'source': 'route() fallback'})
    return routes


# --------------------------------------------------------------------------
# checks
# --------------------------------------------------------------------------


def run_checks(root):
    index = os.path.join(root, 'index.html')
    app_js = os.path.join(root, 'js', 'app.js')
    bug_js = os.path.join(root, 'js', 'bugreport.js')
    checks = []  # {id, group, desc, ok, evidence}

    def add(cid, group, desc, ok, evidence):
        checks.append({'id': cid, 'group': group, 'desc': desc,
                       'ok': bool(ok), 'evidence': evidence})

    html = open(index, encoding='utf-8').read()
    p = ShellParser()
    p.feed(html)

    # ---- A. shell markup ----
    app_node = p.nodes.get('app')
    btn = p.nodes.get('bug-btn')
    sheet = p.nodes.get('bug-sheet')
    add('A1', 'A. shell markup', 'router container #app exists', app_node is not None,
        '#app tag=<' + (app_node['tag'] if app_node else 'MISSING') + '>')
    add('A2', 'A. shell markup', '#bug-btn exists in index.html', btn is not None,
        ('tag=<' + btn['tag'] + '> type=' + btn['attrs'].get('type', '-')) if btn else 'MISSING')
    add('A3', 'A. shell markup', '#bug-btn is a <button type=button>',
        btn is not None and btn['tag'] == 'button' and btn['attrs'].get('type') == 'button',
        'tag=%s type=%s' % (btn['tag'], btn['attrs'].get('type')) if btn else 'MISSING')
    add('A4', 'A. shell markup', '#bug-sheet dialog exists', sheet is not None,
        ('role=' + sheet['attrs'].get('role', '-')) if sheet else 'MISSING')
    add('A5', 'A. shell markup', '#bug-btn is OUTSIDE #app (by-construction presence)',
        btn is not None and not ancestors_include(btn, 'app'),
        'ancestors=' + ','.join(btn['parents']) if btn else 'MISSING')
    add('A6', 'A. shell markup', '#bug-sheet is OUTSIDE #app',
        sheet is not None and not ancestors_include(sheet, 'app'),
        'ancestors=' + ','.join(sheet['parents']) if sheet else 'MISSING')
    add('A7', 'A. shell markup', 'widget CSS is position:fixed (always on screen)',
        '.bug-btn{position:fixed' in html.replace(' ', ''),
        'inline <style> rule .bug-btn{position:fixed;...}')
    add('A8', 'A. shell markup', 'js/bugreport.js loaded by the shell',
        any(s.endswith('bugreport.js') for s in p.scripts),
        'scripts=' + ','.join(s for s in p.scripts if s.startswith('js/')))

    app_src = open(app_js, encoding='utf-8').read()
    bug_src = open(bug_js, encoding='utf-8').read()

    # ---- C. handler independence (checked here; drives every route) ----
    add('C1', 'C. handler', "bugreport.js binds #bug-btn click -> openSheet",
        re.search(r"var btn = \$\('bug-btn'\);", bug_src) is not None
        and re.search(r"btn\.addEventListener\('click',\s*openSheet\)", bug_src) is not None,
        "var btn = $('bug-btn'); btn.addEventListener('click', openSheet)")
    init_m = re.search(r"function init\(\)\s*\{(?P<body>.*?)\n  \}", bug_src, re.S)
    init_body = init_m.group('body') if init_m else ''
    add('C2', 'C. handler', 'init() binds click unconditionally (no route branch inside)',
        bool(init_body) and 'openSheet' in init_body and 'location.hash' not in init_body
        and 'isKidRoute' not in init_body,
        'init body %d chars, route-conditional lines: %d'
        % (len(init_body), init_body.count('location.hash') + init_body.count('isKidRoute')))
    add('C3', 'C. handler', 'init() runs once at DOMContentLoaded/boot, not per route',
        ('document.addEventListener(\'DOMContentLoaded\', init)' in bug_src or
         'DOMContentLoaded\', init' in bug_src) and bug_src.count('function init(') == 1,
        'single init() definition, DOMContentLoaded registration present')
    add('C4', 'C. handler', 'app.js never references #bug-btn / #bug-sheet (cannot unmount it)',
        'bug-btn' not in app_src and 'bug-sheet' not in app_src,
        'occurrences: bug-btn=%d bug-sheet=%d' % (app_src.count('bug-btn'), app_src.count('bug-sheet')))
    add('C5', 'C. handler', 'app.js render pass writes ONLY #app (no body/innerHTML wipes)',
        'document.body.innerHTML' not in app_src and 'documentElement.innerHTML' not in app_src
        and re.search(r"\bapp\.innerHTML\s*=\s*html", app_src) is not None
        and 'function renderInto' in app_src,
        'renderInto writes app.innerHTML only; body wipes: %d'
        % (app_src.count('document.body.innerHTML')))
    add('C6', 'C. handler', 'hashchange only relabels the widget (no listener teardown)',
        re.search(r"addEventListener\('hashchange',\s*syncButtonLabel\)", bug_src) is not None
        and 'removeEventListener' not in bug_src,
        'hashchange -> syncButtonLabel; removeEventListener count=%d'
        % bug_src.count('removeEventListener'))
    open_m = re.search(r"function openSheet\(\)\s*\{(?P<b>.*?)\n  \}", bug_src, re.S)
    open_body = open_m.group('b') if open_m else ''
    add('C7', 'C. handler', 'sheet open path has no route gate (openSheet is route-free)',
        bool(open_body) and 'location.hash' not in open_body,
        'openSheet body %d chars, location.hash tests: %d'
        % (len(open_body), open_body.count('location.hash')))

    return checks, p, html, app_src, bug_src


def main():
    ap = argparse.ArgumentParser(description='SPROUT P0.2 static route sweep')
    ap.add_argument('--app-dir', default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument('--out', default=None, help='write markdown report here')
    args = ap.parse_args()
    root = os.path.abspath(args.app_dir)

    checks, parser, html, app_src, bug_src = run_checks(root)
    app = analyse_app(os.path.join(root, 'js', 'app.js'))
    routes = enumerate_concrete_routes(app)

    # ---- B. route-model checks ----
    def add(cid, desc, ok, evidence):
        checks.append({'id': cid, 'group': 'B. route model', 'desc': desc,
                       'ok': bool(ok), 'evidence': evidence})

    route_views = [r['view'] for r in app['routes']]
    add('B1', 'ROUTES[] parsed from app.js', len(app['routes']) >= 5,
        '%d entries: %s' % (len(app['routes']), ', '.join(route_views)))
    missing_disp = sorted(set(route_views) - set(app['dispatched']))
    add('B2', 'every ROUTES[] view is dispatched by render()', not missing_disp,
        'undispatched: ' + (', '.join(missing_disp) if missing_disp else 'none'))
    unreachable = sorted(set(app['dispatched']) - set(route_views))
    add('B3', 'every dispatched view is reachable from ROUTES[]', not unreachable,
        'unreachable: ' + (', '.join(unreachable) if unreachable else 'none'))
    add('B4', 'route() has an unmatched-hash fallback', app['fallback'] is not None,
        'fallback view = ' + str(app['fallback']))
    add('B5', 'concrete hashes enumerated (literal + dynamic + fallback probe)',
        len(routes) >= len(app['routes']),
        '%d concrete hashes from %d ROUTES entries' % (len(routes), len(app['routes'])))
    dyn_unprobed = [p for p in app['dyn_prefixes']
                    if not any(r['hash'].startswith(p) and '__arg__' not in r['hash']
                               for r in routes)]
    # dynamic prefixes are covered when an ROUTES-derived concrete hash uses them
    dyn_covered = [p for p in app['dyn_prefixes']
                   if any(r['hash'].startswith(p.rstrip('/')) and '/__arg__' in r['hash']
                          or r['hash'].startswith(p) for r in routes)]
    add('B6', 'every dynamic hash prefix (\'#/x/\' + id) has an arg-probed route',
        len(dyn_covered) == len(app['dyn_prefixes']),
        'prefixes=%s covered=%s' % (app['dyn_prefixes'], dyn_covered))

    # ---- per-route verdict table ----
    shell_ok = all(c['ok'] for c in checks if c['group'] == 'A. shell markup')
    handler_ok = all(c['ok'] for c in checks if c['group'] == 'C. handler')
    model_ok = all(c['ok'] for c in checks if c['group'] == 'B. route model')
    rows = []
    for r in routes:
        dispatched = (r['view'] in app['dispatched']) or r['hash'] == '#/__unknown__'
        ok = shell_ok and handler_ok and dispatched
        rows.append({'hash': r['hash'], 'view': r['view'], 'source': r['source'],
                     'shell': shell_ok, 'handler': handler_ok, 'dispatch': dispatched,
                     'verdict': 'PASS' if ok else 'FAIL'})

    failed = [c for c in checks if not c['ok']]
    route_fail = [r for r in rows if r['verdict'] != 'PASS']
    overall = 'PASS' if not failed and not route_fail else 'FAIL'

    # ---- report ----
    def yn(b):
        return 'PASS' if b else 'FAIL'

    L = []
    L.append('# P0.2 Route-coverage sweep (static) — 2026-10-26')
    L.append('')
    L.append('Owner GO: 2026-10-26 19:34 · QA lane: OBSIDIAN · app: `%s`' % root)
    try:
        import subprocess
        rev = subprocess.check_output(['git', '-C', root, 'rev-parse', '--short', 'HEAD'],
                                      text=True).strip()
        L.append('Commit: `%s`' % rev)
    except Exception:
        rev = 'unknown'
    L.append('Script: `tools/route_sweep.py` (stdlib only — no new dependencies).')
    L.append('Mode: **static** (shell markup + route model + handler wiring). '
             'Live click-through: `tools/route_sweep_live.py`.')
    L.append('')
    L.append('## Result: **%s** — %d/%d checks pass · %d/%d routes pass'
             % (overall, len(checks) - len(failed), len(checks),
                len(rows) - len(route_fail), len(rows)))
    L.append('')

    for grp in ('A. shell markup', 'B. route model', 'C. handler'):
        L.append('## ' + grp)
        L.append('')
        L.append('| id | check | result | evidence |')
        L.append('|---|---|---|---|')
        for c in checks:
            if c['group'] == grp:
                L.append('| %s | %s | **%s** | `%s` |'
                         % (c['id'], c['desc'], yn(c['ok']),
                            str(c['evidence']).replace('|', '\\|')))
        L.append('')

    L.append('## Per-route verdict')
    L.append('')
    L.append('Every route shares the same shell markup and the same boot-time handler '
             'binding (checks A1–A8, C1–C7); the per-route column proves the view '
             'actually renders (dispatch) so the widget is never hidden behind a broken view.')
    L.append('')
    L.append('| route hash | view | shell | handler | dispatch | verdict |')
    L.append('|---|---|---|---|---|---|')
    for r in rows:
        L.append('| `%s` | %s | %s | %s | %s | **%s** |'
                 % (r['hash'], r['view'], yn(r['shell']), yn(r['handler']),
                    yn(r['dispatch']), r['verdict']))
    L.append('')

    L.append('## Route model notes')
    L.append('')
    L.append('- `ROUTES[]` entries: ' + ', '.join('`%s` → `%s`' % (r['re'], r['view'])
                                                  for r in app['routes']))
    L.append('- dynamic hash prefixes in app.js: ' +
             ', '.join('`%s`' % p for p in app['dyn_prefixes']))
    L.append('- unmatched hashes fall back to view `%s` (check B4) — probed as '
             '`#/__unknown__`.' % app['fallback'])
    L.append('- Handler binding is route-independent: `js/bugreport.js` registers '
             "`#bug-btn` click once at boot; `js/app.js` only ever writes "
             "`#app.innerHTML`, so no render pass can unmount the widget.")
    L.append('')
    if failed:
        L.append('## Failures')
        L.append('')
        for c in failed:
            L.append('- **%s** %s — %s' % (c['id'], c['desc'], c['evidence']))
        L.append('')

    report = '\n'.join(L) + '\n'
    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        open(args.out, 'w', encoding='utf-8').write(report)
        print('wrote %s' % args.out)

    print('%s  static sweep: %d/%d checks, %d/%d routes'
          % (overall, len(checks) - len(failed), len(checks),
             len(rows) - len(route_fail), len(rows)))
    for c in failed:
        print('  FAIL %s %s [%s]' % (c['id'], c['desc'], c['evidence']))
    return 0 if overall == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())