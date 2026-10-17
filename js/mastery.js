/* SPROUT engine P1 — mastery writer (mastery/v1).
   ------------------------------------------------------------------
   Per-child, per-skill-node working set, key sprout_demo_v1.mastery.<childId>
   = {"schema":"mastery/v1","child_id":"...","nodes":{<node_id>: {...}}}
   Node record (arch §1C): {node_id, p_known, attempts, correct,
   state:"new|developing|mastered|lapsed", gate:0.80, box, due,
   last_event_id, evidence_refs:[eid...]}.

   Algorithm = the repo's own BKT module, ported verbatim (READ + EXTEND,
   not duplicated): /root/sprout/sprout/mastery/bkt.py —
     P_INIT 0.20, P_TRANSITION 0.15, P_SLIP 0.10, P_GUESS 0.10,
     gate_check(p, 0.80). Leitner intervals from
     /root/sprout/sprout/mastery/reviews.py — BOXES [1,2,4,7,15],
     monotonic on recall (interval never decreases), lapse -> box 1.
   The demo's own progress.leitner shape ({box, next_review, state},
   app.js 1471-1488) is preserved on each node so the existing portal
   renderer stays valid; this module only ADDS the engine fields.

   Anti-grind (arch §1C): state === "mastered" requires p_known >= gate
   AND at least one non-practice evidence event (weekly test or artifact);
   practice taps alone never produce a mastery event.

   Evidence: every state change is appended to SPROUT_EVENTS (events/v1)
   and its eid is pushed into evidence_refs — the log, not this record,
   is the source of truth. If SPROUT_EVENTS is absent (P2 not wired yet)
   the update still applies; evidence_refs simply stays empty.

   Zero network. No diagnosis vocabulary, no scoring modifiers: the gate
   is 0.80 for every child (arch §9).
   ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  var SCHEMA = 'mastery/v1';
  var NS = 'sprout_demo_v1';
  var GATE = 0.80;                       // D3 rec / arch §1C — never lowered per child
  var P_INIT = 0.20, P_TRANSITION = 0.15, P_SLIP = 0.10, P_GUESS = 0.10;  // bkt.py
  var BOXES_DAYS = [1, 2, 4, 7, 15];     // reviews.py
  var LAPSE_GRADE_THRESHOLD = 2;         // reviews.py

  /* storage adapter — browser localStorage, else in-memory shim (node/validator) */
  var _mem = {};
  var _shim = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(_mem, k) ? _mem[k] : null; },
    setItem: function (k, v) { _mem[k] = String(v); },
    removeItem: function (k) { delete _mem[k]; }   // internal only, never on the API
  };
  function storage() {
    try { if (root && root.localStorage) return root.localStorage; } catch (e) { /* shim */ }
    return _shim;
  }
  function keyFor(childId) { return NS + '.mastery.' + childId; }

  function clamp01(p) { return Math.min(0.99, Math.max(0.01, p)); }

  /* bkt.py update() — standard BKT posterior + learning transition */
  function bktUpdate(pKnown, correct) {
    var p = clamp01(pKnown), pc;
    if (correct) {
      pc = p * (1 - P_SLIP) / (p * (1 - P_SLIP) + (1 - p) * P_GUESS);
    } else {
      pc = p * P_SLIP / (p * P_SLIP + (1 - p) * (1 - P_GUESS));
    }
    return Math.min(0.99, pc + (1 - pc) * P_TRANSITION);
  }
  function gateCheck(p, gate) { return p >= (gate == null ? GATE : gate); }

  /* reviews.py schedule() — Leitner with monotonic-interval guard */
  function leitnerSchedule(prev, grade, today) {
    var box = Math.max(1, Math.min(BOXES_DAYS.length, (prev && prev.box) || 1));
    var interval;
    if (grade >= LAPSE_GRADE_THRESHOLD) {
      var prevInterval = BOXES_DAYS[Math.min(box, BOXES_DAYS.length) - 1];
      box = Math.min(box + 1, BOXES_DAYS.length);
      interval = Math.max(BOXES_DAYS[box - 1], prevInterval);   // monotonic guard
    } else {
      box = 1;
      interval = BOXES_DAYS[0];
    }
    var d = today || new Date();
    var due = new Date(d.getTime() + interval * 86400000);
    return { box: box, interval_days: interval, due: due.toISOString().slice(0, 10) };
  }

  function dayStr(d) { return (d || new Date()).toISOString().slice(0, 10); }

  function load(childId) {
    var raw = storage().getItem(keyFor(childId));
    var doc = null;
    try { doc = raw == null ? null : JSON.parse(raw); } catch (e) { doc = null; }
    if (!doc || typeof doc !== 'object' || doc.schema !== SCHEMA || typeof doc.nodes !== 'object') {
      doc = { schema: SCHEMA, child_id: childId, gate: GATE, nodes: {}, updated_at: null };
    }
    return doc;
  }
  function save(childId, doc) {
    doc.schema = SCHEMA;
    doc.child_id = childId;
    doc.updated_at = new Date().toISOString();
    storage().setItem(keyFor(childId), JSON.stringify(doc));
  }

  function newNode(nodeId) {
    return {
      node_id: nodeId, p_known: P_INIT, attempts: 0, correct: 0,
      state: 'new', gate: GATE, box: 1,
      due: dayStr(), last_event_id: null, evidence_refs: [],
      next_review: dayStr(), state_label: 'Not started'   // app.js leitner shape
    };
  }

  function isNonPractice(evidenceKind) {
    return evidenceKind === 'test' || evidenceKind === 'artifact' || evidenceKind === 'placement';
  }

  function logEvent(childId, type, payload) {
    var ev = root && root.SPROUT_EVENTS && typeof root.SPROUT_EVENTS.logEvent === 'function'
      ? root.SPROUT_EVENTS.logEvent(childId, type, payload) : null;
    return ev ? ev.eid : null;
  }

  /* record one response against a skill node.
     evidenceKind: 'practice' | 'test' | 'artifact' | 'placement' (default practice).
     Returns the updated node record (or null if nodeId missing). */
  function record(childId, nodeId, correct, evidenceKind, when) {
    if (!childId || !nodeId) throw new Error('mastery: childId and nodeId required');
    var kind = evidenceKind || 'practice';
    var today = when || new Date();
    var doc = load(childId);
    var n = doc.nodes[nodeId] || newNode(nodeId);
    if (n.state === 'new') n.state = 'developing';

    var wasMastered = n.state === 'mastered';
    n.p_known = Math.round(bktUpdate(n.p_known, !!correct) * 10000) / 10000;
    n.attempts += 1;
    if (correct) n.correct += 1;

    /* Leitner: grade >= 2 counts as successful recall (correct=2, wrong=0) */
    var sched = leitnerSchedule({ box: n.box }, correct ? 2 : 0, today);
    n.box = sched.box;
    n.due = sched.due;
    n.next_review = sched.due;

    /* state machine — mastered also needs >=1 non-practice evidence.
       Count the CURRENT event's kind too (it is appended below, after the
       log call that mints its eid), so a first test/artifact evidence can
       land the node on the same update. */
    if (!correct && wasMastered) {
      n.state = 'lapsed';
    } else if (gateCheck(n.p_known, n.gate)) {
      var hasStrongEvidence = isNonPractice(kind) || n.evidence_refs.some(function (r) {
        return r && r.evidence_kind && isNonPractice(r.evidence_kind);
      });
      n.state = hasStrongEvidence ? 'mastered' : 'developing';
    } else if (n.state !== 'lapsed') {
      n.state = 'developing';
    }
    n.state_label = n.state === 'mastered' ? 'Reviewed' : (n.attempts ? 'In progress' : 'Not started');

    var eid = logEvent(childId, 'mastery', {
      node_id: nodeId, correct: !!correct, p_known: n.p_known,
      state: n.state, box: n.box, evidence_kind: kind, gate: n.gate
    });
    n.last_event_id = eid;
    if (eid) n.evidence_refs.push({ eid: eid, evidence_kind: kind, at: today.toISOString() });

    doc.nodes[nodeId] = n;
    save(childId, doc);
    return n;
  }

  function getNode(childId, nodeId) {
    var doc = load(childId);
    return doc.nodes[nodeId] || null;
  }
  function getPKnown(childId, nodeId) {
    var n = getNode(childId, nodeId);
    return n ? n.p_known : P_INIT;
  }
  function isMastered(childId, nodeId) {
    var n = getNode(childId, nodeId);
    return !!(n && n.state === 'mastered');
  }
  /* snapshot for the P2 generator (arch §2 step 1 reads M.nodes) */
  function snapshot(childId) {
    var doc = load(childId), out = {};
    Object.keys(doc.nodes).forEach(function (k) {
      var n = doc.nodes[k];
      out[k] = { node_id: n.node_id, p_known: n.p_known, state: n.state,
                 attempts: n.attempts, gate: n.gate, box: n.box, due: n.due };
    });
    return out;
  }
  /* merge a read-only snapshot (import path) — never overwrites a HIGHER p_known */
  function mergeSnapshot(childId, snap) {
    if (!snap || typeof snap !== 'object') return;
    var doc = load(childId);
    Object.keys(snap).forEach(function (k) {
      var s = snap[k] || {};
      var n = doc.nodes[k] || newNode(k);
      if ((s.p_known || 0) > n.p_known) n.p_known = s.p_known;
      if ((s.attempts || 0) > n.attempts) n.attempts = s.attempts;
      if (s.state && s.state !== 'new') n.state = s.state;
      if (s.box && s.box > n.box) n.box = s.box;
      doc.nodes[k] = n;
    });
    save(childId, doc);
  }
  function resetChild(childId) {   // "Clear this demo" helper — not a record mutation
    storage().removeItem(keyFor(childId));
  }

  var api = {
    SCHEMA: SCHEMA, GATE: GATE, BOXES_DAYS: BOXES_DAYS,
    keyFor: keyFor, bktUpdate: bktUpdate, gateCheck: gateCheck,
    leitnerSchedule: leitnerSchedule,
    record: record, getNode: getNode, getPKnown: getPKnown, isMastered: isMastered,
    snapshot: snapshot, mergeSnapshot: mergeSnapshot, resetChild: resetChild
  };

  if (typeof window !== 'undefined') { window.SPROUT_MASTERY = api; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (root && !root.SPROUT_MASTERY) { root.SPROUT_MASTERY = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
