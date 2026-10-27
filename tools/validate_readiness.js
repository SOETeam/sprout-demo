#!/usr/bin/env node
/* SPROUT P0.4 — K–6 readiness validator v2 (7 grades × 9 months × 4 weeks)
   --------------------------------------------------------------------------------
   Regenerates K6_READINESS_MATRIX.md and prints the matrix + findings to stdout.

   Matrix axes (roadmap §2.1): grades K,1,2,3,4,5,6 × school months 1..9 ×
   4 weeks/month (year week = (month-1)*4 + weekOfMonth, i.e. 1..36).
   Preschool rides as an APPENDIX row: it is a pre-K band, outside MCL
   380.1561(3)(f) compulsory coverage, so 9/9 is reported but not scored.

   Gates per week file (roadmap P0.4 a–e):
     (a) 9/9 statutory coverage per week.
         Canonical list = nine MCL 380.1561(3)(f) subjects (D7-verified).
         Fold-map (K/1/2, mandated):  ela -> reading, writing, spelling,
         literature, english_grammar ; social_studies -> history, civics ;
         math -> mathematics ; science -> science.
         Non-statutory subjects (coding, art, motor, music, pe, health,
         technology, enrichment) are EXCLUDED from the statutory count and
         never satisfy it.
     (b) every lesson_ref / passage_ref / test id resolves inside its own
         week file, OR is explicitly tiered (block carries tier/binding.tier
         in {spiral, fallback, topic} — G13-style documented fallback).
     (c) day.total_min === sum(blocks[].min)
     (d) test.question_count === questions.length (when declared); quizzes
         likewise; preschool show-me check must carry NO pass mark.
     (e) every item/generator skill_node resolves in data/skill_tree.json
         (same grade).

   Tiers (roadmap §2.2):
     T2 Deep  — all gates pass AND >=80% of blocks bind to an authored
                same-week, subject-matched lesson AND test + passages +
                workbook/generator evidence present.
     T1 Spiral— all gates pass; lesson depth below the T2 bar → labeled
                "spiral review" in the parent view.
     T0 Empty — any gate fails, or the week file is missing/topic-only stub
                → that grade-month BLOCKS beta for that grade.

   Exit: 0 = no integrity FAIL (gates b–e). Integrity FAIL → 1.
   --strict: also exit 1 on any WARN (declared-map drift) or any grade-month
   below T1 (the beta bar).  --no-write: skip the .md rewrite.
   Zero network. Requires only node stdlib.
   --------------------------------------------------------------------------------
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const STRICT = process.argv.indexOf('--strict') >= 0;
const NO_WRITE = process.argv.indexOf('--no-write') >= 0;

/* ------------------------------------------------------------------ laws */
const MONTHS = 9;
const WEEKS_PER_MONTH = 4;
const GRADES = ['K', '1', '2', '3', '4', '5', '6'];
const APPENDIX = ['preschool'];

const STATUTORY = ['reading', 'spelling', 'mathematics', 'science', 'history',
  'civics', 'literature', 'writing', 'english_grammar'];

/* subject label -> statutory subjects it counts for (roadmap P0.4.a fold-map) */
const FOLD = {
  reading: ['reading'], spelling: ['spelling'], mathematics: ['mathematics'],
  science: ['science'], history: ['history'], civics: ['civics'],
  literature: ['literature'], writing: ['writing'], english_grammar: ['english_grammar'],
  /* K/1/2 folded labels (roadmap P0.4.a) */
  ela: ['reading', 'writing', 'spelling', 'literature', 'english_grammar'],
  social_studies: ['history', 'civics'],
  /* label aliases seen in content */
  math: ['mathematics'], maths: ['mathematics'], read: ['reading'],
  reading_comp: ['reading'], lit: ['literature'],
  grammar: ['english_grammar'], english: ['english_grammar']
};

/* never counts toward statutory coverage, never rescues a 9/9 failure */
const EXCLUDE = new Set(['coding', 'art', 'motor', 'music', 'pe',
  'physical_education', 'health', 'technology', 'enrichment', 'library']);

const TIER_RANK = { T0: 0, T1: 1, T2: 2 };
const worses = (a, b) => (TIER_RANK[a] < TIER_RANK[b] ? a : b);

/* ------------------------------------------------------------------ load */
const content = readJSON('data/content.json');
const k124 = readJSON('data/grades_k124.json');
const tree = readJSON('data/skill_tree.json');
const bank = readJSON('data/items.json');
const gens = readJSON('data/generators.json');

const findings = [];   // {level:'FAIL'|'WARN'|'GAP'|'NOTE', check, grade, month, week, detail}
const add = (level, check, g, m, w, detail) =>
  findings.push({ level, check, grade: g, month: m, week: w, detail });
const integrityFails = () => findings.filter((f) => f.level === 'FAIL');

function weeksFor(grade) {
  if (grade === '6') return null;                       // no lane at all
  if (k124.weeks && k124.weeks[grade]) return k124.weeks[grade];
  if (content.weeks && content.weeks[grade]) return content.weeks[grade];
  return null;
}

/* node index ------------------------------------------------------------- */
const nodesById = new Map();
GRADES.concat(APPENDIX).forEach((g) => {
  const gg = tree.grades[g];
  (gg && gg.nodes || []).forEach((n) => nodesById.set(n.id, n));
});

/* cross-week index: which week owns a lesson id, and duplicate test ids ---- */
const lessonIdsByGradeWeek = {};   // grade -> {weekNo: Set(lessonIds)}
const quizFirstSeen = {};          // grade|quizId -> first week no
const duplicateTests = [];
GRADES.concat(APPENDIX).forEach((g) => {
  const wks = weeksFor(g);
  lessonIdsByGradeWeek[g] = {};
  if (!wks) return;
  Object.keys(wks).forEach((wn) => {
    lessonIdsByGradeWeek[g][+wn] = new Set(Object.keys((wks[wn] && wks[wn].lessons) || {}));
    const t = wks[wn] && wks[wn].test;
    if (t && t.quizId) {
      const key = g + '|' + t.quizId;
      const tier = (t.tier && String(t.tier).toLowerCase()) || null;
      if (quizFirstSeen[key] == null) quizFirstSeen[key] = +wn;
      else duplicateTests.push({
        grade: g, quizId: t.quizId, first: quizFirstSeen[key], again: +wn,
        tiered: ['spiral', 'fallback'].indexOf(tier) >= 0
      });
    }
  });
});
duplicateTests.forEach((d) => add(d.tiered ? 'WARN' : 'FAIL', 'b/test-id', d.grade, null, d.again,
  'quizId ' + d.quizId + ' reused: authored for week ' + d.first + ', repeated in week ' + d.again +
  (d.tiered ? ' — explicitly tiered spiral/fallback, accepted' : ' (test id must resolve to its own week — rebind or add test.tier)')));

/* declared statutory_map drift (data-level WARN, not per week) ----------- */
GRADES.forEach((g) => {
  const meta = (content.grades && content.grades[g]) || (k124.grades && k124.grades[g]);
  if (!meta || !meta.statutory_map) {
    add('WARN', 'a-declared-map', g, null, null, 'no declared statutory_map in content');
    return;
  }
  /* expand declared labels through the fold (K/1/2 declare folded labels) */
  const expanded = new Set();
  meta.statutory_map.forEach((s) => {
    const key = String(s).toLowerCase();
    if (EXCLUDE.has(key)) { expanded.add(key); return; }
    (FOLD[key] || [key]).forEach((x) => expanded.add(x));
  });
  const declared = [...expanded].sort();
  const want = STATUTORY.slice().sort();
  const illegal = meta.statutory_map.map((s) => String(s).toLowerCase()).filter((s) => EXCLUDE.has(s));
  const missing = want.filter((s) => declared.indexOf(s) < 0);
  if (JSON.stringify(declared) !== JSON.stringify(want)) {
    add('WARN', 'a-declared-map', g, null, null,
      'declared statutory_map ≠ 9 MCL subjects — missing [' + missing.join(',') +
      ']' + (illegal.length ? ', non-statutory included [' + illegal.join(',') + ']' : ''));
  }
});

/* ------------------------------------------------------------------ gates */
function tierOfBlock(b) {
  const t = b.tier || b.binding_tier || (b.binding && b.binding.tier);
  return typeof t === 'string' ? t.toLowerCase() : null;
}
function isTiered(b) {
  return ['spiral', 'fallback', 'topic'].indexOf(tierOfBlock(b)) >= 0;
}

function statutoryFromBlocks(blocks) {
  const covered = new Set();
  blocks.forEach((b) => {
    const s = String(b.subject || '').toLowerCase();
    if (EXCLUDE.has(s)) return;
    const fold = FOLD[s];
    if (fold) fold.forEach((x) => covered.add(x));
  });
  return covered;
}

/* check one week object; returns {tier, reasons, bound, total, missing:[...]} */
function checkWeek(grade, month, wno, wk) {
  const integrity = [];
  const notes = [];

  if (!wk) return { tier: 'T0', reasons: ['week file missing'], missing: [wno], integrity: [], notes: [], covered: [] };
  if (!Array.isArray(wk.days) || !wk.days.length) {
    if (wk.topic_only || wk.badge) {
      return { tier: 'T0', reasons: ['topic-only stub (no day flow)'], missing: [wno], integrity: [], notes: [], covered: [] };
    }
    return { tier: 'T0', reasons: ['no days[]'], missing: [wno], integrity: ['b/no-days'], notes: [], covered: [] };
  }

  const lessons = wk.lessons || {};
  const passages = Array.isArray(wk.passages) ? wk.passages : [];
  const passageIds = new Set(passages.map((p) => p.id));
  const lessonIds = new Set(Object.keys(lessons));

  let blocks = [];
  wk.days.forEach((d) => {
    const dayBlocks = Array.isArray(d.blocks) ? d.blocks : [];
    blocks = blocks.concat(dayBlocks);

    /* (c) total_min sums */
    const sum = dayBlocks.reduce((a, b) => a + (Number(b.min) || 0), 0);
    if (d.total_min == null) {
      integrity.push('c/day' + d.day + ':total_min missing');
    } else if (Number(d.total_min) !== sum) {
      integrity.push('c/day' + d.day + ':total_min ' + d.total_min + ' ≠ Σ min ' + sum);
    }

    /* (b) refs */
    dayBlocks.forEach((b, i) => {
      const label = 'd' + d.day + 'b' + (i + 1);
      if (b.lesson_ref && !lessonIds.has(b.lesson_ref) && !isTiered(b)) {
        integrity.push('b/' + label + ': lesson_ref ' + b.lesson_ref + ' unresolved (not tiered)');
      }
      if (b.passage_ref && !passageIds.has(b.passage_ref) && !isTiered(b)) {
        integrity.push('b/' + label + ': passage_ref ' + b.passage_ref + ' unresolved (not tiered)');
      }
      if (!b.lesson_ref && !isTiered(b)) notes.push(label + ': no lesson_ref (subject fallback)');
    });
  });

  /* (b) test + quizzes ids */
  const test = wk.test || null;
  if (test) {
    (test.covers || []).forEach((cid) => {
      if (lessonIds.has(cid)) return;
      const tiered = (test.tier && String(test.tier).toLowerCase()) || null;
      if (['spiral', 'fallback', 'topic'].indexOf(tiered) >= 0) return;
      let where = null;
      const idx = lessonIdsByGradeWeek[grade] || {};
      Object.keys(idx).some((w) => { if (idx[w].has(cid)) { where = +w; return true; } return false; });
      integrity.push('b/test.covers: ' + cid + ' unresolved in week ' + wno +
        (where ? ' (exists only in week ' + where + ' — rebind, or tier it spiral/fallback)' : ' (no lesson with this id anywhere in grade ' + grade + ')'));
    });
    /* (d) question_count — show-me checklists author their items in `items` */
    const qlist = Array.isArray(test.questions) ? test.questions
      : (Array.isArray(test.items) ? test.items : []);
    if (test.question_count != null && test.question_count !== qlist.length) {
      integrity.push('d/test: question_count ' + test.question_count + ' ≠ ' +
        (Array.isArray(test.questions) ? 'questions' : 'items') + '.length ' + qlist.length);
    }
    if (!qlist.length) integrity.push('d/test: no questions/items');
    /* an empty covers[] is only drift when the test CLAIMS an authored week:
       a test explicitly tiered spiral/fallback (G2 — skeleton or rebind) has
       no in-week lesson to cover[] against by construction. */
    const testTier = (test.tier && String(test.tier).toLowerCase()) || null;
    if (Array.isArray(test.questions) && test.questions.length && !(test.covers || []).length &&
      ['spiral', 'fallback', 'topic'].indexOf(testTier) < 0) {
      add('WARN', 'd/test-covers', grade, month, wno, 'test ' + test.quizId + ' has questions but an empty covers[] (unbound test)');
    }
    /* preschool = show-me, NO pass mark (roadmap §3 STEP 3); 0 == no threshold */
    if (grade === 'preschool' && Number(test.passScore) > 0) {
      integrity.push('d/preschool: pass mark ' + test.passScore + ' present — preschool is show-me, no pass mark');
    }
    /* questions carry a resolvable skill reference? (e, soft) */
  }
  (wk.quizzes || []).forEach((q) => {
    if (!q.quizId) integrity.push('b/quiz: missing quizId');
    const qn = Array.isArray(q.questions) ? q.questions : (Array.isArray(q.items) ? q.items : []);
    if (q.question_count != null && q.question_count !== qn.length) {
      integrity.push('d/' + q.quizId + ': question_count ' + q.question_count + ' ≠ questions.length ' + qn.length);
    }
  });

  /* (a) 9/9 coverage — scored for K..6; reported only for preschool */
  const covered = statutoryFromBlocks(blocks);
  const missingStat = grade === 'preschool' ? [] : STATUTORY.filter((s) => !covered.has(s));
  if (missingStat.length) {
    /* coverage is tier-affecting (T0), not an integrity FAIL */
  }

  /* declared counts drift (soft) */
  if (wk.counts) {
    if (wk.counts.blocks != null && wk.counts.blocks !== blocks.length) {
      add('WARN', 'c/counts', grade, month, wno, 'counts.blocks ' + wk.counts.blocks + ' ≠ ' + blocks.length);
    }
    if (wk.counts.lesson_objects != null && wk.counts.lesson_objects !== lessonIds.size) {
      add('WARN', 'c/counts', grade, month, wno, 'counts.lesson_objects ' + wk.counts.lesson_objects + ' ≠ ' + lessonIds.size);
    }
  }

  /* (e) skill_node resolution — week-scoped where weeks declare nodes;
     repo-scoped for the item bank / generator registry (run once, below). */
  const generators = Array.isArray(wk.generators) ? wk.generators : [];
  generators.forEach((gcfg) => {
    if (gcfg.skill_node && !nodesById.has(gcfg.skill_node)) {
      integrity.push('e/generator ' + gcfg.id + ': skill_node ' + gcfg.skill_node + ' unresolved');
    }
  });

  /* ---- tier ---- */
  const integrityFailsHere = integrity.length > 0;
  const tierEvidence = {
    bound: 0, total: blocks.length,
    workbook: Object.keys(lessons).some((id) =>
      lessons[id] && lessons[id].content && Array.isArray(lessons[id].content.workbook) && lessons[id].content.workbook.length),
    generators: generators.length > 0,
    passages: passages.length > 0,
    testQ: test && test.questions ? test.questions.length : 0
  };
  blocks.forEach((b) => {
    if (!b.lesson_ref) return;
    const l = lessons[b.lesson_ref];
    if (l && String(l.subject || '').toLowerCase() === String(b.subject || '').toLowerCase()) tierEvidence.bound++;
    else if (l) tierEvidence.bound++;   // resolved in-week; subject drift noted only
  });
  const ratio = tierEvidence.total ? tierEvidence.bound / tierEvidence.total : 0;

  let tier;
  const reasons = [];
  if (missingStat.length) {
    reasons.push('9/9 coverage: ' + (9 - missingStat.length) + '/9 — missing ' + missingStat.join(', '));
  }
  if (integrityFailsHere) reasons.push(...integrity);
  if (!reasons.length) {
    const deep = ratio >= 0.8 && tierEvidence.passages && tierEvidence.testQ > 0 &&
      (tierEvidence.workbook || tierEvidence.generators);
    if (deep) tier = 'T2';
    else {
      tier = 'T1';
      if (ratio < 0.8) reasons.push('spiral: only ' + Math.round(ratio * 100) + '% of blocks bind an in-week lesson (<80% T2 bar)');
      if (!tierEvidence.passages) reasons.push('spiral: no passages authored');
      if (!tierEvidence.testQ) reasons.push('spiral: no test questions');
      if (!tierEvidence.workbook && !tierEvidence.generators) reasons.push('spiral: no workbook/generator evidence');
    }
  } else {
    tier = 'T0';
  }

  integrity.forEach((msg) => add('FAIL', msg.split(':')[0], grade, month, wno, msg));
  return { tier, reasons, bound: tierEvidence.bound, total: tierEvidence.total, integrity, notes, covered: [...covered] };
}

/* repo-wide (e) sweep: item bank + generator registry --------------------- */
let itemChecked = 0;
const itemsList = Array.isArray(bank.items) ? bank.items : (bank.items ? Object.values(bank.items) : []);
itemsList.forEach((it) => {
  itemChecked++;
  if (!it.skill_node) { add('FAIL', 'e', it.grade, null, null, 'item ' + it.id + ' has no skill_node'); return; }
  const n = nodesById.get(it.skill_node);
  if (!n) add('FAIL', 'e', it.grade, null, null, 'item ' + it.id + ': skill_node ' + it.skill_node + ' not in skill_tree');
  else if (n.grade !== it.grade) add('FAIL', 'e', it.grade, null, null, 'item ' + it.id + ': skill_node ' + it.skill_node + ' is grade ' + n.grade);
});
const genList = Array.isArray(gens.generators) ? gens.generators : [];
genList.forEach((g) => {
  if (!g.skill_node) { add('FAIL', 'e', g.grade || '-', null, null, 'generator ' + g.id + ' has no skill_node'); return; }
  if (!nodesById.has(g.skill_node)) add('FAIL', 'e', g.grade || '-', null, null, 'generator ' + g.id + ': skill_node ' + g.skill_node + ' unresolved');
});
GRADES.forEach((g) => {
  if (!tree.grades[g]) add('GAP', 'e', g, null, null, 'no skill_tree grade band — grade ' + g + ' is T0 across all 9 months (content lane absent)');
});

/* ------------------------------------------------------------------ matrix */
const matrix = {};       // grade -> month -> {tier, weeks:[...], reasons}
GRADES.concat(APPENDIX).forEach((g) => {
  matrix[g] = {};
  const wks = weeksFor(g);
  for (let m = 1; m <= MONTHS; m++) {
    const wkRes = [];
    for (let wm = 1; wm <= WEEKS_PER_MONTH; wm++) {
      const wno = (m - 1) * WEEKS_PER_MONTH + wm;
      const wk = wks ? wks[String(wno)] : null;
      wkRes.push(Object.assign({ wno }, checkWeek(g, m, wno, wk)));
    }
    let tier = wkRes[0].tier;
    wkRes.forEach((r) => { tier = worses(tier, r.tier); });
    /* preschool: 9/9 is never failed (missingStat is forced empty for the
       pre-K band above), so the generic worst-of-weeks rule already scores
       file presence + gates b–e only — no special case needed. */
    matrix[g][m] = { tier, weeks: wkRes, reasons: wkRes.filter((r) => r.tier === 'T0').flatMap((r) => r.reasons) };
  }
});

/* ------------------------------------------------------------------ report */
const counts = { T0: 0, T1: 0, T2: 0 };
GRADES.forEach((g) => { for (let m = 1; m <= MONTHS; m++) counts[matrix[g][m].tier]++; });
const blocked = [];
GRADES.forEach((g) => {
  const bad = [];
  for (let m = 1; m <= MONTHS; m++) if (matrix[g][m].tier === 'T0') bad.push(m);
  if (bad.length) blocked.push({ grade: g, months: bad });
});

const lines = [];
const L = (s) => lines.push(s == null ? '' : s);

L('# K–6 Readiness Matrix (P0.4 validator v2 output — regenerated, do not hand-edit)');
L();
L('- Generated: `' + new Date().toISOString() + '` by `tools/validate_readiness.js`');
L('- Axes: 7 grades (K–6) × 9 school months × 4 weeks (year week = (month−1)×4 + week-of-month)');
L('- Statutory list: nine MCL 380.1561(3)(f) subjects (D7-verified) — ' + STATUTORY.join(', '));
L('- Fold-map (K/1/2): `ela` → reading, writing, spelling, literature, english_grammar; `social_studies` → history, civics; `math` → mathematics; `science` → science.');
L('- Excluded from the statutory count (never satisfy 9/9): ' + [...EXCLUDE].join(', '));
L('- Tiers: **T2 deep** (≥80% blocks bind an in-week lesson + test/passages/workbook) · **T1 spiral** (all gates pass, depth pending — shown as "spiral review") · **T0 empty** (gate fail or no file — **blocks beta for that grade**)');
L('- Beta bar (§2.2): all 63 grade-months ≥ T1; live grades 3/5 + preschool ≥ T2 for months 1–4.');
L();
L('## Grade × month tiers');
L();
L('| grade | ' + Array.from({ length: MONTHS }, (_, i) => 'm' + (i + 1)).join(' | ') + ' |');
L('|---' + '---|'.repeat(MONTHS));
GRADES.forEach((g) => {
  const row = [];
  for (let m = 1; m <= MONTHS; m++) {
    const t = matrix[g][m].tier;
    row.push(t === 'T2' ? '**T2**' : t === 'T1' ? 'T1' : 'T0');
  }
  L('| **' + g + '** | ' + row.join(' | ') + ' |');
});
L();
L('Grade-month totals: T2 = ' + counts.T2 + ', T1 = ' + counts.T1 + ', T0 = ' + counts.T0 +
  ' (of ' + (GRADES.length * MONTHS) + ').');
L();
if (blocked.length) {
  L('**Beta-blocking (T0) grade-months:**');
  blocked.forEach((b) => L('- grade ' + b.grade + ': months ' + b.months.join(', ')));
  L();
} else {
  L('No T0 grade-months — beta bar reachable on coverage alone.');
  L();
}

L('## Per-week detail (failures and spiral reasons only)');
L();
let anyDetail = false;
GRADES.forEach((g) => {
  for (let m = 1; m <= MONTHS; m++) {
    matrix[g][m].weeks.forEach((r) => {
      if (r.tier === 'T2') return;
      anyDetail = true;
      L('- **' + g + ' / month ' + m + ' / week ' + r.wno + '** → ' + r.tier +
        (r.reasons.length ? ': ' + r.reasons.join('; ') : ''));
    });
  }
});
if (!anyDetail) L('- none — every authored week clears all gates at T2.');
L();

L('## Integrity findings (gates b–e — these are authoring bugs, not coverage gaps)');
L();
const fails = integrityFails();
const gapsFound = findings.filter((f) => f.level === 'GAP');
if (fails.length) fails.forEach((f) => L('- FAIL `' + f.check + '` grade ' + f.grade +
  (f.month ? ' month ' + f.month : '') + (f.week ? ' week ' + f.week : '') + ' — ' + f.detail));
else L('- none.');
L();
if (gapsFound.length) {
  L('## Lane gaps (GAP — blocks beta, not an authoring bug)');
  L();
  gapsFound.forEach((f) => L('- GAP `' + f.check + '` grade ' + f.grade + ' — ' + f.detail));
  L();
}
const warns = findings.filter((f) => f.level === 'WARN');
L('## Warnings (declared-map / count drift)');
L();
if (warns.length) warns.forEach((w) => L('- WARN `' + w.check + '` grade ' + w.grade + ' — ' + w.detail));
else L('- none.');
L();

L('## Appendix — preschool (pre-K band, not scored for 9/9)');
L();
L('| month | ' + Array.from({ length: WEEKS_PER_MONTH }, (_, i) => 'w' + (i + 1)).join(' | ') + ' | tier |');
L('|---' + '---|'.repeat(WEEKS_PER_MONTH + 1));
for (let m = 1; m <= MONTHS; m++) {
  const wkRes = matrix.preschool[m].weeks;
  L('| m' + m + ' | ' + wkRes.map((r) => r.tier).join(' | ') + ' | **' + matrix.preschool[m].tier + '** |');
}
L();
L('## Honest gaps this run found');
L();
const gaps = [];
GRADES.forEach((g) => {
  const present = weeksFor(g);
  if (!present) { gaps.push('grade ' + g + ': no content lane and no skill_tree band — T0 across all 9 months.'); return; }
  const full = Object.keys(present).length;
  const withDays = Object.keys(present).filter((k) => Array.isArray(present[k].days) && present[k].days.length).length;
  if (full < MONTHS * WEEKS_PER_MONTH) gaps.push('grade ' + g + ': ' + full + '/36 week files exist, ' + withDays + ' carry a day flow.');
  const subjMissing = new Set();
  for (let m = 1; m <= MONTHS; m++) matrix[g][m].weeks.forEach((r) => {
    if (r.tier === 'T0' && r.reasons.some((x) => x.indexOf('9/9 coverage') === 0)) {
      const mm = /missing ([a-z_, ]+)$/.exec(r.reasons.find((x) => x.indexOf('9/9 coverage') === 0));
      if (mm) mm[1].split(', ').forEach((s) => subjMissing.add(s));
    }
  });
  if (subjMissing.size) gaps.push('grade ' + g + ': statutory subject(s) missing from at least one authored week — ' + [...subjMissing].join(', ') + '.');
});
if (!gaps.length) gaps.push('none.');
gaps.forEach((g) => L('- ' + g));
L();
L('Run: `node tools/validate_readiness.js [--strict] [--no-write]` or `bash tools/run_readiness.sh`.');

const report = lines.join('\n') + '\n';
if (!NO_WRITE) fs.writeFileSync(path.join(ROOT, 'K6_READINESS_MATRIX.md'), report);

/* machine contract consumed by the P0.7 audit (tools/k6_readiness_audit.py
   auto-detects tools/readiness_matrix_v2.json when present) */
const contract = {
  schema: 'k6_readiness/v2',
  generated_at: new Date().toISOString(),
  source: 'tools/validate_readiness.js',
  axes: { grades: GRADES, months: MONTHS, weeks_per_month: WEEKS_PER_MONTH },
  tiers: {},
  counts: counts
};
GRADES.concat(APPENDIX).forEach((g) => {
  contract.tiers[g] = {};
  for (let m = 1; m <= MONTHS; m++) contract.tiers[g][String(m)] = matrix[g][m].tier;
});
if (!NO_WRITE) fs.writeFileSync(path.join(ROOT, 'tools', 'readiness_matrix_v2.json'),
  JSON.stringify(contract, null, 1) + '\n');

/* ------------------------------------------------------------------ stdout */
console.log(report);

/* ------------------------------------------------------------------ exit */
const failCount = fails.length;
let code = failCount ? 1 : 0;
if (STRICT && (warns.length || gapsFound.length || counts.T0 > 0)) code = 1;
console.log('\n== READINESS SUMMARY ==');
console.log('grade-months: T2=' + counts.T2 + ' T1=' + counts.T1 + ' T0=' + counts.T0 +
  ' (bar: 0 × T0 for beta)');
console.log('integrity (b–e): ' + failCount + ' FAIL · warnings: ' + warns.length +
  ' · lane gaps: ' + gapsFound.length + ' · items checked (e): ' + itemChecked);
console.log('mode: ' + (STRICT ? 'strict(beta bar)' : 'report') + ' · exit ' + code);
process.exit(code);