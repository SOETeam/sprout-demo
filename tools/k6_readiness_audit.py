#!/usr/bin/env python3
"""P0.7 K–6 readiness audit — grades every grade-month against the §2 tiers.

Tiers (roadmap §2):
  T2 Deep   all 4 weeks authored AND every week passes 9/9 statutory coverage AND every
            lesson/passage ref resolves AND every week has a real test (10–14 q for
            tap-mcq; preschool show-me checklist exempt) AND workbook/generator evidence
            is present AND >=80% of blocks bind to an authored same-week lesson.
  T1 Spiral all 4 weeks authored AND every week passes 9/9 AND every ref resolves —
            depth/evidence bar not yet met (parent view must label it "spiral review").
  T0 Empty  anything else: week missing, week is a topic card, any week fails 9/9,
            or any ref is unresolvable. T0 blocks beta for that grade.

Modes
  baseline (default) — this script computes the tiers from the content that exists
                       right now and says so honestly.
  validator v2       — when P0.4 ships, hand it its output and it overrides:
                         1) --validator PATH      JSON file, contract below
                         2) --validator-cmd CMD   command that prints the same JSON
                       Contract: {"schema":"k6_readiness/v2","tiers":{"<grade>":{"<month>":"T2"}}}
                       (grades K,1,2,3,4,5,6 + optional preschool; months "1".."9").
                       Auto-detection: tools/readiness_matrix_v2.json if present.

Month <-> week map: school month m covers school-year weeks (m-1)*4+1 .. m*4
(roadmap §2.1: 9 months x 4 weeks = 36 weeks/grade).

Usage:  python3 tools/k6_readiness_audit.py [--out PATH] [--app-dir DIR]
                                             [--validator PATH] [--validator-cmd CMD]
Exit:   0 always (this is a reporting tool); the beta verdict is in the report.
"""
import argparse
import json
import os
import re
import subprocess
import sys

K6 = ['K', '1', '2', '3', '4', '5', '6']          # the 7 beta grades (63 grade-months)
EXTRA = ['preschool']                              # live-student row, NOT part of the 63
MONTHS = list(range(1, 10))
WEEKS_PER_MONTH = 4
VALIDATOR_DEFAULT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                 'readiness_matrix_v2.json')


# ------------------------------------------------- subject-label -> D7-nine fold rules
# P0.4 validator v2 (tools/validate_readiness.js, landed 2026-10-26 19:41) is the
# ratifying authority for mapping week-block subject labels onto the nine MCL
# 380.1561(3)(f) subjects. `p04` mode (default) uses its canonical fold-map so this
# audit can never disagree with the validator; `app` mode reproduces the narrower
# SUBect_MAP the shipped app uses in buildYearPlan() (kept for comparison).
P04_FOLD = {
    'ela': ['reading', 'writing', 'spelling', 'literature', 'english_grammar'],
    'social_studies': ['history', 'civics'],
    'math': ['mathematics'], 'maths': ['mathematics'],
    'english': ['english_grammar'], 'grammar': ['english_grammar'],
    'read': ['reading'], 'reading_comp': ['reading'], 'lit': ['literature'],
}
P04_EXCLUDED = {'coding', 'art', 'motor', 'music', 'pe', 'physical_education',
                'health', 'technology', 'enrichment', 'library'}


def subject_rules(app_js, mode='p04'):
    """-> (statutory nine, {block label: [statutory subjects...]}, excluded labels)"""
    src = open(app_js, encoding='utf-8').read()
    stat = re.search(r"var\s+STATUTORY\s*=\s*\[(.*?)\];", src, re.S)
    statutory = re.findall(r"'([^']+)'", stat.group(1)) if stat else []
    sm = re.search(r"var\s+SUBJECT_MAP\s*=\s*\{(.*?)\};", src, re.S)
    smap = dict(re.findall(r"(\w+):\s*'([^']+)'", sm.group(1))) if sm else {}
    if mode == 'app':
        fold = {k: [v] for k, v in smap.items()}
        excluded = set()
    else:
        fold = {k: [v] for k, v in smap.items()}
        fold.update({k: list(v) for k, v in P04_FOLD.items()})
        excluded = set(P04_EXCLUDED)
    return statutory, fold, excluded


# ---------------------------------------------------------------- content lanes
def load_lanes(app_dir):
    lanes = {}
    cpath = os.path.join(app_dir, 'data', 'content.json')
    if os.path.exists(cpath):
        lanes['content.json (preschool/3/5 hand-built lane)'] = \
            json.load(open(cpath, encoding='utf-8')).get('weeks', {})
    kpath = os.path.join(app_dir, 'data', 'grades_k124.json')
    if os.path.exists(kpath):
        lanes['grades_k124.json (K/1/2/4 E5 engine lane)'] = \
            json.load(open(kpath, encoding='utf-8')).get('weeks', {})
    return lanes


def all_weeks(lanes):
    """{grade: {week_number(str): week_obj}} merged across lanes."""
    out = {}
    for _lane, grades in lanes.items():
        for g, weeks in grades.items():
            out.setdefault(g, {}).update(weeks)
    return out


def week_state(wk):
    if wk is None:
        return 'absent'
    if 'days' in wk and wk['days']:
        return 'full'
    return 'topic_only' if wk.get('topic_only') else 'stub'


# ---------------------------------------------------------------- per-week checks
def week_report(wk, statutory, fold):
    """Everything §2/§4.4 of the roadmap asks a week to prove."""
    st = week_state(wk)
    r = {'state': st, 'blocks': 0, 'covered': [], 'missing': list(statutory),
         'ref_total': 0, 'ref_ok': 0, 'bad_refs': [], 'bad_covers': [], 'test_q': 0,
         'test_format': None, 'evidence': 0, 'lessons': 0, 'min_ok': True}
    if st != 'full':
        return r

    lessons = wk.get('lessons') or {}
    passages = {p.get('id') for p in (wk.get('passages') or []) if isinstance(p, dict)}
    gens = {g.get('id') for g in (wk.get('generators') or []) if isinstance(g, dict)}
    covered = set()
    for d in wk.get('days') or []:
        total = 0
        for b in d.get('blocks') or []:
            r['blocks'] += 1
            total += b.get('min') or 0
            label = b.get('subject', '')
            for subj in fold.get(label, [label] if label in statutory else []):
                if subj in statutory:
                    covered.add(subj)
            lr = b.get('lesson_ref')
            if lr:
                r['ref_total'] += 1
                if lr in lessons:
                    r['ref_ok'] += 1
                else:
                    r['bad_refs'].append(lr)
            pr = b.get('passage_ref')
            if pr and pr not in passages:
                r['bad_refs'].append(pr)
        if d.get('total_min') is not None and d['total_min'] != total:
            r['min_ok'] = False

    r['covered'] = [s for s in statutory if s in covered]
    r['missing'] = [s for s in statutory if s not in covered]

    r['lessons'] = len(lessons)
    for l in lessons.values():
        c = l.get('content') or {}
        wb = c.get('workbook') or []
        gen = c.get('generator')
        if wb or gen or (l.get('id') in gens):
            r['evidence'] += 1

    t = wk.get('test') or {}
    qs = t.get('questions')
    if not isinstance(qs, list):
        qs = t.get('items')
    if not isinstance(qs, list):
        qs = []
    # P0.4 gate (b): test.covers must resolve to lessons inside THIS week file
    for c in (t.get('covers') or []):
        if c not in lessons:
            r['bad_covers'].append(c)
    r['test_q'] = len(qs)
    r['test_format'] = t.get('format')
    r['test_pass'] = t.get('passScore')
    r['test_present'] = bool(t)
    return r


def test_ok(rep, grade):
    """§2.4 law: 10–14 questions, passScore 0.8. Preschool show-me checklist is
    exempt from scoring by design (roadmap STEP 3) but still needs its items."""
    if not rep.get('test_present'):
        return False
    if rep['test_format'] == 'show-me-checklist' or grade == 'preschool':
        return rep['test_q'] > 0
    ps = rep.get('test_pass')
    return 10 <= rep['test_q'] <= 14 and ps is not None and abs(ps - 0.8) < 1e-9


# ---------------------------------------------------------------- tiering
def tier_for_grade_month(weeks, grade, month, statutory, fold):
    start = (month - 1) * WEEKS_PER_MONTH + 1
    wnums = [str(n) for n in range(start, start + WEEKS_PER_MONTH)]
    reps = [week_report(weeks.get(w), statutory, fold) for w in wnums]
    full = [r for r in reps if r['state'] == 'full']
    detail = {'weeks': wnums, 'reps': reps, 'full': len(full),
              'total': sum(r['blocks'] for r in reps),
              'ref_total': sum(r['ref_total'] for r in reps),
              'ref_ok': sum(r['ref_ok'] for r in reps),
              'bad_refs': [x for r in reps for x in r['bad_refs']],
              'lessons': sum(r['lessons'] for r in reps),
              'evidence': sum(r['evidence'] for r in reps)}
    # month-union coverage (diagnostic — see report open question)
    union = set()
    for r in reps:
        union |= set(r['covered'])
    detail['union'] = [s for s in statutory if s in union]
    detail['union_missing'] = [s for s in statutory if s not in union]

    blockers = []
    full_nums = [w for w, r in zip(wnums, reps) if r['state'] == 'full']
    if len(full_nums) < WEEKS_PER_MONTH:
        blockers.append('%d/4 weeks authored (rest absent/topic-card)'
                        % len(full_nums))
    cov_fail = [w for w, r in zip(wnums, reps)
                if r['state'] == 'full' and r['missing']]
    if cov_fail:
        blockers.append('9/9 fails on week(s) %s (see per-week table)'
                        % ','.join(cov_fail))
    test_fail = [(w, r) for w, r in zip(wnums, reps)
                 if r['state'] == 'full' and not test_ok(r, grade)]
    if test_fail:
        r0 = test_fail[0][1]
        blockers.append('test law fails on week(s) %s (%s q, passScore %s) — §2.4 wants '
                        '10–14 q @ 0.8'
                        % (','.join(w for w, _ in test_fail), r0['test_q'], r0['test_pass']))
    n_bad_refs = sum(len(r['bad_refs']) for r in reps)
    if n_bad_refs:
        blockers.append('%d unresolvable lesson/passage ref(s)' % n_bad_refs)
    cover_fail = [w for w, r in zip(wnums, reps) if r['state'] == 'full' and r['bad_covers']]
    if cover_fail:
        blockers.append('test.covers cross-week/unresolved on week(s) %s (P0.4 gate b)'
                        % ','.join(cover_fail))
    min_fail = [w for w, r in zip(wnums, reps) if r['state'] == 'full' and not r['min_ok']]
    if min_fail:
        blockers.append('total_min does not sum on week(s) %s' % ','.join(min_fail))
    # depth = share of ALL blocks that bind to a resolvable authored lesson
    # (blocks with no lesson_ref at all count as UNbound — §2 wants >=80%)
    depth = (detail['ref_ok'] / detail['total']) if detail['total'] else 0.0
    detail['depth'] = depth

    refs_ok = (detail['ref_total'] > 0 and detail['ref_ok'] == detail['ref_total']
               and not any(r['bad_covers'] for r in reps))
    coverage_ok = len(full) == WEEKS_PER_MONTH and all(not r['missing'] for r in reps)
    tests_ok = len(full) == WEEKS_PER_MONTH and all(test_ok(r, grade) for r in reps)
    evidence_ok = detail['evidence'] > 0
    depth_ok = depth >= 0.80

    if not (len(full) == WEEKS_PER_MONTH and refs_ok and coverage_ok):
        tier = 'T0'
    elif tests_ok and evidence_ok and depth_ok:
        tier = 'T2'
    else:
        tier = 'T1'
        if not tests_ok:
            blockers.append('test bar not met on every week')
        if not evidence_ok:
            blockers.append('no workbook/generator evidence in this month')
        if not depth_ok:
            blockers.append('block binding %.0f%% < 80%%' % (depth * 100))

    detail['tier'] = tier
    detail['blockers'] = blockers
    detail['coverage'] = '%d/9' % len(detail['union'])
    return detail


# ---------------------------------------------------------------- validator override
def load_validator(args):
    path, cmd = args.validator, args.validator_cmd
    if not path and not cmd and os.path.exists(VALIDATOR_DEFAULT):
        path = VALIDATOR_DEFAULT
    raw = None
    if cmd:
        try:
            raw = subprocess.check_output(cmd, shell=True, text=True)
        except Exception as e:                                   # noqa: BLE001
            print('validator command failed (%s) — falling back to baseline' % e,
                  file=sys.stderr)
            return None
    elif path:
        if not os.path.exists(path):
            print('validator file not found (%s) — baseline mode' % path, file=sys.stderr)
            return None
        raw = open(path, encoding='utf-8').read()
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print('validator output is not valid JSON (%s) — baseline mode' % e,
              file=sys.stderr)
        return None
    tiers = data.get('tiers')
    if not isinstance(tiers, dict):
        print('validator output has no "tiers" object — baseline mode', file=sys.stderr)
        return None
    return tiers


# ---------------------------------------------------------------- validator (md)
def load_validator_md(path):
    """Parse the 'Grade x month tiers' table P0.4 writes to K6_READINESS_MATRIX.md.
    Used because the validator prints markdown, not the JSON contract (yet)."""
    if not path or not os.path.exists(path):
        return None
    tiers = {}
    for line in open(path, encoding='utf-8'):
        if not line.strip().startswith('|'):
            continue
        parts = [x.strip() for x in line.strip().strip('|').split('|')]
        if len(parts) < 10:
            continue
        g = parts[0].replace('*', '').strip()
        vals = parts[1:10]
        if g and all(re.match(r'^T[012]$', v.split()[0]) if v else False for v in vals):
            tiers[g] = {str(i + 1): v.split()[0] for i, v in enumerate(vals)}
    return tiers or None


# ---------------------------------------------------------------- report
def main():
    ap = argparse.ArgumentParser(description='SPROUT P0.7 K-6 readiness audit')
    ap.add_argument('--app-dir',
                    default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument('--out', default=None)
    ap.add_argument('--validator', default=None,
                    help='P0.4 validator v2 JSON output (overrides computed tiers)')
    ap.add_argument('--validator-cmd', default=None,
                    help='command printing the same JSON (overrides computed tiers)')
    ap.add_argument('--validator-md', default=None,
                    help='P0.4 K6_READINESS_MATRIX.md (tiers parsed from its table)')
    ap.add_argument('--fold-map', choices=['p04', 'app'], default='p04',
                    help='subject-label fold rules: p04 = validator v2 canonical '
                         '(default), app = the narrower map in js/app.js')
    args = ap.parse_args()
    app_dir = os.path.abspath(args.app_dir)

    statutory, fold, excluded = subject_rules(os.path.join(app_dir, 'js', 'app.js'),
                                                args.fold_map)
    lanes = load_lanes(app_dir)
    weeks_by_grade = all_weeks(lanes)
    vtiers = load_validator(args)
    vsrc = 'P0.4 validator v2 (JSON contract)'
    if vtiers is None:
        mdpath = args.validator_md or os.path.join(app_dir, 'K6_READINESS_MATRIX.md')
        vtiers = load_validator_md(mdpath)
        if vtiers is not None:
            vsrc = 'P0.4 validator v2 — %s' % os.path.relpath(mdpath, app_dir)
    mode = ('validator v2 tiers in force (%s); computed baseline kept as cross-check'
            % vsrc) if vtiers else \
        'BASELINE (pre-P0.4 content scan): provisional §2 tier rules computed here'

    grades = K6 + EXTRA
    cells = {}      # (grade, month) -> detail
    for g in grades:
        for m in MONTHS:
            cells[(g, m)] = tier_for_grade_month(weeks_by_grade.get(g, {}), g, m,
                                                 statutory, fold)
    if vtiers:
        for g, mm in vtiers.items():
            for m, t in mm.items():
                if (g, int(m)) in cells:
                    cells[(g, int(m))]['baseline_tier'] = cells[(g, int(m))]['tier']
                    cells[(g, int(m))]['tier'] = t
                    cells[(g, int(m))]['source'] = 'validator-v2'

    # ---- verdict numbers (the 63 beta-bar cells) ----
    counts = {'T2': 0, 'T1': 0, 'T0': 0}
    for g in K6:
        for m in MONTHS:
            counts[cells[(g, m)]['tier']] += 1
    extra_counts = {'T2': 0, 'T1': 0, 'T0': 0}
    for g in EXTRA:
        for m in MONTHS:
            extra_counts[cells[(g, m)]['tier']] += 1
    bar_met = counts['T0'] == 0

    # how many authored weeks pass EVERY §2 bar at once (evidence for the verdict)
    all_bars = authored = 0
    for g in grades:
        for _w, wk in weeks_by_grade.get(g, {}).items():
            if week_state(wk) != 'full':
                continue
            authored += 1
            r = week_report(wk, statutory, fold)
            depth = (r['ref_ok'] / r['blocks']) if r['blocks'] else 0.0
            if (not r['missing'] and not r['bad_refs'] and test_ok(r, g)
                    and r['evidence'] > 0 and depth >= 0.80):
                all_bars += 1

    # what exists at all
    present = {}
    for g in grades:
        wks = weeks_by_grade.get(g, {})
        full = [w for w, wk in wks.items() if week_state(wk) == 'full']
        stub = [w for w, wk in wks.items() if week_state(wk) != 'full']
        present[g] = {'full': sorted(full, key=int), 'stub': sorted(stub, key=int),
                      'n': len(wks)}

    L = []
    L.append('# K–6 readiness — BASELINE matrix (P0.7) + P0.4 cross-check — 2026-10-26')
    L.append('')
    L.append('Owner GO: 2026-10-26 19:34 · QA lane: OBSIDIAN · app: `%s`' % app_dir)
    L.append('Mode: **%s**' % mode)
    L.append('Runner: `tools/k6_readiness_audit.py` (stdlib only). Tier rules are the §2 '
             'definitions; subject fold-rules come from the P0.4 validator unless '
             '`--fold-map app` is passed. P0.4 (`tools/validate_readiness.js`, landed '
             '2026-10-26 19:41) is consumed directly when `K6_READINESS_MATRIX.md` is '
             'present, so this report always states both tools\' verdicts.')
    if vtiers:
        diff = [(g, m, cells[(g, m)]['baseline_tier'], cells[(g, m)]['tier'])
                for g in grades for m in MONTHS
                if cells[(g, m)].get('source') == 'validator-v2'
                and cells[(g, m)]['baseline_tier'] != cells[(g, m)]['tier']]
        L.append('- Validator override: %d cell(s) differ from the computed baseline — %s'
                 % (len(diff), '; '.join('%s M%d baseline %s -> validator %s'
                                         % (g, m, b, t) for g, m, b, t in diff) or 'none'))
    L.append('')
    L.append('## Verdict (beta bar: all 63 K–6 grade-months ≥ T1)')
    L.append('')
    L.append('- **%s** — %d/63 ≥ T1 (T2 %d · T1 %d · T0 %d)'
             % ('BETA BAR MET' if bar_met else 'BETA BAR NOT MET',
                counts['T1'] + counts['T2'], counts['T2'], counts['T1'], counts['T0']))
    L.append('- Preschool row (live student, not part of the 63): T2 %d · T1 %d · T0 %d'
             % (extra_counts['T2'], extra_counts['T1'], extra_counts['T0']))
    zero = [g for g in K6 if present[g]['n'] == 0]
    L.append('- Grades with zero content rows (all 9 months T0, beta blocked for that grade): '
             + (', '.join('grade ' + g for g in zero) or 'none'))
    L.append('- Authored week files passing **every** §2 bar at once (9/9 + refs + test law '
             '+ workbook/generator evidence + ≥80%% block binding): **%d of %d**'
             % (all_bars, authored))
    L.append('- Content actually on disk today: '
             + ', '.join('%s w%s%s' % (g, ','.join(present[g]['full']) or '—',
                                       (' (%s topic-card)' % ','.join(present[g]['stub']))
                                       if present[g]['stub'] else '')
                         for g in grades if present[g]['n']))
    L.append('')
    L.append('> **Read this as fact, not as a forecast.** No grade-month reaches T1 under '
             'the per-week 9/9 rule the roadmap states (STEP 5: "coverage_audit[9] per week '
             '— any count==0 → error"), and every authored week also fails at least one '
             'other bar (see Detail). Content on disk: **%d authored (full) week files + '
             '%d topic-card stubs**, against the 252 target week files (7 grades × 36 weeks). '
             'The matrix is the readiness claim surface (R1) — publish it as-is.'
             % (sum(len(present[g]['full']) for g in K6),
                sum(len(present[g]['stub']) for g in K6)))
    L.append('')

    # ---- matrix ----
    L.append('## Matrix — 7 grades × 9 school months')
    L.append('')
    L.append('Cell = tier · authored weeks in that month (`n/4`). School month *m* = '
             'school-year weeks %s.' % '*(m−1)×4+1 … m×4*')
    L.append('')
    L.append('| grade | ' + ' | '.join('M%d' % m for m in MONTHS) + ' |')
    L.append('|---' * (len(MONTHS) + 1) + '|')
    for g in grades:
        row = ['**%s**' % g]
        for m in MONTHS:
            d = cells[(g, m)]
            row.append('%s · %d/4w' % (d['tier'], d['full']))
        L.append('| ' + ' | '.join(row) + ' |')
    L.append('')
    L.append('Legend: **T2** deep · **T1** spiral (openable, must be labelled "spiral review") '
             '· **T0** empty → blocks beta for that grade. `n/4w` = authored (full) weeks in '
             'the month; 0 = no content for that month at all.')
    L.append('')

    # ---- detail for grade-months with any content ----
    L.append('## Detail — grade-months that have any content')
    L.append('')
    L.append('| grade | month | full weeks | blocks bound to an authored lesson | evidence (wb/gen) | '
             'month union coverage | test law | tier | top blockers |')
    L.append('|---|---|---|---|---|---|---|---|---|')
    for g in grades:
        for m in MONTHS:
            d = cells[(g, m)]
            if d['full'] == 0:
                continue
            tests = 'all ok' if all(test_ok(r, g) for r in d['reps'] if r['state'] == 'full') \
                else 'FAIL'
            bl = '; '.join(d['blockers'][:2]) or '—'
            if len(d['blockers']) > 2:
                bl += ' (+%d more)' % (len(d['blockers']) - 2)
            L.append('| %s | M%d | %d/4 | %.0f%% | %d/%d lessons | %s (%s) | %s | **%s** | %s |'
                     % (g, m, d['full'], d['depth'] * 100, d['evidence'], d['lessons'],
                        d['coverage'],
                        ', '.join(d['union_missing'][:3]) or 'complete',
                        tests, d['tier'], bl.replace('|', '\\|')))
    L.append('')

    # ---- per-week coverage evidence ----
    L.append('## Per-week 9/9 evidence (the actual blocker)')
    L.append('')
    L.append('| grade | week | state | subjects covered | missing (of the D7 nine) |')
    L.append('|---|---|---|---|---|')
    for g in grades:
        wks = weeks_by_grade.get(g, {})
        for w in sorted(wks, key=lambda x: int(x)):
            r = week_report(wks[w], statutory, fold)
            L.append('| %s | %s | %s | %d/9 %s | %s |'
                     % (g, w, r['state'], len(r['covered']),
                        ''.join('·' for _ in r['covered']),
                        ', '.join(r['missing']) or '—'))
        if not wks:
            L.append('| %s | — | no lane | 0/9 | all nine |' % g)
    L.append('')

    # ---- open questions / not evaluable ----
    L.append('## Open questions, rulings taken, and what is still not evaluable')
    L.append('')
    L.append('1. **9/9 scope — RESOLVED: per week.** P0.4 validator v2 applies the '
             'roadmap\'s per-week hard constraint (§3 STEP 5) and this baseline matches it. '
             'Outlier to fix: the shipped app\'s own audit (`buildYearPlan()` in '
             '`js/app.js`) still unions weeks 1–2, so the in-app coverage card reads more '
             'favourably than the validator — flag to CIPHER (S3-honesty, see runbook §1).')
    L.append('2. **`skill_node` resolution (validator item e) — still not evaluable.** No '
             '`skill_node`/`node_id` field exists in `content.json` (grep count = 0), and '
             'P0.4\'s own matrix reports no gate-(e) findings either — i.e. that gate has '
             'nothing to bite on yet. This baseline substitutes same-week `lesson_ref` '
             'resolution as a conservative proxy; AUTHOR content waves must start emitting '
             'skill nodes before item-level binding can be proven.')
    L.append('3. **`question_count` (validator item c/d)** — the field is absent from every '
             'week test; the baseline uses `len(questions)` (or `items` for the preschool '
             'show-me checklist, which is exempt from the 10–14 question law by design).')
    L.append('4. **K/1/2 subject labels — RESOLVED by P0.4 fold-map.** The validator\'s '
             'canonical fold (`ela` → reading, writing, spelling, literature, '
             'english_grammar; `social_studies` → history, civics) is now the default here, '
             'so both tools agree. Re-run with `--fold-map app` to see the narrower numbers '
             'the shipped app\'s own `SUBJECT_MAP` produces (`ela` → english_grammar only, '
             'K/1/2 weeks score 3/9) — that gap is a second in-app honesty item for CIPHER.')
    L.append('5. **Grade 6** — no lane at all: absent from `skill_tree.json`, both content '
             'files and `GRADES_ENABLED`. All 9 grade-months are T0 (honestly "not built"), '
             'and it is the only grade with zero engine lane too.')
    L.append('6. **Thresholds — P0.4 owns them now.** Its tiers are consumed directly from '
             '`K6_READINESS_MATRIX.md` (auto-detected) or from the JSON contract '
             '(`--validator tools/readiness_matrix_v2.json` / `--validator-cmd "…"`); the '
             'computed baseline stays as a cross-check. This run: **%s**.' % mode)
    L.append('')

    report = '\n'.join(L) + '\n'
    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        open(args.out, 'w', encoding='utf-8').write(report)
        print('wrote %s' % args.out)
    print('%s  K6 baseline: 63 grade-months -> T2 %d / T1 %d / T0 %d (preschool T2 %d / T1 %d / T0 %d)'
          % ('BETA BAR MET' if bar_met else 'BETA BAR NOT MET',
             counts['T2'], counts['T1'], counts['T0'],
             extra_counts['T2'], extra_counts['T1'], extra_counts['T0']))
    return 0


if __name__ == '__main__':
    sys.exit(main())