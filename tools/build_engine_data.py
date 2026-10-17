#!/usr/bin/env python3
"""Engine P1 data builder — skill_tree/v1 + item bank (item/v1 extension).

Reads ONLY /root/sprout-demo/data/content.json (canonical). No content is
invented: every item's text/options/answer is copied verbatim from an existing
weekly-test question, quiz question, lesson practice question, bank-mode
generator item, or the CAT assessment.bank. skill_nodes come from an explicit
hand-authored spec (below) shaped to the MI crosswalk codes in
/root/LNM_BRAIN/SAITTASPROUT/MI_COMPLIANCE_MAP_2026-10-16.md §3 + the
MONTH1_SCAFFOLD_1016.md module structure (modules are week-scoped).

Subjects.yaml note: subjects.yaml lives in the engine repo
(/root/sprout/config/subjects.yaml), not sprout-demo. Per P1 time-box ruling the
canonical subject list here is data/content.json's per-grade subject union
(grade meta subjects + week block subjects); the statutory nine come from
content.statutory (identical to subjects.yaml active_statutory_list, D7).

Parametric generator configs are NOT frozen into items: generator.js streams an
unbounded deterministic variant stream (date+student+genId+cursor); a build-time
snapshot would misrepresent it. They shape the skill tree (each config's skill
gets a node) and bank-mode configs (which carry authored literal items[]) are
derived verbatim.

Standards maps — K/1/2/4 extension (lane A, additive). data/standards_maps.json
holds the grade-band standards codes + one-line labels for the four new grades.
Every entry was copied from a PUBLIC standards document; sources and read dates:

  * Common Core State Standards for English Language Arts & Literacy
      https://corestandards.org/wp-content/uploads/2023/09/ELA_Standards1.pdf
      (HTML index https://www.thecorestandards.org/ELA-Literacy/)  read 2026-10-17
  * Common Core State Standards for Mathematics
      https://corestandards.org/wp-content/uploads/2023/09/Math_Standards1.pdf
      (HTML index https://www.thecorestandards.org/Math/)          read 2026-10-17
  * Next Generation Science Standards — Grades K-5 by Topic (Achieve, Sept 2017)
      https://www.nextgenscience.org/sites/default/files/K-5Topic.pdf
      (HTML index https://www.nextgenscience.org/topics)           read 2026-10-17
  * Michigan K-12 Standards for Social Studies (MDE, GLCE coding K-4)
      https://www.michigan.gov/-/media/Project/Websites/mde/Academic-Standards/Social_Studies_Standards.pdf
                                                                read 2026-10-17

The K/1/2/4 node spec below claims ONLY codes present in that map (asserted
1:1 at build time) and carries NO item text — the new grades ship a
standards-mapped tree only, until their content lane lands. Regeneration is
additive: grades preschool/3/5 and data/items.json are byte-identical to the
pre-extension build.

Output: data/skill_tree.json, data/items.json (both pretty-printed, stable key
order so diffs are reviewable).
"""
import json, os, re, sys, hashlib
from collections import defaultdict, OrderedDict

SRC = 'data/content.json'
OUT_TREE = 'data/skill_tree.json'
OUT_ITEMS = 'data/items.json'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, SRC)
OUT_TREE = os.path.join(ROOT, OUT_TREE)
OUT_ITEMS = os.path.join(ROOT, OUT_ITEMS)

with open(SRC) as f:
    C = json.load(f)

MAPS_SRC = os.path.join(ROOT, 'data/standards_maps.json')
with open(MAPS_SRC) as f:
    STD_MAPS = json.load(f)  # standards_maps/v1 — public-source codes/labels
MAP_IDS = {g: {s['id'] for subj in STD_MAPS['grades'][g].values() for s in subj}
           for g in STD_MAPS['grades']}
assert sorted(MAP_IDS) == ['1', '2', '4', 'K'], 'standards map must cover K/1/2/4 only'

STATUTORY = list(C['statutory'])  # 9 MCL 380.1561(3)(f) subjects
SUBJ_TO_STATUTORY = {
    'math': 'mathematics', 'ela': 'english_grammar', 'reading': 'reading',
    'spelling': 'spelling', 'science': 'science', 'history': 'history',
    'civics': 'civics', 'literature': 'literature', 'writing': 'writing',
    'english_grammar': 'english_grammar', 'coding': None,  # enrichment
    # K-2 band vocabulary (engine subjects, see STATUTORY_BAND): social studies
    # folds into MCL 'history' (the crosswalk's single-valued subject map);
    # motor/art/music are not among the D7 nine -> null enrichment-style slots.
    'social_studies': 'history', 'motor': None, 'art': None, 'music': None,
}
CAT_DOMAIN = {  # content subject -> CAT domain (content.assessment.domains = [math, ela])
    'math': 'math', 'reading': 'ela', 'spelling': 'ela', 'writing': 'ela',
    'english_grammar': 'ela', 'literature': 'ela', 'ela': 'ela',
    'science': None, 'history': None, 'civics': None, 'coding': None,
    'social_studies': None, 'motor': None, 'art': None, 'music': None,
}

# --------------------------- K/1/2/4 extension ------------------------------
# Grades with no data/content.json weeks yet: their tree is standards-mapped
# (data/standards_maps.json) and ships WITHOUT items until a content lane lands.
NEW_GRADES = ['K', '1', '2', '4']
GRADE_LABELS = {'K': 'Kindergarten', '1': 'Grade 1', '2': 'Grade 2', '4': 'Grade 4'}
# Per-grade statutory band (MI compliance). K-2 use the early-grade engine band;
# grade 4 carries the full MCL nine expressed in engine subject vocabulary
# (mathematics -> math), which is exactly grade_subjects['4'].
STATUTORY_BAND = {
    'K': ['ela', 'math', 'science', 'social_studies', 'motor', 'art', 'music'],
    '1': ['ela', 'math', 'science', 'social_studies', 'motor', 'art', 'music'],
    '2': ['ela', 'math', 'science', 'social_studies', 'motor', 'art', 'music'],
    '4': ['math', 'reading', 'writing', 'english_grammar', 'spelling',
          'literature', 'science', 'history', 'civics'],
}
assert all(g in STATUTORY_BAND for g in NEW_GRADES)
assert len(STATUTORY_BAND['4']) == 9, 'grade 4 must carry the full nine-band'
assert all(s in SUBJ_TO_STATUTORY for g in NEW_GRADES for s in STATUTORY_BAND[g]), \
    'every band subject must map to an MCL name or null'
NEW_GRADE_SUBJECTS = {g: sorted(set(STATUTORY_BAND[g])) for g in NEW_GRADES}
# The band is the ONLY subject source for a new grade (no content.json weeks).
for g in NEW_GRADES:
    assert g not in C['weeks'], 'grade %s already has content weeks' % g

def grade_subjects(g):
    """Union of grade-meta subjects and week block subjects (canonical list)."""
    s = set(C['grades'][g]['subjects'])
    for wv in C['weeks'][g].values():
        for d in wv.get('days', []) or []:
            for b in d.get('blocks', []):
                if b.get('subject'):
                    s.add(b['subject'])
    return sorted(s)

GRADE_SUBJECTS = {g: grade_subjects(g) for g in C['weeks']}
# New grades derive their subject list from the statutory band (no content yet).
GRADE_SUBJECTS.update(NEW_GRADE_SUBJECTS)

# ---------------------------------------------------------------------------
# Skill tree spec. Node tuple: (id, grade, subject, kind, label, parent,
# prereqs, standards, unit_wk, priority). standards = MI codes claimed ([] for
# codeless nodes — we claim a standard only when the skill clearly matches the
# crosswalk text; otherwise parent to the subject strand with no code).
# ---------------------------------------------------------------------------
def N(id, grade, subject, kind, label, parent, prereqs=(), standards=(), unit_wk=None, priority=1):
    return dict(id=id, grade=grade, subject=subject, kind=kind, label=label,
                parent=parent, prereqs=list(prereqs), standards=list(standards),
                unit_wk=unit_wk, priority=priority)

def S(id, grade, subject, label, parent):  # strand (subject root)
    return N(id, grade, subject, 'strand', label, parent)

def STD(id, grade, subject, label, parent, prereqs=(), unit_wk=None):  # MI standard
    return N(id, grade, subject, 'standard', label, parent, prereqs, standards=(id,), unit_wk=unit_wk)

def SK(id, grade, subject, label, parent, prereqs=(), standards=(), unit_wk=None, priority=1):
    return N(id, grade, subject, 'skill', label, parent, prereqs, standards, unit_wk, priority)

NODES = []
# ------------------------------- grade 3 ------------------------------------
NODES += [
    S('3.MATH', '3', 'math', 'Mathematics (MCL: mathematics)', None),
    STD('3.OA.1', '3', 'math', 'Interpret products of whole numbers (equal groups, arrays)', '3.MATH', (), 1),
    STD('3.OA.3', '3', 'math', 'Use multiplication and division within 100 in word problems', '3.MATH', ['3.OA.1'], 2),
    STD('3.OA.4', '3', 'math', 'Determine the unknown whole number in an equation', '3.MATH', ['3.OA.1'], 2),
    STD('3.OA.5', '3', 'math', 'Apply properties of operations as strategies', '3.MATH', ['3.OA.1'], 3),
    STD('3.OA.7', '3', 'math', 'Fluently multiply and divide within 100', '3.MATH', ['3.OA.1'], 4),
    STD('3.NBT.1', '3', 'math', 'Round to nearest 10 and 100; place value of 3-digit numbers', '3.MATH', (), 1),
    STD('3.NBT.2', '3', 'math', 'Add and subtract within 1000', '3.MATH', ['3.NBT.1'], 2),
    SK('3.OA.1.equal-groups-arrays', '3', 'math', 'Equal groups & arrays (multiplication meaning)', '3.OA.1', (), ('3.OA.1',), 1),
    SK('3.OA.3.word-problems', '3', 'math', 'Multiplication & division word problems', '3.OA.3', ['3.OA.1.equal-groups-arrays'], ('3.OA.3',), 2),
    SK('3.OA.7.multiplication-facts', '3', 'math', 'Multiplication facts 0-5 & skip-counting', '3.OA.7', ['3.OA.1.equal-groups-arrays'], ('3.OA.7',), 4),
    SK('3.NBT.1.place-value-rounding', '3', 'math', '3-4 digit place value, read/write, rounding', '3.NBT.1', (), ('3.NBT.1',), 1),
    SK('3.NBT.2.add-subtract', '3', 'math', 'Multi-digit addition (regrouping), subtraction, estimation', '3.NBT.2', ['3.NBT.1.place-value-rounding'], ('3.NBT.2',), 2),
    SK('3.MATH.fractions', '3', 'math', 'Fractions (CAT bank practice)', '3.MATH', (), (), None, 2),
    SK('3.MATH.area-perimeter', '3', 'math', 'Area & perimeter (CAT bank practice)', '3.MATH', (), (), None, 2),
    SK('3.MATH.division-facts', '3', 'math', 'Division facts (CAT bank practice)', '3.MATH', ['3.OA.7.multiplication-facts'], (), None, 2),
    SK('3.MATH.elapsed-time', '3', 'math', 'Elapsed time (CAT bank practice)', '3.MATH', (), (), None, 2),
    SK('3.MATH.money-change', '3', 'math', 'Money & making change (CAT bank practice)', '3.MATH', ['3.NBT.2.add-subtract'], (), None, 2),
    S('3.READ', '3', 'reading', 'Reading (MCL: reading)', None),
    STD('3.RI.3.1', '3', 'reading', 'Ask/answer questions referring explicitly to the text', '3.READ', (), 1),
    STD('3.RI.3.2', '3', 'reading', 'Determine main idea and supporting details', '3.READ', ['3.RI.3.1'], 1),
    STD('3.RL.3.1', '3', 'reading', 'Refer to story details in answering questions', '3.READ', (), 1),
    STD('3.RL.3.3', '3', 'reading', 'Describe character traits, motivations, sequence of events', '3.READ', ['3.RL.3.1'], 1),
    STD('3.RF.3.3', '3', 'reading', 'Grade-level phonics and multisyllable decoding', '3.READ', (), 3),
    STD('3.RF.3.4', '3', 'reading', 'Read prose and poetry with accuracy, expression', '3.READ', ['3.RF.3.3'], 3),
    SK('3.RI.3.1.comprehension-evidence', '3', 'reading', 'Comprehension with text evidence (incl. cloze)', '3.RI.3.1', (), ('3.RI.3.1', '3.RI.3.2'), 1),
    SK('3.RL.3.1.literary-questions', '3', 'reading', 'Answering questions about story details', '3.RL.3.1', (), ('3.RL.3.1',), 1),
    SK('3.RF.3.3.decoding-syllables', '3', 'reading', 'Decoding & syllable awareness', '3.RF.3.3', (), ('3.RF.3.3',), 3),
    SK('3.READ.passages', '3', 'reading', 'Grade-3 reading passages (practice)', '3.READ', ['3.RI.3.1.comprehension-evidence'], (), None, 2),
    S('3.LIT', '3', 'literature', 'Literature (MCL: literature)', None),
    STD('3.RL.3.3.lit', '3', 'literature', 'Character traits and event sequence in literature', '3.LIT', (), 1),
    SK('3.LIT.practice', '3', 'literature', 'Literature read-aloud & discussion (practice)', '3.LIT', ['3.RL.3.3.lit'], (), None, 2),
    S('3.WRIT', '3', 'writing', 'Writing (MCL: writing)', None),
    STD('3.W.3.1', '3', 'writing', 'Opinion piece: reasons, linking words, conclusion', '3.WRIT', (), 2),
    STD('3.W.3.2', '3', 'writing', 'Informative/explanatory piece', '3.WRIT', (), 2),
    SK('3.W.3.2.informative-sentences', '3', 'writing', 'Sentence order & detail in informative writing', '3.W.3.2', ['3.L.3.1.sentences'], ('3.W.3.2',), 2),
    SK('3.WRIT.practice', '3', 'writing', 'Writing practice (practice)', '3.WRIT', ['3.W.3.1', '3.W.3.2'], (), None, 2),
    S('3.GRAM', '3', 'english_grammar', 'English grammar (MCL: English grammar)', None),
    STD('3.L.3.1', '3', 'english_grammar', 'Complete sentences, fragments, sentence structure', '3.GRAM', (), 1),
    STD('3.L.3.2', '3', 'english_grammar', 'Punctuation and capitalization', '3.GRAM', ['3.L.3.1'], 1),
    SK('3.L.3.1.sentences', '3', 'english_grammar', 'Sentence structure, plurals, subject-verb agreement', '3.L.3.1', (), ('3.L.3.1',), 1),
    SK('3.L.3.2.punctuation-capitalization', '3', 'english_grammar', 'End punctuation & capitalization', '3.L.3.2', ['3.L.3.1.sentences'], ('3.L.3.2',), 1),
    SK('3.GRAM.synonyms', '3', 'english_grammar', 'Synonyms & word choice (CAT bank practice)', '3.GRAM', (), (), None, 2),
    SK('3.GRAM.practice', '3', 'english_grammar', 'Grammar practice (practice)', '3.GRAM', ['3.L.3.1.sentences'], (), None, 2),
    S('3.SPELL', '3', 'spelling', 'Spelling (MCL: spelling)', None),
    STD('3.L.3.2.e', '3', 'spelling', 'Grade-appropriate spelling in own writing', '3.SPELL', ['3.RF.3.3'], 3),
    SK('3.L.3.2.e.spelling', '3', 'spelling', 'Spelling lists & closed syllables', '3.L.3.2.e', ['3.RF.3.3.decoding-syllables'], ('3.L.3.2.e',), 3),
    S('3.SCI', '3', 'science', 'Science (MCL: science)', None),
    STD('3-PS2-1', '3', 'science', 'Plan/investigate balanced and unbalanced forces', '3.SCI', (), 2),
    STD('3-PS2-2', '3', 'science', 'Support a claim about motion patterns', '3.SCI', ['3-PS2-1'], 2),
    STD('3-ESS2-1', '3', 'science', 'Use weather data to describe the season', '3.SCI', (), 2),
    STD('3-5-ETS1-1', '3', 'science', 'Define a simple design problem and criteria for success', '3.SCI', (), 4),
    SK('3.SCI.living-nonliving', '3', 'science', 'Living and non-living things', '3.SCI', (), (), None, 2),
    SK('3.SCI.forces-motion', '3', 'science', 'Forces & motion (practice)', '3-PS2-1', ['3.SCI.living-nonliving'], ('3-PS2-1', '3-PS2-2'), 2),
    SK('3.SCI.weather', '3', 'science', 'Weather & seasons (practice)', '3-ESS2-1', (), ('3-ESS2-1',), 2),
    SK('3.SCI.practice', '3', 'science', 'Science practice (practice)', '3.SCI', (), (), None, 2),
    S('3.HIST', '3', 'history', 'History (MCL: history)', None),
    STD('H3.0.1', '3', 'history', "What historians ask (historian's questions)", '3.HIST', (), 1),
    STD('H3.0.3', '3', 'history', 'Primary vs secondary sources', '3.HIST', ['H3.0.1'], 1),
    STD('H3.0.4', '3', 'history', 'Causal relationships', '3.HIST', ['H3.0.3'], 3),
    STD('H3.0.10', '3', 'history', 'Early-Michigan timeline', '3.HIST', ['H3.0.1'], 4),
    SK('3.HIST.community-helpers', '3', 'history', 'Community helpers: order & timeline, recall', '3.HIST', (), (), None, 2),
    SK('3.HIST.practice', '3', 'history', 'History practice (practice)', '3.HIST', (), (), None, 2),
    S('3.CIV', '3', 'civics', 'Civics (MCL: civics)', None),
    STD('C1.0.1', '3', 'civics', 'What Michigan government does', '3.CIV', (), 1),
    STD('C2.0.1', '3', 'civics', 'Representative government', '3.CIV', ['C1.0.1'], 1),
    SK('3.CIV.symbols', '3', 'civics', 'Symbols of our country', 'C1.0.1', (), (), None, 2),
    SK('3.CIV.practice', '3', 'civics', 'Civics practice (practice)', '3.CIV', ['C1.0.1', 'C2.0.1'], (), None, 2),
    S('3.CODE', '3', 'coding', 'Coding (enrichment, not statutory)', None),
    SK('3.CODE.block-coding', '3', 'coding', 'Block coding: predict order & debug', '3.CODE', (), (), None, 2),
    SK('3.CODE.practice', '3', 'coding', 'Coding practice (practice)', '3.CODE', (), (), None, 2),
]
# ------------------------------- grade 5 ------------------------------------
NODES += [
    S('5.MATH', '5', 'math', 'Mathematics (MCL: mathematics)', None),
    STD('5.OA.1', '5', 'math', 'Use parentheses in numerical expressions', '5.MATH', (), 1),
    STD('5.OA.2', '5', 'math', 'Write and interpret simple expressions', '5.MATH', ['5.OA.1'], 3),
    STD('5.NBT.1', '5', 'math', 'Place value: tenths/hundredths as 10x', '5.MATH', (), 1),
    STD('5.NBT.3', '5', 'math', 'Read, write, compare decimals to thousandths', '5.MATH', ['5.NBT.1'], 2),
    STD('5.NBT.4', '5', 'math', 'Round decimals to any place', '5.MATH', ['5.NBT.1'], 2),
    STD('5.NBT.5', '5', 'math', 'Fluently multiply multi-digit whole numbers', '5.MATH', ['5.NBT.1'], 3),
    STD('5.NBT.6', '5', 'math', 'Find whole-number quotients', '5.MATH', ['5.NBT.5'], 4),
    STD('5.NBT.7', '5', 'math', 'Add, subtract, multiply, divide decimals to hundredths', '5.MATH', ['5.NBT.3'], 4),
    SK('5.OA.1.expressions', '5', 'math', 'Expressions with parentheses', '5.OA.1', (), ('5.OA.1',), 1),
    SK('5.OA.2.variables', '5', 'math', 'Variables & writing expressions', '5.OA.2', ['5.OA.1.expressions'], ('5.OA.2',), 3),
    SK('5.OA.1.solving-equations', '5', 'math', 'Solve for the unknown (equations)', '5.OA.1', ['5.OA.2.variables'], ('5.OA.1',), 3),
    SK('5.NBT.1.place-value', '5', 'math', 'Decimal place value & rounding', '5.NBT.1', (), ('5.NBT.1', '5.NBT.4'), 1),
    SK('5.NBT.3.decimals', '5', 'math', 'Read/write/compare decimals', '5.NBT.3', ['5.NBT.1.place-value'], ('5.NBT.3',), 2),
    SK('5.NBT.5.multiplication', '5', 'math', 'Multi-digit multiplication fluency', '5.NBT.5', ['5.NBT.1.place-value'], ('5.NBT.5',), 3),
    SK('5.MATH.fractions', '5', 'math', 'Fractions: numerator/denominator, equivalent, mixed review', '5.MATH', (), (), None, 2),
    SK('5.MATH.fractions-operations', '5', 'math', 'Fraction operations & compare', '5.MATH', ['5.MATH.fractions'], (), None, 3),
    SK('5.MATH.area-perimeter-volume', '5', 'math', 'Area, perimeter & volume', '5.MATH', (), (), None, 2),
    SK('5.MATH.add-subtract', '5', 'math', 'Multi-digit addition & subtraction (CAT bank practice)', '5.MATH', ['5.NBT.1.place-value'], (), None, 2),
    SK('5.MATH.division-facts', '5', 'math', 'Division facts (CAT bank practice)', '5.MATH', ['5.NBT.5.multiplication'], (), None, 2),
    SK('5.MATH.elapsed-time', '5', 'math', 'Elapsed time (CAT bank practice)', '5.MATH', (), (), None, 2),
    SK('5.MATH.money-change', '5', 'math', 'Money & making change (CAT bank practice)', '5.MATH', ['5.NBT.3.decimals'], (), None, 2),
    S('5.READ', '5', 'reading', 'Reading (MCL: reading)', None),
    STD('5.RI.5.1', '5', 'reading', 'Quote explicit text to answer questions', '5.READ', (), 1),
    STD('5.RI.5.2', '5', 'reading', 'Main ideas and supporting details', '5.READ', ['5.RI.5.1'], 1),
    STD('5.RF.5.fluency', '5', 'reading', 'Fluency/accuracy routine and self-correcting rereads', '5.READ', (), 1),
    SK('5.RI.5.1.comprehension-evidence', '5', 'reading', 'Comprehension with text evidence (incl. cloze)', '5.RI.5.1', (), ('5.RI.5.1', '5.RI.5.2'), 1),
    SK('5.READ.passages', '5', 'reading', 'Grade-5 reading passages (practice)', '5.READ', ['5.RI.5.1.comprehension-evidence'], (), None, 2),
    SK('5.READ.syllables', '5', 'reading', 'Syllable count (CAT bank practice)', '5.RF.5.fluency', (), (), None, 2),
    S('5.LIT', '5', 'literature', 'Literature (MCL: literature)', None),
    STD('5.RL.5.1', '5', 'literature', 'Theme and supporting evidence', '5.LIT', (), 1),
    STD('5.RL.5.3', '5', 'literature', 'Character traits and chapter structure', '5.LIT', ['5.RL.5.1'], 1),
    SK('5.LIT.practice', '5', 'literature', 'Literature read-aloud & discussion (practice)', '5.LIT', ['5.RL.5.1', '5.RL.5.3'], (), None, 2),
    S('5.WRIT', '5', 'writing', 'Writing (MCL: writing)', None),
    STD('5.W.5.1', '5', 'writing', 'Opinion piece: state opinion, group reasons, conclude', '5.WRIT', (), 2),
    SK('5.W.5.1.opinion', '5', 'writing', 'Opinion writing with linking words', '5.W.5.1', ('5.L.5.1.sentences',), ('5.W.5.1',), 2),
    SK('5.WRIT.practice', '5', 'writing', 'Writing practice (practice)', '5.WRIT', ['5.W.5.1'], (), None, 2),
    S('5.GRAM', '5', 'english_grammar', 'English grammar (MCL: English grammar)', None),
    STD('5.L.5.1', '5', 'english_grammar', 'Verb tenses', '5.GRAM', (), 1),
    STD('5.L.5.2', '5', 'english_grammar', 'Comma and punctuation control', '5.GRAM', ['5.L.5.1'], 1),
    STD('5.L.5.2.b', '5', 'english_grammar', 'Spelling patterns incl. irregular high-frequency words', '5.GRAM', ['5.L.5.2'], 3),
    STD('5.L.5.4', '5', 'english_grammar', 'Vocabulary and figurative language', '5.GRAM', (), 3),
    SK('5.L.5.1.sentences', '5', 'english_grammar', 'Verb tenses & sentence structure', '5.L.5.1', (), ('5.L.5.1',), 1),
    SK('5.L.5.2.punctuation', '5', 'english_grammar', 'Punctuation & capitalization', '5.L.5.2', ['5.L.5.1.sentences'], ('5.L.5.2',), 1),
    SK('5.L.5.4.synonyms', '5', 'english_grammar', 'Synonyms & vocabulary (CAT bank practice)', '5.L.5.4', (), ('5.L.5.4',), 3),
    SK('5.GRAM.practice', '5', 'english_grammar', 'Grammar practice (practice)', '5.GRAM', ['5.L.5.1.sentences'], (), None, 2),
    S('5.SPELL', '5', 'spelling', 'Spelling (MCL: spelling)', None),
    STD('5.L.5.2.b.sp', '5', 'spelling', 'Spelling patterns (-tion/-sion) in own writing', '5.SPELL', ['5.L.5.2'], 3),
    SK('5.L.5.2.b.spelling-patterns', '5', 'spelling', '-tion / -sion spelling patterns', '5.L.5.2.b.sp', ['5.L.5.2.punctuation'], ('5.L.5.2.b',), 3),
    S('5.SCI', '5', 'science', 'Science (MCL: science)', None),
    STD('5-PS1-1', '5', 'science', 'Matter is made of particles; models of matter', '5.SCI', (), 1),
    STD('5-PS1-2', '5', 'science', 'Measure and record amount of matter; weight conserved', '5.SCI', ['5-PS1-1'], 2),
    STD('5-PS1-3', '5', 'science', 'Identify materials by properties', '5.SCI', ['5-PS1-1'], 3),
    STD('5-PS1-4', '5', 'science', 'Mixtures and substances', '5.SCI', ['5-PS1-3'], 4),
    SK('5-PS1-1.particle-model', '5', 'science', 'Particle model of matter & conservation', '5-PS1-1', (), ('5-PS1-1', '5-PS1-2'), 1),
    SK('5.SCI.properties', '5', 'science', 'Properties of matter (practice)', '5-PS1-3', ['5-PS1-1.particle-model'], ('5-PS1-3',), 3),
    SK('5.SCI.scientific-method', '5', 'science', 'Scientific method: observation & data', '5.SCI', (), (), None, 2),
    SK('5.SCI.practice', '5', 'science', 'Science practice (practice)', '5.SCI', (), (), None, 2),
    S('5.HIST', '5', 'history', 'History (MCL: history)', None),
    STD('U1.1.1', '5', 'history', 'Indigenous peoples of the Eastern Woodlands', '5.HIST', (), 1),
    STD('U1.4', '5', 'history', 'Three-world interactions (Europe, Africa, Americas)', '5.HIST', ['U1.1.1'], 4),
    SK('5.HIST.indigenous-peoples', '5', 'history', 'Indigenous peoples maps & routines', 'U1.1.1', (), ('U1.1.1',), 1),
    SK('5.HIST.ancient-civilizations', '5', 'history', 'Ancient civilizations (practice)', '5.HIST', (), (), None, 2),
    SK('5.HIST.map-skills', '5', 'history', 'Map skills: equator, hemispheres, continents', '5.HIST', (), (), None, 2),
    SK('5.HIST.practice', '5', 'history', 'History practice (practice)', '5.HIST', (), (), None, 2),
    S('5.CIV', '5', 'civics', 'Civics (MCL: civics)', None),
    STD('C1', '5', 'civics', 'Purposes of government (light touch, weekly)', '5.CIV', (), 1),
    SK('5.CIV.practice', '5', 'civics', 'Civics practice (practice)', '5.CIV', ['C1'], (), None, 2),
    S('5.CODE', '5', 'coding', 'Coding (enrichment, not statutory)', None),
    SK('5.CODE.python', '5', 'coding', 'Python syntax: print, variables, indentation', '5.CODE', (), (), None, 2),
    SK('5.CODE.practice', '5', 'coding', 'Coding practice (practice)', '5.CODE', (), (), None, 2),
]
# --------------------------- preschool (lite) -------------------------------
# No MI crosswalk codes for preschool (crosswalk covers Max g3 / Adonis g5 only):
# all preschool nodes are codeless skills under subject strands.
NODES += [
    S('P.READ', 'preschool', 'reading', 'Reading (preschool, MCL: reading)', None),
    SK('P.READ.letters', 'preschool', 'reading', 'Letter names A-Z', 'P.READ', (), (), None, 1),
    SK('P.READ.sounds', 'preschool', 'reading', 'First letter sounds', 'P.READ', ['P.READ.letters'], (), None, 1),
    SK('P.READ.practice', 'preschool', 'reading', 'Read-aloud & picture books (practice)', 'P.READ', ['P.READ.sounds'], (), None, 2),
    S('P.MATH', 'preschool', 'math', 'Mathematics (preschool, MCL: mathematics)', None),
    SK('P.MATH.counting-1-10', 'preschool', 'math', 'Counting 1-10', 'P.MATH', (), (), None, 1),
    SK('P.MATH.counting-11-20', 'preschool', 'math', 'Counting 11-20', 'P.MATH', ['P.MATH.counting-1-10'], (), None, 1),
    SK('P.MATH.more-or-less', 'preschool', 'math', 'More or less (compare groups)', 'P.MATH', ['P.MATH.counting-1-10'], (), None, 2),
    SK('P.MATH.counting-with-toys', 'preschool', 'math', 'Counting with toys (add one more)', 'P.MATH', ['P.MATH.counting-1-10'], (), None, 2),
    SK('P.MATH.color-sorting', 'preschool', 'math', 'Sorting by color and size', 'P.MATH', (), (), None, 2),
    SK('P.MATH.shapes', 'preschool', 'math', 'Shapes (circle, triangle, square)', 'P.MATH', (), (), None, 2),
    SK('P.MATH.fine-motor', 'preschool', 'math', 'Fine-motor counting (beads, stickers)', 'P.MATH', ['P.MATH.counting-1-10'], (), None, 2),
    SK('P.MATH.practice', 'preschool', 'math', 'Math play practice (practice)', 'P.MATH', (), (), None, 2),
    S('P.WRIT', 'preschool', 'writing', 'Writing (preschool, MCL: writing)', None),
    SK('P.WRIT.practice', 'preschool', 'writing', 'Pre-writing: lines, playdough, stickers', 'P.WRIT', (), (), None, 2),
    S('P.LIT', 'preschool', 'literature', 'Literature (preschool, MCL: literature)', None),
    SK('P.LIT.read-aloud', 'preschool', 'literature', 'Picture-book read-aloud & retell', 'P.LIT', (), (), None, 2),
    S('P.SCI', 'preschool', 'science', 'Science (preschool, MCL: science)', None),
    SK('P.SCI.play', 'preschool', 'science', 'Outdoor & sensory discovery', 'P.SCI', (), (), None, 2),
]

# ------------------------------- grade K ------------------------------------
# Kindergarten tree: standards-mapped only (no shipped content — the content
# lane lands later; validate_engine.js prints the content-gap NOTEs). Every
# standard id below is asserted against data/standards_maps.json 'grades.K'.
NODES += [
    S('K.ELA', 'K', 'ela', 'English language arts (K-2 band; MCL: english_grammar)', None),
    STD('RF.K.1', 'K', 'ela', 'Print concepts: organization and basic features of print', 'K.ELA'),
    STD('RF.K.2', 'K', 'ela', 'Phonological awareness: words, syllables, and sounds (phonemes)', 'K.ELA', ('RF.K.1',)),
    STD('RF.K.3', 'K', 'ela', 'Grade-level phonics and word analysis skills in decoding words', 'K.ELA', ('RF.K.2',)),
    STD('RF.K.4', 'K', 'ela', 'Read emergent-reader texts with purpose and understanding', 'K.ELA', ('RF.K.3',)),
    STD('RL.K.1', 'K', 'ela', 'Ask and answer questions about key details in a text', 'K.ELA'),
    STD('RI.K.2', 'K', 'ela', 'Identify the main topic and retell key details of a text', 'K.ELA', ('RL.K.1',)),
    STD('W.K.1', 'K', 'ela', 'Compose opinion pieces by drawing, dictating, and writing', 'K.ELA'),
    STD('L.K.1', 'K', 'ela', 'Conventions of standard English grammar and usage', 'K.ELA'),
    STD('L.K.2', 'K', 'ela', 'Conventions of standard English capitalization, punctuation, and spelling', 'K.ELA', ('L.K.1',)),
    SK('K.ELA.letter-names', 'K', 'ela', 'Letter names A-Z and left-to-right print direction', 'K.ELA', (), ('RF.K.1',), None, 1),
    SK('K.ELA.letter-sounds', 'K', 'ela', 'First letter sounds and rhyming words', 'K.ELA', ('K.ELA.letter-names',), ('RF.K.2',), None, 1),
    SK('K.ELA.sight-words', 'K', 'ela', 'Sight words and CVC decoding', 'K.ELA', ('K.ELA.letter-sounds',), ('RF.K.3', 'RF.K.4'), None, 1),
    SK('K.ELA.story-questions', 'K', 'ela', 'Answering who/what questions about a read-aloud', 'K.ELA', (), ('RL.K.1', 'RI.K.2'), None, 1),
    S('K.MATH', 'K', 'math', 'Mathematics (K-2 band; MCL: mathematics)', None),
    STD('K.CC.1', 'K', 'math', 'Count to 100 by ones and by tens', 'K.MATH'),
    STD('K.CC.4', 'K', 'math', 'Connect counting to cardinality (numbers and quantities)', 'K.MATH', ('K.CC.1',)),
    STD('K.CC.5', 'K', 'math', 'Count to answer how-many questions about up to 20 things', 'K.MATH', ('K.CC.4',)),
    STD('K.OA.1', 'K', 'math', 'Represent addition and subtraction with objects, drawings, and equations', 'K.MATH', ('K.CC.4',)),
    STD('K.OA.2', 'K', 'math', 'Add and subtract within 10 in word problems', 'K.MATH', ('K.OA.1',)),
    STD('K.OA.5', 'K', 'math', 'Fluently add and subtract within 5', 'K.MATH', ('K.OA.1',)),
    STD('K.NBT.1', 'K', 'math', 'Compose and decompose numbers 11-19 into ten ones and some further ones', 'K.MATH', ('K.CC.4',)),
    STD('K.MD.2', 'K', 'math', 'Directly compare two objects with a measurable attribute in common', 'K.MATH'),
    STD('K.MD.3', 'K', 'math', 'Classify objects into categories and count them', 'K.MATH', ('K.CC.5',)),
    STD('K.G.1', 'K', 'math', 'Describe objects using shape names and relative positions', 'K.MATH'),
    STD('K.G.2', 'K', 'math', 'Correctly name shapes regardless of orientation or size', 'K.MATH', ('K.G.1',)),
    SK('K.MATH.count-to-100', 'K', 'math', 'Counting to 100 by ones and tens', 'K.MATH', (), ('K.CC.1',), None, 1),
    SK('K.MATH.count-tell-how-many', 'K', 'math', 'Counting out objects and answering how many', 'K.MATH', ('K.MATH.count-to-100',), ('K.CC.5',), None, 1),
    SK('K.MATH.add-subtract-5', 'K', 'math', 'Addition and subtraction facts within 5', 'K.MATH', ('K.MATH.count-tell-how-many',), ('K.OA.1', 'K.OA.5'), None, 1),
    SK('K.MATH.shapes-position', 'K', 'math', 'Shapes and positional words', 'K.MATH', (), ('K.G.1', 'K.G.2'), None, 1),
    SK('K.MATH.compare-measure', 'K', 'math', 'Comparing more/less and measuring attributes', 'K.MATH', (), ('K.MD.2', 'K.MD.3'), None, 1),
    S('K.SCI', 'K', 'science', 'Science (K-2 band; MCL: science)', None),
    STD('K-PS2-1', 'K', 'science', 'Investigate the effects of different strengths or directions of pushes and pulls', 'K.SCI'),
    STD('K-PS3-1', 'K', 'science', "Observe the effect of sunlight on Earth's surface", 'K.SCI'),
    STD('K-LS1-1', 'K', 'science', 'Describe patterns of what plants, animals, and humans need to survive', 'K.SCI'),
    STD('K-ESS2-1', 'K', 'science', 'Describe local weather patterns over time', 'K.SCI'),
    STD('K-ESS3-1', 'K', 'science', 'Model how the needs of plants and animals connect to the places they live', 'K.SCI', ('K-LS1-1',)),
    STD('K-2-ETS1-1', 'K', 'science', 'Ask questions and gather information to define a simple problem', 'K.SCI'),
    SK('K.SCI.weather-patterns', 'K', 'science', 'Weather watching and simple recording (practice)', 'K.SCI', (), ('K-ESS2-1',), None, 2),
    SK('K.SCI.needs-of-living', 'K', 'science', 'What living things need: food, water, light', 'K.SCI', (), ('K-LS1-1', 'K-ESS3-1'), None, 1),
    S('K.SS', 'K', 'social_studies', 'Social studies (K-2 band; MCL: history/civics)', None),
    STD('K.H2.0.1', 'K', 'social_studies', 'Distinguish among the past, present, and future', 'K.SS'),
    STD('K.H2.0.2', 'K', 'social_studies', 'Create a timeline using events from their own lives', 'K.SS', ('K.H2.0.1',)),
    STD('K.G1.0.1', 'K', 'social_studies', 'Recognize that maps and globes represent places', 'K.SS'),
    STD('K.G1.0.2', 'K', 'social_studies', 'Use directions or positional words to locate places in the classroom', 'K.SS', ('K.G1.0.1',)),
    STD('K.C1.0.1', 'K', 'social_studies', 'Identify and explain reasons for rules at home and in school', 'K.SS'),
    STD('K.C2.0.1', 'K', 'social_studies', 'Identify the American flag as an important symbol of the United States', 'K.SS', ('K.C1.0.1',)),
    STD('K.E1.0.2', 'K', 'social_studies', 'Distinguish between goods and services', 'K.SS'),
    SK('K.SS.my-day-timeline', 'K', 'social_studies', 'Timeline of my day: past, present, future', 'K.SS', (), ('K.H2.0.1', 'K.H2.0.2'), None, 1),
    SK('K.SS.classroom-rules', 'K', 'social_studies', 'Why we have rules and fair ways to decide', 'K.SS', (), ('K.C1.0.1',), None, 1),
    S('K.MOTOR', 'K', 'motor', 'Motor development (K-2 band; not in the MCL nine)', None),
    SK('K.MOTOR.gross-motor', 'K', 'motor', 'Gross motor: balance, hopping, throwing, catching', 'K.MOTOR', (), (), None, 2),
    SK('K.MOTOR.fine-motor', 'K', 'motor', 'Fine motor: cutting, drawing lines, buttoning', 'K.MOTOR', (), (), None, 2),
    S('K.ART', 'K', 'art', 'Art (K-2 band; not in the MCL nine)', None),
    SK('K.ART.color-shape', 'K', 'art', 'Colors and shapes in art-making', 'K.ART', (), (), None, 2),
    SK('K.ART.collage', 'K', 'art', 'Drawing, tearing, and collage (fine-motor practice)', 'K.ART', ('K.MOTOR.fine-motor',), (), None, 2),
    S('K.MUSIC', 'K', 'music', 'Music (K-2 band; not in the MCL nine)', None),
    SK('K.MUSIC.clap-rhythm', 'K', 'music', 'Clapping and singing simple rhythms', 'K.MUSIC', (), (), None, 2),
    SK('K.MUSIC.listen-move', 'K', 'music', 'Listening and moving to music', 'K.MUSIC', ('K.MUSIC.clap-rhythm',), (), None, 2),
]
# ------------------------------- grade 1 ------------------------------------
NODES += [
    S('1.ELA', '1', 'ela', 'English language arts (K-2 band; MCL: english_grammar)', None),
    STD('RF.1.1', '1', 'ela', 'Print concepts: distinguishing features of a sentence', '1.ELA'),
    STD('RF.1.2', '1', 'ela', 'Phonological awareness: long and short vowels, blending, segmenting', '1.ELA', ('RF.1.1',)),
    STD('RF.1.3', '1', 'ela', 'Grade-level phonics and word analysis skills in decoding words', '1.ELA', ('RF.1.2',)),
    STD('RF.1.4', '1', 'ela', 'Read with sufficient accuracy and fluency to support comprehension', '1.ELA', ('RF.1.3',)),
    STD('RL.1.1', '1', 'ela', 'Ask and answer questions about key details in a text', '1.ELA'),
    STD('RL.1.2', '1', 'ela', 'Retell stories with key details and the central message or lesson', '1.ELA', ('RL.1.1',)),
    STD('RI.1.2', '1', 'ela', 'Identify the main topic and retell key details of a text', '1.ELA', ('RL.1.1',)),
    STD('W.1.1', '1', 'ela', 'Write opinion pieces with a topic, opinion, reason, and closure', '1.ELA'),
    STD('W.1.3', '1', 'ela', 'Write narratives with sequenced events and temporal words', '1.ELA', ('W.1.1',)),
    STD('L.1.1', '1', 'ela', 'Conventions of standard English grammar and usage', '1.ELA'),
    STD('L.1.2', '1', 'ela', 'Conventions of standard English capitalization, punctuation, and spelling', '1.ELA', ('L.1.1',)),
    SK('1.ELA.decoding-digraphs', '1', 'ela', 'Consonant digraphs and one-syllable decoding', '1.ELA', (), ('RF.1.3',), None, 1),
    SK('1.ELA.fluency-reread', '1', 'ela', 'Fluent reading with rereading and self-correction', '1.ELA', ('1.ELA.decoding-digraphs',), ('RF.1.4',), None, 1),
    SK('1.ELA.story-retell', '1', 'ela', 'Retelling a story in order with the lesson', '1.ELA', (), ('RL.1.2',), None, 1),
    SK('1.ELA.main-topic-details', '1', 'ela', 'Main topic and key details in informational text', '1.ELA', (), ('RI.1.2',), None, 1),
    SK('1.ELA.opinion-writing', '1', 'ela', 'Opinion writing: topic, reason, closure', '1.ELA', (), ('W.1.1',), None, 1),
    S('1.MATH', '1', 'math', 'Mathematics (K-2 band; MCL: mathematics)', None),
    STD('1.OA.1', '1', 'math', 'Use addition and subtraction within 20 to solve word problems', '1.MATH'),
    STD('1.OA.2', '1', 'math', 'Solve word problems adding three whole numbers within 20', '1.MATH', ('1.OA.1',)),
    STD('1.OA.5', '1', 'math', 'Relate counting to addition and subtraction (counting on)', '1.MATH', ('1.OA.1',)),
    STD('1.OA.6', '1', 'math', 'Add and subtract within 20; fluency within 10', '1.MATH', ('1.OA.5',)),
    STD('1.OA.8', '1', 'math', 'Determine the unknown whole number in an addition or subtraction equation', '1.MATH', ('1.OA.6',)),
    STD('1.NBT.1', '1', 'math', 'Count to 120, starting at any number less than 120', '1.MATH'),
    STD('1.NBT.2', '1', 'math', 'Two-digit numbers are amounts of tens and ones', '1.MATH', ('1.NBT.1',)),
    STD('1.NBT.4', '1', 'math', 'Add within 100 using place value and properties of operations', '1.MATH', ('1.NBT.2',)),
    STD('1.NBT.5', '1', 'math', 'Mentally find 10 more or 10 less than a two-digit number', '1.MATH', ('1.NBT.2',)),
    STD('1.MD.3', '1', 'math', 'Tell and write time in hours and half-hours', '1.MATH'),
    STD('1.MD.4', '1', 'math', 'Organize, represent, and interpret data with up to three categories', '1.MATH'),
    STD('1.G.1', '1', 'math', 'Distinguish defining from non-defining attributes of shapes', '1.MATH'),
    STD('1.G.3', '1', 'math', 'Partition circles and rectangles into two and four equal shares', '1.MATH', ('1.G.1',)),
    SK('1.MATH.count-to-120', '1', 'math', 'Counting and writing numbers to 120', '1.MATH', (), ('1.NBT.1',), None, 1),
    SK('1.MATH.place-value-tens-ones', '1', 'math', 'Tens and ones in two-digit numbers', '1.MATH', ('1.MATH.count-to-120',), ('1.NBT.2', '1.NBT.5'), None, 1),
    SK('1.MATH.add-sub-facts-20', '1', 'math', 'Addition and subtraction facts within 20', '1.MATH', (), ('1.OA.6',), None, 1),
    SK('1.MATH.word-problems-20', '1', 'math', 'Addition and subtraction word problems within 20', '1.MATH', ('1.MATH.add-sub-facts-20',), ('1.OA.1', '1.OA.2'), None, 1),
    SK('1.MATH.two-digit-addition', '1', 'math', 'Adding tens and ones (with regrouping)', '1.MATH', ('1.MATH.place-value-tens-ones',), ('1.NBT.4',), None, 1),
    SK('1.MATH.time-half-hours', '1', 'math', 'Reading clocks to the hour and half-hour', '1.MATH', (), ('1.MD.3',), None, 1),
    S('1.SCI', '1', 'science', 'Science (K-2 band; MCL: science)', None),
    STD('1-PS4-1', '1', 'science', 'Evidence that vibrating materials make sound and sound makes objects vibrate', '1.SCI'),
    STD('1-PS4-2', '1', 'science', 'Objects can be seen only when illuminated', '1.SCI'),
    STD('1-LS1-1', '1', 'science', 'Design a solution by mimicking how plants and animals use external parts', '1.SCI'),
    STD('1-LS3-1', '1', 'science', 'Young plants and animals are like, but not exactly like, their parents', '1.SCI'),
    STD('1-ESS1-1', '1', 'science', 'Describe predictable patterns of the sun, moon, and stars', '1.SCI'),
    STD('1-ESS1-2', '1', 'science', 'Relate daylight at different times of year to the time of year', '1.SCI', ('1-ESS1-1',)),
    SK('1.SCI.sound-vibration', '1', 'science', 'Sound and vibration investigations (practice)', '1.SCI', (), ('1-PS4-1',), None, 2),
    SK('1.SCI.light-and-sight', '1', 'science', 'Light, shadow, and seeing (practice)', '1.SCI', (), ('1-PS4-2',), None, 2),
    SK('1.SCI.sky-patterns', '1', 'science', 'Sun, moon, and seasonal sky patterns', '1.SCI', (), ('1-ESS1-1', '1-ESS1-2'), None, 1),
    S('1.SS', '1', 'social_studies', 'Social studies (K-2 band; MCL: history/civics)', None),
    STD('1.H2.0.1', '1', 'social_studies', 'Chronological thinking: past, present, and future using family or school events', '1.SS'),
    STD('1.H2.0.4', '1', 'social_studies', 'Compare life today with life in the past (family, school, jobs, communication)', '1.SS', ('1.H2.0.1',)),
    STD('1.G1.0.1', '1', 'social_studies', 'Construct simple maps of the classroom with aerial perspective', '1.SS'),
    STD('1.G1.0.2', '1', 'social_studies', 'Describe places using absolute or relative location', '1.SS', ('1.G1.0.1',)),
    STD('1.C1.0.1', '1', 'social_studies', 'Explain the need for rules and purposes of rules', '1.SS'),
    STD('1.C2.0.2', '1', 'social_studies', 'Identify important symbols of the United States and what they represent', '1.SS'),
    STD('1.E1.0.1', '1', 'social_studies', 'Distinguish between producers and consumers of goods and services', '1.SS'),
    SK('1.SS.classroom-rules', '1', 'social_studies', 'Our class rules: why rules exist', '1.SS', (), ('1.C1.0.1',), None, 1),
    SK('1.SS.us-symbols', '1', 'social_studies', 'Symbols of the United States', '1.SS', (), ('1.C2.0.2',), None, 1),
    SK('1.SS.map-my-classroom', '1', 'social_studies', 'Mapping the classroom and locating places', '1.SS', (), ('1.G1.0.1', '1.G1.0.2'), None, 1),
    S('1.MOTOR', '1', 'motor', 'Motor development (K-2 band; not in the MCL nine)', None),
    SK('1.MOTOR.gross-motor', '1', 'motor', 'Gross motor: hopping, skipping, ball skills', '1.MOTOR', (), (), None, 2),
    SK('1.MOTOR.fine-motor', '1', 'motor', 'Fine motor: handwriting strokes, cutting, drawing', '1.MOTOR', (), (), None, 2),
    S('1.ART', '1', 'art', 'Art (K-2 band; not in the MCL nine)', None),
    SK('1.ART.color-mixing', '1', 'art', 'Colors, shapes, and simple pattern-making', '1.ART', (), (), None, 2),
    SK('1.ART.drawing-detail', '1', 'art', 'Drawing with detail and describing artwork', '1.ART', ('1.MOTOR.fine-motor',), (), None, 2),
    S('1.MUSIC', '1', 'music', 'Music (K-2 band; not in the MCL nine)', None),
    SK('1.MUSIC.beat-sing', '1', 'music', 'Steady beat, singing, and call-and-response', '1.MUSIC', (), (), None, 2),
    SK('1.MUSIC.compare-songs', '1', 'music', 'Compare slow/fast and loud/soft in music', '1.MUSIC', ('1.MUSIC.beat-sing',), (), None, 2),
]
# ------------------------------- grade 2 ------------------------------------
NODES += [
    S('2.ELA', '2', 'ela', 'English language arts (K-2 band; MCL: english_grammar)', None),
    STD('RF.2.3', '2', 'ela', 'Grade-level phonics: vowel teams, prefixes, and suffixes', '2.ELA'),
    STD('RF.2.4', '2', 'ela', 'Read with sufficient accuracy and fluency to support comprehension', '2.ELA', ('RF.2.3',)),
    STD('RL.2.1', '2', 'ela', 'Ask and answer who/what/where/when/why/how questions about a story', '2.ELA'),
    STD('RL.2.2', '2', 'ela', 'Recount fables and folktales and determine the central message or moral', '2.ELA', ('RL.2.1',)),
    STD('RL.2.5', '2', 'ela', 'Describe the overall structure of a story', '2.ELA', ('RL.2.1',)),
    STD('RI.2.1', '2', 'ela', 'Ask and answer who/what/where/when/why/how questions about a text', '2.ELA'),
    STD('RI.2.2', '2', 'ela', 'Identify the main topic of a multiparagraph text and paragraph focus', '2.ELA', ('RI.2.1',)),
    STD('RI.2.3', '2', 'ela', 'Describe connections between historical events, scientific ideas, or procedures', '2.ELA', ('RI.2.2',)),
    STD('W.2.1', '2', 'ela', 'Write opinion pieces with reasons and linking words', '2.ELA'),
    STD('W.2.2', '2', 'ela', 'Write informative/explanatory texts with a concluding statement', '2.ELA', ('W.2.1',)),
    STD('L.2.1', '2', 'ela', 'Conventions of standard English grammar and usage', '2.ELA'),
    STD('L.2.2', '2', 'ela', 'Conventions of standard English capitalization, punctuation, and spelling', '2.ELA', ('L.2.1',)),
    SK('2.ELA.vowel-teams-decoding', '2', 'ela', 'Vowel teams, prefixes, and suffixes in decoding', '2.ELA', (), ('RF.2.3',), None, 1),
    SK('2.ELA.fluency-expression', '2', 'ela', 'Fluent reading with expression and self-correction', '2.ELA', ('2.ELA.vowel-teams-decoding',), ('RF.2.4',), None, 1),
    SK('2.ELA.fable-message', '2', 'ela', 'Finding the message or moral of a fable', '2.ELA', (), ('RL.2.2', 'RL.2.5'), None, 1),
    SK('2.ELA.main-topic-paragraphs', '2', 'ela', 'Main topic and paragraph focus in informational text', '2.ELA', (), ('RI.2.2', 'RI.2.3'), None, 1),
    SK('2.ELA.opinion-reasons', '2', 'ela', 'Opinion writing with linked reasons', '2.ELA', (), ('W.2.1',), None, 1),
    S('2.MATH', '2', 'math', 'Mathematics (K-2 band; MCL: mathematics)', None),
    STD('2.OA.1', '2', 'math', 'Use addition and subtraction within 100 in one- and two-step word problems', '2.MATH'),
    STD('2.OA.2', '2', 'math', 'Fluently add and subtract within 20 using mental strategies', '2.MATH', ('2.OA.1',)),
    STD('2.OA.3', '2', 'math', 'Determine whether a group of objects up to 20 is odd or even', '2.MATH'),
    STD('2.OA.4', '2', 'math', 'Use addition to total objects in rectangular arrays up to 5 by 5', '2.MATH', ('2.OA.3',)),
    STD('2.NBT.1', '2', 'math', 'Three digits of a three-digit number are hundreds, tens, and ones', '2.MATH'),
    STD('2.NBT.2', '2', 'math', 'Count within 1000 and skip-count by 5s, 10s, and 100s', '2.MATH', ('2.NBT.1',)),
    STD('2.NBT.3', '2', 'math', 'Read and write numbers to 1000 in numerals, words, and expanded form', '2.MATH', ('2.NBT.1',)),
    STD('2.NBT.5', '2', 'math', 'Fluently add and subtract within 100 using place value', '2.MATH', ('2.NBT.3',)),
    STD('2.NBT.7', '2', 'math', 'Add and subtract within 1000 using place value strategies', '2.MATH', ('2.NBT.5',)),
    STD('2.MD.1', '2', 'math', 'Measure length using appropriate tools (rulers, yardsticks, tapes)', '2.MATH'),
    STD('2.MD.7', '2', 'math', 'Tell and write time to the nearest five minutes, using a.m. and p.m.', '2.MATH'),
    STD('2.MD.8', '2', 'math', 'Solve money word problems with dollars, quarters, dimes, nickels, pennies', '2.MATH', ('2.NBT.5',)),
    STD('2.G.1', '2', 'math', 'Recognize and draw shapes with specified attributes', '2.MATH'),
    STD('2.G.3', '2', 'math', 'Partition circles and rectangles into two, three, or four equal shares', '2.MATH'),
    SK('2.MATH.add-sub-fluency-20', '2', 'math', 'Addition and subtraction fluency within 20', '2.MATH', (), ('2.OA.2',), None, 1),
    SK('2.MATH.word-problems-100', '2', 'math', 'One- and two-step word problems within 100', '2.MATH', ('2.MATH.add-sub-fluency-20',), ('2.OA.1',), None, 1),
    SK('2.MATH.arrays-foundation', '2', 'math', 'Rows, columns, and repeated addition (arrays)', '2.MATH', (), ('2.OA.4',), None, 1),
    SK('2.MATH.skip-counting', '2', 'math', 'Skip-counting by 5s, 10s, and 100s', '2.MATH', (), ('2.NBT.2',), None, 1),
    SK('2.MATH.three-digit-place-value', '2', 'math', 'Reading, writing, and comparing three-digit numbers', '2.MATH', ('2.MATH.skip-counting',), ('2.NBT.3', '2.NBT.5'), None, 1),
    SK('2.MATH.money-and-time', '2', 'math', 'Money amounts and time to five minutes', '2.MATH', ('2.MATH.three-digit-place-value',), ('2.MD.7', '2.MD.8'), None, 1),
    S('2.SCI', '2', 'science', 'Science (K-2 band; MCL: science)', None),
    STD('2-PS1-1', '2', 'science', 'Describe and classify materials by their observable properties', '2.SCI'),
    STD('2-PS1-2', '2', 'science', 'Analyze test data to choose materials suited to a use', '2.SCI', ('2-PS1-1',)),
    STD('2-PS1-4', '2', 'science', 'Some changes from heating or cooling can be reversed and some cannot', '2.SCI', ('2-PS1-1',)),
    STD('2-LS2-1', '2', 'science', 'Investigate whether plants need sunlight and water to grow', '2.SCI'),
    STD('2-LS4-1', '2', 'science', 'Compare the diversity of life in different habitats', '2.SCI'),
    STD('2-ESS1-1', '2', 'science', 'Evidence that Earth events can occur quickly or slowly', '2.SCI'),
    STD('2-ESS2-1', '2', 'science', 'Compare solutions that slow wind or water changing the land', '2.SCI', ('2-ESS1-1',)),
    STD('2-ESS2-2', '2', 'science', 'Model the shapes and kinds of land and bodies of water in an area', '2.SCI', ('2-ESS2-1',)),
    SK('2.SCI.material-properties', '2', 'science', 'Material properties and sorting (practice)', '2.SCI', (), ('2-PS1-1', '2-PS1-2'), None, 2),
    SK('2.SCI.plants-need-sun-water', '2', 'science', 'Plant needs: sunlight and water investigations', '2.SCI', (), ('2-LS2-1',), None, 1),
    SK('2.SCI.land-and-water', '2', 'science', 'Land, water, and weathering in our area', '2.SCI', (), ('2-ESS2-1', '2-ESS2-2'), None, 1),
    S('2.SS', '2', 'social_studies', 'Social studies (K-2 band; MCL: history/civics)', None),
    STD('2.H2.0.1', '2', 'social_studies', 'Chronological thinking across years and decades using a community timeline', '2.SS'),
    STD('2.H2.0.4', '2', 'social_studies', 'Describe changes in the local community over time', '2.SS', ('2.H2.0.1',)),
    STD('2.G1.0.1', '2', 'social_studies', 'Construct maps of the local community with symbols, labels, and legends', '2.SS'),
    STD('2.G4.0.1', '2', 'social_studies', 'Describe land use in the community', '2.SS', ('2.G1.0.1',)),
    STD('2.C1.0.1', '2', 'social_studies', 'Explain why people form governments', '2.SS'),
    STD('2.C3.0.1', '2', 'social_studies', 'How local governments make, enforce, and interpret laws (ordinances)', '2.SS', ('2.C1.0.1',)),
    STD('2.E1.0.1', '2', 'social_studies', 'Identify the opportunity cost involved in a consumer decision', '2.SS'),
    SK('2.SS.community-timeline', '2', 'social_studies', 'Building a timeline of our community', '2.SS', (), ('2.H2.0.1', '2.H2.0.4'), None, 1),
    SK('2.SS.community-map', '2', 'social_studies', 'Mapping our community and its land use', '2.SS', (), ('2.G1.0.1', '2.G4.0.1'), None, 1),
    SK('2.SS.local-government', '2', 'social_studies', 'Local government services and rules', '2.SS', (), ('2.C3.0.1',), None, 1),
    S('2.MOTOR', '2', 'motor', 'Motor development (K-2 band; not in the MCL nine)', None),
    SK('2.MOTOR.gross-motor', '2', 'motor', 'Gross motor: coordination, endurance, team games', '2.MOTOR', (), (), None, 2),
    SK('2.MOTOR.fine-motor', '2', 'motor', 'Fine motor: handwriting fluency and tool use', '2.MOTOR', (), (), None, 2),
    S('2.ART', '2', 'art', 'Art (K-2 band; not in the MCL nine)', None),
    SK('2.ART.design-steps', '2', 'art', 'Planning and describing a drawing or craft', '2.ART', (), (), None, 2),
    SK('2.ART.art-in-culture', '2', 'art', 'Art from our community and cultures', '2.ART', ('2.SS.community-map',), (), None, 2),
    S('2.MUSIC', '2', 'music', 'Music (K-2 band; not in the MCL nine)', None),
    SK('2.MUSIC.rhythm-patterns', '2', 'music', 'Clapping and notating rhythm patterns', '2.MUSIC', (), (), None, 2),
    SK('2.MUSIC.sing-clear', '2', 'music', 'Singing with clear voice and steady beat', '2.MUSIC', ('2.MUSIC.rhythm-patterns',), (), None, 2),
]
# ------------------------------- grade 4 ------------------------------------
# Grade 4 carries the full MCL nine-band (engine subject vocabulary), matching
# the grade-3/5 subject set. Standards-mapped only — no shipped content yet.
NODES += [
    S('4.MATH', '4', 'math', 'Mathematics (MCL: mathematics)', None),
    STD('4.OA.1', '4', 'math', 'Interpret a multiplication equation as a comparison', '4.MATH'),
    STD('4.OA.3', '4', 'math', 'Solve multistep word problems with the four operations; interpret remainders', '4.MATH', ('4.OA.1',)),
    STD('4.OA.4', '4', 'math', 'Find all factor pairs for a whole number 1-100 and recognize multiples', '4.MATH', ('4.OA.1',)),
    STD('4.NBT.1', '4', 'math', 'A digit is ten times what it represents in the place to its right', '4.MATH'),
    STD('4.NBT.2', '4', 'math', 'Read, write, and compare multi-digit whole numbers', '4.MATH', ('4.NBT.1',)),
    STD('4.NBT.3', '4', 'math', 'Round multi-digit whole numbers to any place', '4.MATH', ('4.NBT.2',)),
    STD('4.NBT.4', '4', 'math', 'Fluently add and subtract multi-digit whole numbers (standard algorithm)', '4.MATH', ('4.NBT.2',)),
    STD('4.NBT.5', '4', 'math', 'Multiply up to four digits by one digit; multiply two two-digit numbers', '4.MATH', ('4.NBT.2',)),
    STD('4.NBT.6', '4', 'math', 'Find quotients and remainders with four-digit dividends and one-digit divisors', '4.MATH', ('4.NBT.5',)),
    STD('4.NF.1', '4', 'math', 'Explain why a fraction a/b is equivalent to (n x a)/(n x b)', '4.MATH'),
    STD('4.NF.2', '4', 'math', 'Compare fractions with different numerators and denominators', '4.MATH', ('4.NF.1',)),
    STD('4.NF.3', '4', 'math', 'Understand a fraction greater than 1 as a sum of fractions', '4.MATH', ('4.NF.1',)),
    STD('4.MD.3', '4', 'math', 'Apply the area and perimeter formulas for rectangles', '4.MATH', ('4.NBT.2',)),
    SK('4.MATH.multiplicative-comparison', '4', 'math', 'Multiplicative comparison statements and equations', '4.MATH', (), ('4.OA.1',), None, 1),
    SK('4.MATH.multistep-word-problems', '4', 'math', 'Multistep problems with remainders', '4.MATH', ('4.MATH.multiplicative-comparison',), ('4.OA.3',), None, 1),
    SK('4.MATH.multi-digit-add-sub', '4', 'math', 'Multi-digit addition and subtraction fluency', '4.MATH', (), ('4.NBT.4',), None, 1),
    SK('4.MATH.multi-digit-multiplication', '4', 'math', 'Multi-digit multiplication strategies', '4.MATH', ('4.MATH.multi-digit-add-sub',), ('4.NBT.5',), None, 1),
    SK('4.MATH.division-remainders', '4', 'math', 'Division with remainders and interpretation', '4.MATH', ('4.MATH.multi-digit-multiplication',), ('4.NBT.6',), None, 1),
    SK('4.MATH.fraction-equivalence', '4', 'math', 'Equivalent fractions and comparing fractions', '4.MATH', (), ('4.NF.1', '4.NF.2'), None, 1),
    S('4.READ', '4', 'reading', 'Reading (MCL: reading)', None),
    STD('RI.4.1', '4', 'reading', 'Use details and examples to explain and infer from a text', '4.READ'),
    STD('RI.4.2', '4', 'reading', 'Determine the main idea and how it is supported by key details', '4.READ', ('RI.4.1',)),
    STD('RI.4.3', '4', 'reading', 'Explain events, procedures, or concepts in a historical or technical text', '4.READ', ('RI.4.2',)),
    STD('RI.4.5', '4', 'reading', 'Describe the overall structure of a text (chronology, compare, cause/effect)', '4.READ', ('RI.4.2',)),
    STD('RF.4.3', '4', 'reading', 'Decode multisyllabic words using syllabication and morphology', '4.READ'),
    STD('RF.4.4', '4', 'reading', 'Read with sufficient accuracy and fluency to support comprehension', '4.READ', ('RF.4.3',)),
    SK('4.READ.text-evidence', '4', 'reading', 'Comprehension with text evidence (incl. cloze)', '4.READ', (), ('RI.4.1', 'RI.4.2'), None, 1),
    SK('4.READ.main-idea-summarize', '4', 'reading', 'Main idea, structure, and summarizing', '4.READ', ('4.READ.text-evidence',), ('RI.4.2', 'RI.4.5'), None, 1),
    SK('4.READ.multisyllabic-decoding', '4', 'reading', 'Multisyllabic decoding and fluency practice', '4.READ', (), ('RF.4.3', 'RF.4.4'), None, 1),
    S('4.LIT', '4', 'literature', 'Literature (MCL: literature)', None),
    STD('RL.4.1', '4', 'literature', 'Use details and examples to explain and infer from a literary text', '4.LIT'),
    STD('RL.4.2', '4', 'literature', 'Determine a theme from details in the text; summarize', '4.LIT', ('RL.4.1',)),
    STD('RL.4.3', '4', 'literature', 'Describe in depth a character, setting, or event using specific details', '4.LIT', ('RL.4.1',)),
    SK('4.LIT.theme-summary', '4', 'literature', 'Theme and summary in stories, drama, and poetry', '4.LIT', (), ('RL.4.2', 'RL.4.3'), None, 1),
    S('4.WRIT', '4', 'writing', 'Writing (MCL: writing)', None),
    STD('W.4.1', '4', 'writing', 'Opinion pieces that support a point of view with reasons and information', '4.WRIT'),
    STD('W.4.2', '4', 'writing', 'Informative/explanatory texts that examine a topic clearly', '4.WRIT', ('W.4.1',)),
    SK('4.WRIT.opinion', '4', 'writing', 'Opinion writing: reasons, facts, linking words, conclusion', '4.WRIT', (), ('W.4.1',), None, 1),
    SK('4.WRIT.informative', '4', 'writing', 'Informative writing: structure, detail, precise language', '4.WRIT', (), ('W.4.2',), None, 1),
    S('4.GRAM', '4', 'english_grammar', 'English grammar (MCL: English grammar)', None),
    STD('L.4.1', '4', 'english_grammar', 'Conventions of standard English grammar and usage', '4.GRAM'),
    STD('L.4.2', '4', 'english_grammar', 'Conventions of standard English capitalization, punctuation, and spelling', '4.GRAM', ('L.4.1',)),
    STD('L.4.5', '4', 'english_grammar', 'Figurative language, word relationships, and nuances in word meanings', '4.GRAM'),
    SK('4.GRAM.sentence-conventions', '4', 'english_grammar', 'Sentence structure, fragments, and run-ons', '4.GRAM', (), ('L.4.1', 'L.4.2'), None, 1),
    SK('4.GRAM.figurative-language', '4', 'english_grammar', 'Similes, metaphors, idioms, and antonyms/synonyms', '4.GRAM', (), ('L.4.5',), None, 1),
    S('4.SPELL', '4', 'spelling', 'Spelling (MCL: spelling)', None),
    STD('L.4.2.d', '4', 'spelling', 'Spell grade-appropriate words correctly, consulting references as needed', '4.SPELL', ['RF.4.3']),
    SK('4.SPELL.patterns', '4', 'spelling', 'Spelling patterns and reference-checking routine', '4.SPELL', ('4.READ.multisyllabic-decoding',), ('L.4.2.d',), None, 1),
    S('4.SCI', '4', 'science', 'Science (MCL: science)', None),
    STD('4-PS3-1', '4', 'science', 'Explain how the speed of an object relates to the energy of that object', '4.SCI'),
    STD('4-PS3-3', '4', 'science', 'Ask questions and predict outcomes about energy changes in collisions', '4.SCI', ('4-PS3-1',)),
    STD('4-PS4-1', '4', 'science', 'Model waves in terms of amplitude and wavelength', '4.SCI'),
    STD('4-LS1-1', '4', 'science', 'Internal and external structures support survival and reproduction', '4.SCI'),
    STD('4-LS1-2', '4', 'science', 'Model how animals receive, process, and respond to sensory information', '4.SCI', ('4-LS1-1',)),
    STD('4-ESS1-1', '4', 'science', 'Evidence from patterns in rock formations and fossils in rock layers', '4.SCI'),
    STD('4-ESS2-1', '4', 'science', 'Evidence of the effects of weathering and erosion by water, ice, wind, vegetation', '4.SCI', ('4-ESS1-1',)),
    # 3-5-ETS1-1 is already a grade-3 node id (same band PE); ids are globally
    # unique, so grade 4 claims its grade-specific engineering-design PE instead.
    STD('4-PS3-4', '4', 'science', 'Design, test, and refine a device that converts energy from one form to another', '4.SCI', ('4-PS3-3',)),
    SK('4.SCI.energy-and-motion', '4', 'science', 'Energy, speed, and collisions (practice)', '4.SCI', (), ('4-PS3-1', '4-PS3-3'), None, 2),
    SK('4.SCI.waves-sound-light', '4', 'science', 'Waves, sound, and light (practice)', '4.SCI', (), ('4-PS4-1',), None, 2),
    SK('4.SCI.rocks-and-fossils', '4', 'science', 'Rocks, fossils, and Michigan geologic time', '4.SCI', (), ('4-ESS1-1', '4-ESS2-1'), None, 1),
    S('4.HIST', '4', 'history', 'History & geography (MCL: history)', None),
    STD('4.H3.0.1', '4', 'history', 'Historical inquiry questions on Michigan economic activities since statehood', '4.HIST'),
    STD('4.H3.0.2', '4', 'history', 'Primary and secondary sources on how migration shaped Michigan', '4.HIST', ('4.H3.0.1',)),
    STD('4.G1.0.1', '4', 'history', 'Questions geographers ask when examining the United States', '4.HIST'),
    STD('4.G1.0.5', '4', 'history', 'Hemispheres, continents, oceans, and lines of latitude locate the United States', '4.HIST', ('4.G1.0.1',)),
    STD('4.G2.0.1', '4', 'history', 'Describe ways the United States can be divided into regions', '4.HIST', ('4.G1.0.5',)),
    STD('4.G4.0.1', '4', 'history', 'Push and pull factors in a migration case study', '4.HIST', ('4.H3.0.2',)),
    SK('4.HIST.michigan-inquiry', '4', 'history', "Michigan history inquiry: then and now", '4.HIST', (), ('4.H3.0.1',), None, 1),
    SK('4.HIST.primary-sources', '4', 'history', 'Primary vs secondary sources (practice)', '4.HIST', (), ('4.H3.0.2',), None, 1),
    SK('4.HIST.us-regions-maps', '4', 'history', 'U.S. regions, maps, and migration stories', '4.HIST', (), ('4.G2.0.1', '4.G4.0.1'), None, 1),
    S('4.CIV', '4', 'civics', 'Civics (MCL: civics)', None),
    STD('4.C1.0.1', '4', 'civics', 'Questions political scientists ask when examining the United States', '4.CIV'),
    STD('4.C1.0.2', '4', 'civics', 'Purposes of government as stated in the Preamble of the Constitution', '4.CIV', ('4.C1.0.1',)),
    STD('4.C2.0.1', '4', 'civics', 'Popular sovereignty, rule of law, checks and balances, and individual rights', '4.CIV', ('4.C1.0.2',)),
    STD('4.C3.0.1', '4', 'civics', 'Ways the Constitution limits the powers of the federal government', '4.CIV', ('4.C1.0.2',)),
    STD('4.C5.0.1', '4', 'civics', 'Responsibilities of members of American society', '4.CIV', ('4.C2.0.1',)),
    SK('4.CIV.preamble-purposes', '4', 'civics', 'The Preamble and its purposes', '4.CIV', (), ('4.C1.0.2',), None, 1),
    SK('4.CIV.limits-on-government', '4', 'civics', 'Checks, balances, and limits on government power', '4.CIV', (), ('4.C2.0.1', '4.C3.0.1'), None, 1),
]
# ------------------------------- mapping tables -----------------------------
# test/quiz skill tag -> node id, per grade
TEST_SKILL_MAP = {
    '3': {
        'multiplication': '3.OA.7.multiplication-facts', 'skip-counting': '3.OA.7.multiplication-facts',
        'place-value': '3.NBT.1.place-value-rounding', 'multi-digit-addition': '3.NBT.2.add-subtract',
        'equal-groups': '3.OA.1.equal-groups-arrays', 'arrays': '3.OA.1.equal-groups-arrays',
        'word-problems': '3.OA.3.word-problems', 'estimation': '3.NBT.2.add-subtract',
        'comprehension': '3.RL.3.1.literary-questions', 'reading-comprehension': '3.RI.3.1.comprehension-evidence',
        'spelling': '3.L.3.2.e.spelling', 'science': '3.SCI.practice', 'history': '3.HIST.practice',
        'coding-fundamentals': '3.CODE.practice',
    },
    '5': {
        'fractions': '5.MATH.fractions', 'fractions-operations': '5.MATH.fractions-operations',
        'area-perimeter': '5.MATH.area-perimeter-volume', 'volume': '5.MATH.area-perimeter-volume',
        'algebra-equations': '5.OA.1.solving-equations', 'solving-equations': '5.OA.1.solving-equations',
        'variables': '5.OA.2.variables', 'spelling': '5.L.5.2.b.spelling-patterns',
        'punctuation': '5.L.5.2.punctuation', 'sentence-structure': '5.L.5.1.sentences',
        'properties-of-matter': '5.SCI.properties', 'ancient-civilizations': '5.HIST.ancient-civilizations',
        'python-syntax': '5.CODE.python', 'loops': '5.CODE.practice', 'html-basics': '5.CODE.practice',
    },
    'preschool': {
        'letters': 'P.READ.letters', 'sounds': 'P.READ.sounds', 'counting': 'P.MATH.counting-1-10',
        'shapes': 'P.MATH.shapes', 'Counting 1-10': 'P.MATH.counting-1-10',
        'Counting 11-20': 'P.MATH.counting-11-20', 'More or Less': 'P.MATH.more-or-less',
        'Counting with Toys': 'P.MATH.counting-with-toys', 'Color Sorting': 'P.MATH.color-sorting',
        'Fine Motor Counting': 'P.MATH.fine-motor',
    },
}
# generator config skill -> node id, per grade
GEN_SKILL_MAP = {
    '3': {
        'skip-count-2-3-5-10': '3.OA.7.multiplication-facts',
        'multiplication-facts-0-5': '3.OA.7.multiplication-facts',
        'place-value-3-and-4-digit-read-write-blocks': '3.NBT.1.place-value-rounding',
        'multi-digit-addition-regrouping-plus-4-addend': '3.NBT.2.add-subtract',
        'closed-syllables-10-word-list': '3.L.3.2.e.spelling',
        'cloze-from-stored-week-1-passages': '3.RI.3.1.comprehension-evidence',
        'living-and-non-living': '3.SCI.living-nonliving',
        'community-helpers-order-and-timeline': '3.HIST.community-helpers',
        'community-helpers-recall-from-memory': '3.HIST.community-helpers',
        'block-coding-predict-order-debug': '3.CODE.block-coding',
        'capitalization-and-end-punctuation': '3.L.3.2.punctuation-capitalization',
        'sentence-order-and-detail': '3.W.3.2.informative-sentences',
        'symbols-of-our-country': '3.CIV.symbols',
    },
    '5': {
        'numerator-denominator-shaded-improper': '5.MATH.fractions',
        'equivalent-and-missing-numerator': '5.MATH.fractions',
        'fraction-of-a-set-compare-multistep': '5.MATH.fractions-operations',
        'area-perimeter-missing-side': '5.MATH.area-perimeter-volume',
        'cloze-from-stored-grade-5-passages': '5.RI.5.1.comprehension-evidence',
        'tion-sion-spelling-patterns-list-1': '5.L.5.2.b.spelling-patterns',
        'scientific-method-observation-data': '5.SCI.scientific-method',
        'map-skills-equator-hemispheres-continents': '5.HIST.map-skills',
        'python-syntax-print-variables-indentation': '5.CODE.python',
    },
    'preschool': {},
}
# CAT assessment.bank skill_tag -> node id, per grade (bank is served to g3+g5)
BANK_MAP = {
    '3': {
        'multi-digit-addition': '3.NBT.2.add-subtract', 'multi-digit-subtraction': '3.NBT.2.add-subtract',
        'multiplication-facts': '3.OA.7.multiplication-facts', 'division-facts': '3.MATH.division-facts',
        'rounding': '3.NBT.1.place-value-rounding', 'fractions': '3.MATH.fractions',
        'area': '3.MATH.area-perimeter', 'perimeter': '3.MATH.area-perimeter',
        'elapsed-time': '3.MATH.elapsed-time', 'money-change': '3.MATH.money-change',
        'capitalization': '3.L.3.2.punctuation-capitalization', 'plural-nouns': '3.L.3.1.sentences',
        'sentence-types': '3.L.3.1.sentences', 'subject-verb-agreement': '3.L.3.1.sentences',
        'syllable-count': '3.RF.3.3.decoding-syllables', 'synonyms': '3.GRAM.synonyms',
    },
    '5': {
        'multi-digit-addition': '5.MATH.add-subtract', 'multi-digit-subtraction': '5.MATH.add-subtract',
        'multiplication-facts': '5.NBT.5.multiplication', 'division-facts': '5.MATH.division-facts',
        'rounding': '5.NBT.1.place-value', 'fractions': '5.MATH.fractions',
        'area': '5.MATH.area-perimeter-volume', 'perimeter': '5.MATH.area-perimeter-volume',
        'elapsed-time': '5.MATH.elapsed-time', 'money-change': '5.MATH.money-change',
        'capitalization': '5.L.5.2.punctuation', 'plural-nouns': '5.L.5.1.sentences',
        'sentence-types': '5.L.5.1.sentences', 'subject-verb-agreement': '5.L.5.1.sentences',
        'syllable-count': '5.READ.syllables', 'synonyms': '5.L.5.4.synonyms',
    },
}
# The 20 worker-pool grade-3 w2 lessons shipped with `subject: null` (content
# bug, verified in content.json + the _w2_lessons_*.json staging files). Their
# subject is unambiguous from each lesson's own title + practice questions
# (verified by hand, 2026-10-17): explicit table below — a LABEL decision only;
# item text/options/answers remain verbatim from content.json. Any lesson not
# in this table and without a subject field is a hard build failure.
NULL_SUBJ_LESSONS = {
    'max_w2_l5': 'math',      # Mixed Fact Practice (5x0, 3x5, ...)
    'max_w2_l6': 'math',      # Week 1-2 Cumulative Review (skip-count, arrays, estimate)
    'max_w2_l7': 'math',      # Fact Fluency Builder (5x2, 3x0, ...)
    'max_w2_l8': 'reading',   # Retell in Order
    'max_w2_l9': 'coding',    # Morning Routine Code
    'max_w2_l10': 'reading',  # Retelling in Order
    'max_w2_l11': 'spelling', # Spelling Sentences
    'max_w2_l12': 'coding',   # Loop Your Routine
    'max_w2_l13': 'history',  # Town Helpers Quiz
    'max_w2_l14': 'coding',   # Loop Your Routine
    'max_w2_l15': 'reading',  # Retell in Four Sentences
    'max_w2_l16': 'science',  # Animal Facts & Art
    'max_w2_l17': 'science',  # Animal Facts & Pictures
    'max_w2_l18': 'history',  # Town Helpers Timeline
    'max_w2_l19': 'coding',   # Debug a Morning Routine
    'max_w2_l20': 'reading',  # Retell & Why Questions
    'max_w2_l21': 'spelling', # Cover-Write-Check Spelling
    'max_w2_l22': 'science',  # Explain & Draw Animal Families
    'max_w2_l23': 'history',  # Kid Helpers in the Community
    'max_w2_l24': 'coding',   # Explain Your Code
}

def resolve_lesson_subject(lesson):
    s = lesson.get('subject')
    if s:
        return s
    return NULL_SUBJ_LESSONS.get(lesson.get('id'))

# preschool lesson title -> node id (luca lessons carry no generator id)
PRESCHOOL_LESSON_MAP = [
    (r'[Aa]lphabet|[Ll]etter', 'P.READ.letters', 'reading'),
    (r'[Ss]ound', 'P.READ.sounds', 'reading'),
    (r'Count to 10|Counting to 10', 'P.MATH.counting-1-10', 'math'),
    (r'Count to 20|Counting to 20', 'P.MATH.counting-11-20', 'math'),
    (r'More or Less', 'P.MATH.more-or-less', 'math'),
    (r'[Tt]oy', 'P.MATH.counting-with-toys', 'math'),
    (r'[Ss]hape', 'P.MATH.shapes', 'math'),
    (r'[Cc]olor|Sort', 'P.MATH.color-sorting', 'math'),
    (r'[Rr]etell|Rhyme|Book|picture book|Story', 'P.LIT.read-aloud', 'literature'),
]
NON_SPAWNING_LESSON = re.compile(r'^Materials\b')

# generator id -> skill/subject (across all weeks, dedup by id)
GEN_BY_ID = {}
for g in C['weeks']:
    for wv in C['weeks'][g].values():
        for gen in wv.get('generators', []):
            GEN_BY_ID.setdefault(gen['id'], gen)

# ------------------------------- validation helpers -------------------------
NODE_BY_ID = {n['id']: n for n in NODES}
assert len(NODE_BY_ID) == len(NODES), 'duplicate node id in spec'
for n in NODES:
    if n['parent'] is not None:
        assert n['parent'] in NODE_BY_ID, 'missing parent %s for %s' % (n['parent'], n['id'])
    for p in n['prereqs']:
        assert p in NODE_BY_ID, 'missing prereq %s for %s' % (p, n['id'])
        assert NODE_BY_ID[p]['grade'] == n['grade'], 'cross-grade prereq %s' % n['id']

# K/1/2/4: the spec's standard nodes must equal data/standards_maps.json 1:1 —
# no standard outside the public map, none left unclaimed.
for g in NEW_GRADES:
    spec_std = {n['id'] for n in NODES if n['grade'] == g and n['kind'] == 'standard'}
    if spec_std != MAP_IDS[g]:
        raise SystemExit('grade %s standards mismatch: spec-only=%s map-only=%s' % (
            g, sorted(spec_std - MAP_IDS[g]), sorted(MAP_IDS[g] - spec_std)))
    for n in NODES:
        if n['grade'] != g:
            continue
        assert n['subject'] in GRADE_SUBJECTS[g], 'grade %s subject off-band: %s' % (g, n['id'])
        for code in n['standards']:
            assert code in NODE_BY_ID and NODE_BY_ID[code]['grade'] == g, \
                'standard %s claimed by %s is not a same-grade node' % (code, n['id'])

# ------------------------------- item derivation ----------------------------
ITEMS = []
unmapped = []

def add_item(grade, node_id, subject, q, options, answer, level, provenance, skill_tag,
             kind='mc', read_aloud_ok=None, extra=None):
    node = NODE_BY_ID[node_id]
    text = ' '.join(str(q).split())
    norm_opt = [' '.join(str(o).split()) for o in options]
    sig = hashlib.sha1(('|'.join([grade] + [text] + norm_opt)).encode('utf-8')).hexdigest()[:10]
    if read_aloud_ok is None:
        read_aloud_ok = not (subject == 'spelling' or 'spelling' in (skill_tag or ''))
    it = OrderedDict()
    it['id'] = 'itm_' + hashlib.sha1(sig.encode('utf-8')).hexdigest()[:16]
    it['schema'] = 'item/v1'
    it['grade'] = grade
    it['subject'] = subject
    it['cat_domain'] = CAT_DOMAIN[subject]
    it['skill_node'] = node_id
    it['skill_tag'] = skill_tag
    it['standards'] = node['standards']
    it['level'] = level
    it['type'] = kind
    it['exposure_limit'] = 3
    it['accessibility'] = {'read_aloud_ok': read_aloud_ok}
    it['text'] = text
    it['options'] = norm_opt
    it['answer'] = ' '.join(str(answer).split())
    it['provenance'] = provenance
    if extra:
        it.update(extra)
    ITEMS.append(it)

def b_level(b):
    if b is None: return 2
    if b <= -0.6: return 1
    if b <= -0.2: return 2
    if b <= 0.2: return 3
    return 4

# (a) weekly tests + quizzes (skill-tagged mc questions)
for g in ['preschool', '3', '5']:
    for wn, wv in sorted(C['weeks'][g].items(), key=lambda kv: int(kv[0])):
        t = wv.get('test') or {}
        for i, q in enumerate(t.get('questions', [])):
            skill = q.get('skill')
            node = TEST_SKILL_MAP[g].get(skill)
            if not node:
                unmapped.append(('test', g, wn, skill)); continue
            add_item(g, node, NODE_BY_ID[node]['subject'], q['q'], q['options'],
                     q['options'][q['correct']], 2,
                     'content.json:weeks/%s/%s/test/%s[%d]' % (g, wn, t.get('quizId', 'test'), i),
                     skill)
        for qz in wv.get('quizzes', []):
            for i, q in enumerate(qz.get('questions', [])):
                skill = q.get('skill')
                node = TEST_SKILL_MAP[g].get(skill)
                if not node:
                    unmapped.append(('quiz', g, wn, skill)); continue
                add_item(g, node, NODE_BY_ID[node]['subject'], q['q'], q['options'],
                         q['options'][q['correct']], 1,
                         'content.json:weeks/%s/%s/quizzes/%s[%d]' % (g, wn, qz.get('quizId', 'quiz'), i),
                         skill)

# (b) lesson practice questions (verbatim; node via generator skill / title / fallback)
for g in ['preschool', '3', '5']:
    for wn, wv in sorted(C['weeks'][g].items(), key=lambda kv: int(kv[0])):
        for lid, les in sorted(wv.get('lessons', {}).items()):
            practice = les.get('content', {}).get('practice', [])
            if not practice:
                continue
            subject = resolve_lesson_subject(les)
            if subject not in CAT_DOMAIN:
                unmapped.append(('lesson-subject', g, wn, lid, subject)); continue
            gen_id = les.get('content', {}).get('generator')
            node = None
            if gen_id and gen_id in GEN_BY_ID:
                node = GEN_SKILL_MAP[g].get(GEN_BY_ID[gen_id].get('skill'))
            if node is None and g == 'preschool':
                title = les.get('title', '')
                for pat, nid, subj in PRESCHOOL_LESSON_MAP:
                    if re.search(pat, title) and NODE_BY_ID[nid]['subject'] == subject:
                        node = nid; break
            if node is None:
                # structural fallback: per-grade/subject/week practice node (codeless)
                fallback = '%s.%s.practice-w%s' % (
                    {'3': '3', '5': '5', 'preschool': 'P'}[g],
                    {'math': 'MATH', 'reading': 'READ', 'spelling': 'SPELL', 'science': 'SCI',
                     'history': 'HIST', 'civics': 'CIV', 'writing': 'WRIT',
                     'english_grammar': 'GRAM', 'literature': 'LIT', 'coding': 'CODE'}[subject], wn)
                if fallback not in NODE_BY_ID:
                    NODES.append(SK(fallback, g, subject, 'Lesson practice — %s week %s' % (subject, wn),
                                    {'3': '3', '5': '5', 'preschool': 'P'}[g] + '.' + {
                                        'math': 'MATH', 'reading': 'READ', 'spelling': 'SPELL', 'science': 'SCI',
                                        'history': 'HIST', 'civics': 'CIV', 'writing': 'WRIT',
                                        'english_grammar': 'GRAM', 'literature': 'LIT', 'coding': 'CODE'}[subject],
                                    (), (), int(wn), 2))
                    NODE_BY_ID[fallback] = NODES[-1]
                node = fallback
            for i, p in enumerate(practice):
                opts = p.get('options', [])
                if not opts or p.get('correctIndex') is None:
                    continue
                add_item(g, node, subject, p['question'], opts, opts[p['correctIndex']],
                         1, 'content.json:weeks/%s/%s/lessons/%s.practice[%d]' % (g, wn, lid, i),
                         None)

# (c) bank-mode generator literal items (authored items[] arrays)
for g in ['3', '5']:
    seen_gen = set()
    for wn, wv in sorted(C['weeks'][g].items(), key=lambda kv: int(kv[0])):
        for gen in wv.get('generators', []):
            if gen.get('mode') != 'bank' or gen['id'] in seen_gen or not gen.get('items'):
                continue
            seen_gen.add(gen['id'])
            node = GEN_SKILL_MAP[g].get(gen.get('skill'))
            if not node:
                unmapped.append(('generator', g, wn, gen.get('skill'))); continue
            for i, it in enumerate(gen['items']):
                opts = it.get('options', [])
                if not opts or it.get('correctIndex') is None:
                    continue
                add_item(g, node, gen['subject'], it['question'], opts, opts[it['correctIndex']],
                         1 if not it.get('group') else min(4, int(re.sub(r'\D', '', it['group']) or 1)),
                         'generator:%s.items[%d]' % (gen['id'], i), gen.get('skill'),
                         extra={'generator': gen['id'], 'generator_family': gen.get('family')})

# (d) CAT assessment.bank (grade_band dropped in demo copy; served to g3 + g5)
for g in ['3', '5']:
    for b in C['assessment']['bank']:
        node = BANK_MAP[g].get(b['skill_tag'])
        if not node:
            unmapped.append(('catbank', g, b['item_id'], b['skill_tag'])); continue
        add_item(g, node, NODE_BY_ID[node]['subject'], b['text'], b['options'], b['answer'],
                 b_level(b.get('b')), 'content.json:assessment.bank#%s' % b['item_id'],
                 b['skill_tag'],
                 extra={'irt': {'a': b.get('a'), 'b': b.get('b'), 'c': None, 'calibration': 'uncalibrated-v0'}})

if unmapped:
    print('UNMAPPED SOURCES (fix maps, nothing invented):')
    for u in unmapped:
        print('  ', u)
    sys.exit(1)

# ------------------------------- output -------------------------------------
tree = OrderedDict()
tree['schema'] = 'skill_tree/v1'
tree['generated_by'] = 'tools/build_engine_data.py'
tree['source'] = ('MDE K-12 standards crosswalk: LNM_BRAIN/SAITTASPROUT/'
                  'MI_COMPLIANCE_MAP_2026-10-16.md §3 (read 2026-10-16) + '
                  'MONTH1_SCAFFOLD_1016.md module structure (modules are week-scoped)')
tree['subject_source'] = 'data/content.json per-grade subject union + content.statutory (D7 nine)'
tree['statutory_subjects'] = STATUTORY
tree['grade_subjects'] = OrderedDict((g, GRADE_SUBJECTS[g])
                                     for g in ['preschool', '3', '5'] + NEW_GRADES)
tree['grades'] = OrderedDict()
for g in ['preschool', '3', '5'] + NEW_GRADES:
    gnodes = [n for n in NODES if n['grade'] == g]
    entry = OrderedDict()
    entry['grade_band'] = g
    entry['label'] = GRADE_LABELS[g] if g in NEW_GRADES else C['grades'][g]['label']
    entry['nodes'] = [OrderedDict([
        ('id', n['id']), ('grade', n['grade']), ('subject', n['subject']),
        ('statutory', SUBJ_TO_STATUTORY[n['subject']]), ('kind', n['kind']),
        ('label', n['label']), ('parent', n['parent']), ('prereqs', n['prereqs']),
        ('standards', n['standards']), ('unit_wk', n['unit_wk']), ('priority', n['priority']),
    ]) for n in gnodes]
    if g in NEW_GRADES:
        # additive per-grade fields — existing grades keep their exact bytes
        entry['statutory_subjects'] = list(STATUTORY_BAND[g])
        entry['cat_domains'] = ['math', 'ela']
        entry['content'] = ('standards-mapped tree only; no shipped content yet '
                            '(data/content.json has no weeks/%s) — content lane pending' % g)
    tree['grades'][g] = entry
# appended after 'grades' so every pre-existing byte in this document is kept
tree['standards_maps'] = OrderedDict([
    ('schema', 'standards_maps/v1'),
    ('file', 'data/standards_maps.json'),
    ('grades', list(NEW_GRADES)),
    ('sources', [OrderedDict((k, s[k]) for k in ('id', 'title', 'url', 'accessed'))
                 for s in STD_MAPS['sources']]),
])

# dedup items (identical grade+text+options collapse; provenance of first kept)
dedup = OrderedDict()
dropped = 0
for it in ITEMS:
    key = (it['grade'], it['text'], tuple(it['options']))
    if key in dedup:
        dropped += 1
        continue
    dedup[key] = it
ITEMS = list(dedup.values())

items_doc = OrderedDict()
items_doc['schema'] = 'item_bank/v1'
items_doc['generated_by'] = 'tools/build_engine_data.py'
items_doc['derivation'] = ('verbatim from data/content.json weekly tests, quizzes, lesson '
                           'practice, bank-mode generator items[], and assessment.bank; '
                           'parametric generator configs are NOT frozen (unbounded variant '
                           'stream) but each of their skills has a skill_tree node')
items_doc['level_rule'] = ('quiz=1, lesson practice/bank-mode gen=1, weekly test=2, '
                           'assessment.bank from irt.b bands (-inf,-.6]=1,(-.6,-.2]=2,'
                           '(-.2,.2]=3,(.2,inf)=4')
items_doc['exposure_limit'] = 3
items_doc['items'] = ITEMS

with open(OUT_TREE, 'w') as f:
    json.dump(tree, f, indent=1, ensure_ascii=False)
    f.write('\n')
with open(OUT_ITEMS, 'w') as f:
    json.dump(items_doc, f, indent=1, ensure_ascii=False)
    f.write('\n')

# ------------------------------- report -------------------------------------
from collections import Counter
ALL_GRADES = ['preschool', '3', '5'] + NEW_GRADES
print('skill_tree.json: %d nodes (%s)' % (
    len(NODES), ', '.join('%s=%d' % (g, sum(1 for n in NODES if n['grade'] == g))
                          for g in ALL_GRADES)))
print('items.json: %d items (%d duplicates dropped)' % (len(ITEMS), dropped))
for g in ALL_GRADES:
    dom = Counter(i['cat_domain'] for i in ITEMS if i['grade'] == g)
    print('  grade %-9s math=%-3d ela=%-3d non-CAT=%d%s' % (
        g, dom.get('math', 0), dom.get('ela', 0),
        sum(v for k, v in dom.items() if k is None),
        '   (no content yet — tree only)' if g in NEW_GRADES else ''))
src = Counter(i['provenance'].split(':')[0] for i in ITEMS)
print('  provenance:', dict(src))
