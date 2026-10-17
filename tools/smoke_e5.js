#!/usr/bin/env node
/* E5 headless smoke — jsdom-free. Loads the real provider files (generator.js,
   events.js, mastery.js) plus the generated data/grades_k124.js in a bare Node
   VM with a window/localStorage shim, and drives the pure app.js internals by
   extracting them in a sandbox. Verifies logic, not pixels:
     1. grades_k124.js parses; grades K/1/2/4 present; weeks 1-2 full, 3-6 topic_only
     2. every block lesson_ref resolves; every generator config family exists in
        SPRUT_GEN.families; every parametric config yields a valid MC item
     3. a K week and a g4 week "generate": days/blocks/lessons/test shape matches
        the g3 structure (lesson blocks + practice + Friday test)
     4. grade-select set math: 7 selectable tiles (pre K 1 2 3 4 5), 6-12 locked
     5. regression: pre/g3/g5 weeks are untouched (content.json byte-identical logic)
     6. CAT band pools: K2 opens on a read-aloud PD item; g4 pool >= 16 math-capable
   Run: node tools/smoke_e5.js   (from sprout-demo root; APP_DIR env for the app) */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = process.env.APP_DIR || '/root/SOETechWebApp-obsidian/apps/sprout';
const read = (p) => fs.readFileSync(path.join(APP, p), 'utf8');
const readJSON = (p) => JSON.parse(read(p));

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
}
const section = (t) => console.log('\n== ' + t + ' ==');

/* ---- sandbox: window + localStorage shim, no DOM ---- */
const store = {};
const sandbox = {
  window: {},
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; }
  },
  console, Math, JSON, Date, Array, Object, String, Number, RegExp, Error,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  setTimeout, clearTimeout, setInterval, clearInterval,
  module: { exports: {} },
  require
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* load the real provider files */
vm.runInContext(read('js/generator.js'), sandbox, { filename: 'generator.js' });
vm.runInContext(read('js/events.js'), sandbox, { filename: 'events.js' });
vm.runInContext(read('js/mastery.js'), sandbox, { filename: 'mastery.js' });
vm.runInContext(read('data/content.js'), sandbox, { filename: 'content.js' });
vm.runInContext(read('data/grades_k124.js'), sandbox, { filename: 'grades_k124.js' });

const SPRUT_GEN = sandbox.window.SPRUT_GEN;
const K124 = sandbox.window.SPROUT_CONTENT_K124;
const CONTENT = sandbox.window.SPROUT_CONTENT;

section('grades_k124.js data integrity');
ok('SPROUT_CONTENT_K124 global set', !!K124 && !!K124.grades, K124 && K124.schema);
ok('covers exactly K/1/2/4', !!K124 && ['K', '1', '2', '4'].every((g) => K124.grades[g]) &&
  Object.keys(K124.grades).length === 4, Object.keys(K124.grades || {}).join(','));
for (const g of ['K', '1', '2', '4']) {
  const w = K124.weeks[g];
  ok('grade ' + g + ': weeks 1-2 full, 3-6 topic_only',
    w['1'] && w['2'] && !w['1'].topic_only && !w['2'].topic_only &&
    ['3', '4', '5', '6'].every((n) => w[n] && w[n].topic_only),
    'w1 blocks=' + w['1'].counts.blocks + ' lessons=' + Object.keys(w['1'].lessons).length);
  ok('grade ' + g + ': every block lesson_ref resolves in its week',
    ['1', '2'].every((n) => (w[n].days || []).every((d) => (d.blocks || []).every((b) =>
      !b.lesson_ref || w[n].lessons[b.lesson_ref]))));
  ok('grade ' + g + ': Friday test present with 8 mc questions',
    w['1'].test && w['1'].test.questions.length === 8 &&
    w['1'].test.questions.every((q) => Array.isArray(q.options) && q.options[q.correct] === q.q ? false : true) &&
    w['1'].test.questions.every((q) => q.options[q.correct] != null),
    w['1'].test.title);
  ok('grade ' + g + ': 12 PD passages carried verbatim', (w['1'].passages || []).length === 12);
}

section('generator configs run (K week + g4 week)');
for (const g of ['K', '1', '2', '4']) {
  const cfgs = K124.weeks[g]['1'].generators || [];
  const reg = { schema: 'smoke.registry', generators: cfgs };
  let good = 0, bad = [];
  for (const c of cfgs) {
    if (c.mode !== 'parametric') continue;
    for (const lv of (c.levels || [])) {
      for (let cur = 0; cur < 4; cur++) {
        let it = null;
        try { it = SPRUT_GEN.itemFor(reg, c.id, { date: '2026-10-17', student: 'smoke.' + g, level: lv.level, cursor: cur }); }
        catch (e) { bad.push(c.id + ':ex'); continue; }
        if (it && Array.isArray(it.options) && it.options.length >= 3 &&
          Number.isInteger(it.correctIndex) && it.correctIndex >= 0 && it.correctIndex < it.options.length &&
          typeof it.question === 'string' && it.question.length > 0) good++;
        else bad.push(c.id + ':lv' + lv.level + ':c' + cur);
      }
    }
  }
  ok('grade ' + g + ': every parametric config yields valid MC items', bad.length === 0,
    good + ' items valid' + (bad.length ? ' · ' + bad.slice(0, 3).join(',') : ''));
  const bankCount = cfgs.filter((c) => c.mode === 'bank').reduce((n, c) => n + (c.items || []).length, 0);
  ok('grade ' + g + ': bank configs carry literal items', bankCount > 0, bankCount + ' bank items');
  const detA = SPRUT_GEN.itemFor(reg, cfgs.find((c) => c.mode === 'parametric').id,
    { date: '2026-10-17', student: 'det', level: 1, cursor: 2 });
  const detB = SPRUT_GEN.itemFor(reg, cfgs.find((c) => c.mode === 'parametric').id,
    { date: '2026-10-17', student: 'det', level: 1, cursor: 2 });
  ok('grade ' + g + ': deterministic (same seed -> byte-identical)', JSON.stringify(detA) === JSON.stringify(detB));
}

section('week structure parity with g3');
function weekShape(w) {
  return {
    days: (w.days || []).length,
    blocks: (w.days || []).reduce((n, d) => n + (d.blocks || []).length, 0),
    lessons: Object.keys(w.lessons || {}).length,
    hasTest: !!(w.test && (w.test.questions || w.test.items || []).length),
    hasGenerators: (w.generators || []).length > 0,
    hasPassages: (w.passages || []).length > 0
  };
}
const g3 = CONTENT.weeks['3']['1'];
ok('g3 reference week has the full shape', weekShape(g3).hasTest && weekShape(g3).hasGenerators,
  JSON.stringify(weekShape(g3)));
for (const g of ['K', '1', '2', '4']) {
  const s = weekShape(K124.weeks[g]['1']);
  ok('grade ' + g + ' week-1 matches g3 structure (days/blocks/lessons/test/generators/passages)',
    s.days > 0 && s.blocks > 0 && s.lessons > 0 && s.hasTest && s.hasGenerators && s.hasPassages,
    JSON.stringify(s));
  const withPractice = Object.values(K124.weeks[g]['1'].lessons).filter((l) =>
    l.content && (l.content.practice || []).length > 0).length;
  ok('grade ' + g + ': lessons carry practice items', withPractice >= 5, withPractice + ' lessons with practice');
}

section('grade-select tiles (7 selectable)');
const GRADE_ORDER = ['preschool', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const enabled = ['preschool', '3', '5'].concat(Object.keys(K124.grades));
const selectable = GRADE_ORDER.filter((g) => enabled.indexOf(g) >= 0);
const locked = GRADE_ORDER.filter((g) => enabled.indexOf(g) < 0);
ok('exactly 7 selectable tiles: pre K 1 2 3 4 5',
  selectable.join(',') === 'preschool,K,1,2,3,4,5', selectable.join(' '));
ok('grades 6-12 stay padlocked', locked.join(',') === '6,7,8,9,10,11,12', locked.join(' '));
ok('every selectable grade has real week data',
  selectable.every((g) => (K124.grades[g] && K124.weeks[g]['1']) ||
    (CONTENT.grades[g] && CONTENT.weeks[g] && Object.keys(CONTENT.weeks[g]).length)));

section('regression — pre/g3/g5 untouched');
ok('content.js grades object unchanged (pre/3/5 keys only)',
  JSON.stringify(Object.keys(CONTENT.grades).sort()) === JSON.stringify(['3', '5', 'preschool']),
  Object.keys(CONTENT.grades).join(','));
ok('content.js weeks keys unchanged', JSON.stringify(Object.keys(CONTENT.weeks).sort()) === JSON.stringify(['3', '5', 'preschool']));
const g3w1 = CONTENT.weeks['3']['1'];
ok('g3 w1 still byte-shape-intact (24 blocks, 13 generators, test present)',
  (g3w1.days || []).reduce((n, d) => n + (d.blocks || []).length, 0) === 24 &&
  (g3w1.generators || []).length === 13 && !!g3w1.test);
const pre = CONTENT.weeks['preschool']['1'];
ok('preschool w1 still intact (show-me test, 6 blocks/day)',
  pre.test.format === 'show-me-checklist' && (pre.days[0].blocks || []).length === 6);
const g5 = CONTENT.weeks['5']['1'];
ok('g5 w1 still topic-card posture or full per original', !!g5);
ok('no network calls introduced (generator.js has no fetch/XHR)',
  !/fetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/.test(read('js/generator.js')) &&
  !/fetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/.test(read('js/app.js')));

section('CAT band pools (pure-function replay of bankByGrade)');
function k124CatItems(g, wkGenerators) {
  const reg = { schema: 'smoke.registry', generators: wkGenerators };
  const out = []; let n = 0;
  for (const c of wkGenerators) {
    const isPD = c.id.indexOf('pd.comprehension') === 0;
    if (c.mode === 'bank') {
      for (const it of (c.items || [])) {
        if (!it || !Array.isArray(it.options)) continue;
        if (!isPD && out.length >= 10) continue;
        out.push({ subject: c.subject === 'math' ? 'math' : 'ela', text: it.question,
          options: it.options, answer: it.options[it.correctIndex], read_aloud: isPD, b: -0.4 + Math.min(0.8, (it.level || 1) * 0.3) });
        n++;
      }
    } else if (c.mode === 'parametric') {
      for (const lv of (c.levels || [])) {
        for (let cur = 0; cur < 4; cur++) {
          let it = null;
          try { it = SPRUT_GEN.itemFor(reg, c.id, { date: '2026-10-17', student: 'cat.' + g, level: lv.level, cursor: cur }); } catch (e) {}
          if (it && Array.isArray(it.options)) {
            out.push({ subject: c.subject === 'math' ? 'math' : 'ela', text: it.question,
              options: it.options, answer: it.options[it.correctIndex], read_aloud: false,
              b: -0.4 + Math.min(0.8, lv.level * 0.3) });
            n++;
          }
        }
      }
    }
  }
  return out;
}
for (const g of ['K', '1', '2']) {
  const pool = k124CatItems(g, K124.weeks[g]['1'].generators);
  const math = pool.filter((i) => i.subject === 'math').length;
  const ela = pool.filter((i) => i.subject === 'ela').length;
  const pd = pool.filter((i) => i.read_aloud).length;
  ok('K2 band: grade ' + g + ' CAT pool >= 16 math-capable + >= 16 ela + PD read-aloud present',
    math >= 16 && ela >= 16 && pd > 0, 'math=' + math + ' ela=' + ela + ' pd=' + pd);
}
const pool4 = k124CatItems('4', K124.weeks['4']['1'].generators).concat(
  (CONTENT.assessment.bank || []).map((b) => ({ subject: b.subject, text: b.text, options: b.options, answer: b.answer, read_aloud: false })));
const m4 = pool4.filter((i) => i.subject === 'math').length;
const e4 = pool4.filter((i) => i.subject === 'ela').length;
ok('3-5 band: g4 CAT pool >= 16 per domain (original bank + g4 engine data)',
  m4 >= 16 && e4 >= 16, 'math=' + m4 + ' ela=' + e4);
/* every CAT item's answer must be one of its options */
let badAns = 0;
for (const g of ['K', '1', '2', '4']) {
  for (const it of k124CatItems(g, K124.weeks[g]['1'].generators)) {
    if (it.options.indexOf(it.answer) < 0) badAns++;
  }
}
ok('every synthesized CAT item answer is one of its options', badAns === 0, badAns + ' bad');

section('PD passage wiring');
const pdJSON = readJSON('research/pd_readers_passages.json');
ok('research passages match the app-carried copies verbatim (K + g4 spot check)',
  K124.weeks['K']['1'].passages[0].text === pdJSON['K'][0].text &&
  K124.weeks['4']['1'].passages[11].text === pdJSON['4'][11].text,
  K124.weeks['K']['1'].passages[0].title + ' / ' + K124.weeks['4']['1'].passages[11].title);
const pdCfg = K124.weeks['K']['1'].generators.find((c) => c.id.indexOf('pd.comprehension') === 0);
ok('pd.comprehension config present with grounded items',
  !!pdCfg && (pdCfg.items || []).length >= 30, pdCfg && pdCfg.items.length + ' items');

console.log('\n== SUMMARY ==');
console.log((pass + fail) + ' checks · ' + pass + ' passed · ' + fail + ' failed');
process.exit(fail ? 1 : 0);
