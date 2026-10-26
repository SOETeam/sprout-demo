/* SPROUT bug-report widget — roadmap P0.1 / §4.1
   Shell-mounted fixed button + sheet, OUTSIDE the hash-router container (#app), so it is
   present on every route by construction. Static site + localStorage only — zero network,
   zero third-party requests. Reports are stored at sprout_demo_v1.bugs.<rid> under schema
   bugreport/v1, FIFO cap 25 (overflow drops oldest). PII scrub runs before every write:
   account.name/family, child first names and any email-like token are dropped; salt/digest
   are never read into a report; the learner is referenced by opaque index only. */
(function () {
  'use strict';
  var NS = 'sprout_demo_v1';
  var BUGS = NS + '.bugs';
  var SCHEMA = 'bugreport/v1';
  var EXPORT_SCHEMA = 'bugreport-export/v1';
  var CAP = 25;
  var APP_VERSION = 'sprout-demo v1 · public demo build';

  function $(id) { return document.getElementById(id); }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }

  function toast(msg, warn) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.className = 'toast' + (warn ? ' warn' : ''); t.hidden = false;
    if (t._timer) clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 5200);
  }

  function ymd(d) {
    d = d || new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }
  function rand4() {
    var s = '', hex = 'abcdef0123456789';
    for (var i = 0; i < 4; i++) s += hex[(Math.random() * 16) | 0];
    return s;
  }

  /* ---------------- context (read localStorage directly; key NAMES only) ---------------- */
  function children() {
    var c = lsGet(NS + '.children');
    return (c && Array.isArray(c.items)) ? c.items : [];
  }
  function stateKeys() {
    var out = [], p = NS + '.';
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      /* key NAMES only, never values; never echo the bugs bucket back into itself */
      if (k && k.indexOf(p) === 0 && k.indexOf(BUGS) !== 0) out.push(k.slice(p.length));
    }
    return out.sort();
  }
  function collectContext() {
    var acct = lsGet(NS + '.account') || {};
    var sess = lsGet(NS + '.session') || {};
    var kids = children();
    var route = location.hash || '#/';
    var role = sess.role || acct.role || 'parent';
    var mode = (role === 'tutor') ? 'tutor' : 'homeschool';
    var m = route.match(/^#\/(?:assess|ceremony|portal)\/(.+)$/);
    var routeChild = null;
    if (m) { for (var i = 0; i < kids.length; i++) if (kids[i] && kids[i].id === m[1]) { routeChild = kids[i]; break; } }
    var g = (routeChild && routeChild.grade != null) ? routeChild.grade
      : (kids[0] && kids[0].grade != null) ? kids[0].grade : '';
    /* events tail (last 25, scrubbed) — the demo stores no events log today, so this is
       normally empty; populated only if an events key ever appears. */
    var ev = lsGet(NS + '.events') || (kids[0] && lsGet(NS + '.events.' + kids[0].id)) || [];
    if (!Array.isArray(ev)) ev = [];
    var names = [acct.name, acct.family];
    for (var j = 0; j < kids.length; j++) if (kids[j] && kids[j].name) names.push(kids[j].name);
    return {
      route: route, mode: mode, grade_band: String(g == null ? '' : g),
      state_keys: stateKeys(), recent_events_tail: ev.slice(-25), names: names.filter(Boolean)
    };
  }

  /* ---------------- PII scrub (mandatory, runs before every write) ---------------- */
  function scrubText(s, names) {
    s = String(s == null ? '' : s);
    /* email-like tokens */
    s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>');
    /* any real first/family name we know about (child or account) */
    (names || []).forEach(function (n) {
      n = String(n || '').trim();
      if (n.length >= 2) {
        var escRe = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        s = s.replace(new RegExp('\\b' + escRe + '\\b', 'gi'), '<name>');
      }
    });
    /* salt/digest-shaped hex blobs (defensive — free text should never carry these) */
    s = s.replace(/\b[0-9a-f]{32,}\b/gi, '<digest>');
    return s;
  }

  function buildReport(what, expected, repro, attachState) {
    var ctx = collectContext();
    var rep = {
      schema: SCHEMA,
      rid: 'bg_' + ymd() + '_' + rand4(),
      ts: new Date().toISOString(),
      route: ctx.route,
      app_version: APP_VERSION,
      mode: ctx.mode,
      grade_band: ctx.grade_band,
      viewport: (window.innerWidth || 0) + 'x' + (window.innerHeight || 0),
      touch: (('ontouchstart' in window) || ((navigator.maxTouchPoints || 0) > 0)) ? 'yes' : 'no',
      what: scrubText(what, ctx.names),
      expected: scrubText(expected, ctx.names),
      repro: scrubText(repro, ctx.names),
      scrubbed: true
    };
    if (attachState) {
      rep.state_keys = ctx.state_keys;                       // key NAMES only
      rep.recent_events_tail = ctx.recent_events_tail.map(function (e) {
        try { return scrubText(typeof e === 'string' ? e : JSON.stringify(e), ctx.names); }
        catch (err) { return '<unserializable>'; }
      });
    } else {
      rep.state_keys = [];
      rep.recent_events_tail = [];
    }
    return rep;
  }

  /* ---------------- storage (FIFO cap 25, quota-guarded) ---------------- */
  function loadAll() {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(BUGS + '.') === 0) { try { out.push(JSON.parse(localStorage.getItem(k))); } catch (e) {} }
    }
    out.sort(function (a, b) { return (a.ts || '') < (b.ts || '') ? -1 : 1; });
    return out;
  }
  function storeReport(rep) {
    try {
      localStorage.setItem(BUGS + '.' + rep.rid, JSON.stringify(rep));
    } catch (e) {
      toast('Storage full — export and delete old reports, then try again.', true);
      return false;
    }
    var all = loadAll();
    while (all.length > CAP) {
      var old = all.shift();
      try { localStorage.removeItem(BUGS + '.' + old.rid); } catch (e2) {}
    }
    return true;
  }

  /* ---------------- export (no backend — footer stays literally true) ---------------- */
  function summaryText(rep) {
    return 'SPROUT bug ' + rep.rid + '\n' +
      'when: ' + rep.ts + '\n' +
      'route: ' + rep.route + '\n' +
      'mode: ' + rep.mode + ' · grade: ' + (rep.grade_band || '-') + '\n' +
      'app: ' + rep.app_version + ' · viewport ' + rep.viewport + ' · touch ' + rep.touch + '\n' +
      'what: ' + rep.what + '\n' +
      'expected: ' + rep.expected + '\n' +
      'repro: ' + rep.repro;
  }
  function downloadAll() {
    var all = loadAll();
    var payload = { schema: EXPORT_SCHEMA, exported_at: new Date().toISOString(), count: all.length, reports: all };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'sprout_bugs_' + ymd() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('Downloaded ' + all.length + ' report(s) — send the file to the team.');
  }
  function copySummary() {
    var all = loadAll();
    if (!all.length) { toast('No saved reports to copy yet.', true); return; }
    var text = all.map(summaryText).join('\n\n----\n\n');
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Summary copied to clipboard.'); }
      catch (e) { toast('Copy failed — use Download instead.', true); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Summary copied to clipboard.'); }, fallback);
    } else fallback();
  }
  function mailtoLatest() {
    var all = loadAll();
    if (!all.length) { toast('Save a report first.', true); return; }
    var rep = all[all.length - 1];
    /* to= intentionally empty — owner fills at send time, no address in repo */
    window.location.href = 'mailto:?subject=' + encodeURIComponent('SPROUT bug ' + rep.rid) +
      '&body=' + encodeURIComponent(summaryText(rep));
  }

  /* ---------------- UI wiring ---------------- */
  function isKidRoute() { return /^#\/(assess|ceremony|portal|portal-gate)/.test(location.hash || ''); }
  function syncButtonLabel() {
    var btn = $('bug-btn'); if (!btn) return;
    btn.textContent = isKidRoute() ? '🐞 Something broken? Ask a grown-up' : '🐛 Report a bug';
  }
  function openSheet() {
    var sheet = $('bug-sheet'); if (!sheet) return;
    sheet.hidden = false;
    var kid = $('bug-kidhint'); if (kid) kid.hidden = !isKidRoute();
    updateNudge();
    var first = $('bug-what'); if (first) first.focus();
  }
  function closeSheet() { var s = $('bug-sheet'); if (s) s.hidden = true; }
  function updateNudge() {
    var n = $('bug-nudge'); if (!n) return;
    var count = loadAll().length;
    if (count >= 3) {
      n.hidden = false;
      n.textContent = 'You have ' + count + ' report' + (count === 1 ? '' : 's') +
        ' saved — download & send so the team can fix them.';
    } else n.hidden = true;
  }

  function init() {
    var btn = $('bug-btn');
    if (!btn) return;
    syncButtonLabel();
    window.addEventListener('hashchange', syncButtonLabel);

    btn.addEventListener('click', openSheet);
    var closeBtn = $('bug-close'); if (closeBtn) closeBtn.addEventListener('click', closeSheet);
    var sheet = $('bug-sheet');
    if (sheet) sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sheet && !sheet.hidden) closeSheet();
    });

    var form = $('bug-form');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var what = ($('bug-what') || {}).value || '';
      var expected = ($('bug-expected') || {}).value || '';
      var repro = ($('bug-repro') || {}).value || '';
      if (!String(what).trim()) { toast('Tell us what happened first.', true); return; }
      var attach = $('bug-state') ? $('bug-state').checked : true;
      var rep = buildReport(what, expected, repro, attach);
      if (storeReport(rep)) {
        form.reset();
        if ($('bug-state')) $('bug-state').checked = true;
        updateNudge();
        toast('Bug saved locally as ' + rep.rid + ' — nothing was uploaded.');
      }
    });

    var dl = $('bug-export-dl'); if (dl) dl.addEventListener('click', downloadAll);
    var cp = $('bug-export-copy'); if (cp) cp.addEventListener('click', copySummary);
    var ml = $('bug-export-mail'); if (ml) ml.addEventListener('click', mailtoLatest);
  }

  /* Test hook (harmless in production): expose pure helpers so tools/test_bugreport.js can
     verify PII-scrub, schema and the FIFO cap without a real DOM. */
  window.SPROUT_BUGREPORT = {
    buildReport: buildReport, storeReport: storeReport, loadAll: loadAll,
    scrubText: scrubText, collectContext: collectContext
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
