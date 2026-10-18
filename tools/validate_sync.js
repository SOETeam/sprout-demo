// validate_sync.js — SPROUT sync self-test (node tools/validate_sync.js)
// Pure-function self-test of js/sync.js — no DOM, no localStorage, no week data touched.
// Gates:
//   1. export -> wipe -> import roundtrip = identical state (progress/quiz/tests/hours/notes).
//   2. Conflict case keeps BOTH scores (best + last), flags when sources differ.
//   3. Multi-device merge dedupes (same blob twice collapses; two devices merge cleanly).
// Exit 0 = PASS, exit 1 = FAIL.
'use strict';

var path = require('path');
var sync = require(path.join(__dirname, '..', 'js', 'sync.js'));

var FAILURES = [], PASS = 0;
function assert(cond, label) {
  if (cond) { PASS++; console.log('  PASS ' + label); }
  else { FAILURES.push(label); console.log('  FAIL ' + label); }
}
function j(v) { return JSON.stringify(v); }
function D(ms) { return new Date(ms); }
var devA = { id: 'd_testAAAA1234567890', label: 'Class Pad' };
var devB = { id: 'd_testBBBB1234567890', label: 'Home Laptop' };
var devC = { id: 'd_testCCCC1234567890', label: 'USB Stick' };

/* ---------- [1] Export -> wipe -> import roundtrip ---------- */
console.log('[1] export -> wipe -> import roundtrip identical');
var store = {
  ddevice: devA,
  progress: { max_w1_d1_b1: true, max_w1_d2_b1: true, other_w1_d1_b1: true },
  quiz: { max_q1: { attempts: 3, best: 4, total: 5, at: 1000 } },
  tests: { max_w1_test: { attempts: 1, best: 9, total: 10, at: 1001 } },
  hours: { max: { '2026-10-19': { planned: 30, practiced: 25 } } },
  practice: { max: { '2026-10-19': { math: { minutes: 20, items: 15, correct: 13, streak_best: 4 } } } },
  streams: { max: { '2026-10-19|gen-1': { level: 3, cursor: 7, attempts: 12, correct: 9, streak: 3, best: 5, at: 1002 } } },
  notes: { max: { max_w1_d1_b1: { text: 'Needs help with verbs', updated_at: '2026-10-19T10:00:00.000Z', highlights: ['verb'] } } }
};
var blob = sync.buildSyncBlob(store, 'max', { device: devA, now: D(2000) });
assert(blob && isObj(blob._sync) && blob._sync.student === 'max', 'export blob envelope (student=max)');
assert(blob._sync.schema === sync.SYNC_SCHEMA && blob._sync.version === sync.SYNC_VERSION, 'export blob version marker');
assert(blob._sync.ns === 'sprout_v1' && blob._sync.schema === 'sprout-sync', 'SPROUT namespace markers (schema sprout-sync, ns sprout_v1)');
assert(!blob.progress.other_w1_d1_b1, 'export filters other students (PII/scope law)');
var vres = sync.validateSyncBlob(JSON.stringify(blob));
assert(vres.ok === true, 'exported blob passes validateSyncBlob');

/* wipe = parent merges into an empty dash */
var dash1 = sync.mergeSyncBlob(sync.emptyDash(), blob);
var bundle = sync.buildBundle(dash1.dash, 'max', false, devA, D(3000));
assert(j(bundle.progress) === j(blob.progress), 'roundtrip progress identical');
assert(bundle.quiz.max_q1.attempts === 3 && bundle.quiz.max_q1.best === 4 && bundle.quiz.max_q1.total === 5, 'roundtrip quiz identical (best path)');
assert(bundle.tests.max_w1_test.best === 9 && bundle.tests.max_w1_test.total === 10, 'roundtrip tests identical');
assert(j(bundle.hours) === j(blob.hours), 'roundtrip hours identical');
assert(j(bundle.practice) === j(blob.practice), 'roundtrip practice identical');
assert(bundle.notes.max_w1_d1_b1 && bundle.notes.max_w1_d1_b1.text === 'Needs help with verbs', 'roundtrip notes identical');
var back = sync.buildSyncBlob({ ddevice: devA, progress: bundle.progress, quiz: compactBack(bundle.quiz), tests: compactBack(bundle.tests), hours: { max: bundle.hours }, practice: { max: bundle.practice }, streams: { max: bundle.streams }, notes: { max: bundle.notes } }, 'max', { device: devA, now: D(4000) });
assert(j(back.quiz) === j(blob.quiz) && j(back.progress) === j(blob.progress) && j(back.hours) === j(blob.hours), 'full roundtrip re-export identical');
function compactBack(m) { return JSON.parse(j(m)); }

/* ---------- [2] Conflict: best + last kept, flagged ---------- */
console.log('[2] conflict keeps best + last, flags disagreement');
var blobA = sync.buildSyncBlob({ ddevice: devA, progress: {}, quiz: { max_qc: { attempts: 2, best: 5, total: 5, at: 1000 } }, tests: {}, hours: {}, practice: {}, streams: {}, notes: {} }, 'max', { device: devA, now: D(10000) });
var blobB = sync.buildSyncBlob({ ddevice: devB, progress: {}, quiz: { max_qc: { attempts: 4, best: 2, total: 5, at: 2000 } }, tests: {}, hours: {}, practice: {}, streams: {}, notes: {} }, 'max', { device: devB, now: D(20000) });
var d2 = sync.mergeSyncBlob(sync.emptyDash(), blobA);
var r2 = sync.mergeSyncBlob(d2.dash, blobB);
var rec = r2.dash.sync.max.quiz.max_qc;
assert(rec && rec.best === 5 && rec.best_dev === devA.id, 'best kept (5, from device A)');
assert(rec.last === 2 && rec.last_dev === devB.id && rec.last_at === 2000, 'last kept (2, newest, from device B)');
assert(rec.conflict === true, 'conflict flag set on the score record');
assert(r2.report.conflicts.length > 0, 'merge report lists the conflict');
assert(r2.dash.sync.max.conflicts.length > 0 && r2.dash.sync.max.conflicts[0].type === 'quiz', 'dash conflict log carries the conflict');

/* ---------- [3] Multi-device dedupe + merge ---------- */
console.log('[3] multi-device dedupe');
var shared = sync.buildSyncBlob({ ddevice: devC, progress: { max_w2_d1_b1: true }, quiz: { max_qd: { attempts: 1, best: 4, total: 5, at: 3000 } }, tests: {}, hours: {}, practice: {}, streams: {}, notes: {} }, 'max', { device: devC, now: D(30000) });
var d3a = sync.mergeSyncBlob(sync.emptyDash(), shared);
var d3b = sync.mergeSyncBlob(d3a.dash, shared); /* same blob, same device, re-imported */
var st3 = d3b.dash.sync.max;
assert(Object.keys(st3.devices).length === 1, 'same device twice = one device entry (dedupe)');
assert(Object.keys(st3.ledger.max_w2_d1_b1).length === 1, 'same key re-import collapses to one device report');
assert(st3.quiz.max_qd.attempts === 1 && st3.quiz.max_qd.conflict === false, 'same quiz re-import does not inflate attempts or flag conflict');
/* two different devices, same key done -> one effective key, two device reports, no conflict */
var b1 = sync.buildSyncBlob({ ddevice: devA, progress: { max_w3_d1_b1: true }, quiz: {}, tests: {}, hours: {}, practice: {}, streams: {}, notes: {} }, 'max', { device: devA, now: D(40000) });
var b2 = sync.buildSyncBlob({ ddevice: devB, progress: { max_w3_d1_b1: true }, quiz: {}, tests: {}, hours: {}, practice: {}, streams: {}, notes: {} }, 'max', { device: devB, now: D(41000) });
var d4 = sync.mergeSyncBlob(sync.mergeSyncBlob(sync.emptyDash(), b1).dash, b2);
var st4 = d4.dash.sync.max;
assert(Object.keys(st4.ledger.max_w3_d1_b1).length === 2, 'two devices both recorded in ledger');
assert(sync.effectiveProgress(st4).max_w3_d1_b1 === true, 'effective progress = done once');
assert(st4.conflicts.length === 0, 'agreeing devices raise no conflict');
assert(Object.keys(st4.devices).length === 2 && st4.lastSync !== null, 'per-child device count + lastSync stamp present');

/* ---------- [4] SPROUT namespace + rejection gates ---------- */
console.log('[4] namespace + rejection gates');
var bad = JSON.parse(JSON.stringify(blob));
bad._sync.schema = 'saittasprout-sync';
assert(sync.validateSyncBlob(bad).ok === false, 'a SaittaSprout-namespace blob is rejected (no cross-app imports)');
assert(sync.validateSyncBlob('not json').ok === false, 'non-JSON file rejected');
var nod = JSON.parse(JSON.stringify(blob));
nod._sync.device.id = 'machine-fingerprint-99';
assert(sync.validateSyncBlob(nod).ok === false, 'non-d_ device tag rejected (PII law)');

/* ---------- [5] Parent notes: add/delete live only in dash.pnotes ---------- */
console.log('[5] parent notes add + delete');
var nd1 = sync.addParentNote(sync.emptyDash(), 'kid', 'Reads best after lunch', D(50000));
assert(nd1.note.id === 'n_50000' && nd1.note.at === '1970-01-01T00:00:50.000Z', 'note add with Date now (wiring contract) shapes id + at');
assert(nd1.dash.pnotes.kid.length === 1 && nd1.dash.pnotes.kid[0].text === 'Reads best after lunch', 'note stored under the child in dash.pnotes');
var nd2 = sync.addParentNote(nd1.dash, 'kid', '   ', D(51000));
assert(nd2.dash.pnotes.kid.length === 1, 'blank note text is dropped');
var nd3 = sync.deleteParentNote(nd2.dash, 'kid', 'n_50000');
assert(nd3.pnotes.kid.length === 0, 'note delete removes by id');

console.log('\n========================================');
if (FAILURES.length === 0) {
  console.log('VALIDATOR PASS: ' + PASS + '/' + PASS + ' checks green');
  process.exit(0);
} else {
  console.log('VALIDATOR FAIL: ' + FAILURES.length + ' of ' + (PASS + FAILURES.length) + ' checks failed');
  FAILURES.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
