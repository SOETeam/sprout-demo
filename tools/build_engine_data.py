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

STATUTORY = list(C['statutory'])  # 9 MCL 380.1561(3)(f) subjects
SUBJ_TO_STATUTORY = {
    'math': 'mathematics', 'ela': 'english_grammar', 'reading': 'reading',
    'spelling': 'spelling', 'science': 'science', 'history': 'history',
    'civics': 'civics', 'literature': 'literature', 'writing': 'writing',
    'english_grammar': 'english_grammar', 'coding': None,  # enrichment
}
CAT_DOMAIN = {  # content subject -> CAT domain (content.assessment.domains = [math, ela])
    'math': 'math', 'reading': 'ela', 'spelling': 'ela', 'writing': 'ela',
    'english_grammar': 'ela', 'literature': 'ela',
    'science': None, 'history': None, 'civics': None, 'coding': None,
}

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
tree['grade_subjects'] = OrderedDict((g, GRADE_SUBJECTS[g]) for g in ['preschool', '3', '5'])
tree['grades'] = OrderedDict()
for g in ['preschool', '3', '5']:
    gnodes = [n for n in NODES if n['grade'] == g]
    tree['grades'][g] = OrderedDict([
        ('grade_band', g),
        ('label', C['grades'][g]['label']),
        ('nodes', [OrderedDict([
            ('id', n['id']), ('grade', n['grade']), ('subject', n['subject']),
            ('statutory', SUBJ_TO_STATUTORY[n['subject']]), ('kind', n['kind']),
            ('label', n['label']), ('parent', n['parent']), ('prereqs', n['prereqs']),
            ('standards', n['standards']), ('unit_wk', n['unit_wk']), ('priority', n['priority']),
        ]) for n in gnodes]),
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
print('skill_tree.json: %d nodes (%s)' % (
    len(NODES), ', '.join('%s=%d' % (g, sum(1 for n in NODES if n['grade'] == g))
                          for g in ['preschool', '3', '5'])))
print('items.json: %d items (%d duplicates dropped)' % (len(ITEMS), dropped))
for g in ['preschool', '3', '5']:
    dom = Counter(i['cat_domain'] for i in ITEMS if i['grade'] == g)
    print('  grade %-9s math=%-3d ela=%-3d non-CAT=%d' % (
        g, dom.get('math', 0), dom.get('ela', 0),
        sum(v for k, v in dom.items() if k is None)))
src = Counter(i['provenance'].split(':')[0] for i in ITEMS)
print('  provenance:', dict(src))
