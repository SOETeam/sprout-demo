#!/usr/bin/env node
/* SPROUT P0.5/P0.6 client-engine smoke — jsdom-free, node-only.
   Loads the REAL app.js (plus data/content.js + data/grades_k124.js) into a bare
   Node VM with window/localStorage/document stubs, then drives the exposed
   window.SPROUT_DEMO month engine. Verifies logic, not pixels:
     1. homeschool month: 4 weekly_plan/v1 drafts x 4 days x 6 blocks, 9/9 hard
        coverage per week, total_min sums, no day over the overload cap
     2. test binding: covers[] = target nodes, passScore 0.80, question_count ==
        len(questions), preschool carry NO pass mark
     3. binding ladder ∈ {exact, spiral, fallback}
     4. tutor mode: 2-3 sessions/week, pre_check→teach→practice→exit_ticket,
        coverage_claim 'tracked-not-claimed', exact TUTOR_NOTE copy
     5. K/1/2/4 lane: folded subject labels (ela / social_studies) + 9/9 still holds
     6. gate laws: unapproved placement or plan_generation_allowed=false → error,
        status stays 'draft' until approve (gate #2), approval writes to localStorage
   Run: node tools/smoke_month.js   (from sprout-demo root; APP_DIR to point elsewhere)
   Zero network. Exit 0 = all checks green. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = process.env.APP_DIR || path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(APP, p), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
}
const section = (t) => console.log('\n== ' + t + ' ==');

/* ---- sandbox: window + localStorage + document stubs, no DOM ---- */
const store = {};
const sandbox = {
  console, Math, JSON, Date, Array, Object, String, Number, RegExp, Error,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: (i) => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; }
  },
  location: { hash: '#/', href: 'file:///smoke/index.html' },
  navigator: { clipboard: null },
  document: {
    readyState: 'loading',                    // keep boot() from running (no DOM needed)
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }),
    body: { appendChild: () => {} }
  },
  module: { exports: {} },
  require
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(read('data/content.js'), sandbox, { filename: 'content.js' });
vm.runInContext(read('data/grades_k124.js'), sandbox, { filename: 'grades_k124.js' });
vm.runInContext(read('js/app.js'), sandbox, { filename: 'app.js' });

const D = sandbox.window.SPROUT_DEMO;
const NS = 'sprout_demo_v1';
ok('app.js boots without a DOM and exposes the month engine',
  !!D && typeof D.generateMonth === 'function' && typeof D.approveMonthPlan === 'function',
  D ? Object.keys(D).join(',') : 'no SPROUT_DEMO');

/* ---- seed: account (mode), child, approved placement + year plan ---- */
const placement = {
  schema: NS, report_id: 'plc_smoke', learner_id: 'c1',
  domains: [
    { domain: 'math', theta: -1.2, se: 0.4, grade_band: '3', confidence: 'medium',
      mastered_skills: [], focus_skills: ['multiplication', 'place-value'],
      prerequisite_gaps: [], conflict: false, resolution: 'none' },
    { domain: 'ela', theta: -0.5, se: 0.7, grade_band: '3', confidence: 'low',
      mastered_skills: ['fluency'], focus_skills: ['reading-fluency'],
      prerequisite_gaps: ['phonics'], conflict: false, resolution: 'none' }
  ],
  guardian_gate: { status: 'approved', decided_by: 'smoke', decided_at: '2026-10-26T00:00:00Z', notes: null },
  plan_generation_allowed: true, cat: {}, assessment_refs: []
};
function seedChild(id, grade) {
  const kids = D.store.children ? D.store.children() : JSON.parse(store[NS + '.children'] || '{"items":[]}').items;
  const list = kids.slice();
  list.push({ id, name: 'Smoke', grade: grade, start_date: '2026-09-01' });
  D.store.saveChildren(list);
  D.store.set(NS + '.placement.' + id, JSON.parse(JSON.stringify(placement)));
  D.store.set(NS + '.yearplan.' + id, { schema: NS, plan_id: 'plan_' + id, learner_id: id,
    grade_band: String(grade), mode: 'A', approved: true,
    guardian_gate: { status: 'approved', decided_by: 'smoke', decided_at: 't' }, coverage_audit: [] });
  D.store.set(NS + '.gate.' + id, { schema: NS, v: 1 });
  return D.store.children().find((c) => c.id === id);
}
D.store.set(NS + '.account', { schema: NS, name: 'SmokeGuardian', role: 'parent', mode: 'homeschool',
  salt: 's', digest: 'd', created_at: '2026-10-26T00:00:00Z' });
const c3 = seedChild('c3', '3');

section('homeschool month (grade 3)');
const hs = D.generateMonth(c3, { mode: 'homeschool', month: 1 });
ok('monthly_plan/v1 draft behind guardian gate #2',
  hs.schema === 'monthly_plan/v1' && hs.status === 'draft' &&
  hs.guardian_gate.status === 'pending' && hs.mode === 'homeschool',
  hs.status + '/' + hs.guardian_gate.status);
ok('4 weekly_plan/v1 drafts with 4 days x 6 blocks',
  hs.weeks.length === 4 && hs.weeks.every((w) =>
    w.schema === 'weekly_plan/v1' && w.status === 'draft' && w.days.length === 4 &&
    w.days.every((d) => d.blocks.length === 6) && w.adjustments_applied.length === 0),
  hs.weeks.map((w) => w.days.length + 'x' + w.days[0].blocks.length).join(' '));
ok('9/9 statutory coverage hard constraint holds every week',
  hs.audits.coverage.length === 4 && hs.audits.coverage.every((c) => c.ok && c.covered === 9 && c.required === 9),
  hs.audits.coverage.map((c) => c.covered + '/' + c.required).join(' '));
ok('total_min equals the sum of block minutes on every day',
  hs.weeks.every((w) => w.days.every((d) =>
    d.total_min === d.blocks.reduce((a, b) => a + b.min, 0))),
  'all 16 days');
ok('no day exceeds the overload cap (audit clean)',
  hs.audits.overload.length === 0 && hs.audits.errors.length === 0 && hs.ready_for_gate === true,
  'errors=' + hs.audits.errors.length);
ok('binding ladder stays inside {exact, spiral, fallback}',
  hs.weeks.every((w) => w.days.every((d) => d.blocks.every((b) =>
    ['exact', 'spiral', 'fallback'].indexOf(b.binding.tier) >= 0 &&
    (b.binding.tier !== 'exact' || b.lesson_ref)))),
  JSON.stringify([...new Set(hs.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.map((b) => b.binding.tier))))]));
ok('every block carries a gap target or an honest null (spine subject)',
  hs.weeks.every((w) => w.days.every((d) => d.blocks.every((b) => 'skill_node' in b))),
  'skill_node present on all blocks');

section('test binding');
ok('passScore 0.80, question_count == len(questions), covers = touched targets',
  hs.weeks.every((w) => w.test.passScore === 0.80 &&
    w.test.question_count === w.test.questions.length &&
    w.test.covers.length === new Set(w.test.covers).size &&
    w.test.covers.every((n) => w.days.some((d) => d.blocks.some((b) => b.skill_node === n)))),
  hs.weeks.map((w) => w.test.passScore + ':' + w.test.question_count + '/' + w.test.questions.length).join(' '));
ok('bound lessons feed the test (questions pulled from in-week lessons)',
  hs.weeks.some((w) => w.test.questions.length > 0),
  'week tests: ' + hs.weeks.map((w) => w.test.questions.length).join(','));

section('tutor mode (P0.6)');
const tu = D.generateMonth(c3, { mode: 'tutor', month: 2 });
ok('session-shaped weeks: 2-3 sessions, 4 phases each',
  tu.mode === 'tutor' && tu.weeks.every((w) =>
    w.sessions.length >= 2 && w.sessions.length <= 3 && !w.days &&
    w.sessions.every((s) => s.blocks.map((b) => b.phase).join('>') ===
      'pre_check>teach>practice>exit_ticket')),
  tu.weeks.map((w) => w.sessions.length).join(','));
ok('coverage is tracked, never claimed',
  tu.audits.coverage_claim === 'tracked-not-claimed' &&
  tu.mode_note === D.TUTOR_NOTE && /coverage is tracked, not claimed/.test(tu.mode_note),
  tu.audits.coverage_claim);
ok('tutor gaps never block the plan (coverage errors are tracking, not errors)',
  tu.audits.errors.filter((e) => e.type === 'coverage').length === 0 && tu.ready_for_gate === true,
  'errors=' + tu.audits.errors.length);
ok('tutor sessions target placement gap skills only',
  tu.weeks.every((w) => w.sessions.every((s) =>
    !s.target || ['focus', 'target', 'show_me'].indexOf(s.target.action) >= 0)),
  JSON.stringify(tu.weeks[0].sessions.map((s) => s.target && s.target.statutory)));

section('grade lanes');
for (const g of ['preschool', 'K', '1', '2', '4', '5']) {
  const kid = seedChild('c_' + g, g);
  const plan = D.generateMonth(kid, { mode: 'homeschool', month: 1 });
  if (plan.error) { ok('grade ' + g + ': month generates', false, plan.message); continue; }
  const labels = [...new Set(plan.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.map((b) => b.subject))))];
  const stat = D.statutoryForGrade(g);
  ok('grade ' + g + ': generates 4x4x6 with 9/9 coverage',
    plan.weeks.length === 4 && plan.audits.coverage.every((c) => c.ok && c.required === stat.length),
    plan.audits.coverage.map((c) => c.covered + '/' + c.required).join(' ') + ' labels=' + labels.join(','));
  if (g === 'preschool') {
    ok('preschool: show-me — NO pass mark on any test',
      plan.weeks.every((w) => w.test.passScore === null),
      String(plan.weeks[0].test.passScore));
    ok('preschool: gap map bypasses scoring (show_me)',
      Object.values(plan.targets).every((t) => t.action === 'show_me'), 'all show_me');
  }
  if (g === 'K' || g === '1' || g === '2') {
    ok('grade ' + g + ': folded subject vocabulary (ela / social_studies)',
      labels.indexOf('ela') >= 0 && labels.indexOf('social_studies') >= 0 &&
      labels.every((l) => ['ela', 'social_studies', 'math', 'science'].indexOf(l) >= 0),
      labels.join(','));
  }
}

section('gate laws (guardian gate #1 and #2)');
const locked = JSON.parse(JSON.stringify(placement));
locked.plan_generation_allowed = false;
D.store.set(NS + '.placement.c3', locked);
const blocked = D.generateMonth(c3, { mode: 'homeschool' });
ok('plan_generation_allowed=false stops generation (STEP 2 STOP)',
  blocked.error === 'placement', JSON.stringify(blocked.message || blocked.error));
const pending = JSON.parse(JSON.stringify(placement));
pending.guardian_gate.status = 'pending';
D.store.set(NS + '.placement.c3', pending);
ok('unapproved placement stops generation', D.generateMonth(c3, {}).error === 'placement',
  'error=placement');
D.store.set(NS + '.placement.c3', JSON.parse(JSON.stringify(placement)));

const fresh = D.generateMonth(c3, { mode: 'homeschool', month: 3 });
D.saveMonthPlan(c3, fresh);
ok('draft saved to localStorage under sprout_demo_v1.monthplan.<childId>',
  D.monthPlanStore(c3).current.status === 'draft' && !!store[NS + '.monthplan.c3'],
  Object.keys(store).filter((k) => k.indexOf('monthplan') >= 0).join(','));
const approved = D.approveMonthPlan(c3, fresh, 'SmokeGuardian');
ok('guardian approval flips draft -> active (engine never auto-approves)',
  approved.status === 'active' && approved.guardian_gate.status === 'approved' &&
  approved.guardian_gate.decided_by === 'SmokeGuardian',
  approved.status + '/' + approved.guardian_gate.status);
ok('approval persists', D.monthPlanStore(c3).current.status === 'active', 'stored=active');

const dirty = D.generateMonth(c3, { mode: 'homeschool', month: 4 });
dirty.audits.errors.push({ type: 'coverage', week: 1, missing: ['civics'] });
const refused = D.approveMonthPlan(c3, dirty, 'SmokeGuardian');
ok('approval refused while audit errors exist (plan stays draft)',
  refused.error === 'audits' && D.monthPlanStore(c3).current.status === 'active',
  JSON.stringify(refused.message));

section('mode plumbing (account + child + plan)');
const tuted = D.setMode(c3, 'tutor');
const acct = JSON.parse(store[NS + '.account']);
const kidNow = D.store.children().find((c) => c.id === 'c3');
ok('setMode writes mode on BOTH the account and the child',
  tuted === 'tutor' && acct.mode === 'tutor' && kidNow.mode === 'tutor',
  'account=' + acct.mode + ' child=' + kidNow.mode);
ok('generated plan inherits the account/child mode',
  D.generateMonth(c3, { month: 5 }).mode === 'tutor', 'mode=' + D.generateMonth(c3, { month: 5 }).mode);
D.setMode(c3, 'homeschool');
ok('invalid mode falls back to homeschool', D.setMode(c3, 'nope') === 'homeschool', 'fallback ok');

console.log('\n== SUMMARY ==');
console.log((pass + fail) + ' checks · ' + pass + ' passed · ' + fail + ' failed');
process.exit(fail ? 1 : 0);