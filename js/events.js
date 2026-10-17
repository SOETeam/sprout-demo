/* SPROUT engine P1 — append-only event log (events/v1).
   ------------------------------------------------------------------
   Law (SPROUT_ENGINE_ARCH §1E + Build Laws): one append-only JSONL line
   per fact, per child, in localStorage key sprout_events_v1_<childId>.
   There is deliberately NO mutation or deletion API on this module —
   nothing here can edit, reorder or remove a logged line, ever. The
   proficiency report (P5) is a pure function of these lines; if a
   derived table and the log disagree, the log wins.

   Line shape:
     {"schema":"events/v1","eid":"evt_...","ts":"ISO","child_id":"...",
      "type":"...","payload":{...},"dedupe_sig":"fnv1a32(...)"}
   - eid       monotonic per child (evt_<ts36>_<seq36>) — order proof
   - dedupe_sig stable FNV-1a 32-bit over childId|type|canonical-payload,
     so a future relay (§8, off by default) can POST lines idempotently.
     It fingerprints a line; it never suppresses the append (the log
     records what happened, duplicates included — dedupe is a consumer
     concern, e.g. the relay, not the log's).

   Zero network: this file never calls fetch/XHR/WebSocket. exportEvents
   writes a browser JSON download or (in node) returns the string.
   ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  var PREFIX = 'sprout_events_v1_';   // per-child key prefix (P1 brief)
  var SCHEMA = 'events/v1';

  /* storage adapter — browser localStorage, else in-memory shim (node/validator) */
  var _mem = {};
  var _memShim = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(_mem, k) ? _mem[k] : null; },
    setItem: function (k, v) { _mem[k] = String(v); },
    removeItem: function (k) { delete _mem[k]; },     // never exposed to callers
    key: function (i) { return Object.keys(_mem)[i] || null; },
    get length() { return Object.keys(_mem).length; }
  };
  function storage() {
    try {
      if (root && root.localStorage) return root.localStorage;
    } catch (e) { /* Privacy-mode throw — fall through to shim */ }
    return _memShim;
  }

  function keyFor(childId) { return PREFIX + childId; }

  /* FNV-1a 32-bit (same family as generator.js) for dedupe_sig */
  function fnv1a32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  /* canonical JSON: object keys sorted, so sig is key-order independent */
  function canonical(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    var keys = Object.keys(v).sort();
    return '{' + keys.map(function (k) {
      return JSON.stringify(k) + ':' + canonical(v[k]);
    }).join(',') + '}';
  }

  function nowIso() { return new Date().toISOString(); }

  function pad36(n) { return n.toString(36); }

  /* read raw JSONL lines for a child (never mutates) */
  function rawLines(childId) {
    var raw = storage().getItem(keyFor(childId));
    if (raw == null || raw === '') return [];
    return String(raw).split('\n').filter(function (l) { return l.length > 0; });
  }

  function readEvents(childId) {
    return rawLines(childId).map(function (l) {
      try { return JSON.parse(l); } catch (e) { return { schema: SCHEMA, corrupt_line: l }; }
    });
  }

  /* append exactly one line; returns the event object that was written */
  function append(childId, type, payload) {
    if (!childId || typeof childId !== 'string') throw new Error('events: childId required');
    if (!type || typeof type !== 'string') throw new Error('events: type required');
    var lines = rawLines(childId);
    var seq = lines.length;
    var sig = fnv1a32(childId + '|' + type + '|' + canonical(payload == null ? null : payload));
    var ev = {
      schema: SCHEMA,
      eid: 'evt_' + pad36(Date.now()) + '_' + pad36(seq),
      ts: nowIso(),
      child_id: childId,
      type: type,
      payload: (payload == null ? null : payload),
      dedupe_sig: sig
    };
    // append-only: one getItem + one setItem of (existing + new line). No rewrite of old lines.
    var line = JSON.stringify(ev);
    storage().setItem(keyFor(childId), lines.length ? (lines.join('\n') + '\n' + line) : line);
    return ev;
  }

  /* child-bound handle: gives the exact logEvent(type, payload) signature
     from the P1 brief while staying keyed per child. */
  function child(childId) {
    return {
      child_id: childId,
      key: keyFor(childId),
      logEvent: function (type, payload) { return append(childId, type, payload); },
      readEvents: function () { return readEvents(childId); },
      exportEvents: function (fname) { return exportEvents(childId, fname); },
      count: function () { return rawLines(childId).length; }
    };
  }

  /* JSON download in browser; returns the string in node (validator-friendly) */
  function exportEvents(childId, fname) {
    var doc = {
      schema: SCHEMA + '.export',
      exported_at: nowIso(),
      child_id: childId,
      event_count: rawLines(childId).length,
      events: readEvents(childId)
    };
    var json = JSON.stringify(doc, null, 1);
    if (root && typeof document !== 'undefined' && typeof Blob !== 'undefined' &&
        typeof URL !== 'undefined' && URL.createObjectURL) {
      try {
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = fname || ('sprout_events_' + childId + '.json');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      } catch (e) { /* download best-effort; the string is still returned */ }
    }
    return json;
  }

  var api = {
    SCHEMA: SCHEMA,
    PREFIX: PREFIX,
    keyFor: keyFor,
    child: child,
    logEvent: function (childId, type, payload) { return append(childId, type, payload); },
    readEvents: readEvents,
    exportEvents: exportEvents,
    count: function (childId) { return rawLines(childId).length; }
    // NOTE: no delete / update / clear / truncate — append-only law.
  };

  if (typeof window !== 'undefined') { window.SPROUT_EVENTS = api; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (root && !root.SPROUT_EVENTS) { root.SPROUT_EVENTS = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
