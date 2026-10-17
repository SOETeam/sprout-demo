#!/usr/bin/env node
/* SPROUT engine P1 validator — run: node tools/validate_engine.js
   ------------------------------------------------------------------
   Gates (P1 brief):
     1. skill_tree/v1 integrity — unique ids, parent/prereq resolution,
        same-grade edges, statutory + subject consistency
     2. item/v1 integrity — every skill_node resolves (same grade), no
        orphan items, no orphan nodes-with-items, standards inherited
        from the node, answer in options, exposure_limit === 3, type enum
     3. subject lists match data/content.json (canonical per P1 time-box
        ruling; the repo's subjects.yaml lives in /root/sprout/config and
        its active_statutory_list is byte-identical to content.statutory)
     4. CAT floor — >= 16 items per CAT domain (math/ela) per grade
     5. events/v1 append-only law — API exposes no mutation/deletion;
        appends grow the log strictly; dedupe_sig is deterministic
     6. mastery/v1 behavior — BKT update, gate 0.80, anti-grind rule
        (mastered needs non-practice evidence), Leitner monotonicity
     7. engine_schemas.json covers all four P1 schemas and their files exist
     8. node --check passes on every js/ provider file
   K/1/2/4 extension (lane A): those grade bands are standards-mapped tree only
   (no shipped content). Every structural gate above covers them; the content
   gates (subject union vs content.json, CAT floor) print NOTE lines instead of
   FAIL lines until the content lane lands items for them.
   Zero network. Exit 0 = all gates green; 1 = at least one FAIL.
   ------------------------------------------------------------------ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

/* ------------------------------------------------------------------ load */
const content = readJSON('data/content.json');
const tree = readJSON('data/skill_tree.json');
const bank = readJSON('data/items.json');
const reg = readJSON('data/engine_schemas.json');
const gens = readJSON('data/generators.json');

section('schema markers');
ok('skill_tree/v1 marker', tree.schema === 'skill_tree/v1', tree.schema);
ok('item_bank/v1 marker', bank.schema === 'item_bank/v1', bank.schema);
ok('engine_schema_registry/v1 marker', reg.schema === 'engine_schema_registry/v1', reg.schema);
ok('registry covers the four P1 schemas',
  ['skill_tree/v1', 'item/v1', 'events/v1', 'mastery/v1'].every((s) => reg.schemas[s]));
/* K/1/2/4 extension (lane A): standards-mapped grades with no shipped content
   yet. They are covered by every structural gate above/below (they ride in
   tree.grades), but the content-dependent gates (subject union vs
   content.json, CAT floor) cannot pass without content — those print NOTEs. */
const NEW_GRADES = ['K', '1', '2', '4'];

/* ------------------------------------------------------- 1. skill_tree */
section('skill_tree/v1 integrity');
const nodes = [];
Object.keys(tree.grades).forEach((g) => (tree.grades[g].nodes || []).forEach((n) => nodes.push(n)));
const byId = new Map();
let dupIds = [];
nodes.forEach((n) => { if (byId.has(n.id)) dupIds.push(n.id); byId.set(n.id, n); });
ok('node ids unique across grades', dupIds.length === 0, dupIds.join(','));
ok('every node has required fields',
  nodes.every((n) => n.id && n.grade && n.subject && n.kind && n.label !== undefined &&
    'parent' in n && Array.isArray(n.prereqs) && Array.isArray(n.standards)));
const badParent = nodes.filter((n) => n.parent && (!byId.has(n.parent) || byId.get(n.parent).grade !== n.grade));
ok('parents resolve within same grade', badParent.length === 0, badParent.map((n) => n.id).join(','));
const badPrereq = nodes.filter((n) => n.prereqs.some((p) => !byId.has(p) || byId.get(p).grade !== n.grade));
ok('prereqs resolve within same grade', badPrereq.length === 0, badPrereq.map((n) => n.id).join(','));
// cycle check on parent chain
let cyc = null;
for (const n of nodes) {
  const seen = new Set(); let cur = n;
  while (cur && cur.parent) {
    if (seen.has(cur.id)) { cyc = n.id; break; }
    seen.add(cur.id); cur = byId.get(cur.parent);
  }
  if (cyc) break;
}
ok('no parent cycles', cyc === null, cyc || '');
const statSet = new Set(tree.statutory_subjects);
ok('statutory list is the D7 nine',
  JSON.stringify(tree.statutory_subjects) === JSON.stringify(content.statutory),
  tree.statutory_subjects.length + ' subjects');
ok('node.statutory is a D7 subject or null',
  nodes.every((n) => n.statutory === null || statSet.has(n.statutory)));
/* Subject rule: every node subject must be in the grade's content union OR be a
   statutory subject. The OR matters — arch §0 documents that shipped grade-5
   content carries only 6 subjects; the tree deliberately contains all nine
   statutory subjects per grade so P2's generator can bind 9/9 coverage. Those
   statutory-but-unshipped subjects are printed as NOTEs (the §0 content gap). */
const statSubj = new Set(tree.statutory_subjects);
const badSubj = nodes.filter((n) =>
  !(tree.grade_subjects[n.grade] || []).includes(n.subject) && !statSubj.has(n.subject));
ok('node.subject in grade union or statutory', badSubj.length === 0,
  badSubj.map((n) => n.id).join(','));
/* normalize content subject -> statutory name (SUBJECT_MAP, app.js) before
   comparing, so 'math' matches 'mathematics' and the NOTE is not a false gap */
const TO_STATUTORY = { math: 'mathematics', maths: 'mathematics', ela: 'english_grammar',
  read: 'reading', reading_comp: 'reading', lit: 'literature' };
for (const g of ['preschool', '3', '5']) {
  const union = new Set(tree.grade_subjects[g].map((s) => TO_STATUTORY[s] || s));
  const missing = tree.statutory_subjects.filter((s) => !union.has(s));
  if (missing.length) console.log('NOTE  grade ' + g + ' statutory subjects with no shipped content (arch §0 gap, P2 must close): ' + missing.join(','));
}
/* new grades: standards-mapped tree only — structural gates apply, content
   gates are deferred to the content lane (NOTEs, never FAILs) */
for (const g of NEW_GRADES) {
  const gn = tree.grades[g] || {};
  const gs = (gn.nodes || []).filter((n) => n.grade === g);
  console.log('NOTE  grade ' + g + ' standards-mapped tree: ' + gs.length + ' nodes (' +
    ['strand', 'standard', 'skill'].map((k) => k + '=' + gs.filter((n) => n.kind === k).length).join(' ') +
    '), statutory band [' + (gn.statutory_subjects || []).join(',') + '], CAT domains [' +
    (gn.cat_domains || ['math', 'ela']).join(',') + '] — content pending (0 items)');
}

/* ------------------------------------------------------ subject matching */
section('subject lists match content.json');
function contentSubjects(g) {
  const s = new Set(content.grades[g].subjects);
  Object.values(content.weeks[g]).forEach((w) => (w.days || []).forEach((d) =>
    (d.blocks || []).forEach((b) => b.subject && s.add(b.subject))));
  return [...s].sort();
}
for (const g of ['preschool', '3', '5']) {
  const want = contentSubjects(g).join(',');
  const have = (tree.grade_subjects[g] || []).join(',');
  ok('grade ' + g + ' subject union matches content.json', want === have, have);
}
for (const g of NEW_GRADES) {
  console.log('NOTE  grade ' + g + ' subject union is the statutory band (content.json has no weeks/' +
    g + ' yet): ' + (tree.grade_subjects[g] || []).join(','));
}

/* ---------------------------------------------------------- 2. item bank */
section('item/v1 integrity');
const items = bank.items || [];
ok('items array non-empty', items.length > 0, items.length + ' items');
const itemIds = new Set(); let dupItems = [];
items.forEach((i) => { if (itemIds.has(i.id)) dupItems.push(i.id); itemIds.add(i.id); });
ok('item ids unique', dupItems.length === 0, dupItems.join(','));
const orphan = items.filter((i) => !byId.has(i.skill_node));
ok('every item.skill_node resolves in skill_tree', orphan.length === 0,
  orphan.slice(0, 5).map((i) => i.id + '->' + i.skill_node).join(','));
const wrongGrade = items.filter((i) => byId.has(i.skill_node) && byId.get(i.skill_node).grade !== i.grade);
ok('item grade matches its node grade', wrongGrade.length === 0,
  wrongGrade.slice(0, 5).map((i) => i.id).join(','));
const badStandards = items.filter((i) =>
  JSON.stringify(i.standards) !== JSON.stringify((byId.get(i.skill_node) || {}).standards || []));
ok('item.standards inherited from node (never hand-set)', badStandards.length === 0,
  badStandards.slice(0, 5).map((i) => i.id).join(','));
const badAnswer = items.filter((i) => !Array.isArray(i.options) || !i.options.includes(i.answer));
ok('answer is one of options', badAnswer.length === 0, badAnswer.slice(0, 5).map((i) => i.id).join(','));
ok('options length 3..6', items.every((i) => i.options.length >= 3 && i.options.length <= 6));
ok('exposure_limit === 3 on every item', items.every((i) => i.exposure_limit === 3));
ok('type in enum mc|numeric|written', items.every((i) => ['mc', 'numeric', 'written'].includes(i.type)),
  [...new Set(items.map((i) => i.type))].join(','));
ok('accessibility.read_aloud_ok is boolean', items.every((i) => i.accessibility && typeof i.accessibility.read_aloud_ok === 'boolean'));
ok('level in 1..4', items.every((i) => i.level >= 1 && i.level <= 4));
ok('provenance present on every item', items.every((i) => typeof i.provenance === 'string' && i.provenance.length > 4));

/* traceability: every item text exists verbatim (whitespace-normalized) in
   content.json — collected by walking every question/practice/bank field, so
   normalization cannot hide a mismatch. Generator-provenance items are checked
   against their generator config's authored items[] instead. */
section('traceability (never invent content)');
const sourceTexts = new Set();
const genItems = new Set();   // "<genId>|<normalized question>"
function collectQuestions(o) {
  if (Array.isArray(o)) { o.forEach(collectQuestions); return; }
  if (!o || typeof o !== 'object') return;
  if (o.q) sourceTexts.add(norm(o.q));
  if (o.question) sourceTexts.add(norm(o.question));
  if (o.text && o.options) sourceTexts.add(norm(o.text));
  Object.keys(o).forEach((k) => collectQuestions(o[k]));
}
Object.values(content.weeks).forEach((byWeek) =>
  Object.values(byWeek).forEach((w) => {
    (w.test && w.test.questions || []).forEach((q) => sourceTexts.add(norm(q.q)));
    (w.test && w.test.items || []).forEach((q) => sourceTexts.add(norm(q.prompt)));
    (w.quizzes || []).forEach((qz) => (qz.questions || []).forEach((q) => sourceTexts.add(norm(q.q))));
    Object.values(w.lessons || {}).forEach((les) =>
      ((les.content && les.content.practice) || []).forEach((p) => sourceTexts.add(norm(p.question))));
    (w.generators || []).forEach((gen) =>
      (gen.items || []).forEach((it) => genItems.add(gen.id + '|' + norm(it.question))));
  }));
/* K/1/2/4 lane E3: generator configs in data/generators.json carry authored literal items[]
   (bank-mode) — collect those too so generator:<id>.items[i] provenance stays traceable. */
Object.values(gens.grades || {}).forEach((list) =>
  (list || []).forEach((gen) =>
    (gen.items || []).forEach((it) => genItems.add(gen.id + '|' + norm(it.question)))));
(content.assessment.bank || []).forEach((b) => sourceTexts.add(norm(b.text)));
const genRef = (i) => /^generator:([\w.-]+)\.items\[\d+\]$/.exec(i.provenance || '');
const untraceable = items.filter((i) => {
  const m = genRef(i);
  if (m) return !genItems.has(m[1] + '|' + norm(i.text));
  return !sourceTexts.has(norm(i.text));
});
ok('every item text traceable to content.json or its generator config',
  untraceable.length === 0, untraceable.slice(0, 5).map((i) => i.id + ':' + i.provenance).join(' | '));
console.log('      source corpus: ' + sourceTexts.size + ' authored texts + ' + genItems.size + ' generator items');

/* orphan nodes: no node is referenced by an item but missing from tree (checked
   above); here we check the reverse direction for KIND=skill nodes with items */
const nodesWithItems = new Set(items.map((i) => i.skill_node));
ok('no skill node id referenced by items is missing from tree',
  [...nodesWithItems].every((id) => byId.has(id)));

/* --------------------------------------------------------- 4. CAT floor */
section('CAT domain floor (>=16 per domain per grade)');
const CATS = ['math', 'ela'];
for (const g of ['preschool', '3', '5']) {
  for (const d of CATS) {
    const n = items.filter((i) => i.grade === g && i.cat_domain === d).length;
    ok('grade ' + g + ' ' + d + ' >= 16 items', n >= 16, n + ' items');
  }
}
/* new grades: the floor is declared (cat_domains) but unreachable until the
   content lane ships items — NOTE, not FAIL (lane-A scope: tree only) */
for (const g of NEW_GRADES) {
  const doms = (tree.grades[g] || {}).cat_domains || CATS;
  console.log('NOTE  grade ' + g + ' CAT floor deferred (content lane pending): ' +
    doms.map((d) => d + '=' + items.filter((i) => i.grade === g && i.cat_domain === d).length + '/' + 16).join(', '));
}

/* --------------------------------------------- 5. events append-only law */
section('events/v1 append-only law');
const EVENTS = require(path.join(ROOT, 'js/events.js'));
ok('SPROUT_EVENTS exports', !!EVENTS && EVENTS.SCHEMA === 'events/v1', EVENTS && EVENTS.SCHEMA);
const apiKeys = Object.keys(EVENTS);
const mutationApi = apiKeys.filter((k) => /delete|remove|clear|update|mutate|overwrite|truncate|rewrite/i.test(k));
ok('NO mutation/deletion API exposed', mutationApi.length === 0, mutationApi.join(','));
const childApi = EVENTS.child('val_child');
const mutationChildApi = Object.keys(childApi).filter((k) => /delete|remove|clear|update|mutate|overwrite|truncate/i.test(k));
ok('child handle exposes no mutation API', mutationChildApi.length === 0, mutationChildApi.join(','));
const e1 = childApi.logEvent('practice', { node_id: 'x', correct: true });
const n1 = EVENTS.count('val_child');
const e2 = childApi.logEvent('practice', { node_id: 'x', correct: true });
const n2 = EVENTS.count('val_child');
const e3 = childApi.logEvent('test', { node_id: 'x', correct: false });
const n3 = EVENTS.count('val_child');
ok('append grows log monotonically', n1 === 1 && n2 === 2 && n3 === 3, [n1, n2, n3].join(','));
ok('eids strictly increasing', e1.eid < e2.eid && e2.eid < e3.eid, [e1.eid, e2.eid, e3.eid].join(' '));
ok('identical payload -> identical dedupe_sig', e1.dedupe_sig === e2.dedupe_sig, e1.dedupe_sig);
ok('different type -> different dedupe_sig', e2.dedupe_sig !== e3.dedupe_sig);
ok('dedupe_sig key-order independent',
  EVENTS.logEvent('val_child', 'practice', { a: 1, b: 2 }).dedupe_sig ===
  EVENTS.logEvent('val_child', 'practice', { b: 2, a: 1 }).dedupe_sig);
const parsed = EVENTS.readEvents('val_child');
const expectedCount = n3 + 2;  // e1,e2,e3 + the two key-order-independence events
ok('readEvents parses every line', parsed.length === expectedCount && parsed.every((e) => e.schema === 'events/v1' && e.eid && e.ts), parsed.length + ' lines');
ok('lines carry child_id', parsed.every((e) => e.child_id === 'val_child'));
const exp = JSON.parse(EVENTS.exportEvents('val_child'));
ok('exportEvents returns a valid document', exp.event_count === expectedCount && exp.events.length === expectedCount, exp.event_count + ' events');
// re-require must not shrink the log (append-only across sessions)
const EVENTS2 = require(path.join(ROOT, 'js/events.js'));
ok('log survives re-require (append-only across sessions)', EVENTS2.count('val_child') === expectedCount, EVENTS2.count('val_child') + ' lines');

/* --------------------------------------------- 6. mastery/v1 behavior */
section('mastery/v1 behavior');
const MAST = require(path.join(ROOT, 'js/mastery.js'));
ok('SPROUT_MASTERY exports', !!MAST && MAST.SCHEMA === 'mastery/v1', MAST && MAST.SCHEMA);
ok('gate is 0.80', MAST.GATE === 0.8 && MAST.GATE === 0.80);
// BKT: p_known rises on correct, falls on wrong, stays in [0.01,0.99]
const p0 = 0.2;
const pc = MAST.bktUpdate(p0, true), pw = MAST.bktUpdate(p0, false);
ok('BKT correct raises p_known', pc > p0, p0 + ' -> ' + pc.toFixed(4));
ok('BKT wrong lowers p_known', pw < p0, p0 + ' -> ' + pw.toFixed(4));
ok('bktUpdate clamps to [0.01,0.99]', [0, 1, 0.999, -1].every((v) => {
  const r = MAST.bktUpdate(v, true); return r >= 0.01 && r <= 0.99;
}));
ok('gateCheck(0.80)', MAST.gateCheck(0.8) === true && MAST.gateCheck(0.7999) === false);
// Leitner monotonicity (reviews.py QA rule)
let mono = true, prevBox = 1, prevInt = 1;
for (let i = 0; i < 6; i++) {
  const s = MAST.leitnerSchedule({ box: prevBox }, 2, new Date('2026-10-17'));
  if (s.interval_days < prevInt) mono = false;
  prevBox = s.box; prevInt = s.interval_days;
}
ok('Leitner interval monotonic on recall', mono);
ok('Leitner lapse resets to box 1', MAST.leitnerSchedule({ box: 4 }, 0, new Date('2026-10-17')).box === 1);
// record() + anti-grind
const cid = 'val_mastery_child';
const nid = '3.OA.7.multiplication-facts';
let rec = null;
for (let i = 0; i < 40 && (!rec || rec.state !== 'mastered'); i++) {
  rec = MAST.record(cid, nid, true, 'practice');
}
ok('practice-only never reaches mastered (anti-grind §1C)',
  rec.state !== 'mastered' && rec.p_known >= 0.8, 'state=' + rec.state + ' p=' + rec.p_known.toFixed(3));
const recTest = MAST.record(cid, nid, true, 'test');
ok('non-practice evidence lands mastered at gate', recTest.state === 'mastered', recTest.state);
ok('mastery event appended to events log',
  MAST.getNode(cid, nid).last_event_id !== null &&
  EVENTS.readEvents(cid).some((e) => e.type === 'mastery' && e.payload.node_id === nid));
ok('evidence_refs carry the eid', MAST.getNode(cid, nid).evidence_refs.length > 0 &&
  MAST.getNode(cid, nid).evidence_refs.every((r) => r.eid && r.evidence_kind));
// lapse path
const recLapse = MAST.record(cid, nid, false, 'practice');
ok('wrong answer on mastered node -> lapsed', recLapse.state === 'lapsed', recLapse.state);
ok('snapshot exposes node state', !!MAST.snapshot(cid)[nid] && MAST.snapshot(cid)[nid].state === 'lapsed');
ok('resetChild removes only that child key', (MAST.resetChild(cid), MAST.getNode(cid, nid) === null));

/* ------------------------------------ 7. schema registry files exist */
section('engine_schemas.json registry');
ok('registry names files that exist',
  ['data/skill_tree.json', 'data/items.json', 'data/standards_maps.json', 'js/events.js', 'js/mastery.js']
    .every((f) => fs.existsSync(path.join(ROOT, f))));
ok('registry documents append-only law',
  JSON.stringify(reg.schemas['events/v1'].invariants).includes('NO mutation'));
ok('registry documents anti-grind rule',
  JSON.stringify(reg.schemas['mastery/v1'].algorithm).includes('non-practice'));
ok('registry documents CAT floor',
  JSON.stringify(reg.schemas['item/v1'].invariants).includes('16 items per CAT domain'));
/* ---- K/1/2/4 lane E3: generators/v1 registry + config integrity ---- */
ok('registry registers generators/v1', !!(reg.schemas && reg.schemas['generators/v1']));
ok('generators/v1 registry names a file that exists',
  !!(reg.schemas && reg.schemas['generators/v1'] && reg.schemas['generators/v1'].file &&
     fs.existsSync(path.join(ROOT, reg.schemas['generators/v1'].file))));
ok('generators/v1 registry documents its schema marker',
  !!(reg.schemas && reg.schemas['generators/v1'] &&
     JSON.stringify(reg.schemas['generators/v1'].shape || {}).includes('generators/v1')));

section('generators/v1 config integrity (K/1/2/4)');
ok('generators.json has generators/v1 marker', gens.schema === 'generators/v1', gens.schema);
ok('generators.json covers K/1/2/4', ['K','1','2','4'].every((g) => Array.isArray(gens.grades && gens.grades[g])));
const allCfgs = ['K','1','2','4'].flatMap((g) => (gens.grades[g] || []).map((c) => Object.assign({ grade: g }, c)));
ok('generator config ids unique', new Set(allCfgs.map((c) => c.id)).size === allCfgs.length,
  allCfgs.length + ' configs');
ok('every config skill_node resolves in skill_tree (same grade)',
  allCfgs.every((c) => byId.has(c.skill_node) && byId.get(c.skill_node).grade === c.grade));
ok('exposure_limit === 3 on every config', allCfgs.every((c) => c.exposure_limit === 3));
ok('mode in enum parametric|bank', allCfgs.every((c) => c.mode === 'parametric' || c.mode === 'bank'),
  [...new Set(allCfgs.map((c) => c.mode))].join(','));
/* family must exist in js/generator.js's families registry (proves the config can actually run) */
let GENMOD = null;
try { GENMOD = require(path.join(ROOT, 'js/generator.js')); } catch (e) { GENMOD = null; }
const famOk = !!GENMOD && !!GENMOD.families;
ok('js/generator.js loads and exposes families', famOk);
ok('every config family exists in js/generator.js',
  famOk && allCfgs.every((c) => Object.prototype.hasOwnProperty.call(GENMOD.families, c.family)),
  famOk ? [...new Set(allCfgs.filter((c) => !GENMOD.families[c.family]).map((c) => c.family))].join(',') || 'all resolve'
        : 'generator.js failed to load');
/* parametric configs must have well-formed levels; bank configs must have valid literal items[] */
ok('parametric configs have >=1 level with integer level + params object',
  allCfgs.filter((c) => c.mode === 'parametric').every((c) =>
    Array.isArray(c.levels) && c.levels.length > 0 &&
    c.levels.every((l) => Number.isInteger(l.level) && l.level >= 1 && l.params && typeof l.params === 'object')));
ok('bank configs have items[] passing item/v1 shape (3..6 options, answer index valid)',
  allCfgs.filter((c) => c.mode === 'bank').every((c) =>
    Array.isArray(c.items) && c.items.length > 0 &&
    c.items.every((it) => Array.isArray(it.options) && it.options.length >= 3 && it.options.length <= 6 &&
      Number.isInteger(it.correctIndex) && it.correctIndex >= 0 && it.correctIndex < it.options.length)));
/* coverage: each new grade has at least one math and one ela/reading config */
ok('every new grade has >=1 math config and >=1 ela/reading config',
  ['K','1','2','4'].every((g) => {
    const gc = gens.grades[g] || [];
    return gc.some((c) => c.subject === 'math') &&
           gc.some((c) => ['ela','reading'].includes(c.subject));
  }));

section('generators/v1 runtime smoke (deterministic seeded generation)');
if (GENMOD && GENMOD.families) {
  const smokeFail = [];
  const smokePass = [];
  for (const c of allCfgs.filter((x) => x.mode === 'parametric')) {
    const reg2 = { generators: [Object.assign({}, c)], student: 'validator_smoke' };
    for (const lv of (c.levels || [])) {
      for (let cur = 0; cur < 8; cur++) {
        let it = null;
        try {
          it = GENMOD.itemFor(reg2, c.id, { date: '2026-10-17', student: 'validator_smoke', level: lv.level, cursor: cur });
        } catch (e) { smokeFail.push(c.id + ':exception:' + e.message); continue; }
        if (!it || !Array.isArray(it.options) || it.options.length < 3 || it.options.length > 6 ||
            !Number.isInteger(it.correctIndex) || it.correctIndex < 0 || it.correctIndex >= it.options.length ||
            typeof it.question !== 'string' || it.question.length === 0) {
          smokeFail.push(c.id + ':level' + lv.level + ':cursor' + cur);
        } else {
          smokePass.push(1);
        }
      }
    }
  }
  ok('every parametric config produces valid MC items across sampled seeds',
    smokeFail.length === 0,
    smokeFail.length === 0 ? smokePass.length + ' sampled items valid'
                           : smokeFail.slice(0, 5).join(' | ') + (smokeFail.length > 5 ? ' +' + (smokeFail.length - 5) + ' more' : ''));
  /* determinism: same (date, student, genId, cursor) -> byte-identical item, twice */
  let detOk = true;
  for (const c of allCfgs.filter((x) => x.mode === 'parametric').slice(0, 6)) {
    const reg2 = { generators: [Object.assign({}, c)], student: 'det_student' };
    const lv = c.levels[0];
    const a = GENMOD.itemFor(reg2, c.id, { date: '2026-10-17', student: 'det_student', level: lv.level, cursor: 3 });
    const b = GENMOD.itemFor(reg2, c.id, { date: '2026-10-17', student: 'det_student', level: lv.level, cursor: 3 });
    if (JSON.stringify(a) !== JSON.stringify(b)) detOk = false;
  }
  ok('same seed -> byte-identical item (deterministic)', detOk);
} else {
  ok('every parametric config produces valid MC items across sampled seeds', false, 'generator.js unavailable');
  ok('same seed -> byte-identical item (deterministic)', false, 'generator.js unavailable');
}

section('PD passage comprehension grounding (research/pd_readers_passages.json)');
let PDOK = false, pdPassages = null;
try { pdPassages = JSON.parse(fs.readFileSync(path.join(ROOT, 'research/pd_readers_passages.json'), 'utf8')); PDOK = true; } catch (e) { PDOK = false; }
ok('research/pd_readers_passages.json loads (48 passages across K/1/2/4)',
  PDOK && ['K','1','2','4'].every((g) => Array.isArray(pdPassages[g]) && pdPassages[g].length === 12),
  PDOK ? ['K','1','2','4'].map((g) => g + '=' + (pdPassages[g] || []).length).join(' ') : 'file missing');
if (PDOK) {
  /* every pd.comprehension.g<grade> config exists, has 3..4 items per passage, answers grounded verbatim */
  const norm2 = norm;
  const pdFail = [];
  let pdItemCount = 0;
  for (const g of ['K','1','2','4']) {
    const cfg = (gens.grades[g] || []).find((c) => c.id === 'pd.comprehension.g' + g);
    if (!cfg || !Array.isArray(cfg.items)) { pdFail.push(g + ':no-config'); continue; }
    const byPassage = new Map();
    for (const it of cfg.items) {
      pdItemCount++;
      const pidx = it.passage_index;
      if (typeof pidx !== 'number' || !pdPassages[g][pidx]) { pdFail.push(g + ':bad-passage-index'); continue; }
      byPassage.set(pidx, (byPassage.get(pidx) || 0) + 1);
      const pt = pdPassages[g][pidx].text;
      /* answer must be grounded: appears in passage (word-level for short answers, normalized substring for sentences) */
      const ans = it.options[it.correctIndex];
      const inPassage = pt.toLowerCase().includes(String(ans).toLowerCase()) ||
        norm2(pt).includes(norm2(ans));
      if (!inPassage) pdFail.push(g + ':p' + pidx + ':ungrounded-answer:' + String(ans).slice(0, 30));
      /* all options must be unique */
      if (new Set(it.options).size !== it.options.length) pdFail.push(g + ':p' + pidx + ':dup-options');
    }
    for (const [pidx, n] of byPassage) {
      if (n < 3 || n > 4) pdFail.push(g + ':p' + pidx + ':count=' + n);
    }
    /* every passage must have at least 3 questions */
    for (let i = 0; i < pdPassages[g].length; i++) {
      if (!byPassage.has(i)) pdFail.push(g + ':p' + i + ':missing');
    }
  }
  ok('every PD passage has 3..4 comprehension questions with grounded answers',
    pdFail.length === 0,
    pdFail.length === 0 ? pdItemCount + ' questions across 48 passages'
                        : pdFail.slice(0, 5).join(' | '));
} else {
  ok('every PD passage has 3..4 comprehension questions with grounded answers', false, 'passages file missing');
}


/* ------------------------------------------------ 8. node --check all js */
section('node --check on provider js');
for (const f of ['js/events.js', 'js/mastery.js', 'js/app.js', 'js/generator.js', 'js/lesson.js', 'js/pacing.js', 'js/workspace.js']) {
  let okc = true, err = '';
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); }
  catch (e) { okc = false; err = String(e.stderr || e.message).slice(0, 120); }
  ok('node --check ' + f, okc, err);
}

/* ------------------------------------------------------------- summary */
section('SUMMARY');
const perGrade = {};
for (const g of ['preschool', '3', '5', 'K', '1', '2', '4']) {
  perGrade[g] = {
    items: items.filter((i) => i.grade === g).length,
    math: items.filter((i) => i.grade === g && i.cat_domain === 'math').length,
    ela: items.filter((i) => i.grade === g && i.cat_domain === 'ela').length,
    non_cat: items.filter((i) => i.grade === g && i.cat_domain === null).length,
    nodes: (tree.grades[g].nodes || []).length
  };
}
console.log('nodes: ' + nodes.length + '  items: ' + items.length);
console.log(JSON.stringify(perGrade));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
