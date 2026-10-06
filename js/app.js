/* =====================================================================
   SPROUT public demo v1 — app shell
   ---------------------------------------------------------------------
   Static + localStorage only. No backend, no accounts server, no analytics.
   Engines ported from the SaittaSprout prototype (see ARCHITECTURE.md):
     js/generator.js  -> window.SPRUT_GEN   (seeded practice, 14 families)
     js/lesson.js     -> window.SPRUT_LESSON (open-lesson view)
     js/workspace.js  -> window.SPRUT_WS     (math/spelling/reading/writing tools)
   Schemas traced to /root/sprout commits 5874bdd (placement.v1, year_plan/v0,
   item.v1, ledger v3, compliance) and 3f96d8b (D7 nine-subject list).
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------- constants ---------------- */
  var NS = 'sprout_demo_v1';
  var MARKER = 'sprout_demo_v1';
  var LEGACY = ['saittasprout_v1', 'sprout_v2'];   // must NEVER be written
  var CONTENT = window.SPROUT_CONTENT || null;

  var K = {
    account: NS + '.account',
    session: NS + '.session',
    children: NS + '.children',
    placement: function (id) { return NS + '.placement.' + id; },
    yearplan: function (id) { return NS + '.yearplan.' + id; },
    progress: function (id) { return NS + '.progress.' + id; }
  };

  var GRADES_ENABLED = ['preschool', '3', '5'];                       // plan F2
  var GRADE_ORDER = ['preschool', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  var GRADE_LABEL = {
    preschool: 'Preschool', K: 'Kindergarten', '1': 'Grade 1', '2': 'Grade 2',
    '3': 'Grade 3', '4': 'Grade 4', '5': 'Grade 5', '6': 'Grade 6', '7': 'Grade 7',
    '8': 'Grade 8', '9': 'Grade 9', '10': 'Grade 10', '11': 'Grade 11', '12': 'Grade 12'
  };
  var STATUTORY = ['reading', 'spelling', 'mathematics', 'science', 'history',
    'civics', 'literature', 'writing', 'english_grammar'];
  var SUBJECT_MAP = {
    math: 'mathematics', maths: 'mathematics', ela: 'english_grammar',
    english: 'english_grammar', grammar: 'english_grammar', read: 'reading',
    reading_comp: 'reading', lit: 'literature'
  };
  var PERSONA_TOTEM = { '3': '🦊', '5': '🐺', preschool: '🐨' };
  var COMPLIANCE_COPY = 'organizes Michigan-required subject coverage';

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36); }

  /* ---------------- toast ---------------- */
  var toastTimer = null;
  function toast(msg, warn) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (warn ? ' warn' : '');
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
  }

  /* ---------------- sha256 (pure JS, synchronous, no network) ----------------
     Mirrors gate.js's digest shape: sha256(salt + ':' + secret). Never stored
     as plaintext. */
  var SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256(ascii) {
    function rr(v, n) { return (v >>> n) | (v << (32 - n)); }
    var mathPow = Math.pow, maxWord = mathPow(2, 32), result = '';
    var words = [], bitLen = ascii.length * 8;
    var hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [], primeCounter = k.length;
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (var i = 0; i < ascii.length; i++) {
      var j = ascii.charCodeAt(i);
      if (j >> 8) return sha256(unescape(encodeURIComponent(ascii)));   // UTF-8
      words[i >> 2] |= j << (((3 - i) % 4) * 8);
    }
    words[words.length] = (bitLen / maxWord) | 0;
    words[words.length] = bitLen;
    for (var j = 0; j < words.length;) {
      var w = words.slice(j, j += 16);
      var oldHash = hash.slice(0, 8);
      for (var i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7]
          + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + SHA_K[i]
          + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))
          ) | 0);
        var temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (var i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (var i = 0; i < 8; i++) {
      for (var j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }
  function digest(secret, salt) {
    var s = String(salt || 'sprout_demo_v1') + ':' + String(secret || '');
    for (var i = 0; i < 500; i++) s = sha256(s + ':' + i);   // stretch (demo-grade)
    return s;
  }

  /* ---------------- store (localStorage, namespaced, schema-marked) --------
     Every blob is {"schema":"sprout_demo_v1", ...}. "Clear this demo" deletes
     the prefix only. Legacy namespaces are never read or written. */
  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        var v = JSON.parse(raw);
        if (v && typeof v === 'object' && !Array.isArray(v) && v.schema) return v;
        return v;
      } catch (e) { return fallback; }
    },
    set: function (key, obj) {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        if (!obj.schema) obj = Object.assign({}, obj, { schema: MARKER });
      } else {
        obj = { schema: MARKER, value: obj };
      }
      localStorage.setItem(key, JSON.stringify(obj));
      return obj;
    },
    del: function (key) { localStorage.removeItem(key); },
    children: function () { return (store.get(K.children, {}) || {}).items || []; },
    saveChildren: function (items) { store.set(K.children, { items: items }); },
    account: function () { return store.get(K.account, null); },
    session: function () { return store.get(K.session, null); },
    clearAll: function () {
      var removed = [];
      var keep = [];
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf(NS) === 0) { removed.push(k); localStorage.removeItem(k); }
        else keep.push(k);
      }
      LEGACY.forEach(function (lk) {
        if (localStorage.getItem(lk) != null) { localStorage.removeItem(lk); removed.push(lk); }
      });
      return { removed: removed, kept: keep };
    },
    progress: function (childId) {
      var p = store.get(K.progress(childId), null);
      if (!p || typeof p !== 'object') {
        p = { schema: MARKER, child_id: childId, notes: {}, streams: {}, practice: {},
          xp_once: {}, xp: 0, leitner: {}, tests: {}, lessons_done: {},
          exported_at: null };
        store.set(K.progress(childId), p);
      }
      return p;
    },
    saveProgress: function (childId, p) { p.schema = MARKER; store.set(K.progress(childId), p); }
  };

  /* ---------------- content ---------------- */
  function gradeMeta(gk) {
    var g = (CONTENT && CONTENT.grades && CONTENT.grades[gk]) || {};
    return g;
  }
  function weeks(gk) { return (CONTENT && CONTENT.weeks && CONTENT.weeks[gk]) || {}; }
  function weekData(gk, wn) { return weeks(gk)[String(wn)] || null; }
  function lessonsOf(gk, wn) { var w = weekData(gk, wn); return (w && w.lessons) || {}; }
  function findLesson(gk, wn, lid) { return lessonsOf(gk, wn)[lid] || null; }
  function allWeekLessonIds(gk) {
    var out = {}, wks = weeks(gk);
    Object.keys(wks).forEach(function (wn) {
      var L = (wks[wn] && wks[wn].lessons) || {};
      Object.keys(L).forEach(function (id) { out[id] = { id: id, week: +wn, lesson: L[id] }; });
    });
    return out;
  }

  /* generator registry helpers (seeded practice: seed = date+student+skill) */
  function registryFor(gk, wn) {
    var w = weekData(gk, 1) || {};       // generator configs ship with w1 and are reused
    /* SPRUT_GEN.getGen(reg, id) reads reg.generators — keep the file shape */
    return { schema: MARKER + '.registry', generators: w.generators || [] };
  }
  function lessonToGenerator(lessonId, gk, wn) {
    var regs = (registryFor(gk, wn) || {}).generators || [];
    for (var i = 0; i < regs.length; i++) {
      var g = regs[i];
      if (g.lesson_ref === lessonId) return g.id;
      if (g.source && g.source.indexOf(lessonId) >= 0) return g.id;
      if (g.id && g.id.indexOf(lessonId) >= 0) return g.id;
    }
    return null;
  }
  function passagesFor(gk, wn) {
    var w = weekData(gk, wn) || {};
    return w.passages || [];
  }
  function quizPool(gk, wn) {
    var w = weekData(gk, wn) || {};
    var out = [];
    (w.quizzes || []).forEach(function (q) { if (q && q.questions && q.questions.length) out.push(q); });
    return out;
  }

  /* ---------------- session / children ---------------- */
  function currentSession() { return store.session(); }
  function requireSession() {
    var s = currentSession();
    return s && s.name ? s : null;
  }
  function children() { return store.children(); }
  function childById(id) {
    var arr = children();
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  function saveChild(c) {
    var arr = children();
    for (var i = 0; i < arr.length; i++) if (arr[i].id === c.id) { arr[i] = c; store.saveChildren(arr); return; }
    arr.push(c); store.saveChildren(arr);
  }
  function childStage(c) {
    if (!c) return 'none';
    var pl = store.get(K.placement(c.id), null);
    var yp = store.get(K.yearplan(c.id), null);
    if (yp && yp.approved) return 'portal';
    if (pl && pl.guardian_gate && pl.guardian_gate.status === 'approved') return 'ceremony';
    if (pl) return 'placement';
    return 'assess';
  }

  /* ---------------- synthetic name helper ---------------- */
  var SYNTH = ['Juniper', 'Pixel', 'Rookie', 'Wren', 'Otis', 'Marlow', 'Birch', 'Sable',
    'Tansy', 'Pip', 'Hollis', 'Remi', 'Scout', 'Indigo', 'Kestrel', 'Milo'];
  var SYNTH_I = 0;
  function synthName() { var n = SYNTH[SYNTH_I % SYNTH.length]; SYNTH_I++; return n; }

  /* ---------------- router ---------------- */
  var ROUTES = [
    { re: /^#?\/?$/, view: 'landing' },
    { re: /^#\/account$/, view: 'account' },
    { re: /^#\/children$/, view: 'children' },
    { re: /^#\/assess\/(.+)$/, view: 'assess' },
    { re: /^#\/ceremony\/(.+)$/, view: 'ceremony' },
    { re: /^#\/portal\/(.+)$/, view: 'portal' }
  ];
  function route() {
    var h = location.hash || '#/';
    for (var i = 0; i < ROUTES.length; i++) {
      var m = h.match(ROUTES[i].re);
      if (m) return { view: ROUTES[i].view, arg: m[1] || null };
    }
    return { view: 'landing', arg: null };
  }
  function go(hash) {
    if (location.hash === hash) { render(); }
    else location.hash = hash;
  }
  function renderTopnav() {
    var s = requireSession();
    var nav = $('topnav');
    var items = ['<a href="#/">Home</a>'];
    if (s) {
      items.push('<a href="#/children">My children</a>');
      items.push('<button type="button" id="nav-signout">Sign out</button>');
      items.push('<button type="button" id="nav-clear" class="btn danger sm">Clear this demo</button>');
    } else {
      items.push('<a href="#/account">Parent sign in</a>');
    }
    nav.innerHTML = items.join('');
    if (s) {
      var so = $('nav-signout'); if (so) so.addEventListener('click', function () {
        store.del(K.session); toast('Signed out. Your demo data stays in this browser.'); go('#/');
      });
    }
    var cl = $('nav-clear');
    if (cl) cl.addEventListener('click', function () {
      if (!window.confirm('Erase every SPROUT demo record in this browser (parent account, children, placements, progress)?')) return;
      var r = store.clearAll();
      toast('Cleared ' + r.removed.length + ' demo key(s). Nothing else on this device was touched.');
      go('#/');
    });
  }

  /* ================= LANDING ================= */
  function viewLanding() {
    var s = requireSession();
    var kids = children();
    var c = CONTENT || { grades: {}, counts: {} };
    var gradeChips = GRADE_ORDER.map(function (g) {
      var live = GRADES_ENABLED.indexOf(g) >= 0;
      return '<span class="' + (live ? 'live' : 'soon') + '">' + (live ? '✓ ' : '🔒 ') +
        esc(GRADE_LABEL[g]) + (live ? '' : ' · coming soon') + '</span>';
    }).join('');

    var stat = (CONTENT && CONTENT.counts) || {};
    var w1total = stat.w1_items_total || 0;

    var html =
      '<section class="hero">' +
      '<h1><span class="sprout">SPROUT</span> — a homeschool operating system</h1>' +
      '<div class="sub">Place the child. Build the year. Teach the week. Keep the records.' +
      ' SPROUT ' + esc(COMPLIANCE_COPY) + ' — nothing more, nothing less.</div>' +
      '<div class="badge-demo">PUBLIC DEMO · synthetic data · local-first</div>' +
      '<div class="proof">Local-first. No account required to try. Nothing leaves your browser.</div>' +
      '<div>' +
      (s
        ? '<a class="cta" href="#/children">Open the parent portal</a>'
        : '<a class="cta" href="#/account">Create parent account</a>') +
      '<a class="cta ghost" href="#/account">Take the tour</a>' +
      '</div>' +
      '</section>' +

      '<section class="panel">' +
      '<h2>What SPROUT does</h2>' +
      '<div class="pillars">' +
      '<div class="pillar"><div class="n">01 · PLACE</div><h3>Dual assessment</h3>' +
      '<p>An adaptive child check plus a parent questionnaire. Where they disagree, the guardian sees a conflict card — the engine never silently picks a side.</p></div>' +
      '<div class="pillar"><div class="n">02 · BUILD</div><h3>The year, on screen</h3>' +
      '<p>A curriculum ceremony builds the year plan in front of you: statutory spine, week map, coverage audit, then a second guardian gate.</p></div>' +
      '<div class="pillar"><div class="n">03 · TEACH</div><h3>Two full weeks</h3>' +
      '<p>Open lessons, seeded practice that runs on-device with no AI and no network, weekly tests, and a show-me track for pre-readers.</p></div>' +
      '<div class="pillar"><div class="n">04 · KEEP</div><h3>Records you own</h3>' +
      '<p>Progress, XP and review queues live in this browser. Export a JSON file, import it back — the kid owns the file, not a vendor.</p></div>' +
      '</div>' +
      '</section>' +

      '<section class="panel">' +
      '<h2>Grades in this demo</h2>' +
      '<p class="lede">Preschool, 3rd and 5th are live in this demo. K–12 coverage is on the roadmap.</p>' +
      '<div class="strip">' + gradeChips + '</div>' +
      '<div class="statgrid">' +
      '<div class="statbox"><b>' + w1total + '</b><span>week-1 lesson items ported (3 grades)</span></div>' +
      '<div class="statbox"><b>22</b><span>generator configs (seeded practice)</span></div>' +
      '<div class="statbox"><b>9</b><span>Michigan statutory subjects organized</span></div>' +
      '<div class="statbox"><b>0</b><span>servers, trackers or uploads</span></div>' +
      '</div>' +
      '<p class="mono" style="margin-top:12px">' + esc(COMPLIANCE_COPY) + ' · MCL 380.1561(3)(f) · verified-D7 · not legal advice</p>' +
      '</section>' +

      '<section class="panel">' +
      '<h2>Demo account</h2>' +
      (s
        ? '<p class="lede">Signed in as <b>' + esc(s.name) + '</b>' + (s.family ? ' · family “' + esc(s.family) + '”' : '') +
        '. This demo account lives only in this browser.</p>' +
        '<div style="margin-top:12px"><a class="btn" href="#/children">Go to my children</a></div>'
        : '<p class="lede">Create a local parent account — a display name and passphrase, stored as a salted hash in this browser. No email, no verification, no server.</p>' +
        '<div style="margin-top:12px"><a class="btn" href="#/account">Create parent account</a>' +
        (kids.length ? ' <span class="mono">' + kids.length + ' child record(s) already in this browser</span>' : '') +
        '</div>') +
      '</section>';

    renderInto(html);
  }

  /* ================= ACCOUNT ================= */
  function viewAccount() {
    var s = requireSession();
    if (s) { go('#/children'); return; }
    var html =
      '<section class="panel">' +
      '<h2>Create a parent account (local only)</h2>' +
      '<p class="lede">This demo account lives only in this browser. No email field, no password reset, no server — a passphrase is stretched into a salted digest and stored under <span class="mono">sprout_demo_v1.account</span>.</p>' +
      '<form id="signup-form" autocomplete="off">' +
      '<div class="formrow">' +
      '<div class="field"><label for="su-name">Your display name</label>' +
      '<input id="su-name" name="name" required maxlength="40" placeholder="e.g. Casey"></div>' +
      '<div class="field"><label for="su-family">Synthetic family name <span class="mono">(optional)</span></label>' +
      '<input id="su-family" name="family" maxlength="40" placeholder="e.g. the Fernwood family"></div>' +
      '</div>' +
      '<div class="field"><label for="su-pass">Passphrase</label>' +
      '<input id="su-pass" name="pass" type="password" required minlength="6" placeholder="at least 6 characters">' +
      '<div class="hint">Stored as a salted, stretched sha256 digest — never as plaintext.</div></div>' +
      '<div style="margin-top:16px"><button class="btn" type="submit">Create account →</button></div>' +
      '</form>' +
      '<p class="mono" style="margin-top:14px">Already created one in this browser? <a href="#/signin">Sign in</a></p>' +
      '</section>' +

      '<section class="panel" id="signin-panel" hidden>' +
      '<h2>Sign in</h2>' +
      '<form id="signin-form" autocomplete="off">' +
      '<div class="field"><label for="si-name">Display name</label><input id="si-name" required maxlength="40"></div>' +
      '<div class="field"><label for="si-pass">Passphrase</label><input id="si-pass" type="password" required></div>' +
      '<div style="margin-top:14px"><button class="btn" type="submit">Sign in →</button></div>' +
      '</form></section>';

    renderInto(html);
    $('signup-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('su-name').value.trim();
      var family = $('su-family').value.trim();
      var pass = $('su-pass').value;
      if (!name || pass.length < 6) { toast('A name and a passphrase of 6+ characters, please.', true); return; }
      var existing = store.account();
      if (existing) {
        if (existing.digest !== digest(pass, existing.salt)) {
          toast('A different account already exists in this browser. Clear this demo to start over.', true); return;
        }
      }
      var salt = uid('sl');
      var rec = { schema: MARKER, name: name, family: family || null, salt: salt,
        digest: digest(pass, salt), created_at: new Date().toISOString() };
      store.set(K.account, rec);
      store.set(K.session, { schema: MARKER, name: name, family: rec.family, at: new Date().toISOString() });
      toast('Account created — it lives only in this browser.');
      go('#/children');
    });
    $('signin-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var a = store.account();
      if (!a) { toast('No account in this browser yet — create one first.', true); return; }
      if ($('si-name').value.trim() !== a.name || digest($('si-pass').value, a.salt) !== a.digest) {
        toast('Name or passphrase did not match the account stored in this browser.', true); return;
      }
      store.set(K.session, { schema: MARKER, name: a.name, family: a.family, at: new Date().toISOString() });
      toast('Welcome back, ' + a.name + '.');
      go('#/children');
    });
    if (location.hash === '#/signin') { $('signin-panel').hidden = false; }
  }

  /* ================= CHILDREN ================= */
  function viewChildren() {
    var s = requireSession();
    if (!s) { go('#/account'); return; }
    var kids = children();
    var cards = kids.map(function (c) {
      var gk = c.grade;
      var meta = gradeMeta(gk);
      var stage = childStage(c);
      var pl = store.get(K.placement(c.id), null);
      var yp = store.get(K.yearplan(c.id), null);
      var stageLabel = {
        assess: 'Next: assessment', placement: 'Placement ready', ceremony: 'Build the year',
        portal: 'Portal live'
      }[stage] || 'Next: assessment';
      return '<button class="kidcard" type="button" data-child="' + esc(c.id) + '">' +
        '<div class="totem">' + (PERSONA_TOTEM[gk] || '🌱') + '</div>' +
        '<div class="name">' + esc(c.name) + '</div>' +
        '<div class="meta">' + esc(GRADE_LABEL[gk] || gk) + ' · started ' + esc(c.start_date || '—') + '</div>' +
        '<div class="row"><span>Placement</span><b>' + (pl && pl.guardian_gate && pl.guardian_gate.status === 'approved' ? 'Approved' : (pl ? 'Pending guardian' : 'Not started')) + '</b></div>' +
        '<div class="row"><span>Year plan</span><b>' + (yp && yp.approved ? 'Approved' : 'Not built') + '</b></div>' +
        '<div class="row"><span>Next step</span><b>' + stageLabel + '</b></div>' +
        '</button>';
    }).join('');

    var html =
      '<section class="panel">' +
      '<h2>My children</h2>' +
      '<p class="lede">K–12 coverage is on the roadmap; Preschool, 3rd and 5th are live in this demo. ' +
      'Every name below is synthetic — invent one or use the helper.</p>' +
      (kids.length
        ? '<div class="grid3">' + cards + '</div>'
        : '<div class="grid3"><div class="card"><h3>No children yet</h3><p class="mono">Add one below to start the flow.</p></div></div>') +
      '</section>' +

      '<section class="panel">' +
      '<h2>Add child</h2>' +
      '<form id="child-form" autocomplete="off">' +
      '<div class="formrow">' +
      '<div class="field"><label for="ch-name">Child name</label>' +
      '<input id="ch-name" required maxlength="30" placeholder="synthetic name">' +
      '<button type="button" class="btn ghost sm" id="ch-synth" style="margin-top:8px">Use a synthetic name</button></div>' +
      '<div class="field"><label for="ch-start">Start date</label>' +
      '<input id="ch-start" type="date" required></div>' +
      '</div>' +
      '<div class="field"><label>Grade</label>' +
      '<div class="gradelist" id="grade-list" role="radiogroup" aria-label="Grade"></div>' +
      '<div class="hint">Locked grades are visible on purpose — that is the roadmap. Clicking one does nothing in this demo.</div>' +
      '</div>' +
      '<div style="margin-top:16px"><button class="btn" type="submit">Add child →</button></div>' +
      '</form>' +
      '</section>';

    renderInto(html);
    var gl = $('grade-list');
    var selected = null;
    gl.innerHTML = GRADE_ORDER.map(function (g) {
      var live = GRADES_ENABLED.indexOf(g) >= 0;
      return '<button type="button" class="gradeopt" data-grade="' + g + '" data-live="' + live + '"' +
        (live ? '' : ' disabled aria-disabled="true"') + '>' + esc(GRADE_LABEL[g]) +
        '<span class="tag">' + (live ? '✓ live in this demo' : '🔒 coming soon') + '</span></button>';
    }).join('');
    gl.addEventListener('click', function (e) {
      var b = e.target.closest('.gradeopt'); if (!b) return;
      if (b.disabled) {
        toast(GRADE_LABEL[b.dataset.grade] + ' is on the roadmap — Preschool, 3rd and 5th are live now.', true);
        return;
      }
      Array.prototype.forEach.call(gl.querySelectorAll('.gradeopt'), function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      selected = b.dataset.grade;
    });
    $('ch-synth').addEventListener('click', function () { $('ch-name').value = synthName(); });
    $('ch-start').value = dayStr(new Date());
    $('child-form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!selected) { toast('Pick a grade first (Preschool, 3rd or 5th).', true); return; }
      var name = $('ch-name').value.trim();
      if (!name) { toast('A name is required.', true); return; }
      var pin = String(Math.floor(1000 + Math.random() * 9000));
      var c = {
        schema: MARKER, id: uid('child'), name: name, grade: selected,
        start_date: $('ch-start').value || dayStr(new Date()),
        persona: (gradeMeta(selected) || {}).persona || name,
        pin_digest: digest(pin, NS + ':childpin'),
        pin_hint: pin,                                   // demo only: shown to the parent
        created_at: new Date().toISOString()
      };
      saveChild(c);
      toast(name + ' added. Portal keypad PIN for this demo: ' + pin);
      go('#/assess/' + c.id);
    });
    var grid = document.querySelector('.grid3');
    if (grid) grid.addEventListener('click', function (e) {
      var b = e.target.closest('[data-child]'); if (!b) return;
      var c = childById(b.getAttribute('data-child')); if (!c) return;
      var stage = childStage(c);
      if (stage === 'portal') go('#/portal/' + c.id);
      else if (stage === 'ceremony') go('#/ceremony/' + c.id);
      else go('#/assess/' + c.id);
    });
  }

  /* ================= ASSESSMENT (F3) =================
     Child adaptive-lite CAT (2PL EAP, max Fisher info, deterministic
     tie-break by item_id) + parent questionnaire + A10 conflict rule +
     mandatory guardian gate -> placement/v1 report. */
  var assess = null;

  function eapEstimate(responses) {
    // responses: [{a, b, correct}] -> theta / se via EAP over a fixed grid
    var grid = [], i;
    for (i = -4; i <= 4.0001; i += 0.1) grid.push(Math.round(i * 10) / 10);
    var post = grid.map(function (t) { return Math.exp(-0.5 * t * t); }); // N(0,1) prior
    responses.forEach(function (r) {
      grid.forEach(function (t, k) {
        var p = 1 / (1 + Math.exp(-1.702 * r.a * (t - r.b)));
        post[k] *= (r.correct ? p : (1 - p));
      });
    });
    var sum = 0, tot = 0;
    post.forEach(function (p) { sum += p; tot += 1; });
    var theta = 0, m2 = 0;
    post.forEach(function (p, k) { var w = p / sum; theta += w * grid[k]; m2 += w * grid[k] * grid[k]; });
    var se = Math.sqrt(Math.max(0.0001, m2 - theta * theta));
    return { theta: Math.round(theta * 100) / 100, se: Math.round(se * 100) / 100 };
  }
  function fisherInfo(a, b, theta) {
    var p = 1 / (1 + Math.exp(-1.702 * a * (theta - b)));
    return (1.702 * a) * (1.702 * a) * p * (1 - p);
  }
  function catNextItem(pool, used, theta) {
    var best = null;
    pool.slice().sort(function (x, y) { return x.item_id < y.item_id ? -1 : 1; }).forEach(function (it) {
      if (used.indexOf(it.item_id) >= 0) return;
      var info = fisherInfo(it.a, it.b, theta);
      if (!best || info > best.info + 1e-9) best = { item: it, info: info };
    });
    return best ? best.item : null;
  }

  var QUESTIONNAIRE = [
    { id: 'q_read_freq', domain: 'ela', q: 'How often does your child read to you (or with you) at home?',
      opts: [['Daily', 0.7], ['A few times a week', 0.1], ['Once a week', -0.3], ['Rarely', -0.8]] },
    { id: 'q_read_fluency', domain: 'ela', q: 'Reading aloud, your child most often…',
      opts: [['Reads smoothly and understands', 0.8], ['Reads with some effort but follows along', 0.1],
      ['Sounds out many words', -0.5], ['Prefers to be read to', -0.8]] },
    { id: 'q_writing', domain: 'ela', q: 'Writing a short note or list, your child can…',
      opts: [['Write a few sentences with help', 0.6], ['Copy words and simple sentences', 0.1],
      ['Form letters and try words', -0.5], ['Not writing yet', -0.9]] },
    { id: 'q_math_freq', domain: 'math', q: 'How often does your child use numbers outside schoolwork (cooking, shops, games)?',
      opts: [['Most days', 0.6], ['A few times a week', 0.1], ['Occasionally', -0.4], ['Rarely', -0.8]] },
    { id: 'q_math_facts', domain: 'math', q: 'Math facts (addition and multiplication) currently feel…',
      opts: [['Fast and confident', 0.8], ['Mostly right with some thinking time', 0.1],
      ['Still building speed', -0.5], ['A big lift right now', -0.9]] },
    { id: 'q_math_apply', domain: 'math', q: 'Story problems (word problems) are…',
      opts: [['Comfortable', 0.6], ['Manageable with a hint', 0.1], ['Tricky', -0.4], ['A focus area', -0.8]] }
  ];

  function startAssessment(child) {
    var gk = child.grade;
    var bank = (CONTENT && CONTENT.assessment && CONTENT.assessment.bank) || [];
    assess = {
      child: child, gk: gk, phase: 'child', item: null, used: [], responses: [],
      math: { theta: 0, se: 1 }, ela: { theta: 0, se: 1 }, checklist: [], qIdx: 0, priors: {},
      conflict: null
    };
    if (gk === 'preschool') { assess.phase = 'intro'; assess.checklist = preschoolChecklist(); }
    else { assess.phase = 'intro'; assess.catDomain = 'math'; assess.catItems = bank.slice(); }
  }

  function preschoolChecklist() {
    return [
      { id: 'ps_count', prompt: 'Show me three fingers.', emoji: '🖐️', choices: ['I can show three!', 'Show me again', 'Not yet'], note: 'Counting to three' },
      { id: 'ps_letters', prompt: 'Point to the letter A.', emoji: '🅰️', choices: ['I pointed!', 'Show me again', 'Not yet'], note: 'Letter recognition' },
      { id: 'ps_shapes', prompt: 'Find the circle.', emoji: '⭕', choices: ['I found it!', 'Show me again', 'Not yet'], note: 'Shape recognition' },
      { id: 'ps_colors', prompt: 'Show me something red.', emoji: '🔴', choices: ['I found it!', 'Show me again', 'Not yet'], note: 'Color recognition' },
      { id: 'ps_story', prompt: 'Look at the picture and tell me one thing you see.', emoji: '🖼️', choices: ['I told you!', 'Help me start', 'Not yet'], note: 'Oral narration' },
      { id: 'ps_pattern', prompt: 'What comes next: red, blue, red, blue…?', emoji: '🔴🔵', choices: ['Red!', 'Show me again', 'Not yet'], note: 'Pattern spotting' }
    ];
  }

  function renderAssess(childId) {
    var c = childById(childId);
    if (!c) { go('#/children'); return; }
    var pl = store.get(K.placement(c.id), null);
    if (pl && pl.guardian_gate && pl.guardian_gate.status === 'approved') { renderPlacementCard(c, pl); return; }
    if (!assess || assess.child.id !== c.id) startAssessment(c);

    var head =
      '<section class="panel">' +
      '<h2>Assessment — ' + esc(c.name) + ' · ' + esc(GRADE_LABEL[c.grade]) + '</h2>' +
      '<p class="lede">Dual assessment, exactly as the engine does it: an adaptive child check, then a parent questionnaire, then a mandatory guardian gate. ' +
      'Preschool uses the show-me checklist instead of a scored check — no pass mark, portfolio entry only.</p>' +
      (assess.phase === 'cat' ? '<div class="progress"><i style="width:' + Math.round((assess.used.length / 10) * 100) + '%"></i></div>' : '') +
      '</section>';

    var body = '';
    if (assess.phase === 'intro') {
      body = '<section class="panel"><div class="qcard"><h3>Ready when your child is</h3>' +
        '<p class="lede" style="margin-top:8px">About 8–10 short questions. One at a time. There is no timer and no score shown to the child — ' +
        'the engine is estimating where to start, not grading anyone.</p>' +
        '<button class="btn" id="assess-start" style="margin-top:14px">Start the child check →</button></div></section>';
    } else if (assess.phase === 'cat') {
      var item = assess.item;
      if (!item) {
        assess.item = catNextItem(assess.catItems, assess.used, assess.catDomain === 'math' ? assess.math.theta : assess.ela.theta);
        item = assess.item;
        if (!item) { assess.phase = 'questionnaire'; }
      }
      if (item) {
        body = '<section class="panel qcard"><div class="mono">Question ' + (assess.used.length + 1) +
          ' · ' + esc(item.subject) + ' · ' + esc(item.skill_tag) + ' · adaptive pick (max Fisher information)</div>' +
          '<h3 style="margin-top:8px;font-size:1.15rem;color:#fff">' + esc(item.text) + '</h3>' +
          '<div class="opts" id="cat-opts"></div>' +
          '<div class="feedback" id="cat-fb"></div>' +
          '<button class="btn amber" id="cat-next" style="display:none;margin-top:10px">Next →</button>' +
          '<div class="mono" style="margin-top:12px">θ(estimate) ' +
          (assess.catDomain === 'math' ? assess.math.theta : assess.ela.theta).toFixed(2) +
          ' · SE ' + (assess.catDomain === 'math' ? assess.math.se : assess.ela.se).toFixed(2) +
          ' · domain ' + esc(assess.catDomain) + '</div>' +
          '</section>';
      } else { body = renderQuestionnaire(); }
    } else if (assess.phase === 'checklist') {
      var ci = assess.checklist[assess.qIdx];
      if (ci) {
        body = '<section class="panel qcard"><div class="mono">Show-me checklist · item ' +
          (assess.qIdx + 1) + '/' + assess.checklist.length + ' · no pass mark · portfolio entry</div>' +
          '<h3 style="margin-top:10px;font-size:1.3rem;color:#fff">' + ci.emoji + ' ' + esc(ci.prompt) + '</h3>' +
          '<div class="mono" style="margin-top:6px">tap what happened together</div>' +
          '<div class="opts" id="ps-opts"></div>' +
          '<div class="feedback" id="ps-fb"></div>' +
          '<button class="btn amber" id="ps-next" style="display:none;margin-top:10px">Next →</button>' +
          '</section>';
      } else { body = renderQuestionnaire(); }
    } else if (assess.phase === 'questionnaire') {
      var q = QUESTIONNAIRE[assess.qIdx];
      if (q) {
        body = '<section class="panel qcard"><div class="mono">Parent questionnaire · question ' +
          (assess.qIdx + 1) + '/' + QUESTIONNAIRE.length + ' · per-domain priors</div>' +
          '<h3 style="margin-top:10px;font-size:1.12rem;color:#fff">' + esc(q.q) + '</h3>' +
          '<div class="opts" id="pq-opts"></div>' +
          '</section>';
      } else { body = renderConflictAndGate(); }
    } else if (assess.phase === 'conflict' || assess.phase === 'gate') {
      body = renderConflictAndGate();
    } else if (assess.phase === 'placement') {
      renderPlacementCard(c, store.get(K.placement(c.id), null));
      return;
    }
    renderInto(head + body);
    wireAssess(c);
  }

  function renderQuestionnaire() {
    var q = QUESTIONNAIRE[assess.qIdx];
    if (!q) { assess.phase = 'conflict'; return renderConflictAndGate(); }
    return '<section class="panel qcard"><div class="mono">Parent questionnaire · question ' +
      (assess.qIdx + 1) + '/' + QUESTIONNAIRE.length + ' · per-domain priors</div>' +
      '<h3 style="margin-top:10px;font-size:1.12rem;color:#fff">' + esc(q.q) + '</h3>' +
      '<div class="opts" id="pq-opts"></div><div class="feedback" id="pq-fb"></div></section>';
  }

  function computePriors() {
    var acc = { math: { s: 0, n: 0 }, ela: { s: 0, n: 0 } };
    QUESTIONNAIRE.forEach(function (q) {
      var v = assess.priors[q.id];
      if (v == null) return;
      acc[q.domain].s += v; acc[q.domain].n += 1;
    });
    var out = {};
    Object.keys(acc).forEach(function (d) {
      out[d] = acc[d].n ? Math.round((acc[d].s / acc[d].n) * 100) / 100 : 0;
    });
    return out;
  }

  function finishAssessment(child) {
    var priors = computePriors();
    var domains = [];
    if (child.grade === 'preschool') {
      var ready = assess.checklist.filter(function (i) { return i.tap === 0; }).length;
      var shown = assess.checklist.filter(function (i) { return i.tap === 1; }).length;
      domains.push({
        domain: 'ela', theta: priors.ela, se: 0.9, grade_band: 'preschool',
        confidence: 'low', mastered_skills: [], focus_skills: shown ? ['oral narration, show-me items'] : [],
        prerequisite_gaps: [], parent_prior_theta: priors.ela, conflict: false, resolution: null,
        checklist: assess.checklist.map(function (i) { return { id: i.id, note: i.note, tap: i.tap }; }),
        checklist_ready: ready
      });
      domains.push({
        domain: 'math', theta: priors.math, se: 0.9, grade_band: 'preschool',
        confidence: 'low', mastered_skills: [], focus_skills: [], prerequisite_gaps: [],
        parent_prior_theta: priors.math, conflict: false, resolution: null
      });
    } else {
      ['math', 'ela'].forEach(function (d) {
        var dom = d === 'math' ? assess.math : assess.ela;
        var theta = dom.n ? Math.round(dom.theta * 100) / 100 : priors[d];
        var se = dom.n ? dom.se : 0.9;
        var conflict = (dom.n && Math.abs(dom.theta - priors[d]) >= 0.75);
        var bySkill = {};
        assess.responses.forEach(function (r) {
          if (r.subject !== (d === 'math' ? 'math' : 'ela')) return;
          bySkill[r.skill_tag] = bySkill[r.skill_tag] || { c: 0, n: 0 };
          bySkill[r.skill_tag].n++; if (r.correct) bySkill[r.skill_tag].c++;
        });
        var mastered = [], focus = [];
        Object.keys(bySkill).forEach(function (s) {
          var r = bySkill[s];
          if (r.n >= 2 && r.c / r.n >= 0.75) mastered.push(s);
          else focus.push(s);
        });
        domains.push({
          domain: d, theta: theta, se: Math.round(se * 100) / 100,
          grade_band: String(child.grade), confidence: se <= 0.35 ? 'high' : (se <= 0.6 ? 'medium' : 'low'),
          mastered_skills: mastered, focus_skills: focus, prerequisite_gaps: [],
          parent_prior_theta: priors[d], conflict: !!conflict,
          resolution: conflict ? null : 'none'
        });
      });
    }
    var anyConflict = domains.some(function (d) { return d.conflict; });
    var placement = {
      schema: 'placement/v1',
      report_id: uid('placement'),
      learner_id: child.id,
      generated_at: new Date().toISOString(),
      domains: domains,
      cat: {
        selection_rule: (CONTENT && CONTENT.assessment && CONTENT.assessment.selection_rule) || 'max-fisher-information-2pl-eap',
        mode: child.grade === 'preschool' ? 'show-me-checklist' : 'adaptive-lite-cat',
        items_served: assess.responses.length,
        min_items: 8, max_items: 10,
        conflict_rule: 'A10 — |cat_theta - parent_prior| >= 0.75 raises a conflict card; the engine never silently picks a side'
      },
      assessment_refs: assess.responses.map(function (r) { return r.id; }),
      guardian_gate: { status: 'pending', decided_by: null, decided_at: null, notes: null },
      plan_generation_allowed: false,
      starting_week: 1,
      strengths: domains.filter(function (d) { return d.mastered_skills && d.mastered_skills.length; })
        .map(function (d) { return d.domain + ': ' + d.mastered_skills.join(', '); }),
      focus_areas: domains.filter(function (d) { return d.focus_skills && d.focus_skills.length; })
        .map(function (d) { return d.domain + ': ' + d.focus_skills.join(', '); }),
      conflict: anyConflict
    };
    store.set(K.placement(child.id), placement);
    assess.phase = 'conflict';
    assess.placement = placement;
  }

  function renderConflictAndGate() {
    var c = assess.child;
    var pl = store.get(K.placement(c.id), null) || assess.placement;
    var conflicts = (pl.domains || []).filter(function (d) { return d.conflict; });
    var html = '';
    if (conflicts.length) {
      html += '<section class="conflict"><h3>Conflict card — the two assessments disagree</h3>' +
        '<p class="lede" style="color:#ffeec4">A10 rule: when the child\'s adaptive check and the parent questionnaire land more than 0.75 apart on a domain, SPROUT stops and shows you both. It never silently picks a side.</p>' +
        conflicts.map(function (d) {
          return '<div style="margin-top:12px"><b style="color:#eef2ff">' + esc(d.domain) + '</b><div class="mono">' +
            'child check θ ' + d.theta.toFixed(2) + ' (se ' + d.se.toFixed(2) + ') · parent prior θ ' +
            d.parent_prior_theta.toFixed(2) + '</div></div>';
        }).join('') +
        '<div class="field" style="margin-top:12px"><label>Guardian resolution</label>' +
        '<div class="opts" id="conflict-opts">' +
        '<button type="button" data-res="child">Start from the child\'s check — the questionnaire will be re-asked in two weeks.</button>' +
        '<button type="button" data-res="parent">Start from the parent estimate — we will re-check sooner.</button>' +
        '<button type="button" data-res="blend">Blend both and open with the focus areas from each.</button>' +
        '</div><div class="feedback" id="conflict-fb"></div></div>' +
        '</section>';
    }
    html += '<section class="panel"><h2>Placement result — ' + esc(c.name) + '</h2>' +
      placementCardHTML(pl) +
      '<div class="gate">' +
      '<label><input type="checkbox" id="pl-gate">' +
      '<span><b style="color:#fff">I reviewed this placement for ' + esc(c.name) + '.</b><br>' +
      '<span style="color:var(--mut);font-size:.84rem">Placement stays locked until a guardian reviews it. ' +
      'Approving unlocks the curriculum year build — that is the whole gate, and it is mandatory.</span></span></label>' +
      '<div class="gate-blocked" id="pl-blocked" hidden>⛔ Placement is locked until a guardian reviews it. No year plan can be generated yet.</div>' +
      '<div class="gate-open" id="pl-open" hidden>✓ Guardian approval recorded — curriculum creation unlocked.</div>' +
      '<div style="margin-top:12px"><button class="btn amber" id="pl-approve" type="button">Approve placement →</button></div>' +
      '</div></section>';
    return html;
  }

  function placementCardHTML(pl) {
    if (!pl) return '<p class="mono">No placement yet.</p>';
    return '<div class="placement-card">' +
      '<div class="mono">' + esc(pl.schema) + ' · report ' + esc(pl.report_id) + ' · ' + esc(pl.generated_at) + '</div>' +
      '<div class="mono" style="margin-top:4px">selection: ' + esc(pl.cat.selection_rule) + ' · mode: ' + esc(pl.cat.mode) +
      ' · items served: ' + pl.cat.items_served + '</div>' +
      (pl.domains || []).map(function (d) {
        return '<div class="domain"><div style="flex:1;min-width:220px">' +
          '<b style="color:#eef2ff">' + esc(d.domain === 'ela' ? 'English Language Arts' : 'Mathematics') + '</b>' +
          '<div class="mono">θ ' + d.theta.toFixed(2) + ' · SE ' + d.se.toFixed(2) +
          ' · confidence ' + esc(d.confidence) + ' · band ' + esc(d.grade_band) +
          (d.parent_prior_theta != null ? ' · parent prior θ ' + Number(d.parent_prior_theta).toFixed(2) : '') + '</div>' +
          (d.conflict ? '<div class="mono" style="color:#ffd166">conflict raised (A10) — guardian resolution required</div>' : '') +
          '<div class="taglist">' +
          (d.mastered_skills || []).map(function (s) { return '<span>✓ ' + esc(s) + '</span>'; }).join('') +
          (d.focus_skills || []).map(function (s) { return '<span>focus · ' + esc(s) + '</span>'; }).join('') +
          (d.checklist || []).map(function (i) { return '<span>' + esc(i.note) + ' · ' + (i.tap === 0 ? 'showed it' : i.tap === 1 ? 'with help' : 'not yet') + '</span>'; }).join('') +
          '</div></div></div>';
      }).join('') +
      (pl.strengths && pl.strengths.length ? '<div class="mono" style="margin-top:8px">strengths: ' + esc(pl.strengths.join(' · ')) + '</div>' : '') +
      (pl.focus_areas && pl.focus_areas.length ? '<div class="mono" style="margin-top:4px">focus areas: ' + esc(pl.focus_areas.join(' · ')) + '</div>' : '') +
      '</div>';
  }

  function renderPlacementCard(c, pl) {
    if (!pl) { renderAssess(c.id); return; }
    renderInto(
      '<section class="panel"><h2>Placement — ' + esc(c.name) + '</h2>' +
      placementCardHTML(pl) +
      '<div class="gate-open">✓ Guardian approved · plan generation allowed: ' + (pl.plan_generation_allowed ? 'yes' : 'no') + '</div>' +
      '<div style="margin-top:14px"><a class="btn" href="#/ceremony/' + esc(c.id) + '">Build the year plan →</a></div>' +
      '</section>');
  }

  function wireAssess(c) {
    var el;
    if ((el = $('assess-start'))) el.addEventListener('click', function () {
      assess.phase = assess.gk === 'preschool' ? 'checklist' : 'cat';
      renderAssess(c.id);
    });

    /* child CAT */
    if ((el = $('cat-opts')) && assess.item) {
      var item = assess.item;
      item.options.forEach(function (op, i) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = op;
        b.addEventListener('click', function () {
          if (assess.item !== item) return;
          var ok = op === item.answer;
          assess.used.push(item.item_id);
          assess.responses.push({ id: item.item_id, subject: item.subject, skill_tag: item.skill_tag, correct: ok, a: item.a, b: item.b });
          var est = eapEstimate(assess.responses.filter(function (r) { return r.subject === item.subject; }));
          if (item.subject === 'math') { assess.math.theta = est.theta; assess.math.se = est.se; assess.math.n = (assess.math.n || 0) + 1; }
          else { assess.ela.theta = est.theta; assess.ela.se = est.se; assess.ela.n = (assess.ela.n || 0) + 1; }
          Array.prototype.forEach.call(document.querySelectorAll('#cat-opts button'), function (x) { x.disabled = true; });
          b.classList.add(ok ? 'right' : 'wrong');
          var fb = $('cat-fb');
          fb.textContent = ok ? '✓ logged.' : '✓ logged — the engine adjusts from here.';
          fb.className = 'feedback ok';
          var nx = $('cat-next'); nx.style.display = 'inline-block';
          var done = assess.used.length >= 10;
          if (!done) {
            var dom = item.subject === 'math' ? assess.math : assess.ela;
            done = assess.used.length >= 8 && dom.se <= 0.35;
          }
          if (done) {
            assess.catDomain = assess.catDomain === 'math' && assess.math.n < 4 ? 'ela' : assess.catDomain;
            nx.textContent = 'See what is next →';
          } else nx.textContent = 'Next →';
        });
        el.appendChild(b);
      });
    }
    if ((el = $('cat-next'))) el.addEventListener('click', function () {
      var item = assess.item;
      if (item && assess.used.indexOf(item.item_id) < 0) {
        // safety: force a recorded response if the button is used oddly
        assess.used.push(item.item_id);
        assess.responses.push({ id: item.item_id, subject: item.subject, skill_tag: item.skill_tag, correct: false, a: item.a, b: item.b });
      }
      // domain switching: finish math block, then ela block
      var mathDone = (assess.math.n || 0) >= 4 || (assess.used.length >= 8 && assess.math.se <= 0.35);
      var elaDone = (assess.ela.n || 0) >= 4;
      if (assess.catDomain === 'math' && mathDone && !elaDone) assess.catDomain = 'ela';
      else if (assess.catDomain === 'ela' && mathDone && elaDone && assess.used.length < 10) {
        // second pass: back to the domain with the higher SE
        assess.catDomain = (assess.math.se > assess.ela.se) ? 'math' : 'ela';
      }
      if ((assess.math.n || 0) + (assess.ela.n || 0) >= 10 || (assess.math.n || 0) >= 4 && (assess.ela.n || 0) >= 4 && assess.used.length >= 8) {
        assess.item = null; assess.phase = 'questionnaire'; assess.qIdx = 0;
        renderAssess(c.id); return;
      }
      assess.item = null;
      renderAssess(c.id);
    });

    /* preschool checklist */
    if ((el = $('ps-opts')) && assess.checklist[assess.qIdx]) {
      var ci = assess.checklist[assess.qIdx];
      ci.choices.forEach(function (ch, i) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = ch;
        b.addEventListener('click', function () {
          assess.checklist[assess.qIdx].tap = i;
          Array.prototype.forEach.call(document.querySelectorAll('#ps-opts button'), function (x) { x.disabled = true; });
          b.classList.add(i === 0 ? 'right' : 'wrong');
          var fb = $('ps-fb');
          fb.textContent = i === 0 ? '✓ noted for the portfolio.' : (i === 1 ? '✓ noted — we will show it again.' : '✓ noted — no score, no red marks.');
          fb.className = 'feedback ok';
          var nx = $('ps-next'); nx.style.display = 'inline-block';
          nx.textContent = assess.qIdx === assess.checklist.length - 1 ? 'Parent questions next →' : 'Next →';
        });
        el.appendChild(b);
      });
    }
    if ((el = $('ps-next'))) el.addEventListener('click', function () {
      assess.qIdx++;
      if (assess.qIdx >= assess.checklist.length) { assess.phase = 'questionnaire'; assess.qIdx = 0; }
      renderAssess(c.id);
    });

    /* questionnaire */
    if ((el = $('pq-opts')) && QUESTIONNAIRE[assess.qIdx]) {
      var q = QUESTIONNAIRE[assess.qIdx];
      q.opts.forEach(function (o) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = o[0];
        b.addEventListener('click', function () {
          assess.priors[q.id] = o[1];
          assess.qIdx++;
          if (assess.qIdx >= QUESTIONNAIRE.length) {
            finishAssessment(c);
            assess.phase = 'conflict';
            renderAssess(c.id);
            return;
          }
          renderAssess(c.id);
        });
        el.appendChild(b);
      });
    }

    /* conflict resolution + guardian gate */
    if ((el = $('conflict-opts'))) {
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-res]'); if (!b) return;
        var pl = store.get(K.placement(c.id), null);
        if (!pl) return;
        (pl.domains || []).forEach(function (d) {
          if (d.conflict) {
            d.resolution = b.getAttribute('data-res');
            if (b.getAttribute('data-res') === 'child') d.theta = d.parent_prior_theta != null ? d.theta : d.theta;
            if (b.getAttribute('data-res') === 'parent') d.theta = d.parent_prior_theta;
            if (b.getAttribute('data-res') === 'blend') d.theta = Math.round(((d.theta + (d.parent_prior_theta || 0)) / 2) * 100) / 100;
          }
        });
        store.set(K.placement(c.id), pl);
        $('conflict-fb').textContent = 'Resolution recorded on the placement report. The guardian gate is next.';
        $('conflict-fb').className = 'feedback ok';
      });
    }
    if ((el = $('pl-gate'))) el.addEventListener('change', function () {
      $('pl-blocked').hidden = el.checked;
      $('pl-open').hidden = !el.checked;
    });
    if ((el = $('pl-approve'))) el.addEventListener('click', function () {
      var pl = store.get(K.placement(c.id), null);
      if (!pl) { toast('Finish the assessment first.', true); return; }
      var conflicts = (pl.domains || []).filter(function (d) { return d.conflict && !d.resolution; });
      if (conflicts.length) {
        $('pl-blocked').hidden = false;
        $('pl-open').hidden = true;
        toast('Resolve the conflict card first — the engine will not pick a side for you.', true);
        return;
      }
      if (!$('pl-gate').checked) {
        $('pl-blocked').hidden = false;
        toast('Placement is locked until a guardian reviews it.', true);
        return;
      }
      pl.guardian_gate = {
        status: 'approved', decided_by: requireSession() ? requireSession().name : 'guardian',
        decided_at: new Date().toISOString(),
        notes: 'Reviewed in the public demo flow'
      };
      pl.plan_generation_allowed = true;
      store.set(K.placement(c.id), pl);
      toast('Placement approved for ' + c.name + '. Building the year comes next.');
      go('#/ceremony/' + c.id);
    });
  }

  /* ================= CURRICULUM CEREMONY (F4) ================= */
  function buildYearPlan(c) {
    var gk = c.grade;
    var wks = weeks(gk);
    var weekMap = [];
    for (var wn = 1; wn <= 6; wn++) {
      var w = weekData(gk, wn);
      if (!w) { weekMap.push({ week: wn, theme: '', status: 'not_in_demo' }); continue; }
      if (w.topic_only) weekMap.push({ week: wn, theme: w.theme || '', status: 'topics_only', badge: w.badge || 'Section coming soon' });
      else weekMap.push({ week: wn, theme: w.theme || '', status: wn <= 2 ? 'full' : 'topics_only', days: (w.days || []).length, blocks: w.counts ? w.counts.blocks : 0 });
    }
    var covered = {};
    for (var i = 1; i <= 2; i++) {
      var wd = weekData(gk, i);
      (wd && wd.days || []).forEach(function (d) {
        (d.blocks || []).forEach(function (b) {
          var s = (b.subject || '').toLowerCase();
          var stat = SUBJECT_MAP[s] || s;
          if (STATUTORY.indexOf(stat) >= 0) covered[stat] = (covered[stat] || 0) + 1;
        });
      });
    }
    var audit = STATUTORY.map(function (s) {
      return { subject: s, covered_in_weeks: covered[s] || 0, in_year_spine: true };
    });
    return {
      schema: 'year_plan/v0',
      plan_id: uid('plan'),
      learner_id: c.id,
      learner_label: c.name,
      grade_band: String(c.grade),
      generated_at: new Date().toISOString(),
      mode: 'A',
      spine: STATUTORY.slice(),
      spine_note: 'Mode A spine — every plan covers all nine MCL 380.1561(3)(f) subject areas (D7, verified).',
      weeks: weekMap,
      coverage_audit: audit,
      assessment_ref: (function () { var pl = store.get(K.placement(c.id), null); return pl ? pl.report_id : null; })(),
      compliance_copy: COMPLIANCE_COPY,
      guardian_gate: { status: 'pending', decided_by: null, decided_at: null },
      approved: false
    };
  }

  function renderCeremony(childId) {
    var c = childById(childId);
    if (!c) { go('#/children'); return; }
    var pl = store.get(K.placement(c.id), null);
    if (!pl || !pl.guardian_gate || pl.guardian_gate.status !== 'approved') {
      renderInto('<section class="panel"><h2>Curriculum creation is locked</h2>' +
        '<p class="lede">Placement is locked until a guardian reviews it — the year plan cannot be generated yet.</p>' +
        '<div style="margin-top:12px"><a class="btn" href="#/assess/' + esc(c.id) + '">Back to the placement →</a></div></section>');
      return;
    }
    var existing = store.get(K.yearplan(c.id), null);
    var yp = existing && existing.approved ? existing : null;
    if (yp) { renderCeremonyDone(c, yp); return; }

    if (!assess || !assess.ceremony || assess.child.id !== c.id) {
      assess = assess && assess.child && assess.child.id === c.id ? assess : { child: c, gk: c.grade };
      assess.ceremony = { step: 0, plan: buildYearPlan(c) };
    }
    var C = assess.ceremony;
    var steps = [
      { k: '1', t: 'year_plan/v0 skeleton' },
      { k: '2', t: 'Mode A spine — nine subjects' },
      { k: '3', t: 'Week map' },
      { k: '4', t: 'Coverage audit' },
      { k: '5', t: 'Guardian gate' },
      { k: '6', t: 'Done' }
    ];
    var stepper = '<div class="stepper">' + steps.map(function (s, i) {
      return '<div class="step ' + (i < C.step ? 'done' : (i === C.step ? 'on' : '')) + '"><span class="k">' + s.k + '</span>' + esc(s.t) + '</div>';
    }).join('') + '</div>';

    var body = '';
    if (C.step === 0) {
      body = '<div class="mono">Showing the real object as it is built — not a spinner.</div>' +
        '<pre class="code">' + esc(JSON.stringify(C.plan, null, 1)) + '</pre>' +
        '<button class="btn" id="cer-next">Add the Mode A spine →</button>';
    } else if (C.step === 1) {
      body = '<p class="lede">' + esc(C.plan.spine_note) + '</p>' +
        '<div class="cov">' + STATUTORY.map(function (s) { return '<span><b>✓</b> ' + esc(s) + '</span>'; }).join('') + '</div>' +
        '<div class="mono" style="margin-top:10px">Status: verified-D7 · ' + esc(COMPLIANCE_COPY) + '</div>' +
        '<button class="btn" id="cer-next" style="margin-top:14px">Build the week map →</button>';
    } else if (C.step === 2) {
      body = '<div class="weekpick"><span class="mono">six weeks planned for ' + esc(c.name) + ':</span></div>' +
        C.plan.weeks.map(function (w) {
          var badge = w.status === 'full' ? '<span class="pill live">full week</span>' :
            '<span class="pill soon">' + esc(w.badge || 'Section coming soon') + '</span>';
          return '<div class="topiccard"><h3>Week ' + w.week + ' — ' + esc(w.theme || 'Topic to follow') + '</h3>' +
            '<div class="mono" style="margin-top:6px">' + (w.status === 'full' ? (w.days + ' days · ' + w.blocks + ' blocks · lessons, practice, weekly test') : 'topic card only — the section is not in this demo yet') + '</div>' +
            '<div style="margin-top:8px">' + badge + '</div></div>';
        }).join('') +
        '<button class="btn" id="cer-next" style="margin-top:14px">Run the coverage audit →</button>';
    } else if (C.step === 3) {
      body = '<p class="lede">Every statutory subject is on the plan spine. Week-level coverage is read from the real schedule blocks for weeks 1–2.</p>' +
        '<div class="cov">' + C.plan.coverage_audit.map(function (a) {
          return '<span><b>' + (a.covered_in_weeks > 0 ? '✓' : '·') + '</b> ' + esc(a.subject) +
            '<div class="mono">' + (a.covered_in_weeks > 0 ? a.covered_in_weeks + ' block(s) in weeks 1–2' : 'on the year spine — carried in the full-year map') + '</div></span>';
        }).join('') + '</div>' +
        '<div class="mono" style="margin-top:10px">audit against the nine-subject list · MCL 380.1561(3)(f) · verified-D7 · not legal advice</div>' +
        '<button class="btn" id="cer-next" style="margin-top:14px">Send to the guardian gate →</button>';
    } else if (C.step === 4) {
      body = '<div class="gate">' +
        '<label><input type="checkbox" id="cer-gate">' +
        '<span><b style="color:#fff">I approve this year plan for ' + esc(c.name) + '.</b><br>' +
        '<span style="color:var(--mut);font-size:.84rem">This is the second guardian gate. Nothing in the portal opens until the plan itself is approved.</span></span></label>' +
        '<div class="gate-blocked" id="cer-blocked" hidden>⛔ The year plan stays draft until a guardian approves it.</div>' +
        '<div class="gate-open" id="cer-open" hidden>✓ Guardian approval recorded.</div>' +
        '<button class="btn amber" id="cer-approve" style="margin-top:12px">Approve the year plan →</button>' +
        '</div>';
    }
    renderInto(
      '<section class="panel"><h2>Curriculum creation — ' + esc(c.name) + '</h2>' +
      '<p class="lede">Building your year… the ceremony shows the real schema objects at each step, then takes a second guardian approval.</p>' +
      stepper +
      '<div style="margin-top:14px">' + body + '</div>' +
      '</section>');

    var b;
    if ((b = $('cer-next'))) b.addEventListener('click', function () { C.step++; renderCeremony(c.id); });
    if ((b = $('cer-gate'))) b.addEventListener('change', function () {
      $('cer-blocked').hidden = b.checked; $('cer-open').hidden = !b.checked;
    });
    if ((b = $('cer-approve'))) b.addEventListener('click', function () {
      if (!$('cer-gate').checked) { $('cer-blocked').hidden = false; toast('The year plan stays draft until a guardian approves it.', true); return; }
      C.plan.guardian_gate = {
        status: 'approved', decided_by: requireSession() ? requireSession().name : 'guardian',
        decided_at: new Date().toISOString()
      };
      C.plan.approved = true;
      store.set(K.yearplan(c.id), C.plan);
      C.step = 5;
      toast('Year plan approved for ' + c.name + '. Portal unlocked.');
      go('#/portal/' + c.id);
    });
  }

  function renderCeremonyDone(c, yp) {
    renderInto('<section class="panel"><h2>Year plan approved — ' + esc(c.name) + '</h2>' +
      '<p class="lede">The plan is live in the portal: week 1 full, week 2 full, weeks 3–6 topic cards with “Section coming soon”.</p>' +
      '<pre class="code">' + esc(JSON.stringify({ schema: yp.schema, plan_id: yp.plan_id, mode: yp.mode, approved: yp.approved, weeks: yp.weeks, guardian_gate: yp.guardian_gate }, null, 1)) + '</pre>' +
      '<div style="margin-top:14px"><a class="cta" href="#/portal/' + esc(c.id) + '">Open the portal →</a>' +
      ' <a class="btn ghost" href="#/children">Back to children</a></div>' +
      '</section>');
  }

  /* ================= STUDENT PORTAL (F5) ================= */
  var portal = { child: null, week: 1, tab: 'week' };

  /* keypad gate (tile-first, exactly the SaittaSprout interaction:
     digits typed before a tile are buffered and ignored until a tile is
     tapped; CLR resets the buffer on retry) */
  function gateKey(id) { return NS + '.gate.' + id; }
  function gateUnlocked(id) { return !!store.get(gateKey(id), null); }
  var gateState = { tile: null, buf: '', msg: '' };
  function renderGatePad(c) {
    var kids = children();
    gateState.tile = gateState.tile || null;
    renderInto(
      '<section class="panel"><h2>Portal gate — ' + esc(c.name) + '</h2>' +
      '<p class="lede">Tap your name first, then the keypad PIN (shown to the grown-up on the children page).</p>' +
      '<div class="gatepad">' +
      '<div class="tiles" id="gate-tiles">' +
      kids.map(function (k) {
        return '<button type="button" class="tile ' + (gateState.tile === k.id ? 'on' : '') + '" data-tile="' + esc(k.id) + '">' +
          '<span class="totem">' + (PERSONA_TOTEM[k.grade] || '🌱') + '</span>' + esc(k.name) + '</button>';
      }).join('') +
      '</div>' +
      '<div class="dots" id="gate-dots" aria-label="PIN entered so far"></div>' +
      '<div class="pad" id="gate-pad">' +
      ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(function (d) { return '<button type="button" data-digit="' + d + '">' + d + '</button>'; }).join('') +
      '<button type="button" class="wide" data-digit="clr">CLR</button>' +
      '<button type="button" data-digit="0">0</button>' +
      '<button type="button" class="wide" data-digit="enter">Enter →</button>' +
      '</div>' +
      '<div class="pad-msg" id="gate-msg"></div>' +
      '<div class="mono" style="margin-top:10px">Demo PIN for this child: ' + esc(c.pin_hint || '—') + '</div>' +
      '</div></section>');
    var dots = $('gate-dots');
    function paint() {
      dots.innerHTML = [0, 1, 2, 3].map(function (i) { return '<i class="' + (i < gateState.buf.length ? 'on' : '') + '"></i>'; }).join('');
      $('gate-msg').textContent = gateState.msg;
    }
    paint();
    $('gate-tiles').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tile]'); if (!b) return;
      gateState.tile = b.getAttribute('data-tile');
      gateState.buf = ''; gateState.msg = '';
      Array.prototype.forEach.call(document.querySelectorAll('#gate-tiles .tile'), function (x) {
        x.classList.toggle('on', x.getAttribute('data-tile') === gateState.tile);
      });
      paint();
    });
    $('gate-pad').addEventListener('click', function (e) {
      var b = e.target.closest('[data-digit]'); if (!b) return;
      var v = b.getAttribute('data-digit');
      if (v === 'clr') { gateState.buf = ''; gateState.msg = ''; paint(); return; }
      if (v === 'enter') {
        if (!gateState.tile) { gateState.msg = 'Tap your name first.'; paint(); return; }
        var kid = childById(gateState.tile);
        if (!kid) { gateState.msg = 'Unknown tile.'; paint(); return; }
        if (digest(gateState.buf, NS + ':childpin') === kid.pin_digest) {
          store.set(gateKey(kid.id), { schema: MARKER, at: new Date().toISOString() });
          gateState.buf = ''; gateState.msg = '';
          go('#/portal/' + kid.id);
          return;
        }
        gateState.buf = ''; gateState.msg = 'That PIN did not match — tap CLR and try again.'; paint();
        return;
      }
      if (!gateState.tile) { gateState.msg = 'Tap your name first.'; paint(); return; }
      if (gateState.buf.length < 4) { gateState.buf += v; gateState.msg = ''; paint(); }
    });
  }

  function renderPortal(childId) {
    var c = childById(childId);
    if (!c) { go('#/children'); return; }
    var yp = store.get(K.yearplan(c.id), null);
    if (!yp || !yp.approved) { go('#/ceremony/' + c.id); return; }
    if (!gateUnlocked(c.id)) { renderGatePad(c); return; }
    portal.child = c;
    var s = '<section class="panel"><div class="portal-head">' +
      '<div class="totem">' + (PERSONA_TOTEM[c.grade] || '🌱') + '</div>' +
      '<div><div style="font-size:1.25rem;color:#fff;font-weight:700">' + esc(c.name) + '</div>' +
      '<div class="mono">' + esc(GRADE_LABEL[c.grade]) + ' · ' + esc((gradeMeta(c.grade) || {}).persona || c.name) + ' persona · plan ' + esc(yp.plan_id) + '</div></div>' +
      '<div style="margin-left:auto"><a class="btn ghost sm" href="#/children">← children</a></div>' +
      '</div>';
    s += '<div class="tabs" id="portal-tabs">' +
      '<button type="button" data-tab="week" class="' + (portal.tab === 'week' ? 'active' : '') + '">This week</button>' +
      '<button type="button" data-tab="weeks" class="' + (portal.tab === 'weeks' ? 'active' : '') + '">Weeks 3–6</button>' +
      '<button type="button" data-tab="progress" class="' + (portal.tab === 'progress' ? 'active' : '') + '">Progress</button>' +
      '<button type="button" data-tab="parent" class="' + (portal.tab === 'parent' ? 'active' : '') + '">Parent view</button>' +
      '</div><div id="portal-body"></div></section>';
    renderInto(s);
    $('portal-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]'); if (!b) return;
      portal.tab = b.getAttribute('data-tab');
      renderPortal(c.id);
    });
    renderPortalBody(c);
  }

  function renderPortalBody(c) {
    var body = $('portal-body');
    if (portal.tab === 'week') body.innerHTML = portalWeekHTML(c);
    else if (portal.tab === 'weeks') body.innerHTML = portalWeeksHTML(c);
    else if (portal.tab === 'progress') body.innerHTML = portalProgressHTML(c);
    else if (portal.tab === 'parent') body.innerHTML = portalParentHTML(c);
    wirePortal(c);
  }

  function blockState(childId, blockKey) {
    var p = store.progress(childId);
    return (p.lessons_done && p.lessons_done[blockKey]) || 'Not started';
  }

  function portalWeekHTML(c) {
    var gk = c.grade;
    var w = weekData(gk, portal.week) || {};
    if (w.topic_only) {
      return '<div class="topiccard"><h3>Week ' + portal.week + ' — ' + esc(w.theme || 'Topic to follow') + '</h3>' +
        '<div class="mono" style="margin-top:6px">This section is not in the demo yet.</div>' +
        '<div style="margin-top:8px"><span class="pill soon">' + esc(w.badge || 'Section coming soon') + '</span></div></div>';
    }
    var days = w.days || [];
    var out = '<div class="weekpick"><span class="mono">Week</span>' +
      [1, 2].map(function (n) {
        return '<button class="btn ' + (portal.week === n ? '' : 'ghost') + ' sm" data-week="' + n + '">Week ' + n + '</button>';
      }).join('') +
      '<span class="mono">' + esc(w.theme || '') + '</span></div>';

    days.slice(0, 4).forEach(function (d) {
      out += '<div class="dayblock"><header><b>Day ' + d.day + '</b><span class="mono">' +
        (d.total_min ? d.total_min + ' min planned' : '') + '</span></header>' +
        (d.parent_note ? '<div class="note">Grown-up note: ' + esc(d.parent_note) + '</div>' : '');
      (d.blocks || []).forEach(function (b, i) {
        var lid = b.lesson_ref || null;
        var lesson = lid ? findLesson(gk, portal.week, lid) : null;
        var hasGen = lid ? !!lessonToGenerator(lid, gk, portal.week) : false;
        var st = blockState(c.id, portal.week + ':' + d.day + ':' + (lid || b.subject + i));
        out += '<div class="blockrow">' +
          '<div class="subj">' + esc(b.subject) + '<small>' + (b.min || 0) + ' min</small></div>' +
          '<div class="act">' + esc(b.activity || '') +
          (lesson ? '' : '<div class="mono" style="margin-top:4px">' + (b.passage_ref ? 'reading passage · lesson opens below' : '') + '<span class="pill soon">Lesson · coming soon</span></div>') +
          '</div>' +
          '<div class="acts">' +
          (lesson ? '<button class="btn sm" data-open-lesson="' + esc(lid) + '" data-block-key="' + esc(portal.week + ':' + d.day + ':' + (lid || b.subject + i)) + '">📖 Open lesson</button>' : '') +
          (hasGen ? '<button class="btn ghost sm" data-practice="' + esc(lid) + '">🎲 Practice</button>' : '') +
          (b.passage_ref ? '<button class="btn ghost sm" data-passage="' + esc(b.passage_ref) + '" data-lesson="' + esc(lid || '') + '">📚 Passage</button>' : '') +
          '<span class="pill state">' + esc(st) + '</span>' +
          '</div></div>';
      });
      out += '</div>';
    });

    var test = w.test;
    if (test) {
      var tid = test.quizId || ('wk' + portal.week + '_test');
      var p = store.progress(c.id);
      var res = p.tests && p.tests[tid];
      out += '<div class="card" style="margin-top:14px"><h3>' + esc(test.title || 'Weekly test') + '</h3>' +
        '<p class="mono">' + (test.questions ? test.questions.length + (test.format === 'show-me-checklist' ? ' show-me items' : ' questions') : '') +
        (test.passScore != null ? ' · pass mark ' + Math.round(test.passScore * 100) + '%' : ' · no pass mark') +
        (res ? ' · last result ' + res.pct + '%' : '') + '</p>' +
        '<div style="margin-top:10px"><button class="btn amber" data-test="' + esc(tid) + '">' +
        (res ? 'Take it again' : 'Start the weekly test') + '</button></div></div>';
    }
    return out;
  }

  function portalWeeksHTML(c) {
    var gk = c.grade;
    var out = '';
    [3, 4, 5, 6].forEach(function (wn) {
      var w = weekData(gk, wn) || { theme: '', badge: 'Section coming soon' };
      out += '<div class="topiccard"><h3>Week ' + wn + ' — ' + esc(w.theme || 'Topic to follow') + '</h3>' +
        '<p class="mono" style="margin-top:6px">' + (w.goal ? esc(w.goal) : 'Theme extracted from the year plan; the section itself is not in this demo yet.') + '</p>' +
        '<div class="chips">' + ((w.subject_chips || []).map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('') || '<span>subject mix to follow</span>') + '</div>' +
        '<div style="margin-top:10px"><span class="pill soon">' + esc(w.badge || 'Section coming soon') + '</span></div></div>';
    });
    out += '<div class="topiccard"><h3>Locked grades</h3><p class="mono" style="margin-top:6px">K–12 coverage is on the roadmap — the same badge pattern appears on every locked grade.</p>' +
      '<div class="chips">' + GRADE_ORDER.filter(function (g) { return GRADES_ENABLED.indexOf(g) < 0; })
      .map(function (g) { return '<span>' + esc(GRADE_LABEL[g]) + ' · coming soon</span>'; }).join('') + '</div></div>';
    return out;
  }

  function portalProgressHTML(c) {
    var p = store.progress(c.id);
    var streams = p.streams && p.streams[c.id] ? p.streams[c.id] : {};
    var xp = p.xp || 0;
    var leitner = p.leitner || {};
    var skills = Object.keys(leitner).slice(0, 12);
    var out = '<div class="statgrid">' +
      '<div class="mini"><div class="k">XP</div><div class="v">' + xp + '</div></div>' +
      '<div class="mini"><div class="k">Practice sessions</div><div class="v">' + Object.keys(streams).length + '</div></div>' +
      '<div class="mini"><div class="k">Lessons opened</div><div class="v">' + Object.keys(p.lessons_done || {}).length + '</div></div>' +
      '<div class="mini"><div class="k">Weekly tests</div><div class="v">' + Object.keys(p.tests || {}).length + '</div></div>' +
      '</div>';
    out += '<div class="card" style="margin-top:14px"><h3>Review queue (Leitner, read-only)</h3>' +
      (skills.length
        ? skills.map(function (s) {
          var L = leitner[s];
          return '<div class="skillrow"><span>' + esc(s) + '</span>' +
            '<span class="mono">box ' + L.box + ' · next ' + esc(L.next_review || '—') + '</span>' +
            '<span class="pill state">' + esc(L.state || 'In progress') + '</span></div>';
        }).join('')
        : '<p class="mono">Practice a lesson and the queue fills in here.</p>') +
      '<div class="mono" style="margin-top:10px">Neutral states only — “Not started / In progress / Reviewed / Coming soon”. Nothing is ever marked behind or failing.</div>' +
      '</div>';
    out += '<div class="card" style="margin-top:14px"><h3>Your progress file</h3>' +
      '<p class="mono">Export writes a JSON file to this browser\'s downloads. Import validates the file, asks for confirmation, and never breaks your session.</p>' +
      '<div style="margin-top:10px"><button class="btn" id="prog-export">⬇ Export progress JSON</button> ' +
      '<button class="btn ghost" id="prog-import">⬆ Import progress JSON</button></div>' +
      '<pre class="code" id="prog-preview" style="margin-top:12px">' + esc(JSON.stringify(exportPayload(c), null, 1).slice(0, 1400)) + '</pre></div>';
    return out;
  }

  function portalParentHTML(c) {
    var pl = store.get(K.placement(c.id), null);
    var yp = store.get(K.yearplan(c.id), null);
    var p = store.progress(c.id);
    var tests = p.tests || {};
    var cov = (yp && yp.coverage_audit) || [];
    var out = '<div class="card"><h3>Placement card</h3>' + placementCardHTML(pl) + '</div>';
    out += '<div class="card" style="margin-top:14px"><h3>Weekly-test results</h3>' +
      (Object.keys(tests).length
        ? Object.keys(tests).map(function (k) {
          var t = tests[k];
          return '<div class="skillrow"><span>' + esc(k) + '</span><span class="mono">' + t.correct + '/' + t.total + ' · ' + t.pct + '%</span>' +
            '<span class="pill state">' + esc(t.state || 'Reviewed') + '</span></div>';
        }).join('')
        : '<p class="mono">No weekly tests taken yet.</p>') + '</div>';
    out += '<div class="card" style="margin-top:14px"><h3>Coverage audit — nine statutory subjects</h3>' +
      '<div class="cov">' + cov.map(function (a) {
        return '<span><b>' + (a.covered_in_weeks > 0 ? '✓' : '·') + '</b> ' + esc(a.subject) +
          '<div class="mono">' + (a.covered_in_weeks > 0 ? a.covered_in_weeks + ' block(s) w1–2' : 'on the year spine') + '</div></span>';
      }).join('') + '</div>' +
      '<p class="mono" style="margin-top:10px">' + esc(COMPLIANCE_COPY) + ' · MCL 380.1561(3)(f) · verified-D7 · not legal advice</p></div>';
    out += '<div class="card" style="margin-top:14px"><h3>Guardian approvals</h3>' +
      '<div class="skillrow"><span>Placement</span><span class="mono">' + esc(pl && pl.guardian_gate ? pl.guardian_gate.status : 'pending') + '</span></div>' +
      '<div class="skillrow"><span>Year plan</span><span class="mono">' + esc(yp && yp.guardian_gate ? yp.guardian_gate.status : 'pending') + '</span></div>' +
      '<div class="mono" style="margin-top:8px">Portal keypad PIN for this demo: ' + esc(c.pin_hint || '—') + '</div></div>';
    return out;
  }

  var portalWired = false;
  function wirePortal(c) {
    var b;
    if (!portalWired && (b = $('portal-body'))) {
      portalWired = true;               // delegated once — tab switches re-render the inner HTML only
      b.addEventListener('click', function (e) {
        var t = e.target.closest('button'); if (!t) return;
        if (t.hasAttribute('data-week')) { portal.week = +t.getAttribute('data-week'); renderPortalBody(c); return; }
        if (t.hasAttribute('data-open-lesson')) {
          openLesson(c, t.getAttribute('data-open-lesson'), portal.week, t.getAttribute('data-block-key'), null);
          return;
        }
        if (t.hasAttribute('data-practice')) {
          openLesson(c, t.getAttribute('data-practice'), portal.week, null, 'practice');
          return;
        }
        if (t.hasAttribute('data-passage')) {
          openPassage(c, t.getAttribute('data-passage'), t.getAttribute('data-lesson'));
          return;
        }
        if (t.hasAttribute('data-test')) { runWeeklyTest(c, t.getAttribute('data-test')); return; }
      });
    }
    if ((b = $('prog-export'))) b.addEventListener('click', function () { exportProgress(c); });
    if ((b = $('prog-import'))) b.addEventListener('click', function () { $('import-file-progress').click(); });
  }

  /* ---------- lesson view (ported SPRUT_LESSON) ---------- */
  var activeLessonCtx = null;
  function openLesson(c, lessonId, wn, blockKey, mode) {
    var gk = c.grade;
    var lesson = findLesson(gk, wn, lessonId);
    if (!lesson) { toast('That lesson is not in this demo build yet.', true); return; }
    var p = store.progress(c.id);
    var root = $('modal-root');
    root.hidden = false;
    root.innerHTML = '<div class="modal-card"><button class="modal-close" id="lesson-x" type="button" aria-label="Close lesson">✕ close</button><div id="lesson-host"></div></div>';

    var dateStr = dayStr(new Date());
    var lessonCopy = JSON.parse(JSON.stringify(lesson));
    if (mode === 'practice' && !lessonCopy.content.generator) {
      var g = lessonToGenerator(lessonId, gk, wn);
      if (g) lessonCopy.content.generator = g;
    }
    if (!lessonCopy.subject) {
      // infer subject from the schedule block that references it
      (weekData(gk, wn).days || []).forEach(function (d) {
        (d.blocks || []).forEach(function (b) { if (b.lesson_ref === lessonId) lessonCopy.subject = b.subject; });
      });
    }
    var ctx = {
      lesson: lessonCopy,
      modal: root.querySelector('.modal-card'),
      student: c.id,
      date: dateStr,
      registry: registryFor(gk, wn),
      passages: passagesFor(gk, wn),
      subject: lessonCopy.subject || null,
      plannedMinutes: lessonCopy.minutes || 15,
      read: function () { return store.progress(c.id); },
      update: function (patch) {
        var cur = store.progress(c.id);
        Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
        store.saveProgress(c.id, cur);
      }
    };
    var L = window.SPRUT_LESSON;
    if (!L || !L.buildHTML) { root.innerHTML = '<div class="modal-card" style="padding:18px">Lesson engine unavailable.</div>'; return; }
    root.querySelector('#lesson-host').innerHTML = L.buildHTML(ctx);
    activeLessonCtx = ctx;
    try { L.wire(ctx); } catch (err) { console.error(err); }

    // mark done + bookkeeping on top of the ported engine
    var markBtn = root.querySelector('#lesson-done') || root.querySelector('.mark-done');
    if (markBtn) markBtn.addEventListener('click', function () {
      var cur = store.progress(c.id);
      cur.lessons_done = cur.lessons_done || {};
      var key = blockKey || (wn + ':' + lessonId);
      cur.lessons_done[key] = 'Reviewed';
      if (!cur.xp_once) cur.xp_once = {};
      if (!cur.xp_once['lesson:' + lessonId]) { cur.xp_once['lesson:' + lessonId] = true; cur.xp = (cur.xp || 0) + 10; }
      store.saveProgress(c.id, cur);
      toast('Marked reviewed — ' + (cur.xp || 0) + ' XP.');
    });
    var x = root.querySelector('#lesson-x');
    if (x) x.addEventListener('click', closeLesson);
    root.addEventListener('click', function (e) { if (e.target === root) closeLesson(); });
  }
  function closeLesson() {
    var ctx = activeLessonCtx;
    if (ctx && typeof ctx.onClose === 'function') { try { ctx.onClose(); } catch (e) {} }
    activeLessonCtx = null;
    var root = $('modal-root');
    root.hidden = true; root.innerHTML = '';
    var r = route();
    if (r.view === 'portal' && portal.child) renderPortalBody(portal.child);
  }
  function openPassage(c, passageId, lessonId) {
    var gk = c.grade;
    var pass = passagesFor(gk, portal.week).filter(function (p) { return p.id === passageId; })[0];
    if (!pass) { toast('That passage is not in this demo build yet.', true); return; }
    var root = $('modal-root');
    root.hidden = false;
    var L = window.SPRUT_LESSON;
    var html = '<div class="modal-card" style="padding:20px"><button class="modal-close" id="lesson-x" type="button" aria-label="Close">✕ close</button>' +
      '<span class="badge" style="background:var(--acc);color:#001b12;border-radius:20px;padding:3px 11px;font-size:.75rem;font-weight:800">Reading passage</span>' +
      '<h2 style="margin-top:10px;color:#eef2ff">' + esc(pass.title || 'Passage') + '</h2>' +
      '<p class="mono">tap a word to keep it</p>' +
      '<div id="passage-body" style="margin-top:12px;font-size:1.02rem;color:#e7ecfa;line-height:1.75">' +
      (L && L.passageHTML ? L.passageHTML(pass.text || '', pass.vocab || pass.words || [], []) : esc(pass.text || '')) +
      '</div></div>';
    root.innerHTML = html;
    root.querySelector('#lesson-x').addEventListener('click', function () {
      root.hidden = true; root.innerHTML = '';
      var r = route(); if (r.view === 'portal' && portal.child) renderPortalBody(portal.child);
    });
  }

  /* ---------- weekly test ---------- */
  function runWeeklyTest(c, testId) {
    var w = weekData(c.grade, portal.week) || {};
    var test = w.test;
    if (!test) { toast('No test for this week in the demo.', true); return; }
    var questions = test.questions || test.items || [];
    if (!questions.length) { toast('This test has no items in the demo build.', true); return; }
    var state = { i: 0, correct: 0, answers: [] };
    var root = $('modal-root');
    root.hidden = false;

    function draw() {
      var q = questions[state.i];
      var isChecklist = test.format === 'show-me-checklist';
      var opts = q.options || q.choices || [];
      root.innerHTML = '<div class="modal-card" style="padding:20px">' +
        '<button class="modal-close" id="test-x" type="button" aria-label="Close test">✕ close</button>' +
        '<div class="mono">' + esc(test.title || 'Weekly test') + ' · item ' + (state.i + 1) + '/' + questions.length +
        (test.passScore != null ? ' · pass mark ' + Math.round(test.passScore * 100) + '%' : ' · no pass mark') + '</div>' +
        '<h3 style="margin-top:10px;font-size:1.15rem;color:#fff">' + (q.emoji ? q.emoji + ' ' : '') + esc(q.q || q.prompt || '') + '</h3>' +
        '<div class="opts" id="test-opts"></div><div class="feedback" id="test-fb"></div>' +
        '<button class="btn amber" id="test-next" style="display:none;margin-top:12px">' +
        (state.i === questions.length - 1 ? 'See my result →' : 'Next →') + '</button></div>';
      var box = root.querySelector('#test-opts');
      opts.forEach(function (op, idx) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = op;
        b.addEventListener('click', function () {
          var correctIdx = (q.correct != null) ? q.correct : (q.correctIndex != null ? q.correctIndex : -1);
          var ok = idx === correctIdx;
          if (isChecklist && correctIdx < 0) ok = idx === 0;   // show-me: first tap is "I did it"
          state.answers.push({ q: q.q || q.prompt || '', ok: ok });
          if (ok) state.correct++;
          Array.prototype.forEach.call(box.querySelectorAll('button'), function (x) { x.disabled = true; });
          b.classList.add(ok ? 'right' : 'wrong');
          var fb = root.querySelector('#test-fb');
          fb.textContent = ok ? (q.why || '✓') : ('✓ noted — ' + (q.why || 'the grown-up will look at this one with you.'));
          fb.className = 'feedback ok';
          root.querySelector('#test-next').style.display = 'inline-block';
        });
        box.appendChild(b);
      });
      root.querySelector('#test-next').addEventListener('click', function () {
        state.i++;
        if (state.i >= questions.length) finish();
        else draw();
      });
      root.querySelector('#test-x').addEventListener('click', function () {
        root.hidden = true; root.innerHTML = '';
        var r = route(); if (r.view === 'portal' && portal.child) renderPortalBody(portal.child);
      });
    }
    function finish() {
      var pct = Math.round((state.correct / questions.length) * 100);
      var passed = test.passScore == null ? null : pct >= Math.round(test.passScore * 100);
      var p = store.progress(c.id);
      p.tests = p.tests || {};
      p.tests[testId] = {
        correct: state.correct, total: questions.length, pct: pct, at: new Date().toISOString(),
        state: passed === null ? 'Reviewed' : (passed ? 'Reviewed' : 'In progress')
      };
      store.saveProgress(c.id, p);
      root.innerHTML = '<div class="modal-card" style="padding:20px">' +
        '<h3 style="color:#eef2ff">Result</h3>' +
        '<div class="big" style="font-size:1.8rem;color:#00e5a0;margin-top:8px">' + state.correct + ' / ' + questions.length + ' · ' + pct + '%</div>' +
        (passed === null
          ? '<p class="mono" style="margin-top:8px">Show-me checklist — no pass mark by design. The entry is saved to the portfolio.</p>'
          : '<p class="mono" style="margin-top:8px">' + (passed ? 'Mark met.' : 'Below the mark this week — the grown-up will look at these with you. Nothing is recorded as failing.') + '</p>') +
        '<div style="margin-top:14px"><button class="btn" id="test-done">Back to the week</button></div></div>';
      root.querySelector('#test-done').addEventListener('click', function () {
        root.hidden = true; root.innerHTML = '';
        var r = route(); if (r.view === 'portal' && portal.child) renderPortalBody(portal.child);
      });
      toast('Weekly test saved to ' + c.name + '\'s records.');
    }
    draw();
  }

  /* ---------- export / import ---------- */
  function exportPayload(c) {
    var p = store.progress(c.id);
    var exported_at = p.exported_at || new Date().toISOString();
    return {
      schema: MARKER + '.export',
      export_schema: 'sprout_demo_v1.progress/1',
      child_id: c.id,
      persona: (gradeMeta(c.grade) || {}).persona || c.name,
      grade: c.grade,
      exported_at: exported_at,
      progress: {
        notes: p.notes || {}, streams: p.streams || {}, practice: p.practice || {},
        xp: p.xp || 0, xp_once: p.xp_once || {}, leitner: p.leitner || {},
        tests: p.tests || {}, lessons_done: p.lessons_done || {}
      }
    };
  }
  function exportProgress(c) {
    var payload = exportPayload(c);
    var p = store.progress(c.id);
    if (!p.exported_at) { p.exported_at = payload.exported_at; store.saveProgress(c.id, p); }
    var json = JSON.stringify(payload, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'sprout-demo-' + c.name.replace(/[^\w-]+/g, '_').toLowerCase() + '-progress.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    var prev = $('prog-preview');
    if (prev) prev.textContent = json.slice(0, 1400);
    toast('Progress file exported — it is yours, stored nowhere but your browser and this download.');
  }
  function handleProgressImport(file) {
    var c = portal.child; if (!c) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(String(reader.result)); }
      catch (e) { toast('That file is not valid JSON.', true); return; }
      if (!data || data.schema !== MARKER + '.export') {
        toast('That file is not a SPROUT demo progress file (schema marker missing).', true); return;
      }
      if (!data.progress || typeof data.progress !== 'object') { toast('That file has no progress payload.', true); return; }
      var summary = 'Replace ' + c.name + '\'s progress with this file?\n\n' +
        'persona: ' + (data.persona || '—') + '\n' +
        'lessons opened: ' + Object.keys(data.progress.lessons_done || {}).length + '\n' +
        'tests: ' + Object.keys(data.progress.tests || {}).length + '\n' +
        'exported_at: ' + (data.exported_at || '—');
      if (!window.confirm(summary)) { toast('Import cancelled — nothing was changed.'); return; }
      var cur = store.progress(c.id);
      var merged = Object.assign({}, cur, {
        schema: MARKER, child_id: cur.child_id, exported_at: data.exported_at || cur.exported_at,
        notes: data.progress.notes || {}, streams: data.progress.streams || {},
        practice: data.progress.practice || {}, xp: data.progress.xp || 0,
        xp_once: data.progress.xp_once || {}, leitner: data.progress.leitner || {},
        tests: data.progress.tests || {}, lessons_done: data.progress.lessons_done || {}
      });
      store.saveProgress(c.id, merged);       // session survives: we only replace progress
      toast('Progress imported and validated.');
      renderPortalBody(c);
    };
    reader.readAsText(file);
  }

  /* ================= RENDER PLUMBING ================= */
  function renderInto(html) {
    var app = $('app');
    app.innerHTML = html;
    renderTopnav();
    window.scrollTo(0, 0);
  }
  function render() {
    var r = route();
    if (r.view === 'landing') viewLanding();
    else if (r.view === 'account') viewAccount();
    else if (r.view === 'children') viewChildren();
    else if (r.view === 'assess') renderAssess(r.arg);
    else if (r.view === 'ceremony') renderCeremony(r.arg);
    else if (r.view === 'portal') renderPortal(r.arg);
    else viewLanding();
  }

  /* ================= BOOT ================= */
  function boot() {
    if (!CONTENT) {
      $('app').innerHTML = '<section class="panel"><h2>Demo content failed to load</h2>' +
        '<p class="lede">data/content.js did not load — rebuild it with <span class="mono">python3 tools/build_content.py</span>.</p></section>';
      return;
    }
    window.addEventListener('hashchange', render);
    $('import-file-progress').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) handleProgressImport(e.target.files[0]);
      e.target.value = '';
    });
    render();
  }

  /* expose for QA */
  window.SPROUT_DEMO = {
    NS: NS, store: store, digest: digest, content: CONTENT,
    exportPayload: exportPayload, STATUTORY: STATUTORY, GRADES_ENABLED: GRADES_ENABLED,
    routes: route
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
