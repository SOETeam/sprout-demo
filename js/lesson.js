/* SaittaSprout Open Lesson View — five sections for EVERY week-1 day card:
   1 Explain · 2 Worked Examples · 3 Workbook Area (reveal on demand)
   4 Practice Area (generator arena: auto-spawn, streak, timer, minutes)
   5 Note Section (autosave into the student's own store).

   Mechanics are shared; CONTENT differs per student (one engine, two content sets).
   ZERO network: this file never calls fetch/XHR/WebSocket — all data arrives as
   arguments from app.js, and all state goes through the store handle it passes in.
   Every store it writes is keyed by STUDENT first (MAGNATE correction #8):
     notes[student][lessonId], practice[student][date][subject],
     hours[student][date], streams[student][date|generatorId]                     */
(function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function rich(text) {
    var s = esc(text);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return s;
  }

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function mmss(sec) { sec = Math.max(0, Math.floor(sec)); return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60); }

  /* ---------------- store accessors (all student-keyed) ---------------- */

  function sub(storeObj, key) {
    if (!isObj(storeObj[key])) { storeObj[key] = {}; }
    return storeObj[key];
  }

  function getNotes(s, student, lessonId) {
    var byStudent = isObj(s.notes) ? s.notes : {};
    var mine = isObj(byStudent[student]) ? byStudent[student] : {};
    return isObj(mine[lessonId]) ? mine[lessonId] : null;
  }

  function saveNote(ctx, text) {
    var s = ctx.read();
    var notes = isObj(s.notes) ? JSON.parse(JSON.stringify(s.notes)) : {};
    var mine = isObj(notes[ctx.student]) ? notes[ctx.student] : {};
    mine[ctx.lesson.id] = { text: String(text), updated_at: new Date().toISOString() };
    notes[ctx.student] = mine;
    ctx.update({ notes: notes });
  }

  function saveNote(ctx, text) {
    var s = ctx.read();
    var notes = isObj(s.notes) ? JSON.parse(JSON.stringify(s.notes)) : {};
    var mine = isObj(notes[ctx.student]) ? notes[ctx.student] : {};
    var prev = isObj(mine[ctx.lesson.id]) ? mine[ctx.lesson.id] : null;
    var rec = { text: String(text), updated_at: new Date().toISOString() };
    if (prev && Array.isArray(prev.highlights)) { rec.highlights = prev.highlights; } /* vocabulary taps ride the note */
    mine[ctx.lesson.id] = rec;
    notes[ctx.student] = mine;
    ctx.update({ notes: notes });
  }

  /* ---------------- passage + vocabulary helpers (workspace.js reuses these) ------ */

  function getHighlights(ctx) {
    var n = getNotes(ctx.read(), ctx.student, ctx.lesson.id);
    return (n && Array.isArray(n.highlights)) ? n.highlights : [];
  }

  function saveHighlights(ctx, words) {
    var s = ctx.read();
    var notes = isObj(s.notes) ? JSON.parse(JSON.stringify(s.notes)) : {};
    var mine = isObj(notes[ctx.student]) ? notes[ctx.student] : {};
    var prev = isObj(mine[ctx.lesson.id]) ? mine[ctx.lesson.id] : {};
    var rec = { text: prev.text || '', updated_at: new Date().toISOString(), highlights: [] };
    var seen = {}, i;
    for (i = 0; i < (words || []).length; i++) {
      var w = String(words[i] || '').trim();
      if (w && !seen[w]) { seen[w] = 1; rec.highlights.push(w); }
    }
    mine[ctx.lesson.id] = rec;
    notes[ctx.student] = mine;
    ctx.update({ notes: notes });
  }

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* Resolve the stored passage for a lesson: explicit passage_ref first, then a
     title match against the block activity / lesson title, then passage 0 for
     reading lessons. Reads engines[learner].passages — already loaded by app.js. */
  function pickPassage(ctx) {
    var arr = (ctx.passages && ctx.passages.length) ? ctx.passages : null;
    if (!arr) { return null; }
    var i;
    if (ctx.passageRef) {
      for (i = 0; i < arr.length; i++) { if (arr[i] && arr[i].id === ctx.passageRef) { return arr[i]; } }
    }
    var hay = norm(ctx.blockActivity) + ' ' + norm(ctx.lesson && ctx.lesson.title);
    for (i = 0; i < arr.length; i++) {
      var t = norm(arr[i] && arr[i].title);
      if (t && hay.indexOf(t) >= 0) { return arr[i]; }
    }
    if (ctx.subject === 'reading') { return arr[0]; }
    return null;
  }

  /* Passage text with the vocabulary pool wrapped as tap-to-keep buttons. */
  function passageHTML(text, pool, marked) {
    var s = esc(text);
    var low = {}, i;
    for (i = 0; i < (marked || []).length; i++) { low[String(marked[i]).toLowerCase()] = 1; }
    if (pool && pool.length) {
      var alts = [];
      for (i = 0; i < pool.length; i++) {
        var w = String(pool[i] || '').trim();
        if (w) { alts.push(esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); }
      }
      if (alts.length) {
        alts.sort(function (a, b) { return b.length - a.length; });
        var re = new RegExp('\\b(' + alts.join('|') + ')\\b', 'gi');
        s = s.replace(re, function (m) {
          return '<button type="button" class="vw' + (low[m.toLowerCase()] ? ' vw-on' : '') +
            '" data-vw="' + m + '">' + m + '</button>';
        });
      }
    }
    return s;
  }

  function getStream(s, student, date, genId) {
    var byStudent = isObj(s.streams) ? s.streams : {};
    var mine = isObj(byStudent[student]) ? byStudent[student] : {};
    var key = date + '|' + genId;
    return isObj(mine[key]) ? mine[key] : null;
  }

  function saveStream(ctx, genId, st) {
    var s = ctx.read();
    var streams = isObj(s.streams) ? JSON.parse(JSON.stringify(s.streams)) : {};
    var mine = isObj(streams[ctx.student]) ? streams[ctx.student] : {};
    mine[ctx.date + '|' + genId] = {
      level: st.level, cursor: st.cursor, attempts: st.attempts || 0,
      correct: st.correct || 0, streak: st.streak || 0, best: st.best || 0, at: Date.now()
    };
    streams[ctx.student] = mine;
    ctx.update({ streams: streams });
  }

  function addPracticeMinutes(ctx, subject, seconds, items, correct, streakBest) {
    if (!seconds && !items) { return; }
    var s = ctx.read();
    var practice = isObj(s.practice) ? JSON.parse(JSON.stringify(s.practice)) : {};
    var mine = isObj(practice[ctx.student]) ? practice[ctx.student] : {};
    var day = isObj(mine[ctx.date]) ? mine[ctx.date] : {};
    var rec = isObj(day[subject]) ? day[subject] : { minutes: 0, items: 0, correct: 0, streak_best: 0 };
    rec.minutes = Math.round(((rec.minutes || 0) + seconds / 60) * 100) / 100;
    rec.items = (rec.items || 0) + (items || 0);
    rec.correct = (rec.correct || 0) + (correct || 0);
    rec.streak_best = Math.max(rec.streak_best || 0, streakBest || 0);
    day[subject] = rec;
    mine[ctx.date] = day;
    practice[ctx.student] = mine;
    ctx.update({ practice: practice });

    /* hours roll-up: planned comes from the week JSON block minutes */
    var hours = isObj(s.hours) ? JSON.parse(JSON.stringify(s.hours)) : {};
    var hmine = isObj(hours[ctx.student]) ? hours[ctx.student] : {};
    var hrec = isObj(hmine[ctx.date]) ? hmine[ctx.date] : { planned: 0, practiced: 0 };
    var totalSec = 0, k;
    for (k in mine[ctx.date]) {
      if (Object.prototype.hasOwnProperty.call(mine[ctx.date], k)) {
        totalSec += (mine[ctx.date][k].minutes || 0) * 60;
      }
    }
    hrec.practiced = Math.round((totalSec / 60) * 100) / 100;
    if (ctx.plannedMinutes) { hrec.planned = ctx.plannedMinutes; }
    hmine[ctx.date] = hrec;
    hours[ctx.student] = hmine;
    ctx.update({ hours: hours });
  }

  /* ---------------- HTML ---------------- */

  function sectionHead(n, title, extra) {
    return '<section class="l-sec"><h3><span class="l-sec-n">' + n + '</span> ' + esc(title) +
      (extra ? ' <span class="l-sec-x">' + esc(extra) + '</span>' : '') + '</h3>';
  }

  function exampleHTML(ex, i) {
    if (typeof ex === 'string') {
      return '<div class="ex"><span class="ex-t">Example ' + (i + 1) + '</span><div class="ex-body">' + rich(ex) + '</div></div>';
    }
    var h = '<div class="ex"><span class="ex-t">Example ' + (i + 1) + '</span><div class="ex-body">';
    if (ex.q) { h += '<p><strong>Q.</strong> ' + rich(ex.q) + '</p>'; }
    if (ex.a) { h += '<p><strong>A.</strong> ' + rich(ex.a) + '</p>'; }
    if (ex.steps && ex.steps.length) {
      h += '<ol class="ex-steps">';
      for (var s = 0; s < ex.steps.length; s++) { h += '<li>' + rich(ex.steps[s]) + '</li>'; }
      h += '</ol>';
    }
    h += '</div></div>';
    return h;
  }

  function workbookHTML(items) {
    var h = sectionHead(3, 'Workbook Area', 'write first, then reveal') + '<p class="muted pq-lead">Do it on paper, then tap <em>Show answer</em> to check your work.</p>';
    for (var i = 0; i < items.length; i++) {
      var w = items[i];
      h += '<div class="wb" data-wb="' + i + '">';
      h += '<div class="wb-q"><span class="pq-n">' + (i + 1) + '</span><span>' + rich(w.prompt) + '</span></div>';
      h += '<div class="wb-ans" id="wb-ans-' + i + '" hidden>' + rich(w.answer) + '</div>';
      h += '<button class="wb-toggle" type="button" data-wb-toggle="' + i + '">Show answer</button>';
      h += '</div>';
    }
    h += '</section>';
    return h;
  }

  function buildHTML(ctx) {
    var ls = ctx.lesson, c = ls.content || {};
    var h = '<div class="lwrap">';

    /* header */
    h += '<div class="ltop"><div class="l-head"><span class="l-head-emoji">' + (ls.emoji || '\ud83d\udcd6') + '</span>';
    h += '<div class="l-titles"><span class="badge">Open lesson</span><h2>' + esc(ls.title) + '</h2>';
    h += '<p class="muted">' + esc(ls.summary || '') + ' \u00b7 ' + (ls.minutes || 15) + ' min</p></div></div>';
    h += '<button id="lesson-close" type="button" aria-label="Close lesson">\u2715</button></div>';

    if (ls.parentGuided) {
      h += '<div class="grownup"><strong>\ud83d\udc68\u200d\ud83d\udc67 Grown-up, this one is yours to lead:</strong> read it aloud together, then help with the practice taps. Stop while it is still fun.</div>';
    }
    /* workspace host — desktop: questions left / workspace right;
       mobile <900px: the workspace becomes a bottom-sheet popup (index.html CSS). */
    var toolSubj = ls.subject || null;
    var wsTools = (toolSubj && typeof window !== 'undefined' && window.SPRUT_WS && window.SPRUT_WS.toolsFor) ? window.SPRUT_WS.toolsFor(toolSubj) : null;
    var hasWS = !!(wsTools && wsTools.length);

    h += '<div class="l-grid">';
    h += '<div class="l-main">';

    /* 0 — Read the passage (reading lessons: stored passage + tap-to-keep words) */
    var pass = pickPassage(ctx);
    if (pass) {
      h += '<section class="l-sec l-sec-passage"><h3><span class="l-sec-n l-sec-emoji">\ud83d\udcd6</span> Read the passage' +
        ' <span class="l-sec-x">tap a word to keep it</span></h3>';
      h += '<div class="passage-card"><div class="pc-title">' + esc(pass.title) + '</div>';
      h += '<div class="pc-text" id="pc-text">' + passageHTML(pass.text, pass.pool, getHighlights(ctx)) + '</div></div>';
      h += '<p class="pc-tip muted">Tap a word you do not know \u2014 it saves into this lesson\u2019s notes and travels with your progress file.</p></section>';
    }



    /* 1 — Explain */
    h += sectionHead(1, 'Explain');
    h += '<div class="learn-card">' + (c.explain ? rich(c.explain) : esc(ls.summary || '')) + '</div></section>';

    /* 2 — Worked Examples */
    if (c.examples && c.examples.length) {
      h += sectionHead(2, 'Worked Examples');
      h += '<div class="ex-list">';
      for (var e = 0; e < c.examples.length; e++) { h += exampleHTML(c.examples[e], e); }
      h += '</div></section>';
    } else {
      h += sectionHead(2, 'Worked Examples') + '<p class="muted">Your grown-up will work one with you at the board.</p></section>';
    }

    /* 3 — Workbook Area */
    if (c.workbook && c.workbook.length) {
      h += workbookHTML(c.workbook);
    } else {
      h += sectionHead(3, 'Workbook Area') + '<p class="muted">No written exercises in this lesson \u2014 use the practice below.</p></section>';
    }

    /* 4 — Practice Area (generator arena) */
    h += sectionHead(4, 'Practice Area', c.generator ? 'new question every time' : 'tap the answer');
    if (c.generator && ctx.registry) {
      h += '<div class="arena" id="arena">';
      h += '<div class="arena-hud">';
      h += '<span class="hud-chip" id="hud-streak">\ud83d\udd25 0</span>';
      h += '<span class="hud-chip" id="hud-best">best 0</span>';
      h += '<span class="hud-chip" id="hud-level">level 1</span>';
      h += '<span class="hud-chip" id="hud-time">00:00</span>';
      h += '<span class="hud-chip" id="hud-min">0 min</span>';
      h += '</div>';
      h += '<div id="arena-body"><div class="loading">Loading practice\u2026</div></div>';
      h += '</div>';
    } else if (c.practice && c.practice.length) {
      h += '<p class="muted pq-lead">Tap the answer you think is right.</p>';
      for (var p = 0; p < c.practice.length; p++) {
        var it = c.practice[p];
        h += '<div class="pq"><div class="pq-q"><span class="pq-n">' + (p + 1) + '</span><span>' + esc(it.question) + '</span></div>';
        h += '<div class="opts">';
        for (var i = 0; i < it.options.length; i++) {
          h += '<button class="opt" type="button" data-pq="' + p + '" data-i="' + i + '">' + esc(it.options[i]) + '</button>';
        }
        h += '</div><div class="pq-fb" id="pq-fb-' + p + '"></div></div>';
      }
    } else {
      h += '<p class="muted">Practice for this lesson is coming from your grown-up today.</p>';
    }
    h += '</section>';

    /* 5 — Note Section */
    h += sectionHead(5, 'Note Section', 'saved to this device');
    h += '<textarea id="lesson-note" class="note-box" rows="4" placeholder="Write what you learned, a word to remember, or a question to ask\u2026"></textarea>';
    h += '<div class="note-meta"><span id="note-status">Not saved yet</span></div>';
    h += '</section>';

    /* done + footer */
    h += '<button class="mark-done' + (ctx.done ? ' is-done' : '') + '" id="lesson-done" type="button">';
    h += ctx.done ? '\u2705 Done \u2014 tap to undo' : 'Mark done \u2705';
    h += '</button>';
    h += '<p class="footnote">Progress is saved on this device only \u2014 nothing leaves this page. Use \ud83d\udcbe Save Progress / \ud83d\udcc2 Load Progress in the top bar to move it to another device.</p>';
    h += '</div>';   /* .l-main */

    if (hasWS) {
      h += '<aside class="ws-panel" id="ws-panel" aria-label="Workspace">';
      h += '<div class="ws-head"><span class="ws-title">\ud83e\uddf0 Workspace</span>';
      h += '<button class="ws-close" id="ws-close" type="button" aria-label="Close workspace">\u2715</button></div>';
      h += '<div class="ws-tabs" id="ws-tabs" role="tablist"></div>';
      h += '<div class="ws-body" id="ws-body"></div>';
      h += '</aside>';
    }
    h += '</div>';   /* .l-grid */
    if (hasWS) {
      h += '<button class="ws-fab" id="ws-fab" type="button">\ud83e\uddf0 Workspace</button>';
      h += '<div class="ws-scrim" id="ws-scrim"></div>';
    }
    h += '</div>';   /* .lwrap */
    return h;
  }

  /* ---------------- wiring ---------------- */

  function wire(ctx) {
    var modal = ctx.modal;

    /* vocabulary taps: toggle the highlight and save to the student's notes store */
    Array.prototype.forEach.call(modal.querySelectorAll('.vw'), function (btn) {
      btn.addEventListener('click', function () {
        var w = btn.getAttribute('data-vw') || '';
        var on = btn.classList.toggle('vw-on');
        var sel = '.vw[data-vw="' + w.replace(/"/g, '') + '"], .vchip[data-vw="' + w.replace(/"/g, '') + '"]';
        Array.prototype.forEach.call(modal.querySelectorAll(sel), function (el) {
          if (el === btn) { return; }
          el.classList.toggle('vw-on', on);
          el.classList.toggle('on', on);
        });
        var out = [], seen = {};
        Array.prototype.forEach.call(modal.querySelectorAll('.vw.vw-on'), function (b) {
          var word = b.getAttribute('data-vw');
          if (word && !seen[word]) { seen[word] = 1; out.push(word); }
        });
        saveHighlights(ctx, out);
        if (typeof document !== 'undefined' && document.dispatchEvent) {
          try { document.dispatchEvent(new CustomEvent('saittasprout:highlights')); } catch (e) {}
        }
      });
    });

    /* workspace: tool tabs + tool body, launcher + backdrop on mobile */
    var tabs = modal.querySelector('#ws-tabs'), wsBody = modal.querySelector('#ws-body');
    if (tabs && wsBody && typeof window !== 'undefined' && window.SPRUT_WS) {
      window.SPRUT_WS.mount(ctx, tabs, wsBody);
    }
    var wsPanel = modal.querySelector('#ws-panel');
    var wsFab = modal.querySelector('#ws-fab');
    var wsScrim = modal.querySelector('#ws-scrim');
    function setPanel(open) {
      if (wsPanel) { wsPanel.classList.toggle('open', !!open); }
      if (wsScrim) { wsScrim.hidden = !open; wsScrim.classList.toggle('on', !!open); }
      if (wsFab) { wsFab.classList.toggle('is-hidden', !!open); }
    }
    if (wsFab) { wsFab.addEventListener('click', function () { setPanel(true); }); }
    if (wsScrim) { wsScrim.addEventListener('click', function () { setPanel(false); }); }
    var wsClose = modal.querySelector('#ws-close');
    if (wsClose) { wsClose.addEventListener('click', function () { setPanel(false); }); }


    /* workbook reveal-on-demand */
    Array.prototype.forEach.call(modal.querySelectorAll('[data-wb-toggle]'), function (btn) {
      btn.addEventListener('click', function () {
        var i = btn.getAttribute('data-wb-toggle');
        var ans = modal.querySelector('#wb-ans-' + i);
        if (!ans) { return; }
        var show = ans.hasAttribute('hidden');
        if (show) { ans.removeAttribute('hidden'); btn.textContent = 'Hide answer'; btn.classList.add('on'); }
        else { ans.setAttribute('hidden', ''); btn.textContent = 'Show answer'; btn.classList.remove('on'); }
      });
    });

    /* note autosave */
    var note = modal.querySelector('#lesson-note');
    var status = modal.querySelector('#note-status');
    if (note) {
      var existing = getNotes(ctx.read(), ctx.student, ctx.lesson.id);
      if (existing && existing.text) { note.value = existing.text; if (status) { status.textContent = 'Saved \u2014 ' + String(existing.updated_at || '').slice(0, 16).replace('T', ' '); } }
      var timer = null;
      note.addEventListener('input', function () {
        if (timer) { clearTimeout(timer); }
        if (status) { status.textContent = 'Typing\u2026'; }
        timer = setTimeout(function () {
          saveNote(ctx, note.value);
          if (status) { status.textContent = 'Saved ' + new Date().toLocaleTimeString(); }
        }, 500);
      });
    }

    /* practice arena */
    var c = ctx.lesson.content || {};
    if (c.generator && ctx.registry && typeof window !== 'undefined' && window.SPRUT_GEN) {
      wireArena(ctx, c.generator);
    } else {
      wireStatic(ctx);
    }
  }

  function wireStatic(ctx) {
    var modal = ctx.modal;
    var items = (ctx.lesson.content && ctx.lesson.content.practice) ? ctx.lesson.content.practice : [];
    Array.prototype.forEach.call(modal.querySelectorAll('.opt'), function (btn) {
      btn.addEventListener('click', function () {
        var pi = parseInt(btn.getAttribute('data-pq'), 10);
        var pick = parseInt(btn.getAttribute('data-i'), 10);
        var item = items[pi];
        if (!item) { return; }
        var fb = modal.querySelector('#pq-fb-' + pi);
        if (pick === item.correctIndex) {
          btn.classList.add('right');
          Array.prototype.forEach.call(modal.querySelectorAll('[data-pq="' + pi + '"]'), function (b) { b.disabled = true; });
          if (fb) { fb.textContent = item.praise || 'Nice! That is right.'; fb.className = 'pq-fb ok'; }
        } else {
          btn.classList.add('wrong');
          btn.disabled = true;
          if (fb) { fb.textContent = 'Hint: ' + (item.hint || 'Try once more.'); fb.className = 'pq-fb no'; }
        }
      });
    });
  }

  function wireArena(ctx, genId) {
    var G = window.SPRUT_GEN;
    var modal = ctx.modal;
    var gen = G.getGen(ctx.registry, genId);
    if (!gen) { wireStatic(ctx); return; }

    var saved = getStream(ctx.read(), ctx.student, ctx.date, genId);
    var state = saved
      ? { level: G.clampLevel(gen, saved.level || 1), cursor: saved.cursor || 0, attempts: saved.attempts || 0, correct: saved.correct || 0, streak: saved.streak || 0, best: saved.best || 0 }
      : G.newState(gen);

    var subject = ctx.subject || 'practice';
    var sec = 0, lastTick = Date.now(), answered = false;
    var body = modal.querySelector('#arena-body');
    var hudStreak = modal.querySelector('#hud-streak');
    var hudBest = modal.querySelector('#hud-best');
    var hudLevel = modal.querySelector('#hud-level');
    var hudTime = modal.querySelector('#hud-time');
    var hudMin = modal.querySelector('#hud-min');

    function practicedSeconds() {
      var s = ctx.read();
      var pr = isObj(s.practice) ? s.practice : {};
      var mine = isObj(pr[ctx.student]) ? pr[ctx.student] : {};
      var day = isObj(mine[ctx.date]) ? mine[ctx.date] : {};
      var rec = isObj(day[subject]) ? day[subject] : {};
      return (rec.minutes || 0) * 60;
    }

    function paintHud() {
      if (hudStreak) { hudStreak.textContent = '\ud83d\udd25 ' + (state.streak || 0); }
      if (hudBest) { hudBest.textContent = 'best ' + (state.best || 0); }
      if (hudLevel) { hudLevel.textContent = 'level ' + state.level; }
      if (hudTime) { hudTime.textContent = mmss(sec); }
      if (hudMin) { hudMin.textContent = Math.floor(practicedSeconds() / 60) + ' min'; }
    }

    var tick = setInterval(function () {
      var now = Date.now();
      sec += (now - lastTick) / 1000;
      lastTick = now;
      paintHud();
    }, 1000);

    function flushTime(isFinal) {
      var now = Date.now();
      var delta = (now - lastTick) / 1000;
      lastTick = now;
      sec += delta;
      if (delta >= 0.4 || isFinal) {
        addPracticeMinutes(ctx, subject, delta, 0, 0, state.best || 0);
      }
      paintHud();
    }

    function spawn() {
      var item = G.itemFor(ctx.registry, genId, { date: ctx.date, student: ctx.student, level: state.level, cursor: state.cursor });
      if (!item) { body.innerHTML = '<p class="muted">Practice is taking a rest \u2014 tap Mark done and tell your grown-up.</p>'; return; }
      var h = '<div class="pq arena-q"><div class="pq-q"><span class="pq-n">\u2713</span><span>' + esc(item.question).replace(/\n/g, '<br>') + '</span></div>';
      h += '<div class="opts">';
      for (var i = 0; i < item.options.length; i++) {
        h += '<button class="opt" type="button" data-i="' + i + '">' + esc(item.options[i]) + '</button>';
      }
      h += '</div><div class="pq-fb" id="arena-fb"></div>';
      h += '<div class="arena-nav"><button class="arena-hint" type="button" id="arena-hint-btn">Need a hint?</button></div>';
      h += '</div>';
      body.innerHTML = h;
      answered = false;
      paintHud();

      var fb = body.querySelector('#arena-fb');
      Array.prototype.forEach.call(body.querySelectorAll('.opt'), function (btn) {
        btn.addEventListener('click', function () {
          if (answered) { return; }
          answered = true;
          var pick = parseInt(btn.getAttribute('data-i'), 10);
          var ok = pick === item.correctIndex;
          flushTime(false);
          addPracticeMinutes(ctx, subject, 0, 1, ok ? 1 : 0, state.best || 0);
          Array.prototype.forEach.call(body.querySelectorAll('.opt'), function (b) { b.disabled = true; });
          if (ok) {
            btn.classList.add('right');
            if (fb) { fb.textContent = item.praise || 'Nice! That is right.'; fb.className = 'pq-fb ok'; }
          } else {
            btn.classList.add('wrong');
            var right = body.querySelectorAll('.opt')[item.correctIndex];
            if (right) { right.classList.add('right'); }
            if (fb) { fb.textContent = 'Hint: ' + (item.hint || 'Try once more.'); fb.className = 'pq-fb no'; }
          }
          state = G.step(state, ok, gen);
          saveStream(ctx, genId, state);
          paintHud();
          setTimeout(spawn, ok ? 900 : 1600);
        });
      });

      var hintBtn = body.querySelector('#arena-hint-btn');
      if (hintBtn) {
        hintBtn.addEventListener('click', function () {
          if (fb && !answered) { fb.textContent = 'Hint: ' + (item.hint || 'Read the question once more, slowly.'); fb.className = 'pq-fb no'; }
        });
      }
    }

    spawn();
    paintHud();

    /* stop the clock + flush minutes when the lesson closes */
    ctx.onClose = function () {
      clearInterval(tick);
      flushTime(true);
      saveStream(ctx, genId, state);
    };
  }

  var api = { buildHTML: buildHTML, wire: wire, esc: esc, rich: rich, dayStr: dayStr, mmss: mmss,
    pickPassage: pickPassage, passageHTML: passageHTML, getHighlights: getHighlights, saveHighlights: saveHighlights };
  if (typeof window !== 'undefined') { window.SPRUT_LESSON = api; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})();
