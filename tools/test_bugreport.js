// Functional test for the bug-report widget (roadmap P0.1 / §4.1).
// Mocks a minimal browser (localStorage/window/document/navigator/location), loads
// js/bugreport.js in a vm sandbox, and asserts: PII scrub, bugreport/v1 schema,
// key-NAMES-only state snapshot, and the FIFO cap of 25.
// Run: node tools/test_bugreport.js
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');

var passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; console.log('PASS  ' + msg); } else { failed++; console.log('FAIL  ' + msg); } }

function makeLS() {
  var data = {};
  return {
    get length() { return Object.keys(data).length; },
    key: function (i) { return Object.keys(data)[i] || null; },
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; }
  };
}

var sandbox = {};
sandbox.localStorage = makeLS();
sandbox.window = { innerWidth: 390, innerHeight: 844, addEventListener: function () {}, location: { hash: '#/children' } };
sandbox.document = { readyState: 'complete', addEventListener: function () {}, getElementById: function () { return null; } };
sandbox.navigator = { maxTouchPoints: 0 };
sandbox.location = sandbox.window.location;
sandbox.console = console;
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
vm.createContext(sandbox);

var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'bugreport.js'), 'utf8');
vm.runInContext(src, sandbox);

var API = sandbox.window.SPROUT_BUGREPORT;
ok(!!API && typeof API.buildReport === 'function', 'widget exposes window.SPROUT_BUGREPORT test API');

// seed app state (account + children with names to scrub + a placement key)
sandbox.localStorage.setItem('sprout_demo_v1.account',
  JSON.stringify({ name: 'Zoe', family: 'Rivera', salt: 'abc', digest: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }));
sandbox.localStorage.setItem('sprout_demo_v1.children',
  JSON.stringify({ items: [{ id: 'c1', name: 'Coral', grade: '3' }, { id: 'c2', name: 'Reef', grade: '5' }] }));
sandbox.localStorage.setItem('sprout_demo_v1.placement.c1', JSON.stringify({ round: 1 }));

// 1) scrub: emails, child/account names, digest hex removed
var names = ['Zoe', 'Rivera', 'Coral', 'Reef'];
var s = API.scrubText('Email zoe@test.com — Coral struggled; digest deadbeefdeadbeefdeadbeefdeadbeefdeadbeef ok', names);
ok(s.indexOf('zoe@test.com') === -1, 'scrub removes email tokens');
ok(!/coral/i.test(s), 'scrub removes child name (Coral)');
ok(!/deadbeef/i.test(s), 'scrub removes digest hex blobs');

// 2) buildReport: schema + scrubbed free text + key-NAMES-only state
var rep = API.buildReport('Coral could not open the lesson (zoe@test.com)', 'it should open', 'tap lesson 2', true);
ok(rep.schema === 'bugreport/v1', 'report schema is bugreport/v1');
ok(rep.scrubbed === true, 'report marked scrubbed:true');
ok(!/coral/i.test(rep.what) && rep.what.indexOf('zoe@test.com') === -1, 'free-text PII scrubbed in stored report');
ok(Array.isArray(rep.state_keys) && rep.state_keys.indexOf('placement.c1') >= 0 && rep.state_keys.indexOf('account') >= 0,
  'state_keys carry key NAMES only (account, placement.c1 present)');
ok(rep.state_keys.every(function (k) { return typeof k === 'string'; }), 'state_keys are name strings, never values');
ok(rep.grade_band === '3', 'grade_band derived from first/route child');
ok(Array.isArray(rep.recent_events_tail) && rep.recent_events_tail.length === 0,
  'recent_events_tail empty (demo stores no events log today)');
ok(/^bg_\d{8}_[0-9a-f]{4}$/.test(rep.rid), 'rid matches bg_YYYYMMDD_xxxx');
ok(rep.viewport === '390x844' && rep.touch === 'no', 'viewport + touch captured');

// 3) storeReport + FIFO cap 25
var storeOk = true;
for (var i = 0; i < 30; i++) {
  var r = API.buildReport('bug ' + i, 'e', 'r', false);
  if (!API.storeReport(r)) storeOk = false;
}
ok(storeOk, 'all storeReport writes succeeded (no quota error)');
var all = API.loadAll();
ok(all.length === 25, 'FIFO cap: 25 reports retained after storing 30 (got ' + all.length + ')');
ok(all.some(function (x) { return x.what === 'bug 29'; }), 'newest report (bug 29) retained');
ok(all.every(function (x) { return x.what !== 'bug 0' && x.what !== 'bug 1' && x.what !== 'bug 2'; }),
  'oldest reports (bug 0-2) dropped first (FIFO overflow)');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
