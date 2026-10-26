// SPROUT sync — pure export/import/merge for the parent dashboard (public beta).
// NO DOM, NO localStorage, NO fetch: every function takes plain objects and
// returns new plain objects, so tools/validate_sync.js can drive it in node.
// app.js wires it to the demo store (namespace 'sprout_demo_v1', dash key
// 'sprout_demo_v1.dash_v1') and the parent dashboard on the children page.
//
// Local-first law: a sync file is the ONLY thing that ever crosses devices.
// No server collection ever. PII: first names only, no emails, device identity
// is a renameable random tag (d_xxxxxxxxxxxxxxxx).
//
// Merge policy (owner order 2026-10-18):
//   progress   last-write-wins per lesson-key, per device source. A device's
//              newer export may un-done a key IT previously reported done; a key
//              another device still reports done stays done unless the un-done
//              report is newer. Nothing is silently lost: every device report is
//              kept in the ledger and disagreement is flagged for the parent UI.
//   quiz/tests keep BOTH scores: best (max) and last (newest 'at'); flagged when
//              best and last come from different devices.
//   hours      max per metric per day (summing would double-count class sessions
//              that travelled between devices).
//   practice   max per metric per (date, subject).
//   streams    newest 'at' wins; streak/best take the max of both sides.
//   notes      student lesson notes: newest updated_at wins per lesson id.
//   parent notes live ONLY in the parent dashboard (dash.pnotes), never in a
//   student's own engine data; they ride an exported bundle only by toggle.
(function () {
  'use strict';

  var SYNC_SCHEMA = 'sprout-sync';
  var SYNC_VERSION = 1;
  var MONTH1_START = '2026-10-19'; // owner-stated Month 1 start (weeks 1-4)
  var MONTH1_WEEKS = 4;
  var FILE_PREFIX = 'Sprout_';

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function copyOwn(o) {
    var n = {}, k;
    if (!isObj(o)) { return n; }
    for (k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) { n[k] = o[k]; } }
    return n;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  /* ---------------- device tag (PII law) ---------------- */

  function newDeviceId(rand) {
    var r = (typeof rand === 'function') ? rand : Math.random;
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', s = '', i;
    for (i = 0; i < 16; i++) { s += chars.charAt(Math.floor(r() * chars.length)); }
    return 'd_' + s;
  }
  /* Pure: returns {store, device, created}. Caller persists store if created. */
  function ensureDevice(store, rand) {
    if (isObj(store) && isObj(store.ddevice) && store.ddevice.id) {
      return { store: store, device: store.ddevice, created: false };
    }
    var dev = { id: newDeviceId(rand), label: '' };
    var next = copyOwn(store);
    next.ddevice = dev;
    return { store: next, device: dev, created: true };
  }

  /* ---------------- export: one file per student ---------------- */

  function syncFileName(student, date) {
    return FILE_PREFIX + String(student || 'student') + '_' + date + '.json';
  }

  /* Build the per-student blob from a device store. opts: {student, now, device,
     includeNotes? (not used for student export — parent bundles only)}.
     Pure: never mutates `store`. */
  function buildSyncBlob(store, student, opts) {
    opts = opts || {};
    var o = opts;
    var now = o.now || new Date();
    var s = isObj(store) ? store : {};
    var dev = isObj(o.device) ? o.device : (isObj(s.ddevice) ? s.ddevice : { id: newDeviceId(), label: '' });
    var blob = {
      _sync: {
        schema: SYNC_SCHEMA,
        version: SYNC_VERSION,
        student: String(student || ''),
        device: { id: String(dev.id || ''), label: String(dev.label || '') },
        exported_at: now.toISOString(),
        exported_day: dayStr(now),
        ns: 'sprout_v1'
      },
      progress: studentKeyed(student, s.progress),
      quiz: studentKeyed(student, s.quiz),
      tests: studentKeyed(student, s.tests),
      hours: hoursForStudent(s, student),
      practice: practiceForStudent(s, student),
      streams: streamsForStudent(s, student)
    };
    /* student lesson notes ride along (they are the student's own work notes) */
    blob.notes = notesForStudent(s, student);
    if (isObj(o.parentNotes)) { blob.parent_notes = o.parentNotes; }
    return blob;
  }

  /* per-student filter: engine keys are learner-prefixed ('juniper_w1_d1_b1',
     'juniper_q1', 'juniper_w1_test'), so a blob only carries this student's keys. */
  function studentKeyed(student, map) {
    var out = {}, k, pre = String(student || '') + '_';
    if (!isObj(map)) { return out; }
    for (k in map) { if (k.slice(0, pre.length) === pre) { out[k] = map[k]; } }
    return out;
  }
  function subFor(s, key, student) {
    var m = isObj(s[key]) ? s[key] : {};
    return isObj(m[student]) ? m[student] : {};
  }
  function hoursForStudent(s, student) { return copyOwn(subFor(s, 'hours', student)); }
  function practiceForStudent(s, student) { return copyOwn(subFor(s, 'practice', student)); }
  function streamsForStudent(s, student) { return copyOwn(subFor(s, 'streams', student)); }
  function notesForStudent(s, student) { return copyOwn(subFor(s, 'notes', student)); }

  /* Parent bundle: the parent's merged state for one child + optional parent notes. */
  function buildBundle(dash, student, includeNotes, device, now) {
    var st = dashEntry(dash, student);
    var blob = {
      _sync: {
        schema: SYNC_SCHEMA,
        version: SYNC_VERSION,
        student: String(student || ''),
        device: { id: String(device.id || ''), label: String(device.label || '') },
        exported_at: (now || new Date()).toISOString(),
        exported_day: dayStr(now || new Date()),
        ns: 'sprout_v1'
      },
      progress: effectiveProgress(st),
      quiz: compactScoreMap(st.quiz),
      tests: compactScoreMap(st.tests),
      hours: copyOwn(st.hours),
      practice: copyOwn(st.practice),
      streams: copyOwn(st.streams),
      notes: copyOwn(st.notes)
    };
    if (includeNotes) {
      blob.parent_notes = (isObj(dash.pnotes) && Array.isArray(dash.pnotes[student])) ? dash.pnotes[student] : [];
    }
    return blob;
  }

  /* ---------------- validation ---------------- */

  function validateSyncBlob(text) {
    var obj, k;
    if (typeof text === 'string') {
      try { obj = JSON.parse(text); } catch (e) {
        return { ok: false, error: 'That file is not valid JSON. Nothing was changed.' };
      }
    } else { obj = text; }
    if (!isObj(obj)) { return { ok: false, error: 'That file is not a sync file (expected a JSON object). Nothing was changed.' }; }
    var m = obj._sync;
    if (!isObj(m) || m.schema !== SYNC_SCHEMA) {
      return { ok: false, error: 'That is not a SPROUT sync file (missing sync marker). Nothing was changed.' };
    }
    if (m.version !== SYNC_VERSION) {
      return { ok: false, error: 'This file is sync v' + m.version + ' — this app reads v' + SYNC_VERSION + '. Nothing was changed.' };
    }
    if (typeof m.student !== 'string' || !m.student) {
      return { ok: false, error: 'This file does not say which student it belongs to. Nothing was changed.' };
    }
    var d = m.device;
    if (!isObj(d) || !/^d_[A-Za-z0-9]{8,24}$/.test(String(d.id)) || typeof d.label !== 'string') {
      return { ok: false, error: 'This file has a bad device tag. Nothing was changed.' };
    }
    if (typeof m.exported_at !== 'string' || isNaN(Date.parse(m.exported_at))) {
      return { ok: false, error: 'This file has a bad export date. Nothing was changed.' };
    }
    if (typeof m.exported_day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.exported_day)) {
      return { ok: false, error: 'This file has a bad export day. Nothing was changed.' };
    }
    var need = ['progress', 'quiz', 'tests', 'hours'], i;
    for (i = 0; i < need.length; i++) {
      if (!isObj(obj[need[i]])) {
        return { ok: false, error: 'This file is missing its "' + need[i] + '" data — it looks corrupt. Nothing was changed.' };
      }
    }
    var opt = ['practice', 'streams', 'notes', 'parent_notes'];
    for (i = 0; i < opt.length; i++) {
      if (obj[opt[i]] != null && !isObj(obj[opt[i]])) {
        return { ok: false, error: 'This file has a bad "' + opt[i] + '" block. Nothing was changed.' };
      }
    }
    for (k in obj.progress) { if (obj.progress[k] !== true) {
      return { ok: false, error: 'This file has a bad progress entry ("' + k + '"). Nothing was changed.' };
    } }
    return { ok: true, data: obj };
  }

  /* ---------------- dash (parent aggregation layer) ---------------- */

  function emptyDash() { return { sync: {}, pnotes: {}, devices: {} }; }
  function dashEntry(dash, student) {
    if (!isObj(dash.sync)) { dash.sync = {}; }
    if (!isObj(dash.sync[student])) {
      dash.sync[student] = {
        ledger: {}, quiz: {}, tests: {}, hours: {}, practice: {}, streams: {},
        notes: {}, devices: {}, lastSync: null, lastExportDay: null, conflicts: []
      };
    }
    return dash.sync[student];
  }
  /* Pure entry reader (no mutation) for views. */
  function peekEntry(dash, student) {
    if (!isObj(dash) || !isObj(dash.sync) || !isObj(dash.sync[student])) { return null; }
    return dash.sync[student];
  }

  /* Effective done-map: per key, the device report with the newest 'at' wins. */
  function effectiveProgress(st) {
    var out = {}, key, dev, rep, best;
    if (!st || !isObj(st.ledger)) { return out; }
    for (key in st.ledger) {
      best = null;
      for (dev in st.ledger[key]) {
        rep = st.ledger[key][dev];
        if (!isObj(rep)) { continue; }
        if (!best || rep.at > best.at) { best = rep; }
      }
      if (best && best.done === true) { out[key] = true; }
    }
    return out;
  }

  function compactScoreMap(m) {
    var out = {}, id, r;
    if (!isObj(m)) { return out; }
    for (id in m) {
      r = m[id];
      if (!isObj(r)) { continue; }
      out[id] = {
        attempts: r.attempts || 0,
        best: r.best != null ? r.best : (r.last != null ? r.last : 0),
        total: r.total || 0,
        at: r.last_at || r.best_at || null
      };
    }
    return out;
  }

  /* Merge one validated blob into the dash. Pure: returns {dash, report}.
     report: {student, device, addedKeys, clearedKeys, conflicts, quizLast, quizBest} */
  function mergeSyncBlob(dashIn, blob) {
    var dash = copyOwn(isObj(dashIn) ? dashIn : emptyDash());
    if (!isObj(dash.sync)) { dash.sync = {}; }
    if (!isObj(dash.pnotes)) { dash.pnotes = {}; }
    if (!isObj(dash.devices)) { dash.devices = {}; }
    var m = blob._sync;
    var student = m.student, dev = m.device.id, at = m.exported_at;
    var st = dashEntry(dash, student);
    var before = effectiveProgress(st);

    dash.devices[dev] = { label: m.device.label || '', lastSync: at };
    st.devices[dev] = m.device.label || '';
    st.lastSync = at;
    st.lastExportDay = m.exported_day;

    var report = {
      student: student, device: dev, addedKeys: 0, clearedKeys: 0,
      conflicts: [], quizUpdated: 0, testsUpdated: 0, notesMerged: 0
    };

    /* --- progress ledger: per-device last report per lesson-key --- */
    var key, prev;
    for (key in st.ledger) {
      if (!Object.prototype.hasOwnProperty.call(blob.progress, key)) {
        prev = st.ledger[key][dev];
        /* this device's newer export no longer carries the key -> un-done report */
        if (prev && prev.done === true && prev.at <= at) {
          st.ledger[key][dev] = { done: false, at: at };
          if (effectiveProgress(st)[key] !== true) {
            report.clearedKeys++;
            report.conflicts.push({
              type: 'progress', key: key, at: at, device: dev,
              detail: 'un-done on ' + (m.device.label || dev) + ' (newer export)'
            });
          }
        }
      }
    }
    for (key in blob.progress) {
      if (blob.progress[key] !== true) { continue; }
      prev = (isObj(st.ledger[key]) && st.ledger[key][dev]) ? st.ledger[key][dev] : null;
      if (prev && prev.done === true && prev.at >= at) { continue; } /* dedupe: nothing new */
      if (!isObj(st.ledger[key])) { st.ledger[key] = {}; }
      st.ledger[key][dev] = { done: true, at: at };
      if (before[key] !== true) { report.addedKeys++; }
      /* cross-device disagreement: another device reported not-done later */
      var otherDev, other, clash = null;
      for (otherDev in st.ledger[key]) {
        if (otherDev === dev) { continue; }
        other = st.ledger[key][otherDev];
        if (other && other.done === false && other.at > at) {
          clash = { type: 'progress', key: key, at: other.at, device: otherDev,
            detail: 'kept done here; ' + otherDev + ' reported un-done later' };
        }
      }
      if (clash) { report.conflicts.push(clash); }
    }

    /* --- quiz + tests: best + last, conflict when sources differ --- */
    function mergeScores(bucketName, incoming, updatedCounter) {
      var id, rec, cur, src;
      var mine = isObj(st[bucketName]) ? st[bucketName] : (st[bucketName] = {});
      for (id in incoming) {
        rec = incoming[id];
        if (!isObj(rec) || typeof rec.attempts !== 'number') { continue; }
        cur = isObj(mine[id]) ? mine[id] : null;
        src = dev;
        if (!cur) {
          mine[id] = {
            attempts: rec.attempts, total: rec.total || 0,
            best: rec.best != null ? rec.best : 0, best_dev: src, best_at: rec.at || null,
            last: rec.best != null ? rec.best : 0, last_dev: src, last_at: rec.at || null,
            conflict: false
          };
          report[updatedCounter]++;
          continue;
        }
        var changed = false;
        if ((rec.best != null ? rec.best : 0) > (cur.best != null ? cur.best : 0)) {
          cur.best = rec.best; cur.best_dev = src; cur.best_at = rec.at || null; changed = true;
        }
        if ((rec.at || 0) >= (cur.last_at || 0) && rec.at != null) {
          cur.last = rec.best != null ? rec.best : cur.last; cur.last_dev = src; cur.last_at = rec.at; changed = true;
        }
        if (rec.total && !cur.total) { cur.total = rec.total; }
        if (rec.attempts > (cur.attempts || 0)) { cur.attempts = rec.attempts; }
        if (changed) { report[updatedCounter]++; }
        if (cur.best_dev !== cur.last_dev && cur.best !== cur.last) {
          if (!cur.conflict) {
            cur.conflict = true;
            report.conflicts.push({
              type: bucketName, key: id, at: cur.last_at || at, device: cur.last_dev,
              detail: 'best ' + cur.best + ' (' + cur.best_dev + ') differs from last ' + cur.last + ' (' + cur.last_dev + ')'
            });
          }
        }
      }
    }
    mergeScores('quiz', isObj(blob.quiz) ? blob.quiz : {}, 'quizUpdated');
    mergeScores('tests', isObj(blob.tests) ? blob.tests : {}, 'testsUpdated');

    /* --- hours: max per metric per day --- */
    var date, hrec, hcur;
    var hIn = isObj(blob.hours) ? blob.hours : {};
    for (date in hIn) {
      hrec = hIn[date];
      if (!isObj(hrec)) { continue; }
      hcur = isObj(st.hours[date]) ? st.hours[date] : {};
      st.hours[date] = {
        planned: Math.max(hcur.planned || 0, hrec.planned || 0),
        practiced: Math.max(hcur.practiced || 0, hrec.practiced || 0)
      };
    }

    /* --- practice: max per metric per (date, subject) --- */
    var subj, prec, pcur, metric;
    var pIn = isObj(blob.practice) ? blob.practice : {};
    for (date in pIn) {
      if (!isObj(pIn[date])) { continue; }
      var mineP = isObj(st.practice[date]) ? st.practice[date] : {};
      for (subj in pIn[date]) {
        prec = pIn[date][subj];
        if (!isObj(prec)) { continue; }
        pcur = isObj(mineP[subj]) ? mineP[subj] : {};
        mineP[subj] = {
          minutes: Math.max(pcur.minutes || 0, prec.minutes || 0),
          items: Math.max(pcur.items || 0, prec.items || 0),
          correct: Math.max(pcur.correct || 0, prec.correct || 0),
          streak_best: Math.max(pcur.streak_best || 0, prec.streak_best || 0)
        };
      }
      st.practice[date] = mineP;
    }

    /* --- streams: newest 'at' wins; streak/best take max --- */
    var skey, srec, scur;
    var sIn = isObj(blob.streams) ? blob.streams : {};
    for (skey in sIn) {
      srec = sIn[skey];
      if (!isObj(srec)) { continue; }
      scur = isObj(st.streams[skey]) ? st.streams[skey] : null;
      if (!scur || (srec.at || 0) >= (scur.at || 0)) {
        var merged = copyOwn(srec);
        merged.streak = Math.max(scur ? (scur.streak || 0) : 0, srec.streak || 0);
        merged.best = Math.max(scur ? (scur.best || 0) : 0, srec.best || 0);
        st.streams[skey] = merged;
      }
    }

    /* --- student lesson notes: newest updated_at wins per lesson id --- */
    var lid, nrec, ncur;
    var nIn = isObj(blob.notes) ? blob.notes : {};
    var mineN = isObj(st.notes) ? st.notes : (st.notes = {});
    for (lid in nIn) {
      nrec = nIn[lid];
      if (!isObj(nrec)) { continue; }
      ncur = isObj(mineN[lid]) ? mineN[lid] : null;
      if (!ncur || String(nrec.updated_at || '') >= String(ncur.updated_at || '')) {
        mineN[lid] = copyOwn(nrec);
        report.notesMerged++;
      }
    }

    /* --- conflict log (per student, newest first, capped) --- */
    if (report.conflicts.length) {
      var log = (isObj(st.conflicts) && Array.isArray(st.conflicts)) ? st.conflicts : [];
      st.conflicts = report.conflicts.concat(log).slice(0, 50);
    }
    return { dash: dash, report: report };
  }

  /* ---------------- parent notes (live ONLY in the dash) ---------------- */

  function addParentNote(dashIn, student, text, now, id) {
    var dash = copyOwn(isObj(dashIn) ? dashIn : emptyDash());
    if (!isObj(dash.pnotes)) { dash.pnotes = {}; }
    var list = Array.isArray(dash.pnotes[student]) ? dash.pnotes[student] : [];
    var note = {
      id: id || 'n_' + (now || new Date()).getTime(),
      text: String(text || '').trim(),
      at: (now || new Date()).toISOString()
    };
    if (note.text) { list.push(note); dash.pnotes[student] = list; }
    return { dash: dash, note: note };
  }
  function deleteParentNote(dashIn, student, noteId) {
    var dash = copyOwn(isObj(dashIn) ? dashIn : emptyDash());
    var list = (isObj(dash.pnotes) && Array.isArray(dash.pnotes[student])) ? dash.pnotes[student] : [];
    dash.pnotes[student] = list.filter(function (n) { return n.id !== noteId; });
    return dash;
  }

  /* ---------------- parent day view ---------------- */

  /* Month-1 calendar: week/day index from a date string, or null outside. */
  function weekDayForDate(day) {
    if (typeof day !== 'string' || day < MONTH1_START) { return null; }
    var start = new Date(MONTH1_START + 'T00:00:00');
    var now = new Date(day + 'T00:00:00');
    var idx = Math.floor((now - start) / 86400000);
    var week = 1 + Math.floor(idx / 7);
    var dow = idx % 7; /* 0 = Mon (week file days run Mon-Fri, 1..5) */
    if (week > MONTH1_WEEKS) { return null; }
    if (dow > 4) { return null; } /* weekend: no scheduled blocks */
    return { week: week, day: dow + 1, idx: idx };
  }

  function streakDays(hoursMine, todayStr) {
    var days = [], d;
    if (!isObj(hoursMine)) { return 0; }
    for (d in hoursMine) {
      if (isObj(hoursMine[d]) && (hoursMine[d].practiced || 0) > 0) { days.push(d); }
    }
    if (!days.length) { return 0; }
    days.sort();
    var set = {}, i;
    for (i = 0; i < days.length; i++) { set[days[i]] = 1; }
    var streak = 0, cursor = todayStr;
    var dt = new Date(cursor + 'T00:00:00');
    /* today may have zero minutes so far — a streak anchored on yesterday holds */
    if (!set[cursor]) { dt = new Date(dt.getTime() - 86400000); cursor = dayStr(dt); }
    while (set[cursor]) {
      streak++;
      dt = new Date(dt.getTime() - 86400000);
      cursor = dayStr(dt);
    }
    return streak;
  }

  /* One child's day view from merged data. weekDay = {week, day} | null.
     blockKeys: the keys scheduled today (['juniper_w1_d2_b1', ...]) or null. */
  function dayView(dash, student, todayStr, weekDay, blockKeys) {
    var st = peekEntry(dash, student);
    var eff = st ? effectiveProgress(st) : {};
    var out = {
      student: student,
      hoursToday: (st && isObj(st.hours[todayStr])) ? st.hours[todayStr] : { planned: 0, practiced: 0 },
      streak: st ? streakDays(st.hours, todayStr) : 0,
      lastActiveDay: null,
      blocks: { done: 0, total: 0, keys: [] },
      nextLesson: null,
      lastSync: st ? st.lastSync : null,
      deviceCount: st ? Object.keys(st.devices || {}).length : 0,
      conflicts: (st && Array.isArray(st.conflicts)) ? st.conflicts.length : 0
    };
    if (st) {
      var days = [], d;
      for (d in st.hours) { if ((st.hours[d].practiced || 0) > 0) { days.push(d); } }
      days.sort();
      if (days.length) { out.lastActiveDay = days[days.length - 1]; }
    }
    var dayToUse = weekDay;
    if (!dayToUse && out.lastActiveDay) { dayToUse = weekDayForDate(out.lastActiveDay); }
    if (dayToUse && Object.prototype.toString.call(blockKeys) === '[object Array]') {
      var i;
      for (i = 0; i < blockKeys.length; i++) {
        if (eff[blockKeys[i]]) { out.blocks.done++; out.blocks.keys.push(blockKeys[i]); }
      }
      out.blocks.total = blockKeys.length;
    }
    out.merged = st ? { progress: eff, quiz: compactScoreMap(st.quiz), tests: compactScoreMap(st.tests) } : null;
    return out;
  }

  /* Next lesson from a curriculum + effective progress map (pure). */
  function nextLessonFrom(progressMap, cur) {
    var m, l, mods = (cur && cur.modules) || [];
    for (m = 0; m < mods.length; m++) {
      for (l = 0; l < mods[m].lessons.length; l++) {
        if (!progressMap[mods[m].lessons[l].id]) {
          return 'W' + mods[m].week + ' \u00b7 ' + mods[m].lessons[l].title;
        }
      }
    }
    return 'Month 1 complete \ud83c\udf89';
  }

  var api = {
    SYNC_SCHEMA: SYNC_SCHEMA, SYNC_VERSION: SYNC_VERSION, MONTH1_START: MONTH1_START,
    isObj: isObj, copyOwn: copyOwn, dayStr: dayStr,
    newDeviceId: newDeviceId, ensureDevice: ensureDevice,
    syncFileName: syncFileName,
    buildSyncBlob: buildSyncBlob, buildBundle: buildBundle,
    validateSyncBlob: validateSyncBlob,
    emptyDash: emptyDash, dashEntry: dashEntry, peekEntry: peekEntry,
    effectiveProgress: effectiveProgress, compactScoreMap: compactScoreMap,
    mergeSyncBlob: mergeSyncBlob,
    addParentNote: addParentNote, deleteParentNote: deleteParentNote,
    weekDayForDate: weekDayForDate, streakDays: streakDays,
    dayView: dayView, nextLessonFrom: nextLessonFrom
  };
  if (typeof window !== 'undefined') { window.SPROUT_SYNC = api; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})();
