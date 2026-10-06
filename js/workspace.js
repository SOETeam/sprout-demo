/* SaittaSprout Workspaces — rule-based digital manipulatives for math, spelling,
   writing and reading, mounted beside (desktop) or over (mobile) the lesson view.

   ZERO AI, ZERO NETWORK: every tool is deterministic JS/SVG built from the lesson's
   own data (curriculum, generator banks, stored passages). Nothing here calls
   fetch/XHR/WebSocket — libraries arrive as local <script> tags from ./vendor/.
   Vendor licences ship next to each file: MathQuill MPL-2.0, math.js Apache-2.0,
   SortableJS MIT, jQuery MIT.

   State lives under the top-level `ws[student][lessonId]` key of the existing
   store, so it rides the v2 progress export/import like notes + hours do.      */
(function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function clamp(n, lo, hi) { return n < lo ? lo : (n > hi ? hi : n); }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }

  /* ---------------- persistence: ws[student][lessonId] (rides export v2) --------- */

  function readRec(ctx) {
    var s = ctx.read();
    var ws = isObj(s.ws) ? s.ws : {};
    var mine = isObj(ws[ctx.student]) ? ws[ctx.student] : {};
    return isObj(mine[ctx.lesson.id]) ? mine[ctx.lesson.id] : null;
  }
  function subRec(ctx) { var r = readRec(ctx); return r || {}; }
  function saveWs(ctx, patch) {
    var s = ctx.read();
    var ws = isObj(s.ws) ? JSON.parse(JSON.stringify(s.ws)) : {};
    var mine = isObj(ws[ctx.student]) ? ws[ctx.student] : {};
    var rec = isObj(mine[ctx.lesson.id]) ? mine[ctx.lesson.id] : {};
    for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) { rec[k] = patch[k]; } }
    mine[ctx.lesson.id] = rec;
    ws[ctx.student] = mine;
    ctx.update({ ws: ws });
  }

  /* ---------------- tool registry ---------------------------------------------- */

  var TOOLS = {
    math: [
      { id: 'base10', label: 'Blocks', icon: '\ud83e\uddea', build: buildBase10 },
      { id: 'numberline', label: 'Number line', icon: '\ud83d\udccf', build: buildNumberLine },
      { id: 'fraction', label: 'Fractions', icon: '\ud83c\udf79', build: buildFraction },
      { id: 'equation', label: 'Equations', icon: '\u2328\ufe0f', build: buildEquation }
    ],
    spelling: [{ id: 'sort', label: 'Word sort', icon: '\ud83d\udd24', build: buildSort }],
    writing: [{ id: 'lines', label: 'Lined paper', icon: '\u270f\ufe0f', build: buildWriting }],
    reading: [{ id: 'passage', label: 'Passage & words', icon: '\ud83d\udcd6', build: buildReading }]
  };

  function toolsFor(subject) { return TOOLS[subject] || null; }

  var activeTool = null;

  function mount(ctx, tabsEl, bodyEl) {
    var list = toolsFor(ctx.subject) || [];
    if (!list.length || !tabsEl || !bodyEl) { return false; }
    var rec = subRec(ctx);
    var active = list[0], i;
    if (rec.tool) {
      for (i = 0; i < list.length; i++) { if (list[i].id === rec.tool) { active = list[i]; } }
    }
    function paintTabs() {
      var h = '';
      for (var j = 0; j < list.length; j++) {
        h += '<button class="ws-tab' + (list[j] === active ? ' on' : '') + '" type="button" data-tool="' +
          list[j].id + '">' + list[j].icon + ' ' + esc(list[j].label) + '</button>';
      }
      tabsEl.innerHTML = h;
    }
    function show(id) {
      for (var j = 0; j < list.length; j++) { if (list[j].id === id) { active = list[j]; } }
      paintTabs();
      bodyEl.innerHTML = '<div class="loading">Setting up your workspace\u2026</div>';
      try { active.build(ctx, bodyEl); }
      catch (e) { bodyEl.innerHTML = '<p class="muted">This tool could not open \u2014 try the lesson again.</p>'; }
      saveWs(ctx, { tool: active.id });
    }
    tabsEl.onclick = function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-tool]') : null;
      if (b) { show(b.getAttribute('data-tool')); }
    };
    activeTool = { show: show, ctx: ctx };
    show(active.id);
    return true;
  }

  /* ============================================================================ *
   *  MATH 1 — base-10 place-value blocks (custom SVG, drag-from-tray + exchange)  *
   * ============================================================================ */

  var B10_COLS = [
    { t: '1000', label: '1000s', one: 'cube', many: 'cubes' },
    { t: '100', label: '100s', one: 'flat', many: 'flats' },
    { t: '10', label: '10s', one: 'rod', many: 'rods' },
    { t: '1', label: '1s', one: 'unit', many: 'units' }
  ];

  function trayItem(c) {
    return '<button class="tray-item" type="button" data-add="' + c.t + '" ' +
      'aria-label="Add a ' + c.one + ' (worth ' + c.t + ')">' +
      '<span class="tray-ico ti-' + c.t + '"></span>' +
      '<span class="tray-n">' + c.t + '</span></button>';
  }

  function b10Shape(t, x, y, w, h, cls) {
    var s = '<g class="b10-b ' + cls + '" data-t="' + t + '">';
    if (t === '1000') {
      s += '<rect x="' + (x + 5) + '" y="' + (y - 5) + '" width="' + w + '" height="' + h +
        '" class="b10-face b10-f1000 b10-top"/>';
    }
    s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" class="b10-face b10-f' + t + '"/>';
    var i;
    if (h > 18) {
      if (t === '10') {
        for (i = 1; i < 5; i++) {
          s += '<line x1="' + x + '" y1="' + (y + (h * i / 5)) + '" x2="' + (x + w) + '" y2="' + (y + (h * i / 5)) + '" class="b10-line"/>';
        }
      } else {
        s += '<line x1="' + (x + w / 2) + '" y1="' + y + '" x2="' + (x + w / 2) + '" y2="' + (y + h) + '" class="b10-line"/>';
        s += '<line x1="' + x + '" y1="' + (y + h / 2) + '" x2="' + (x + w) + '" y2="' + (y + h / 2) + '" class="b10-line"/>';
      }
    }
    s += '</g>';
    return s;
  }

  function b10SVG(st, pop) {
    var W = 360, H = 300, colW = 86, x0 = 6, i;
    var s = '<svg class="b10" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Place value chart: thousands, hundreds, tens, ones">';
    for (i = 0; i < B10_COLS.length; i++) {
      var c = B10_COLS[i], n = st[c.t] || 0, cx = x0 + i * colW;
      s += '<g class="b10-col" data-col="' + c.t + '">';
      s += '<text x="' + (cx + (colW - 6) / 2) + '" y="16" class="b10-h" text-anchor="middle">' + c.label + '</text>';
      s += '<rect x="' + cx + '" y="24" width="' + (colW - 6) + '" height="' + (H - 30) + '" class="b10-slot" data-col="' + c.t + '"/>';
      if (n > 0) {
        var cnt = Math.min(n, 40), gap = 3, top = 34, baseY = H - 10;
        var area = baseY - top;
        var bh = Math.max(7, Math.min(c.t === '1' ? 22 : 62, (area - gap * (cnt - 1)) / cnt));
        var bw = colW - 6 - 16;
        for (var k = 0; k < cnt; k++) {
          var y = baseY - (k + 1) * bh - k * gap;
          var isNew = pop && pop.t === c.t && k >= cnt - pop.n;
          s += b10Shape(c.t, cx + 8, y, bw, bh, 'b10-t' + c.t + (isNew ? ' b10-pop' : ''));
        }
        if (n > cnt) {
          s += '<text x="' + (cx + (colW - 6) / 2) + '" y="' + (baseY - cnt * (bh + gap) - 5) + '" class="b10-more" text-anchor="middle">+' + (n - cnt) + '</text>';
        }
        s += '<text x="' + (cx + (colW - 6) / 2) + '" y="' + (top + 11) + '" class="b10-count" text-anchor="middle">\u00d7' + n + '</text>';
      }
      s += '</g>';
    }
    s += '</svg>';
    return s;
  }

  function buildBase10(ctx, body) {
    var rec = subRec(ctx);
    var st = rec.base10 || { '1000': 0, '100': 0, '10': 0, '1': 0 };
    var pop = null;
    body.innerHTML = '<div class="ws-tool">' +
      '<p class="ws-lead">Drag a block from the tray into a column (or tap it to drop it in). Tap a block to take one back.</p>' +
      '<div class="b10-tray" id="b10-tray">' +
      trayItem(B10_COLS[0]) + trayItem(B10_COLS[1]) + trayItem(B10_COLS[2]) + trayItem(B10_COLS[3]) +
      '</div>' +
      '<div class="b10-svgwrap" id="b10-svgwrap"></div>' +
      '<div class="b10-readout" id="b10-readout"></div>' +
      '<div class="ws-btnrow" id="b10-acts"></div>' +
      '<p class="ws-tip" id="b10-tip"></p>' +
      '</div>';

    var wrap = body.querySelector('#b10-svgwrap');
    var readout = body.querySelector('#b10-readout');
    var acts = body.querySelector('#b10-acts');
    var tray = body.querySelector('#b10-tray');
    var tip = body.querySelector('#b10-tip');

    function total() {
      return (st['1000'] || 0) * 1000 + (st['100'] || 0) * 100 + (st['10'] || 0) * 10 + (st['1'] || 0);
    }
    function render() {
      wrap.innerHTML = b10SVG(st, pop);
      pop = null;
      var parts = [], i;
      for (i = 0; i < B10_COLS.length; i++) {
        var c = B10_COLS[i], n = st[c.t] || 0;
        parts.push(n + ' \u00d7 ' + c.t);
      }
      readout.innerHTML = '<div class="b10-exp">' + esc(parts.join('  +  ')) + '</div>' +
        '<div class="b10-num">= <strong>' + total() + '</strong>' +
        ' <span class="muted">(' + (st['1000'] || 0) + ' \u00d7 1000 + ' + (st['100'] || 0) + ' \u00d7 100 + ' +
        (st['10'] || 0) + ' \u00d7 10 + ' + (st['1'] || 0) + ' \u00d7 1)</span></div>';
      var h = '', j;
      for (j = 0; j < B10_COLS.length - 1; j++) {
        var from = B10_COLS[j], to = B10_COLS[j + 1];
        var can = (st[from.t] || 0) > 0;
        h += '<button class="ws-btn' + (can ? '' : ' off') + '" type="button" data-trade="' + from.t + '"' +
          (can ? '' : ' disabled') + '>\u21c4 1 ' + from.one + ' \u2192 10 ' + to.many + '</button>';
      }
      h += '<button class="ws-btn ghost" type="button" data-b10clear="1">Clear</button>';
      acts.innerHTML = h;
    }
    function add(t, n) {
      st[t] = clamp((st[t] || 0) + (n || 1), 0, 99);
      pop = { t: t, n: Math.min(n || 1, 12) };
      saveWs(ctx, { base10: st });
      render();
      tip.textContent = '';
    }
    function remove(t) {
      if (!st[t]) { return; }
      st[t] = clamp(st[t] - 1, 0, 99);
      saveWs(ctx, { base10: st });
      render();
    }

    acts.addEventListener('click', function (ev) {
      var tr = ev.target.closest('[data-trade]');
      if (tr && !tr.disabled) {
        var ft = tr.getAttribute('data-trade'), idx = 0;
        for (var i = 0; i < B10_COLS.length; i++) { if (B10_COLS[i].t === ft) { idx = i; } }
        if (st[ft] > 0) {
          st[ft]--; st[B10_COLS[idx + 1].t] = clamp(st[B10_COLS[idx + 1].t] + 10, 0, 99);
          pop = { t: B10_COLS[idx + 1].t, n: 10 };
          saveWs(ctx, { base10: st });
          render();
          tip.textContent = 'Exchanged! 1 ' + B10_COLS[idx].one + ' became 10 ' + B10_COLS[idx + 1].many + '.';
        }
        return;
      }
      if (ev.target.closest('[data-b10clear]')) {
        st = { '1000': 0, '100': 0, '10': 0, '1': 0 };
        saveWs(ctx, { base10: st });
        render();
        tip.textContent = 'Fresh chart \u2014 start again.';
      }
    });

    wrap.addEventListener('click', function (ev) {
      if (dragMoved) { dragMoved = false; return; }
      var blk = ev.target.closest('.b10-b');
      if (blk) { remove(blk.getAttribute('data-t')); }
    });

    /* --- pointer drag from tray (tap also works: no movement = drop in that column) --- */
    var dragType = null, dragEl = null, dragMoved = false, sx = 0, sy = 0;
    tray.addEventListener('pointerdown', function (ev) {
      var t = ev.target.closest('[data-add]');
      if (!t) { return; }
      dragType = t.getAttribute('data-add');
      dragEl = t; dragMoved = false; sx = ev.clientX; sy = ev.clientY;
      var g = document.createElement('div');
      g.className = 'b10-ghost';
      g.textContent = dragType;
      document.body.appendChild(g);
      g.style.left = ev.clientX + 'px'; g.style.top = ev.clientY + 'px';
    });
    window.addEventListener('pointermove', function (ev) {
      if (!dragType) { return; }
      var g = document.querySelector('.b10-ghost');
      if (g) { g.style.left = ev.clientX + 'px'; g.style.top = ev.clientY + 'px'; }
      if (Math.abs(ev.clientX - sx) > 8 || Math.abs(ev.clientY - sy) > 8) { dragMoved = true; }
    });
    var handledAt = 0;
    window.addEventListener('pointerup', function (ev) {
      if (!dragType) { return; }
      var t = dragType; dragType = null;
      var g = document.querySelector('.b10-ghost');
      if (g) { g.parentNode.removeChild(g); }
      var over = document.elementFromPoint(ev.clientX, ev.clientY);
      var col = over && over.closest ? over.closest('[data-col]') : null;
      handledAt = Date.now();
      if (col) { add(col.getAttribute('data-col'), 1); }
      else if (!dragMoved && dragEl) { add(t, 1); }
      else { handledAt = 0; }
      dragEl = null;
      setTimeout(function () { dragMoved = false; }, 0);
    });
    /* pointer events are optional: a plain click (assistive tech, some test
       harnesses) still drops one block into the tray's own column. */
    tray.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-add]');
      if (!t) { return; }
      if (Date.now() - handledAt < 600) { return; }
      add(t.getAttribute('data-add'), 1);
    });

    render();
  }

  /* ============================================================================ *
   *  MATH 2 — skip-count number line (SVG hops, draggable start + step)          *
   * ============================================================================ */

  var NL_Y = 84, NL_X0 = 26, NL_SPAN = 312;
  function nlX(v) { return NL_X0 + (v / 100) * NL_SPAN; }
  function nlV(x) { return ((x - NL_X0) / NL_SPAN) * 100; }

  function buildNumberLine(ctx, body) {
    var rec = subRec(ctx);
    var st = rec.numberline || { start: 0, step: 5, hops: 0 };
    st.start = clamp(st.start || 0, 0, 95);
    st.step = [2, 5, 10].indexOf(st.step) >= 0 ? st.step : 5;
    st.hops = clamp(st.hops || 0, 0, 40);

    body.innerHTML = '<div class="ws-tool">' +
      '<p class="ws-lead">Drag the round start dot along the line, slide the step knob, then hop.</p>' +
      '<div class="nl-svgwrap" id="nl-svgwrap"></div>' +
      '<div class="nl-step"><span class="nl-lab">Step</span>' +
      '<div class="nl-track" id="nl-track"><span class="nl-knob" id="nl-knob"></span></div>' +
      '<span class="nl-stops"><i>2</i><i>5</i><i>10</i></span></div>' +
      '<div class="ws-btnrow">' +
      '<button class="ws-btn" type="button" id="nl-hop">Hop \u2192</button>' +
      '<button class="ws-btn" type="button" id="nl-hop5">Hop \u00d75</button>' +
      '<button class="ws-btn ghost" type="button" id="nl-reset">Reset</button>' +
      '</div>' +
      '<div class="nl-readout" id="nl-readout"></div></div>';

    var wrap = body.querySelector('#nl-svgwrap');
    var readout = body.querySelector('#nl-readout');
    var knob = body.querySelector('#nl-knob');
    var track = body.querySelector('#nl-track');
    var msg = '';

    function visited() {
      var out = [], v = st.start;
      out.push(v);
      for (var i = 1; i <= st.hops; i++) {
        v = st.start + i * st.step;
        if (v > 100) { break; }
        out.push(v);
      }
      return out;
    }
    function svg() {
      var s = '<svg class="nl" viewBox="0 0 360 150" role="img" aria-label="Number line from 0 to 100">';
      s += '<line x1="' + nlX(0) + '" y1="' + NL_Y + '" x2="' + nlX(100) + '" y2="' + NL_Y + '" class="nl-line"/>';
      for (var t = 0; t <= 100; t += 10) {
        s += '<line x1="' + nlX(t) + '" y1="' + (NL_Y - 6) + '" x2="' + nlX(t) + '" y2="' + (NL_Y + 6) + '" class="nl-tick"/>';
        s += '<text x="' + nlX(t) + '" y="' + (NL_Y + 22) + '" class="nl-num" text-anchor="middle">' + t + '</text>';
      }
      var v = visited(), i;
      for (i = 1; i < v.length; i++) {
        var x1 = nlX(v[i - 1]), x2 = nlX(v[i]);
        s += '<path d="M' + x1 + ' ' + NL_Y + ' Q' + ((x1 + x2) / 2) + ' ' + (NL_Y - 34) + ' ' + x2 + ' ' + NL_Y + '" class="nl-arc"/>';
      }
      for (i = 0; i < v.length; i++) {
        s += '<circle cx="' + nlX(v[i]) + '" cy="' + NL_Y + '" r="5.5" class="nl-dot' + (i === 0 ? ' nl-dot-start' : '') + '"/>';
        if (i > 0 || st.hops === 0) {
          s += '<text x="' + nlX(v[i]) + '" y="' + (NL_Y - 14) + '" class="nl-vnum" text-anchor="middle">' + v[i] + '</text>';
        }
      }
      s += '<circle cx="' + nlX(st.start) + '" cy="' + NL_Y + '" r="9" class="nl-start" data-drag="start" tabindex="0" role="slider" aria-label="Start number" aria-valuenow="' + st.start + '" aria-valuemin="0" aria-valuemax="100"/>';
      s += '<text x="180" y="140" class="nl-caption" text-anchor="middle">counting by ' + st.step + 's</text>';
      s += '</svg>';
      return s;
    }
    function pattern() {
      if (st.step === 2) { return 'Ones digits repeat: 0, 2, 4, 6, 8, then 0 again.'; }
      if (st.step === 5) { return 'Ones digits alternate: 0, 5, 0, 5 \u2026'; }
      return 'The ones digit stays 0 \u2014 the tens count up by 1.';
    }
    function render() {
      wrap.innerHTML = svg();
      knob.style.left = (st.step === 2 ? 0 : (st.step === 5 ? 50 : 100)) + '%';
      var v = visited();
      var next = v[v.length - 1] + st.step;
      readout.innerHTML = '<div class="nl-seq">' + v.join(', ') + (next <= 100 ? ', \u2026 ' + next : '') + '</div>' +
        '<div class="nl-meta"><strong>' + st.hops + ' hop' + (st.hops === 1 ? '' : 's') + '</strong> from ' +
        st.start + ' \u00b7 next hop ' + (next <= 100 ? next : 'would pass 100') + '</div>' +
        '<div class="nl-hint">' + esc(pattern()) + '</div>' +
        (msg ? '<div class="nl-msg">' + esc(msg) + '</div>' : '');
    }
    function reset(msgTxt) {
      st.hops = 0; msg = msgTxt || '';
      saveWs(ctx, { numberline: st });
      render();
    }
    function animateHop(from, to, done) {
      var svgEl = wrap.querySelector('svg');
      var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', '7'); dot.setAttribute('class', 'nl-fly');
      svgEl.appendChild(dot);
      var t0 = null, dur = 420;
      function step(ts) {
        if (t0 === null) { t0 = ts; }
        var p = Math.min(1, (ts - t0) / dur);
        var x = nlX(from) + (nlX(to) - nlX(from)) * p;
        var y = NL_Y - Math.sin(Math.PI * p) * 32;
        dot.setAttribute('cx', x); dot.setAttribute('cy', y);
        if (p < 1) { requestAnimationFrame(step); }
        else { if (dot.parentNode) { dot.parentNode.removeChild(dot); } done(); }
      }
      requestAnimationFrame(step);
    }
    function hop(n) {
      var v = visited(), cur = v[v.length - 1], steps = n || 1, made = 0;
      var maxSteps = Math.floor((100 - cur) / st.step);
      var real = Math.min(steps, Math.max(0, maxSteps));
      if (real < 1) { msg = 'That hop would go past 100 \u2014 slide the start dot back or tap Reset.'; render(); return; }
      msg = '';
      animateHop(cur, cur + real * st.step, function () {
        st.hops += real;
        saveWs(ctx, { numberline: st });
        render();
      });
    }

    /* drag the start dot */
    wrap.addEventListener('pointerdown', function (ev) {
      if (!ev.target.closest || !ev.target.closest('.nl-start')) { return; }
      var svgEl = wrap.querySelector('svg');
      function move(e) {
        var r = svgEl.getBoundingClientRect();
        var vx = (e.clientX - r.left) * (360 / r.width);
        var val = clamp(Math.round(nlV(vx) / 5) * 5, 0, 95);
        if (val !== st.start) {
          st.start = val; st.hops = 0;
          saveWs(ctx, { numberline: st });
          render();
          svgEl = wrap.querySelector('svg');
        }
      }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      ev.preventDefault();
    });

    /* drag the step knob */
    knob.addEventListener('pointerdown', function (ev) {
      function move(e) {
        var r = track.getBoundingClientRect();
        var p = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1);
        var stops = [2, 5, 10];
        var idx = p < 0.25 ? 0 : (p < 0.75 ? 1 : 2);
        if (stops[idx] !== st.step) {
          st.step = stops[idx]; st.hops = 0;
          saveWs(ctx, { numberline: st });
          render();
        }
      }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      ev.preventDefault();
    });

    body.querySelector('#nl-hop').addEventListener('click', function () { hop(1); });
    body.querySelector('#nl-hop5').addEventListener('click', function () { hop(5); });
    body.querySelector('#nl-reset').addEventListener('click', function () { reset('Line cleared.'); });

    render();
  }

  /* ============================================================================ *
   *  MATH 3 — fraction bars (tap to shade + equivalence readout)                 *
   * ============================================================================ */

  var FR_DENS = [2, 3, 4, 6, 8, 10, 12];

  function buildFraction(ctx, body) {
    var rec = subRec(ctx);
    var st = rec.fraction || { den: 4, shaded: [] };
    if (FR_DENS.indexOf(st.den) < 0) { st.den = 4; }
    if (!st.shaded || st.shaded.length !== st.den) { st.shaded = []; }

    body.innerHTML = '<div class="ws-tool">' +
      '<p class="ws-lead">Tap a slice to shade it. The line under the bar shows the same amount in other ways.</p>' +
      '<div class="fr-dens" id="fr-dens"></div>' +
      '<div class="fr-svgwrap" id="fr-svgwrap"></div>' +
      '<div class="fr-readout" id="fr-readout"></div>' +
      '<div class="ws-btnrow"><button class="ws-btn ghost" type="button" id="fr-clear">Clear</button></div>' +
      '</div>';

    var dens = body.querySelector('#fr-dens');
    var wrap = body.querySelector('#fr-svgwrap');
    var out = body.querySelector('#fr-readout');

    function render() {
      var h = '', i;
      for (i = 0; i < FR_DENS.length; i++) {
        h += '<button class="fr-den' + (FR_DENS[i] === st.den ? ' on' : '') + '" type="button" data-den="' +
          FR_DENS[i] + '">' + FR_DENS[i] + '</button>';
      }
      dens.innerHTML = '<span class="fr-lab">Equal parts</span>' + h;

      var W = 320, H = 56, x0 = 16, y0 = 18, pw = W / st.den;
      var s = '<svg class="fr" viewBox="0 0 360 96" role="img" aria-label="Fraction bar split into ' + st.den + ' equal parts">';
      for (i = 0; i < st.den; i++) {
        s += '<rect x="' + (x0 + i * pw) + '" y="' + y0 + '" width="' + (pw - 1) + '" height="' + H +
          '" class="fr-part' + (st.shaded[i] ? ' on' : '') + '" data-i="' + i + '" role="button" tabindex="0" aria-pressed="' +
          (st.shaded[i] ? 'true' : 'false') + '"/>';
      }
      s += '<rect x="' + x0 + '" y="' + y0 + '" width="' + W + '" height="' + H + '" class="fr-frame" pointer-events="none"/>';
      for (i = 1; i < st.den; i++) {
        s += '<text x="' + (x0 + i * pw) + '" y="' + (y0 + H + 16) + '" class="fr-tick" text-anchor="middle">' + (i) + '</text>';
      }
      s += '</svg>';
      wrap.innerHTML = s;

      var k = st.shaded.filter(function (v) { return !!v; }).length;
      var g = gcd(k, st.den), sk = k / g, sd = st.den / g;
      var eqs = [], d;
      for (i = 0; i < FR_DENS.length; i++) {
        d = FR_DENS[i];
        if (d > st.den && d % sd === 0 && k > 0) {
          var m = d / sd;
          eqs.push((sk * m) + '/' + d);
        }
      }
      var dec = st.den ? (k / st.den) : 0;
      out.innerHTML = '<div class="fr-eq"><strong>' + k + ' of ' + st.den + '</strong> shaded \u2192 <strong>' +
        k + '/' + st.den + '</strong>' + (g > 1 ? ' = ' + sk + '/' + sd + ' (simplified)' : '') +
        (eqs.length ? ' = ' + eqs.join(' = ') : '') +
        ' \u00b7 ' + (Math.round(dec * 1000) / 1000) + '</div>' +
        '<div class="muted fr-tip">Tip: a fully shaded bar is 1 whole \u2014 ' + st.den + '/' + st.den + ' = 1.</div>';
    }

    dens.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-den]');
      if (!b) { return; }
      st.den = parseInt(b.getAttribute('data-den'), 10);
      st.shaded = [];
      saveWs(ctx, { fraction: st });
      render();
    });
    wrap.addEventListener('click', function (ev) {
      var p = ev.target.closest('[data-i]');
      if (!p) { return; }
      var i = parseInt(p.getAttribute('data-i'), 10);
      st.shaded[i] = st.shaded[i] ? 0 : 1;
      saveWs(ctx, { fraction: st });
      render();
    });
    wrap.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') { return; }
      var p = ev.target.closest('[data-i]');
      if (!p) { return; }
      ev.preventDefault();
      var i = parseInt(p.getAttribute('data-i'), 10);
      st.shaded[i] = st.shaded[i] ? 0 : 1;
      saveWs(ctx, { fraction: st });
      render();
    });
    body.querySelector('#fr-clear').addEventListener('click', function () {
      st.shaded = [];
      saveWs(ctx, { fraction: st });
      render();
    });

    render();
  }

  /* ============================================================================ *
   *  MATH 4 — typed equations (MathQuill input + math.js deterministic check)    *
   * ============================================================================ */

  function hashStr(s) {
    var h = 2166136261, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  function eqQuestion(band, seed, idx) {
    var h = hashStr(seed + '#' + idx);
    var a, b, ans, op, prompt;
    if (band === 'preschool') {
      a = 1 + (h % 5); b = 1 + ((h >>> 5) % 5);
      op = ((h >>> 9) & 1) ? '+' : '\u2212';
      ans = op === '+' ? a + b : Math.max(a, b) - Math.min(a, b);
      if (op === '\u2212') { if (b > a) { var t = a; a = b; b = t; } }
      prompt = a + ' ' + op + ' ' + b;
    } else if (band === 'grade5') {
      if ((h >>> 3) & 1) {
        b = 3 + ((h >>> 7) % 8); ans = 2 + ((h >>> 11) % 9); a = b * ans;
        op = '\u00f7'; prompt = a + ' \u00f7 ' + b;
      } else {
        a = 12 + (h % 24); b = 4 + ((h >>> 6) % 9); ans = a * b;
        op = '\u00d7'; prompt = a + ' \u00d7 ' + b;
      }
    } else {
      b = 2 + ((h >>> 4) % 9);
      var mode = (h >>> 8) % 3;
      if (mode === 0) { a = 2 + (h % 9); ans = a * b; op = '\u00d7'; prompt = a + ' \u00d7 ' + b; }
      else if (mode === 1) { a = 2 + (h % 9); ans = a * b; op = '\u00d7'; prompt = b + ' \u00d7 ' + a; }
      else { a = 2 + (h % 9); ans = a; a = a * b; op = '\u00f7'; prompt = a + ' \u00f7 ' + b; }
    }
    return { prompt: prompt, answer: ans, op: op, a: a, b: b };
  }
  function latexToExpr(l) {
    return String(l == null ? '' : l)
      .replace(/\\times|\\cdot|\u00d7/g, '*')
      .replace(/\\div|\u00f7/g, '/')
      .replace(/\u2212|\u2013|\u2014/g, '-')
      .replace(/\\left|\\right|\\,|\\ /g, '')
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))')
      .replace(/[^\d+\-*/().]/g, '')
      .trim();
  }
  function evalExpr(expr) {
    if (window.math && typeof window.math.evaluate === 'function') {
      var v = window.math.evaluate(expr);
      return (typeof v === 'number') ? v : NaN;
    }
    if (/^[\d+\-*/().\s]+$/.test(expr)) {
      try { return Number(new Function('return (' + expr + ');')()); } catch (e) { return NaN; }
    }
    return NaN;
  }
  function makeMQField(el) {
    if (!window.MathQuill) { return null; }
    var MQ = null;
    try { MQ = (typeof window.MathQuill.getInterface === 'function') ? window.MathQuill.getInterface(2) : window.MathQuill; }
    catch (e0) { MQ = window.MathQuill; }
    var factories = [
      function () { return (MQ && typeof MQ.MathField === 'function') ? MQ.MathField(el) : null; },
      function () { return (MQ && typeof MQ.MathQuill === 'function') ? MQ.MathQuill(el) : null; },
      function () { return (MQ && typeof MQ.Editable === 'function') ? MQ.Editable(el) : null; },
      function () { return (MQ && typeof MQ.TextField === 'function') ? MQ.TextField(el) : null; },
      function () { return (typeof MQ === 'function') ? MQ(el) : null; },
      function () { return window.MathQuill(el); },
      function () { return (window.MathQuill.MathQuill) ? window.MathQuill.MathQuill(el) : null; },
      function () { return (MQ && typeof MQ.StaticMath === 'function') ? MQ.StaticMath(el) : null; }
    ];
    for (var i = 0; i < factories.length; i++) {
      try {
        var f = factories[i]();
        if (f && typeof f.latex === 'function') { return f; }
      } catch (e1) {}
    }
    return null;
  }
  function buildEquation(ctx, body) {
    var rec = subRec(ctx);
    var band = document.body.getAttribute('data-band') || 'grade3';
    var idx = (typeof rec.eqIdx === 'number') ? rec.eqIdx : 0;
    var solved = rec.eqSolved || 0;
    var seed = ctx.student + ':' + ctx.date + ':' + ctx.lesson.id;
    var q = eqQuestion(band, seed, idx);

    body.innerHTML = '<div class="ws-tool">' +
      '<p class="ws-lead">Type your answer. Use the keys on your keyboard \u2014 the box shows it as real math.</p>' +
      '<div class="eq-q"><span id="eq-prompt">' + esc(q.prompt) + '</span> = <span class="eq-qmark">?</span></div>' +
      '<div class="eq-box"><span class="eq-mq" id="eq-input" aria-label="Type your answer"></span></div>' +
      '<div class="ws-btnrow">' +
      '<button class="ws-btn" type="button" id="eq-check">Check</button>' +
      '<button class="ws-btn ghost" type="button" id="eq-new">New question</button>' +
      '</div>' +
      '<div class="pq-fb" id="eq-fb"></div>' +
      '<div class="eq-meta muted" id="eq-meta"></div></div>';

    var mqEl = body.querySelector('#eq-input');
    var fb = body.querySelector('#eq-fb');
    var fallbackInput = null;
    var field = makeMQField(mqEl);
    if (!field) {
      var inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'eq-fallback'; inp.setAttribute('inputmode', 'decimal');
      inp.setAttribute('aria-label', 'Type your answer');
      mqEl.parentNode.replaceChild(inp, mqEl);
      fallbackInput = inp;
    } else {
      mqEl.classList.add('mq-live');
    }
    function readAnswer() {
      if (field) { return latexToExpr(field.latex()); }
      return String(fallbackInput ? fallbackInput.value : '').replace(/[^0-9.\-+*/()]/g, '');
    }
    function clearInput() {
      if (field) { field.latex(''); }
      else if (fallbackInput) { fallbackInput.value = ''; }
    }
    function hint() {
      if (q.op === '\u00d7') { return 'Skip-count by ' + q.b + ': ' + q.b + ', ' + (q.b * 2) + ', ' + (q.b * 3) + ' \u2026'; }
      if (q.op === '\u00f7') { return 'How many groups of ' + q.b + ' fit into ' + q.a + '?'; }
      if (q.op === '+') { return 'Count on from ' + q.a + ': ' + (q.a + 1) + ', ' + (q.a + 2) + ' \u2026'; }
      return 'Count back from ' + q.a + ': ' + (q.a - 1) + ', ' + (q.a - 2) + ' \u2026';
    }
    function meta() {
      body.querySelector('#eq-meta').textContent =
        'Solved today: ' + solved + ' \u00b7 deterministic check \u2014 same day, same questions.';
    }
    function check() {
      var raw = readAnswer();
      if (!raw) { fb.textContent = 'Type an answer first.'; fb.className = 'pq-fb no'; return; }
      var val = evalExpr(raw);
      if (isNaN(val)) {
        fb.textContent = 'I could not read that yet \u2014 use numbers and + \u2212 \u00d7 \u00f7 only.';
        fb.className = 'pq-fb no';
        return;
      }
      if (Math.abs(val - q.answer) < 1e-9) {
        fb.textContent = 'Yes! ' + q.prompt + ' = ' + q.answer + ' \u2705';
        fb.className = 'pq-fb ok';
        solved += 1;
        saveWs(ctx, { eqSolved: solved, eqIdx: idx + 1 });
        meta();
        setTimeout(function () {
          q = eqQuestion(band, seed, idx + 1);
          body.querySelector('#eq-prompt').textContent = q.prompt;
          clearInput();
          fb.textContent = '';
          fb.className = 'pq-fb';
          if (fallbackInput) { fallbackInput.focus(); }
        }, 1100);
      } else {
        fb.textContent = 'Not yet \u2014 ' + hint();
        fb.className = 'pq-fb no';
      }
    }
    body.querySelector('#eq-check').addEventListener('click', check);
    body.querySelector('#eq-new').addEventListener('click', function () {
      idx += 1;
      q = eqQuestion(band, seed, idx);
      body.querySelector('#eq-prompt').textContent = q.prompt;
      clearInput();
      fb.textContent = '';
      fb.className = 'pq-fb';
      saveWs(ctx, { eqIdx: idx });
    });
    body.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); check(); }
    });
    meta();
  }

  /* ============================================================================ *
   *  SPELLING — SortableJS word sort into rule bins (wrong bin snaps back)       *
   * ============================================================================ */

  function spellingWords(ctx) {
    if (!ctx.registry || !ctx.registry.generators) { return null; }
    var gs = ctx.registry.generators, i;
    for (i = 0; i < gs.length; i++) {
      if (gs[i].subject === 'spelling' && gs[i].banks && gs[i].banks.words && gs[i].banks.words.length) {
        return { id: gs[i].id, words: gs[i].banks.words };
      }
    }
    return null;
  }

  function binsFor(words) {
    var i, suffix = false;
    for (i = 0; i < words.length; i++) {
      if (/(tion|sion)$/i.test(words[i])) { suffix = true; }
    }
    var bins = [], assign = {};
    if (suffix) {
      bins.push({ id: 'tion', label: '-tion words' });
      bins.push({ id: 'sion', label: '-sion words' });
      bins.push({ id: 'other', label: 'other endings' });
      for (i = 0; i < words.length; i++) {
        var w = words[i].toLowerCase();
        assign[words[i]] = /tion$/i.test(w) ? 'tion' : (/sion$/i.test(w) ? 'sion' : 'other');
      }
      return { bins: bins, assign: assign, rule: 'Say the ending: /shun/ after a vowel is spelled <strong>-tion</strong>, after a consonant it is usually <strong>-sion</strong>.' };
    }
    var present = {}, v;
    for (i = 0; i < words.length; i++) {
      var m = words[i].toLowerCase().match(/[aeiou]/);
      if (m) { present[m[0]] = true; }
    }
    var order = ['a', 'e', 'i', 'o', 'u'];
    for (i = 0; i < order.length; i++) {
      if (present[order[i]]) { bins.push({ id: order[i], label: 'Short ' + order[i] }); }
    }
    for (i = 0; i < words.length; i++) {
      var mm = words[i].toLowerCase().match(/[aeiou]/);
      assign[words[i]] = mm && present[mm[0]] ? mm[0] : (bins[0] ? bins[0].id : 'a');
    }
    return { bins: bins, assign: assign, rule: 'Closed syllable: a vowel boxed in by consonants says its <strong>short sound</strong> \u2014 cat, bed, sit, hot, mud.' };
  }

  function buildSort(ctx, body) {
    var data = spellingWords(ctx);
    if (!data) {
      body.innerHTML = '<div class="ws-tool"><p class="muted">No word list is stored for this lesson yet \u2014 your grown-up can read the words aloud for today\'s sort.</p></div>';
      return;
    }
    var plan = binsFor(data.words);
    var rec = subRec(ctx);
    var done = rec.sorted || [];
    var wrong = rec.wrong || 0;
    var i;

    var h = '<div class="ws-tool">';
    h += '<div class="ws-rule">Rule: ' + plan.rule + '</div>';
    h += '<div class="sort-msg" id="sort-msg"></div>';
    h += '<div class="sort-zone" id="sort-tray" data-bin=""><span class="sort-lab">Word bank</span><div class="sort-slot" data-bin=""></div></div>';
    h += '<div class="sort-bins">';
    for (i = 0; i < plan.bins.length; i++) {
      h += '<div class="sort-bin" data-bin="' + plan.bins[i].id + '"><span class="sort-lab">' + esc(plan.bins[i].label) +
        '</span><div class="sort-slot" data-bin="' + plan.bins[i].id + '"></div></div>';
    }
    h += '</div>';
    h += '<div class="sort-prog" id="sort-prog"></div>';
    h += '<div class="ws-btnrow"><button class="ws-btn ghost" type="button" id="sort-reset">Start over</button></div>';
    h += '</div>';
    body.innerHTML = h;

    var traySlot = body.querySelector('#sort-tray .sort-slot');
    var msg = body.querySelector('#sort-msg');
    var prog = body.querySelector('#sort-prog');

    function chip(w) {
      var correct = plan.assign[w];
      var where = done.indexOf(w) >= 0 ? correct : '';
      return '<span class="wchip' + (where ? ' wchip-ok' : '') + '" data-word="' + esc(w) + '" data-bin="' +
        esc(correct) + '" tabindex="0" role="button">' + esc(w) + '</span>';
    }
    function paint() {
      traySlot.innerHTML = '';
      for (i = 0; i < data.words.length; i++) {
        if (done.indexOf(data.words[i]) < 0) { traySlot.insertAdjacentHTML('beforeend', chip(data.words[i])); }
      }
      var slots = body.querySelectorAll('.sort-bins .sort-slot');
      for (var s = 0; s < slots.length; s++) {
        slots[s].innerHTML = '';
        var bid = slots[s].getAttribute('data-bin');
        for (i = 0; i < data.words.length; i++) {
          if (done.indexOf(data.words[i]) >= 0 && plan.assign[data.words[i]] === bid) {
            slots[s].insertAdjacentHTML('beforeend', chip(data.words[i]));
          }
        }
      }
      prog.textContent = done.length + ' of ' + data.words.length + ' sorted' +
        (wrong ? ' \u00b7 ' + wrong + ' try' + (wrong === 1 ? '' : 'ies') + ' that snapped back' : '');
      if (done.length === data.words.length) {
        msg.innerHTML = '<span class="sort-ok">\ud83c\udf89 Every word is in the right bin \u2014 rule learned.</span>';
      }
    }
    function snapBack(item, from, index, why) {
      try { from.insertBefore(item, from.children[index] || null); } catch (e) {}
      item.classList.add('wchip-shake');
      setTimeout(function () { item.classList.remove('wchip-shake'); }, 400);
      wrong += 1;
      saveWs(ctx, { sorted: done, wrong: wrong });
      msg.innerHTML = '<span class="sort-no">\u2715 Snap back \u2014 ' + why + '</span>';
      prog.textContent = done.length + ' of ' + data.words.length + ' sorted \u00b7 ' + wrong + ' tr' + (wrong === 1 ? 'y' : 'ies') + ' that snapped back';
    }
    function tryPlace(item, targetSlot) {
      var w = item.getAttribute('data-word');
      var want = item.getAttribute('data-bin');
      var got = targetSlot ? targetSlot.getAttribute('data-bin') : '';
      if (!got) { return 'back'; }
      if (got === want) {
        if (done.indexOf(w) < 0) { done.push(w); }
        saveWs(ctx, { sorted: done, wrong: wrong });
        msg.innerHTML = '<span class="sort-ok">\u2714 ' + esc(w) + ' belongs in ' + esc(got === 'tion' ? '-tion' : (got === 'sion' ? '-sion' : got)) + '.</span>';
        return 'ok';
      }
      return 'wrong';
    }

    body.addEventListener('click', function (ev) {
      var c = ev.target.closest('.wchip');
      if (!c) { return; }
      if (c.classList.contains('wchip-ok')) { return; }
      var sel = body.querySelector('.wchip-sel');
      if (sel && sel !== c) { sel.classList.remove('wchip-sel'); }
      c.classList.toggle('wchip-sel');
    });
    body.addEventListener('click', function (ev) {
      if (ev.target.closest('.wchip')) { return; } /* chip clicks belong to the selector handler */
      var slot = ev.target.closest('.sort-slot');
      if (!slot) { return; }
      var sel = body.querySelector('.wchip-sel');
      if (!sel || sel.classList.contains('wchip-ok')) { return; }
      var res = tryPlace(sel, slot);
      if (res === 'wrong') {
        snapBack(sel, body.querySelector('#sort-tray .sort-slot'), 0,
          'remember: ' + (sel.getAttribute('data-bin') === 'tion' ? 'this ending is -tion.' : (sel.getAttribute('data-bin') === 'sion' ? 'this ending is -sion.' : 'check the short vowel sound.')));
        sel.classList.remove('wchip-sel');
      } else if (res === 'ok') {
        sel.classList.remove('wchip-sel');
        paint();
        wireSortable();
      } else {
        sel.classList.remove('wchip-sel');
        paint();
        wireSortable();
      }
    });
    body.querySelector('#sort-reset').addEventListener('click', function () {
      done = []; wrong = 0;
      saveWs(ctx, { sorted: [], wrong: 0 });
      msg.innerHTML = '';
      paint();
      wireSortable();
    });

    function wireSortable() {
      if (typeof window.Sortable === 'undefined') { return; }
      var slots = body.querySelectorAll('.sort-slot');
      for (var s = 0; s < slots.length; s++) {
        if (slots[s]._ss) { try { slots[s]._ss.destroy(); } catch (e) {} slots[s]._ss = null; }
        var inst = window.Sortable.create(slots[s], {
          group: 'sprout-sort',
          animation: 140,
          draggable: '.wchip',
          forceFallback: false,
          onEnd: function (ev) {
            var target = ev.to, item = ev.item;
            var res = tryPlace(item, target);
            if (res === 'wrong') {
              snapBack(item, ev.from, ev.oldIndex,
                'remember: ' + (item.getAttribute('data-bin') === 'tion' ? 'this ending is -tion.' : (item.getAttribute('data-bin') === 'sion' ? 'this ending is -sion.' : 'check the short vowel sound.')));
            } else if (res === 'ok') {
              setTimeout(function () { paint(); wireSortable(); }, 260);
            }
            /* returning a word to the bank is always allowed */
          }
        });
        slots[s]._ss = inst;
      }
    }

    paint();
    wireSortable();
  }

  /* ============================================================================ *
   *  WRITING — lined paper + rule-based checker (no AI)                          *
   * ============================================================================ */

  function analyse(text, target) {
    var t = String(text == null ? '' : text);
    var trimmed = t.replace(/\s+$/, '');
    var words = t.trim().split(/\s+/).filter(function (w) { return w.length; });
    var res = {
      words: words.length, target: target,
      empty: !t.trim(),
      firstCap: false, endPunct: false, capAfter: false, spaces: false,
      badFirst: false, badAfter: [], badLast: false, badSpaces: false
    };
    if (res.empty) { return res; }
    var first = words[0] || '';
    res.firstCap = /^[A-ZÀ-Þ]/.test(first) || first === 'I';
    res.badFirst = !res.firstCap;
    res.endPunct = /[.!?]$/.test(trimmed);
    res.badLast = !res.endPunct;
    res.spaces = !/\s{3,}/.test(t);
    res.badSpaces = !res.spaces;
    var i, expectCap = false;
    for (i = 0; i < words.length; i++) {
      var w = words[i];
      if (expectCap) {
        if (/^[a-zà-ÿ]/.test(w)) { res.badAfter.push(i); }
        expectCap = false;
      }
      if (/[.!?]$/.test(w)) { expectCap = true; }
    }
    res.capAfter = res.badAfter.length === 0;
    return res;
  }

  function decorate(text, a) {
    var parts = String(text).split(/(\s+)/);
    var wi = -1, h = '', i;
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (/^\s+$/.test(p)) {
        if (a.badSpaces && p.length >= 3) { h += '<u class="wo" title="One space between words">' + esc(p) + '</u>'; }
        else { h += esc(p); }
        continue;
      }
      wi++;
      var flag = false;
      if (wi === 0 && a.badFirst) { flag = true; }
      if (wi === a.words - 1 && a.badLast) { flag = true; }
      if (a.badAfter.indexOf(wi) >= 0) { flag = true; }
      h += flag ? '<u class="wo">' + esc(p) + '</u>' : esc(p);
    }
    return h;
  }

  function buildWriting(ctx, body) {
    var rec = subRec(ctx);
    var text = rec.draft || '';
    var target = (typeof rec.target === 'number') ? rec.target : 20;

    body.innerHTML = '<div class="ws-tool">' +
      '<div class="wpaper" id="wpaper" contenteditable="true" spellcheck="false" role="textbox" ' +
      'aria-multiline="true" aria-label="Lined writing paper" placeholder="Start your first sentence\u2026">' + esc(text) + '</div>' +
      '<div class="ws-btnrow">' +
      '<button class="ws-btn" type="button" id="w-check">\u2705 Check my writing</button>' +
      '<button class="ws-btn ghost" type="button" id="w-goal">Goal: ' + target + ' words</button>' +
      '<button class="ws-btn ghost" type="button" id="w-clear">Clear</button>' +
      '</div>' +
      '<ul class="w-list" id="w-list"></ul>' +
      '<p class="ws-tip" id="w-tip"></p></div>';

    var ed = body.querySelector('#wpaper');
    var list = body.querySelector('#w-list');
    var tip = body.querySelector('#w-tip');
    var timer = null;

    function plain() { return ed.textContent || ''; }
    function refresh(underlines) {
      var a = analyse(plain(), target);
      var rows = [
        { ok: a.firstCap, pend: a.empty, txt: 'Starts with a capital letter' },
        { ok: a.endPunct, pend: a.empty, txt: 'Ends with . or ! or ?' },
        { ok: a.capAfter, pend: a.empty, txt: 'Capital letter after a period' },
        { ok: a.spaces, pend: a.empty, txt: 'One space between words' },
        { ok: a.words >= target, pend: false, txt: 'Word count: ' + a.words + ' / ' + target }
      ];
      var h = '', i;
      for (i = 0; i < rows.length; i++) {
        var cls = rows[i].pend ? 'pend' : (rows[i].ok ? 'yes' : 'no');
        h += '<li class="w-row ' + cls + '"><span class="w-mark">' + (cls === 'yes' ? '\u2713' : (cls === 'no' ? '\u2715' : '\u25cb')) +
          '</span><span>' + esc(rows[i].txt) + '</span></li>';
      }
      list.innerHTML = h;
      if (underlines) {
        ed.innerHTML = decorate(plain(), a);
        tip.textContent = a.empty ? 'Write a sentence first.' :
          ((a.firstCap && a.endPunct && a.capAfter && a.spaces) ?
            (a.words >= target ? 'All the rules hold \u2014 nice writing!' : 'Rules hold \u2014 keep going to ' + target + ' words.') :
            'The wavy underlines mark where to fix.');
      }
      return a;
    }
    ed.addEventListener('input', function () {
      if (timer) { clearTimeout(timer); }
      tip.textContent = '\u2026';
      timer = setTimeout(function () {
        saveWs(ctx, { draft: plain() });
        refresh(false);
      }, 400);
    });
    ed.addEventListener('focus', function () {
      if (ed.querySelector('u.wo')) { ed.textContent = plain(); }
    });
    body.querySelector('#w-check').addEventListener('click', function () {
      if (timer) { clearTimeout(timer); }
      saveWs(ctx, { draft: plain() });
      try { ed.blur(); } catch (e) {}
      refresh(true);
    });
    body.querySelector('#w-goal').addEventListener('click', function () {
      target = target === 10 ? 20 : (target === 20 ? 30 : (target === 30 ? 40 : 10));
      saveWs(ctx, { target: target, draft: plain() });
      body.querySelector('#w-goal').textContent = 'Goal: ' + target + ' words';
      refresh(false);
    });
    body.querySelector('#w-clear').addEventListener('click', function () {
      ed.textContent = '';
      saveWs(ctx, { draft: '' });
      refresh(false);
      tip.textContent = 'Fresh page.';
    });
    refresh(false);
  }

  /* ============================================================================ *
   *  READING — passage card + tap-to-highlight vocabulary, saved to notes        *
   * ============================================================================ */

  function buildReading(ctx, body) {
    var L = window.SPRUT_LESSON;
    var pass = (L && L.pickPassage) ? L.pickPassage(ctx) : null;
    if (!pass) {
      body.innerHTML = '<div class="ws-tool"><p class="muted">No passage is stored for this lesson yet \u2014 ask your grown-up to read one with you.</p></div>';
      return;
    }
    var marked = (L && L.getHighlights) ? L.getHighlights(ctx) : [];
    body.innerHTML = '<div class="ws-tool">' +
      '<div class="passage-card"><div class="pc-title">' + esc(pass.title) + '</div>' +
      '<div class="pc-text">' + (L ? L.passageHTML(pass.text, pass.pool, marked) : esc(pass.text)) + '</div></div>' +
      '<div class="pc-words" id="pc-words"></div>' +
      '<div class="pc-saved"><span class="sort-lab">My words (saved to your notes)</span><div class="pc-saved-list" id="pc-saved"></div></div>' +
      '</div>';

    var savedEl = body.querySelector('#pc-saved');
    var wordsEl = body.querySelector('#pc-words');

    function paint() {
      var hs = (L && L.getHighlights) ? L.getHighlights(ctx) : [];
      var h = '', i;
      for (i = 0; i < (pass.pool || []).length; i++) {
        var w = pass.pool[i];
        h += '<button class="vchip' + (hs.indexOf(w) >= 0 ? ' on' : '') + '" type="button" data-vw="' + esc(w) + '">' + esc(w) + '</button>';
      }
      wordsEl.innerHTML = '<span class="sort-lab">Words from this passage \u2014 tap to highlight</span><div>' + h + '</div>';
      savedEl.innerHTML = hs.length ? '' : '<span class="muted">Nothing saved yet \u2014 tap a word.</span>';
      for (i = 0; i < hs.length; i++) {
        savedEl.insertAdjacentHTML('beforeend', '<span class="vchip on">' + esc(hs[i]) + '</span>');
      }
    }
    body.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-vw]');
      if (!b) { return; }
      var w = b.getAttribute('data-vw');
      var on = b.classList.contains('vw') ? b.classList.toggle('vw-on') : b.classList.toggle('on');
      var hs = (L && L.getHighlights) ? L.getHighlights(ctx).slice() : [];
      var i = hs.indexOf(w);
      if (on && i < 0) { hs.push(w); }
      if (!on && i >= 0) { hs.splice(i, 1); }
      if (L && L.saveHighlights) { L.saveHighlights(ctx, hs); }
      /* mirror the same word in the lesson's inline passage and in the chip list */
      Array.prototype.forEach.call(document.querySelectorAll('.vw[data-vw="' + w.replace(/"/g, '') + '"], .vchip[data-vw="' + w.replace(/"/g, '') + '"]'), function (el) {
        if (el === b) { return; }
        if (el.classList.contains('vw')) { el.classList.toggle('vw-on', on); }
        else { el.classList.toggle('on', on); }
      });
      paint();
    });
    if (document.removeEventListener && window.__SPROUT_HI_HANDLER) {
      try { document.removeEventListener('saittasprout:highlights', window.__SPROUT_HI_HANDLER); } catch (e) {}
    }
    window.__SPROUT_HI_HANDLER = function () { paint(); };
    if (document.addEventListener) { document.addEventListener('saittasprout:highlights', window.__SPROUT_HI_HANDLER); }
    paint();
  }

  var api = { mount: mount, toolsFor: toolsFor, analyseWriting: analyse, eqQuestion: eqQuestion };
  if (typeof window !== 'undefined') { window.SPRUT_WS = api; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})();
