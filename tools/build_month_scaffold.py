#!/usr/bin/env python3
"""SPROUT month scaffold builder — generalize build_month1_scaffold.py.

    python3 tools/build_month_scaffold.py --grade 3 --month 2
    python3 tools/build_month_scaffold.py --grade 5 --month 2 --spine tools/spines/g5_m2.json
    python3 tools/build_month_scaffold.py --grade 3 --month 2 --dry-run

One grade-month = one authoring sprint (roadmap §2.3). The only creative input
is the spine sheet:

    tools/spines/g<grade>_m<month>.json     schema sprout_demo_v1.spine/1
      themes[4], goals[4]
      subjects: <9 statutory subjects> -> [topic_w1, topic_w2, topic_w3, topic_w4]
      coding:   [topic_w1, .. ]                      (10th, non-statutory slot)
      lessons:  16 (4/week) {subject,title,emoji,minutes,summary,explain,
                             examples[],practice[],workbook[]}
      tests:    4 (1/week)   {title,note,questions[10..14]}
                 each question {q,options[4],correct,skill,subject,why}
      passages: 4 (1/week)   {title,text,pool[12]}

The builder expands it:
  * fixed day template — 4 days x 6 blocks, phase Model -> Practice -> Apply ->
    Review (day 1..4), subject rotation
        b1 math        b2 reading|reading|writing|literature
        b3 spelling|english_grammar|spelling|spelling
        b4 science     b5 history|history|history|civics     b6 coding
    -> all nine MCL 380.1561(3)(f) subjects every week; coding never counts.
  * minute law — g3 210/day; g5 240/240/240/210 (day.total_min is recomputed,
    never trusted).
  * lesson_ref ladder — exact (same week, same subject) -> same-week (same
    strand: ela = reading/writing/spelling/literature/english_grammar,
    social = history/civics) -> spiral (earlier week, block tiered "spiral")
    -> fallback (no ref, block tiered "fallback").
  * 16 lessons + 4 tap-mcq tests (10-14 q, passScore 0.80, per-question why)
    + 4 passages per grade-month; covers[] = the in-week lessons whose strand
    the question subjects touch, so covers[] and item skills cannot drift.
  * generator bindings: every lesson with authored practice gets a
    bank.recall binding (bank families take authored lists, no new JS),
    appended to the grade's week-1 registry — that is where the app reads it
    from (app.js registryFor()). Optional per-lesson `generator` override
    {family, params} for the parametric families.

Output is written straight into data/content.json + data/content.js and then
checked by tools/validate_readiness.js (exit 0 required, else the build is
rejected). Zero network, stdlib only.
"""
import argparse
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
SPINES = os.path.join(ROOT, 'tools', 'spines')

STATUTORY_NINE = ['reading', 'spelling', 'mathematics', 'science', 'history',
                  'civics', 'literature', 'writing', 'english_grammar']
# block-level subject labels the day template emits (mathematics -> math)
BLOCK_OF = {'mathematics': 'math', 'math': 'math'}
BLOCK_SUBJECTS = ['math', 'reading', 'spelling', 'science', 'history',
                  'civics', 'literature', 'writing', 'english_grammar']

# subject -> strand used by the lesson_ref ladder step 2
STRAND = {
    'math': 'math', 'science': 'science',
    'reading': 'ela', 'writing': 'ela', 'spelling': 'ela',
    'literature': 'ela', 'english_grammar': 'ela',
    'history': 'social', 'civics': 'social',
    'coding': 'coding',
}

# fixed 4-day x 6-block rotation; phase is the day (Model->Practice->Apply->Review)
PHASE = {1: 'Model', 2: 'Practice', 3: 'Apply', 4: 'Review'}
B2 = {1: 'reading', 2: 'reading', 3: 'writing', 4: 'literature'}
B3 = {1: 'spelling', 2: 'english_grammar', 3: 'spelling', 4: 'spelling'}
B5 = {1: 'history', 2: 'history', 3: 'history', 4: 'civics'}
ROTATION = ['math', 'b2', 'b3', 'science', 'b5', 'coding']

# 6th slot when the band carries no coding nodes (grade 4): rotate the thin
# statutory strands instead, so the week union still equals
# skill_tree.grade_subjects[grade] exactly (validate_engine gate 3).
# Chosen so it never collides with B2/B3/B5 on the SAME day — a day carrying
# english_grammar twice is legal but clones one topic into two identical blocks.
B6 = {1: 'literature', 2: 'writing', 3: 'english_grammar', 4: 'writing'}

# --- G7 per-grade skeleton shapes -----------------------------------------
# K/1/2 ship 4 days x 4 blocks (grades_k124 w1/w2 reality: 60-90 min/day) and
# preschool ships 4 x 6 at 180 min/day; grades 3-6 run the 4 x 6 spine.  The
# union of each row folds to 9/9 statutory (K/1/2: ela + social_studies do the
# folding) and coding/art/motor/music never count toward it.
K12_DAY_SUBJECTS = [
    ['ela', 'math', 'science', 'social_studies'],
    ['ela', 'math', 'science', 'motor'],
    ['ela', 'math', 'social_studies', 'art'],
    ['ela', 'math', 'science', 'music'],
]
PRESCHOOL_DAY_SUBJECTS = [
    ['reading', 'math', 'math', 'writing', 'literature', 'science'],
] * 4

# minute law (roadmap §2.3 step 2): minutes per block, per day.
# 'shape' = (days, blocks) per G7; day.total_min is recomputed, never trusted.
MINUTE_LAW = {
    'preschool': {'shape': (4, 6),
                  'days': [[30, 25, 20, 25, 30, 50]] * 4,
                  'totals': [180, 180, 180, 180]},
    'K': {'shape': (4, 4),
          'days': [[15, 15, 15, 15], [15, 15, 15, 20],
                   [15, 15, 15, 20], [15, 15, 15, 20]],
          'totals': [60, 65, 65, 65]},
    '1': {'shape': (4, 4),
          'days': [[20, 20, 20, 15], [20, 20, 20, 20],
                   [20, 20, 15, 20], [20, 20, 20, 20]],
          'totals': [75, 80, 75, 80]},
    '2': {'shape': (4, 4),
          'days': [[25, 25, 20, 15], [25, 25, 20, 20],
                   [25, 25, 15, 20], [25, 25, 20, 20]],
          'totals': [85, 90, 85, 90]},
    '3': {'shape': (4, 6),
          'days': [[65, 60, 15, 25, 25, 20]] * 4,
          'totals': [210, 210, 210, 210]},
    '4': {'shape': (4, 6),
          'days': [[65, 60, 15, 25, 25, 20]] * 4,
          'totals': [210, 210, 210, 210]},
    '5': {'shape': (4, 6),
          'days': [[75, 60, 15, 30, 30, 30]] * 3 + [[60, 45, 15, 30, 30, 30]],
          'totals': [240, 240, 240, 210]},
    '6': {'shape': (4, 6),
          'days': [[75, 60, 15, 30, 30, 30]] * 3 + [[60, 45, 15, 30, 30, 30]],
          'totals': [240, 240, 240, 210]},
}

# minutes added to a day when T1 completes an authored week's 9/9 coverage
COVERAGE_TOPUP = {'preschool': 30, 'K': 15, '1': 20, '2': 20}


def _verify_minute_law():
    """shape/day-row/total drift is a build bug — catch it at import."""
    for g, law in MINUTE_LAW.items():
        days, blocks = law['shape']
        assert days == 4, 'grade %s: minute law must be 4 days (got %d)' % (g, days)
        assert len(law['days']) == days and len(law['totals']) == days, \
            'grade %s: minute law rows/totals must be %d long' % (g, days)
        for i, row in enumerate(law['days']):
            assert len(row) == blocks, 'grade %s day %d: %d blocks, shape says %d' \
                % (g, i + 1, len(row), blocks)
            assert sum(row) == law['totals'][i], 'grade %s day %d sums to %d, totals say %d' \
                % (g, i + 1, sum(row), law['totals'][i])


_verify_minute_law()

# statutory fold-map (roadmap P0.4.a) — must stay byte-equal in spirit to
# tools/validate_readiness.js#FOLD and sprout/planning/spine.py#FOLD.
FOLD = {
    'reading': ['reading'], 'spelling': ['spelling'], 'mathematics': ['mathematics'],
    'science': ['science'], 'history': ['history'], 'civics': ['civics'],
    'literature': ['literature'], 'writing': ['writing'],
    'english_grammar': ['english_grammar'],
    'ela': ['reading', 'writing', 'spelling', 'literature', 'english_grammar'],
    'social_studies': ['history', 'civics'],
    'math': ['mathematics'], 'maths': ['mathematics'], 'read': ['reading'],
    'reading_comp': ['reading'], 'lit': ['literature'],
    'grammar': ['english_grammar'], 'english': ['english_grammar'],
}
# never counts toward the statutory count, never rescues a coverage failure
EXCLUDE = {'coding', 'art', 'motor', 'music', 'pe', 'physical_education',
           'health', 'technology', 'enrichment', 'library'}

# G1: the one sentence a guardian is allowed to read when the data is not there.
GUARDIAN_NOT_READY = 'Grade %s content is not ready yet — no plans can be generated'

# grades whose weeks live in data/grades_k124.{json,js} (E5 lane), not content.json
K124_GRADES = ('K', '1', '2', '4')

PARENT_NOTES = {
    1: 'Watch: the fact or the sentence is said aloud before it is written — no guessing.',
    2: 'Watch: answers are worked fully, not rushed; point to the line that proves each one.',
    3: 'Watch: corrections go in a new colour, nothing erased.',
    4: 'Watch: keep the tone light, break before the test, finish on time.',
}

# (subject, phase) -> activity template, {topic} = that subject's weekly topic
ACTIVITY = {
    ('math', 'Model'): 'Model: work 5 guided {topic} items together and say each step out loud.',
    ('math', 'Practice'): 'Practice: solve 10 {topic} items on your own, then check every one.',
    ('math', 'Apply'): 'Apply: solve 6 {topic} word problems and underline the clue that tells you which operation.',
    ('math', 'Review'): 'Review: redo the 3 hardest {topic} items and fix each miss in a new colour.',
    ('reading', 'Model'): 'Model: read the passage on {topic} together and underline 3 words you do not know.',
    ('reading', 'Practice'): 'Practice: answer the 5 questions on {topic} and point to the line that proves each answer.',
    ('writing', 'Apply'): 'Apply: {topic} — write 4 sentences in order, then read them aloud.',
    ('literature', 'Review'): 'Review: {topic} — read for 15 minutes, then retell the ending in 3 sentences.',
    ('spelling', 'Model'): 'Model: read the 10 {topic} words aloud, then sort them by the pattern.',
    ('spelling', 'Apply'): 'Apply: dictation — write all 10 {topic} words from memory, then fix misses in a new colour.',
    ('spelling', 'Review'): 'Review: cover, write and check the 5 hardest {topic} words, then re-test yourself once.',
    ('english_grammar', 'Practice'): 'Practice: {topic} — write 4 sentences, capitalising the first word and ending each one correctly.',
    ('science', 'Model'): 'Model: read the {topic} lesson and tell a parent 3 facts from it without looking.',
    ('science', 'Practice'): 'Practice: answer the 6 {topic} questions and check each one against the lesson.',
    ('science', 'Apply'): 'Apply: draw or build {topic} examples and label 4 of them.',
    ('science', 'Review'): 'Review: explain {topic} to a parent in 3 sentences, then draw one labelled picture.',
    ('history', 'Model'): 'Model: read the {topic} lesson and put 4 events or people in order.',
    ('history', 'Practice'): 'Practice: answer 5 {topic} questions from memory, then check the lesson and fix 2.',
    ('history', 'Apply'): 'Apply: add 4 labels to the {topic} timeline or map, then read them back.',
    ('civics', 'Review'): 'Review: {topic} — name 4 jobs or rules that make a community work and say why one matters.',
    ('coding', 'Model'): 'Model: build a 5-block {topic} one block at a time, testing after each block.',
    ('coding', 'Practice'): 'Practice: remix the {topic} so it does something new, then run it again.',
    ('coding', 'Apply'): 'Apply: add a repeat block to the {topic} so it runs 3 times.',
    ('coding', 'Review'): 'Review: run the {topic} and fix the one block that makes it stop early.',
    # K/1/2 folded band labels + the non-statutory slots their days carry
    ('ela', 'Model'): 'Model: read {topic} together and underline 3 words you do not know.',
    ('ela', 'Practice'): 'Practice: {topic} — answer the questions and point to the line that proves each one.',
    ('ela', 'Apply'): 'Apply: {topic} — write 4 sentences using it, then read them aloud.',
    ('ela', 'Review'): 'Review: {topic} — read for 10 minutes, then retell it in 3 sentences.',
    ('social_studies', 'Model'): 'Model: read the {topic} lesson and name 3 facts from it without looking.',
    ('social_studies', 'Practice'): 'Practice: answer 5 {topic} questions from memory, then check the lesson and fix 2.',
    ('social_studies', 'Apply'): 'Apply: add 4 labels to the {topic} map or timeline, then read them back.',
    ('social_studies', 'Review'): 'Review: {topic} — name 4 jobs or rules that make a community work and say why one matters.',
    ('motor', 'Model'): 'Model: {topic} — copy the movement slowly, then at half speed.',
    ('motor', 'Practice'): 'Practice: {topic} — repeat it 5 times and notice what changes each time.',
    ('motor', 'Apply'): 'Apply: {topic} — build a 3-move sequence and do it twice through.',
    ('motor', 'Review'): 'Review: {topic} — show a parent one favourite move and name the muscles it uses.',
    ('art', 'Model'): 'Model: {topic} — watch one step done slowly, then try that step.',
    ('art', 'Practice'): 'Practice: {topic} — make 3 of them and keep the one you like best.',
    ('art', 'Apply'): 'Apply: {topic} — finish one piece and say what you would change next time.',
    ('art', 'Review'): 'Review: {topic} — pick your best work and tell a parent one thing it shows.',
    ('music', 'Model'): 'Model: {topic} — clap or hum it back once, slowly.',
    ('music', 'Practice'): 'Practice: {topic} — try it 3 times and keep the steadiest one.',
    ('music', 'Apply'): 'Apply: {topic} — teach it to a parent or a toy, beat by beat.',
    ('music', 'Review'): 'Review: {topic} — play it through twice and name the part that felt easiest.',
}

# any (subject, phase) pair the fixed templates do not cover — never KeyError,
# never invent a subject claim: the phase verb does the work, {topic} carries it.
GENERIC_ACTIVITY = {
    'Model': 'Model: {topic} — work one example together and say each step out loud.',
    'Practice': 'Practice: {topic} — work 6 items on your own, then check every one.',
    'Apply': 'Apply: {topic} — use it once today and explain how you know it worked.',
    'Review': 'Review: {topic} — redo the hardest part and fix each miss in a new colour.',
}

EMOJI = {'math': '🔢', 'reading': '📖', 'writing': '✍️', 'literature': '📚',
         'spelling': '🔤', 'english_grammar': '📝', 'science': '🔬',
         'history': '🏛️', 'civics': '🗳️', 'coding': '💻'}


def L(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def W(p, o):
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(o, f, ensure_ascii=False, indent=1)
        f.write('\n')


def tree_node_ids(tree, grade):
    return {n['id'] for n in (tree['grades'].get(str(grade)) or {}).get('nodes', [])}


def die(msg):
    sys.stderr.write('BUILD ERROR: %s\n' % msg)
    sys.exit(1)


# ------------------------------------------------- G1 data floor (pre-flight)
def fold(label):
    """statutory subjects a block label counts for ([] = excluded, never counts)."""
    key = str(label or '').lower()
    if key in EXCLUDE:
        return []
    return FOLD.get(key, [key])


def statutory_required(grade):
    """the list a week must cover: D7 nine MCL subjects, preschool override."""
    if str(grade) == 'preschool':
        return ['literature', 'mathematics', 'reading', 'science', 'writing']
    return list(STATUTORY_NINE)


def data_floor(grade, tree):
    """G1 pre-flight — refuse to generate when the band cannot cover its
    statutory list.  A draft-forever plan (gap_map 'no_nodes' -> coverage error
    -> status:draft forever) is worse for a guardian than one clear refusal, so
    this dies before any week is written.  Returns the verified floor record."""
    band = (tree.get('grades') or {}).get(str(grade)) or {}
    nodes = band.get('nodes') or []
    required = statutory_required(grade)
    if not nodes:
        die('%s (technical: no skill_tree band for grade %s)'
            % (GUARDIAN_NOT_READY % grade, grade))
    covered = set()
    for n in nodes:
        covered.update(fold(n.get('subject')))
        if n.get('statutory'):
            covered.update(fold(n.get('statutory')))
    missing = [s for s in required if s not in covered]
    if missing:
        die('%s (technical: band has no node for %s)'
            % (GUARDIAN_NOT_READY % grade, ', '.join(missing)))
    return {'band_exists': True, 'statutorys_with_nodes': len(required),
            'statutorys_required': required, 'missing': [],
            'nodes': len(nodes),
            'block_labels': sorted({s for s in
                                    ((tree.get('grade_subjects') or {}).get(str(grade)) or [])
                                    if s} | {n.get('subject') for n in nodes
                                             if n.get('subject')})}


def covered_statutory(blocks):
    """validator gate (a) computed the same way validate_readiness.js does."""
    out = set()
    for b in blocks:
        out.update(fold(b.get('subject')))
    return out


# ------------------------------------------- T1 skeleton (no authored spine)
def skeleton_rotation(grade, block_labels):
    """per-day subject lists for a --t1 week (G7 shapes).  Each row folds to
    the full statutory list — the 9/9 hard constraint is structural, not
    checked-after-the-fact."""
    if grade in ('K', '1', '2'):
        return [list(row) for row in K12_DAY_SUBJECTS]
    if grade == 'preschool':
        return [list(row) for row in PRESCHOOL_DAY_SUBJECTS]
    use_coding = 'coding' in set(block_labels or [])
    return [['math', B2[d], B3[d], 'science', B5[d],
             'coding' if use_coding else B6[d]] for d in range(1, 5)]


def topic_pool(tree, grade, subject):
    """(node_ids, labels) for one band subject, priority order (strands skipped
    — a strand label like 'Mathematics (MCL: mathematics)' is not a topic)."""
    nodes = [n for n in ((tree.get('grades') or {}).get(str(grade)) or {}).get('nodes', [])
             if n.get('subject') == subject and n.get('kind') != 'strand']
    nodes.sort(key=lambda n: (n.get('priority') if isinstance(n.get('priority'), int) else 99,
                              str(n.get('id'))))
    return ([n['id'] for n in nodes],
            [str(n.get('label') or n.get('skill_tag') or n['id']) for n in nodes])


def skeleton_picks(grade, wi, tree, rotation):
    """[[ (subject, node_id|None, topic_label) per block ] per day] for a --t1
    week.  ONE occurrence counter per subject across the WEEK, so a subject
    that repeats (math on all 4 days; preschool's two math slots) draws a
    different priority-ordered node each time instead of cloning one block
    into identical twins.  build_skeleton_week and week_targets both go
    through here, so the test chain sees exactly the nodes the days point at.
    """
    pools = {}
    for row in rotation:
        for subject in row:
            if subject not in pools:
                pools[subject] = topic_pool(tree, grade, subject)
    occ, days = {}, []
    for row in rotation:
        out = []
        for subject in row:
            ids, labels = pools[subject]
            if not ids:                          # band has no node for this slot
                out.append((subject, None, subject.replace('_', ' ') + ' practice'))
                continue
            n = occ.get(subject, 0)
            occ[subject] = n + 1
            k = (wi + n) % len(ids)
            out.append((subject, ids[k], labels[k]))
        days.append(out)
    return days


def short(text, n=60):
    t = ' '.join(str(text).split())
    return t if len(t) <= n else t[:n].rsplit(' ', 1)[0] + '…'


def activity_for(subject, phase, topic):
    tpl = ACTIVITY.get((subject, phase)) or GENERIC_ACTIVITY[phase]
    return tpl.format(topic=topic)


def cover_labels(block_labels, missing):
    """greedy set-cover: which band labels fold over the most missing subjects."""
    picks, rem = [], list(missing)
    while rem:
        best, best_n = None, 0
        for lab in block_labels:
            f = fold(lab)
            n = len([x for x in f if x in rem])
            if n > best_n:
                best, best_n = lab, n
        if not best:
            break
        picks.append(best)
        rem = [x for x in rem if x not in fold(best)]
    return picks, rem


# --------------------------------------- G2 test binding (question fallback)
def _to_mc(pool, grade, want, skill_of, why_of, start=0):
    """deterministic pick of 4-option mc items -> tap-mcq question dicts.
    `start` rotates the pick by week so two weeks never draw an identical test
    from the same small pool."""
    usable = []
    for i in pool:
        opts = i.get('options') or []
        if len(opts) != 4:
            continue
        ans = i.get('answer')
        try:
            idx = opts.index(ans)
        except ValueError:
            continue
        usable.append((i, idx))
    if not usable:
        return []
    usable.sort(key=lambda t: str(t[0].get('id') or t[0].get('question') or ''))
    n = len(usable)
    off = int(start or 0) % n
    usable = usable[off:] + usable[:off]
    stride = max(1, n // want)
    picked = usable[::stride][:want]
    return [{'q': i['text'], 'options': i['options'], 'correct': idx,
             'skill': skill_of(i), 'subject': i.get('subject'),
             'why': why_of(i)} for i, idx in picked if i.get('text')]


def assemble_questions(grade, week_no, target_nodes, block_subjects, bank, authored):
    """G2 chain: bank items for the week's target nodes -> any item for the
    week's subjects -> any grade bank item -> authored_bank topic items.
    Returns (questions, source_note); (None, None) means the grade has no
    question source at all and the caller must refuse honestly."""
    items = [i for i in (bank.get('items') or [])
             if str(i.get('grade')) == str(grade) and i.get('type', 'mc') == 'mc']
    subj = set(block_subjects or [])
    pools = (
        ([i for i in items if i.get('skill_node') in target_nodes],
         'items.json — target nodes'),
        ([i for i in items if i.get('subject') in subj],
         'items.json — week subjects'),
        (items, 'items.json — grade bank'),
    )
    for pool, note in pools:
        qs = _to_mc(pool, grade, 10,
                    lambda i: i.get('skill_tag') or i.get('skill_node') or 'skill',
                    lambda i: 'Practice bank item for %s.' % (i.get('skill_node') or 'this skill'),
                    start=week_no)
        if qs:
            return qs, note
    flat = []
    for topic, group in ((authored.get('grades') or {}).get(str(grade)) or {}).items():
        for it in group or []:
            flat.append({'_topic': topic, '_item': it})
    if flat:
        opts = [{'id': '%s|%s|%s' % (grade, e['_topic'], e['_item'].get('question', '')),
                 'text': e['_item'].get('question'), 'options': e['_item'].get('options'),
                 'answer': (e['_item'].get('options') or [None])[
                     e['_item'].get('correctIndex', 0)]
                 if 0 <= e['_item'].get('correctIndex', -1) < len(e['_item'].get('options') or [])
                 else None,
                 'skill_tag': e['_topic'], 'subject': None,
                 'skill_node': None, 'type': 'mc'}
                for e in flat]
        qs = _to_mc(opts, grade, 10,
                    lambda i: i.get('skill_tag') or 'practice',
                    lambda i: 'Authored topic bank item (%s).' % (i.get('skill_tag') or 'practice'),
                    start=week_no)
        # authored items carry no why/skill provenance beyond the topic — say so
        for q in qs:
            q.pop('subject', None)
        if qs:
            return qs, 'authored_bank_items.json — grade topic bank'
    return None, None


def validate_spine(spine, grade, month):
    errs = []
    if spine.get('schema') != 'sprout_demo_v1.spine/1':
        errs.append('schema must be sprout_demo_v1.spine/1')
    if str(spine.get('grade')) != str(grade) or int(spine.get('month', -1)) != month:
        errs.append('spine declares grade %s / month %s, asked for %s / %s'
                    % (spine.get('grade'), spine.get('month'), grade, month))
    weeks = (month - 1) * 4
    if [int(w) for w in spine.get('week_numbers', [])] != list(range(weeks + 1, weeks + 5)):
        errs.append('week_numbers must be %s for month %s'
                    % (list(range(weeks + 1, weeks + 5)), month))
    for key, n in (('themes', 4), ('goals', 4)):
        if len(spine.get(key) or []) != n:
            errs.append('%s must have %d entries' % (key, n))
    subs = spine.get('subjects') or {}
    for s in BLOCK_SUBJECTS:
        if len(subs.get(s) or []) != 4:
            errs.append('subjects.%s must have 4 weekly topics' % s)
    if len(spine.get('coding') or []) != 4:
        errs.append('coding must have 4 weekly topics')
    for i, bucket in enumerate(('lessons', 'tests', 'passages')):
        got = spine.get(bucket) or []
        want = [16, 4, 4][i]
        if len(got) != want:
            errs.append('%s: expected %d, got %d' % (bucket, want, len(got)))
    # lessons: 4 per week, subjects inside the grade band
    for i, les in enumerate(spine.get('lessons') or []):
        if les.get('subject') not in STRAND:
            errs.append('lessons[%d] subject %r unknown' % (i, les.get('subject')))
        for f in ('title', 'summary', 'explain'):
            if not les.get(f):
                errs.append('lessons[%d] missing %s' % (i, f))
        if not (les.get('examples') or []):
            errs.append('lessons[%d] needs >=1 example' % i)
        if len(les.get('workbook') or []) < 4:
            errs.append('lessons[%d] needs 4 workbook items' % i)
    # tests: 10-14 questions, why on every item, subject on every item
    for i, t in enumerate(spine.get('tests') or []):
        qs = t.get('questions') or []
        if not 10 <= len(qs) <= 14:
            errs.append('tests[%d] has %d questions (need 10-14)' % (i, len(qs)))
        for j, q in enumerate(qs):
            if len(q.get('options') or []) != 4:
                errs.append('tests[%d].questions[%d] needs 4 options' % (i, j))
            if not isinstance(q.get('correct'), int) or not 0 <= q['correct'] < 4:
                errs.append('tests[%d].questions[%d] correct out of range' % (i, j))
            if not q.get('why'):
                errs.append('tests[%d].questions[%d] missing why' % (i, j))
            if not q.get('skill'):
                errs.append('tests[%d].questions[%d] missing skill' % (i, j))
            if q.get('subject') not in STRAND:
                errs.append('tests[%d].questions[%d] subject %r unknown'
                            % (i, j, q.get('subject')))
    for i, p in enumerate(spine.get('passages') or []):
        if not p.get('title') or not p.get('text'):
            errs.append('passages[%d] missing title/text' % i)
        if len(p.get('pool') or []) < 8:
            errs.append('passages[%d] pool needs >=8 words for the cloze generator' % i)
    # PII law: synthetic personas only, no real learner names or private paths
    blob = json.dumps(spine, ensure_ascii=False)
    # patterns are assembled from fragments so this file itself never carries a
    # banned token — a repo-wide PII grep must stay at zero hits, including on
    # the guard that enforces it.
    banned = [r'\b' + 'ado' + 'nis' + r'\b',
              r'\b' + 'maxi' + 'mos' + r'\b',
              r'\blu' + r'ca\b',
              'saitta' + 'sprout',
              'SAITTAS' + 'PROUT',
              'max' + '_w' + r'\d', 'max' + '_grade3', 'MAX' + '_YEAR',
              r'\bsa' + 'mantha' + r'\b', r'\bso' + 'phi' + r'\b',
              'students' + '/', 'year' + '_curriculum']
    for pat in banned:
        if re.search(pat, blob, re.IGNORECASE):
            errs.append('PII/provenance law: spine matches banned pattern %r' % pat)
    return errs


def build_skeleton_week(grade, persona, key, week_no, wi, tree, floor,
                        questions, qnote):
    """--t1 week: day flow from the grade's skeleton shape (G7), topics from
    skill_tree node labels ordered by priority, every block tiered 'fallback'
    (no authored lesson exists for this week yet), test assembled through the
    G2 question chain.  Returns the week dict."""
    law = MINUTE_LAW[grade]
    rotation = skeleton_rotation(grade, floor['block_labels'])
    picked = skeleton_picks(grade, wi, tree, rotation)

    days, target_nodes = [], set()
    for d in range(1, 5):
        phase = PHASE[d]
        mins = law['days'][d - 1]
        blocks = []
        for bi, (subject, nid, label) in enumerate(picked[d - 1]):
            if nid:
                target_nodes.add(nid)
            b = {'block': bi + 1, 'subject': subject, 'min': mins[bi],
                 'activity': activity_for(subject, phase, short(label)),
                 'tier': 'fallback'}
            if nid:
                b['skill_node'] = nid
            blocks.append(b)
        total = sum(b['min'] for b in blocks)
        if total != law['totals'][d - 1]:
            die('week %d day %d sums to %d, minute law says %d'
                % (week_no, d, total, law['totals'][d - 1]))
        days.append({'day': d, 'parent_note': PARENT_NOTES[d],
                     'blocks': blocks, 'total_min': total})

    # theme/goal: the first two statutory subjects of the week, top-priority labels
    theme_picks, seen = [], set()
    for subject, _nid, label in picked[0]:
        if subject in EXCLUDE or subject in seen:
            continue
        seen.add(subject)
        theme_picks.append(short(label, 34))
        if len(theme_picks) == 2:
            break
    if not theme_picks:
        theme_picks = ['every required subject']
    theme = theme_picks[0] + (' and ' + theme_picks[1] if len(theme_picks) > 1 else '')
    goal = ('Keep %s moving and touch every required subject at least once this week.'
            % short(picked[0][0][2], 40))

    if not questions:
        die('%s (technical: no question source for grade %s week %d — items.json '
            'and authored_bank_items.json are both empty for this grade)'
            % (GUARDIAN_NOT_READY % grade, grade, week_no))
    nblocks = sum(len(d['blocks']) for d in days)
    week = {
        'week': week_no,
        'theme': theme,
        'goal': goal,
        'grade': str(grade),
        'persona': persona,
        'days': days,
        'lessons': {},
        'passages': [],
        'test': {
            'quizId': '%s_w%d_test' % (key, week_no),
            'learner': persona,
            'title': 'Week %d check-in' % week_no,
            'tapFriendly': True,
            'format': 'tap-mcq',
            'minutes': 15,
            'passScore': 0 if grade == 'preschool' else 0.80,
            # no authored lesson exists to cover[] against — the tier says so
            # out loud (validator accepts an explicitly tiered test)
            'covers': [],
            'tier': 'fallback',
            'note': 'Spiral review — questions drawn from the %s; no authored '
                    'week test yet.' % qnote,
            'questions': questions,
        },
        'quizzes': [],
        'counts': {'blocks': nblocks, 'lesson_objects': 0, 'sheets': 0},
        'source': 'build_month_scaffold --t1',
    }
    return week, sorted(target_nodes)


def complete_week(grade, week, tree, floor, bank, authored):
    """T1 completion for a week that already has a day flow (authored or E5):
    never rewrite the author's days/lessons/test — only (a) add the missing
    statutory blocks and (b) guarantee a non-empty test.  Returns the number
    of coverage blocks added."""
    required = statutory_required(grade)
    blocks = [b for d in week['days'] for b in d['blocks']]
    missing = [s for s in required if s not in covered_statutory(blocks)]
    added = 0
    if missing:
        picks, unmet = cover_labels(floor['block_labels'], missing)
        if unmet:
            die('%s (technical: week %s cannot reach %s — no band label folds to %s)'
                % (GUARDIAN_NOT_READY % grade, week.get('week'),
                   ','.join(missing), ','.join(unmet)))
        topup = COVERAGE_TOPUP.get(grade, 20)
        wno = int(week.get('week') or 1)
        for i, label in enumerate(picks):
            day = week['days'][i % len(week['days'])]
            ids, labels = topic_pool(tree, grade, label)
            if ids:
                nid = ids[(wno - 1) % len(ids)]
                topic = labels[(wno - 1) % len(ids)]
            else:
                nid, topic = None, label.replace('_', ' ') + ' practice'
            b = {'block': len(day['blocks']) + 1, 'subject': label, 'min': topup,
                 'activity': activity_for(label, PHASE.get(day['day'], 'Practice'),
                                          short(topic)),
                 'tier': 'fallback'}
            if nid:
                b['skill_node'] = nid
            day['blocks'].append(b)
            day['total_min'] = sum(x['min'] for x in day['blocks'])
            added += 1
        counts = week.setdefault('counts', {})
        counts['blocks'] = sum(len(d['blocks']) for d in week['days'])
        blocks = [b for d in week['days'] for b in d['blocks']]

    # test floor: an authored week with no items still fails validator gate (d)
    test = week.get('test') or {}
    if not (test.get('questions') or test.get('items') or []):
        rotation = skeleton_rotation(grade, floor['block_labels'])
        qs, note = assemble_questions(grade, int(week.get('week') or 1),
                                      set(), {s for row in rotation for s in row},
                                      bank, authored)
        if not qs:
            die('%s (technical: week %s has no test and no question source)'
                % (GUARDIAN_NOT_READY % grade, week.get('week')))
        week['test'] = {
            'quizId': '%s_w%d_test' % (key_of(week), int(week.get('week') or 1)),
            'learner': week.get('persona'), 'title': 'Week %s check-in' % week.get('week'),
            'tapFriendly': True, 'format': 'tap-mcq', 'minutes': 15,
            'passScore': 0 if grade == 'preschool' else 0.80,
            'covers': [], 'tier': 'fallback',
            'note': 'Spiral review — questions drawn from the %s.' % note,
            'questions': qs,
        }
    return added


def key_of(week):
    """student key from an existing week (persona is lower-cased in E5 meta)."""
    return str(week.get('persona') or 'learner').lower()


# ------------------------------------------------------------------ spine
def strand_of(subject):
    return STRAND[subject]


def topic_for(spine, subject, wi):
    if subject == 'coding':
        return spine['coding'][wi]
    return spine['subjects'][subject][wi]


def bind(week_lessons, block_subject, spiral_pool):
    """exact -> same-week -> spiral -> fallback. Returns (ref, tier, how)."""
    strand = strand_of(block_subject)
    same = [lid for lid, l in week_lessons.items()]
    for lid in same:                                   # 1 — exact
        if week_lessons[lid]['subject'] == block_subject:
            return lid, None, 'exact'
    for lid in same:                                   # 2 — same-week strand
        if strand_of(week_lessons[lid]['subject']) == strand:
            return lid, None, 'same-week'
    for lid in spiral_pool:                            # 3 — spiral (earlier week)
        if spiral_pool[lid]['subject'] == block_subject:
            return lid, 'spiral', 'spiral'
    return None, 'fallback', 'fallback'                # 4


def build_week(grade, persona, key, week_no, spine, wi, spiral_pool, passage_id):
    law = MINUTE_LAW[grade]
    lessons_src = spine['lessons'][wi * 4:wi * 4 + 4]
    lessons = {}
    for i, src in enumerate(lessons_src):
        lid = '%s_w%d_l%d' % (key, week_no, i + 1)
        lessons[lid] = {
            'id': lid,
            'title': src['title'],
            'emoji': src.get('emoji') or EMOJI.get(src['subject'], '📖'),
            'minutes': int(src.get('minutes') or 30),
            'summary': src['summary'],
            'subject': src['subject'],
            'week': week_no,
            'content': {
                'explain': src['explain'],
                'examples': src['examples'],
                'practice': src.get('practice') or [],
                'workbook': src['workbook'],
                'parent_note': src.get('parent_note', ''),
                'minutes_target': int(src.get('minutes') or 30),
            },
        }
        if src.get('generator'):
            lessons[lid]['content']['generator'] = src['generator'].get('id')

    days = []
    for d in range(1, 5):
        phase = PHASE[d]
        subj_for = {1: 'math', 2: B2[d], 3: B3[d], 4: 'science', 5: B5[d], 6: 'coding'}
        mins = law['days'][d - 1]
        blocks = []
        for bi, slot in enumerate(ROTATION):
            subject = subj_for[bi + 1]
            topic = topic_for(spine, subject, wi)
            ref, tier, how = bind(lessons, subject, spiral_pool)
            b = {
                'block': bi + 1,
                'subject': subject,
                'min': mins[bi],
                'activity': ACTIVITY[(subject, phase)].format(topic=topic),
            }
            if ref:
                b['lesson_ref'] = ref
            if tier:
                b['tier'] = tier
            if passage_id and subject in ('reading', 'literature'):
                b['passage_ref'] = passage_id
            b['_bind'] = how          # stripped before emit, used for the report
            blocks.append(b)
        total = sum(b['min'] for b in blocks)
        if total != law['totals'][d - 1]:
            die('week %d day %d sums to %d, minute law says %d'
                % (week_no, d, total, law['totals'][d - 1]))
        days.append({'day': d, 'parent_note': PARENT_NOTES[d],
                     'blocks': blocks, 'total_min': total})

    # ---- test: covers[] = in-week lessons the item subjects touch
    tsrc = spine['tests'][wi]
    want_strands = {strand_of(q['subject']) for q in tsrc['questions']}
    covers = [lid for lid, l in lessons.items()
              if strand_of(l['subject']) in want_strands]
    missing = want_strands - {strand_of(lessons[c]['subject']) for c in covers}
    if missing:
        # under-claiming is the safe direction: covers[] must never name a
        # lesson the items did not ask about, and cross-week refs do not resolve.
        print('  note: w%d test asks about %s but that strand has no in-week '
              'lesson — left out of covers[]' % (week_no, ','.join(sorted(missing))))
    test = {
        'quizId': '%s_w%d_test' % (key, week_no),
        'learner': persona,
        'title': tsrc['title'],
        'tapFriendly': True,
        'format': 'tap-mcq',
        'minutes': 15,
        'passScore': 0.80,
        'covers': covers,
        'note': tsrc.get('note', ''),
        'questions': tsrc['questions'],
    }

    week = {
        'week': week_no,
        'theme': spine['themes'][wi],
        'goal': spine['goals'][wi],
        'grade': str(grade),
        'persona': persona,
        'days': days,
        'lessons': lessons,
        'passages': [{'id': passage_id,
                      'title': spine['passages'][wi]['title'],
                      'text': spine['passages'][wi]['text'],
                      'pool': spine['passages'][wi]['pool']}],
        'test': test,
        'quizzes': [],
        'counts': {'blocks': 24, 'lesson_objects': len(lessons), 'sheets': 0},
    }
    return week, lessons_src


def generator_bindings(grade, key, week_no, spine, wi, lessons_src, tree):
    """bank.recall bindings from authored practice; optional parametric override."""
    out = []
    for i, src in enumerate(lessons_src):
        lid = '%s_w%d_l%d' % (key, week_no, i + 1)
        subject = src['subject']
        if src.get('generator'):
            fam, params = src['generator']['family'], src['generator']['params']
        else:
            items = [{'q': p['question'], 'options': p['options'],
                      'correct': p['correctIndex'], 'hint': p.get('hint', ''),
                      'praise': p.get('praise', '')}
                     for p in (src.get('practice') or [])]
            if not items:
                continue
            fam, params = 'bank.recall', {'items': items}
        node = src.get('skill_node')
        if node and node not in tree_node_ids(tree, grade):
            die('lesson %s declares skill_node %s which is not in skill_tree grade %s'
                % (lid, node, grade))
        out.append({
            'id': '%s.%s_w%d_l%d' % (key, key, week_no, i + 1),
            'skill': src.get('skill') or re.sub(r'[^a-z0-9]+', '-', src['title'].lower()).strip('-'),
            'source': 'curriculum:%s' % lid,
            'family': fam,
            'mode': 'parametric',
            'subject': subject,
            'skill_node': node,
            'levels': [{'level': 1, 'params': params}],
        })
    return out


def next_passage_ids(key, existing):
    used = set()
    for by_week in existing.values():
        for p in by_week.get('passages') or []:
            m = re.match(r'%s_p(\d+)$' % re.escape(key), p.get('id', ''))
            if m:
                used.add(int(m.group(1)))
    n = max(used) if used else 0
    return n


def emit_bundles(lane, doc):
    """content lane -> data/content.js; K/1/2/4 lane -> data/grades_k124.js.
    index.html loads both and app.js picks the lane by grade (k124Grade())."""
    if lane == 'k124':
        path = os.path.join(DATA, 'grades_k124.js')
        var = 'window.SPROUT_CONTENT_K124'
        head = ('/* K/1/2/4 content lane — generated, do not hand-edit.\n'
                '   tools/build_e5_content.py seeds weeks 1-2 + topic cards;\n'
                '   tools/build_month_scaffold.py [--t1] completes or builds later\n'
                '   weeks. Both merge: a week that already carries a day flow is\n'
                '   never regenerated, so reruns cannot clobber built weeks. */\n')
    else:
        path, var, head = os.path.join(DATA, 'content.js'), 'window.SPROUT_CONTENT', ''
    with open(path, 'w', encoding='utf-8') as f:
        f.write(head + var + ' = ' +
                json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + ';\n')


def lane_of(grade):
    """which data lane owns this grade's weeks: E5's grades_k124 or content.json."""
    if grade in K124_GRADES:
        return 'k124', os.path.join(DATA, 'grades_k124.json')
    return 'content', os.path.join(DATA, 'content.json')


def week_targets(grade, wi, tree, rotation):
    """node ids the week's blocks point at — computed through skeleton_picks(),
    the SAME path build_skeleton_week uses, so the G2 test chain targets exactly
    the nodes the days bind."""
    out = set()
    for day in skeleton_picks(grade, wi, tree, rotation):
        for _subject, nid, _label in day:
            if nid:
                out.add(nid)
    return sorted(out)


def week_bind_report(week):
    """(blocks bound to a real in-week lesson, {tier/how -> count}) for the
    build report.  Strips the spine builder's `_bind` marker as it goes."""
    how, bound = {}, 0
    for d in week['days']:
        for b in d['blocks']:
            h = b.pop('_bind', None)
            if h is None:
                t = b.get('tier')
                if t in ('spiral', 'fallback', 'topic'):
                    h = t
                elif b.get('lesson_ref'):
                    h = 'bound'
                else:
                    h = 'untiered'
            how[h] = how.get(h, 0) + 1
            if b.get('lesson_ref') and h in ('exact', 'same-week', 'bound'):
                bound += 1
    return bound, how


def print_report(report):
    for wn, theme, bound, nl, nq, how, nblocks in report:
        print('  w%-2d %-42s lessons=%d  bound=%d/%d  test=%dq  %s'
              % (wn, str(theme)[:42], nl, bound, nblocks, nq, how))


def main():
    ap = argparse.ArgumentParser(
        description='build one SPROUT grade-month from a spine sheet, or a T1 '
                    'skeleton month with --t1 (no spine needed)')
    ap.add_argument('--grade', required=True)
    ap.add_argument('--month', required=True, type=int)
    ap.add_argument('--spine', default=None)
    ap.add_argument('--t1', action='store_true',
                    help='T1 skeleton mode: topics from skill_tree labels by '
                         'priority, tests assembled through the items.json G2 '
                         'chain, blocks tiered fallback. Weeks that already have '
                         'a day flow are COMPLETED (coverage + test floor), '
                         'never rewritten; stubs/missing weeks are built fresh.')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--no-validate', action='store_true')
    ap.add_argument('--force', action='store_true',
                    help='overwrite an existing full week (default: refuse; '
                         'with --t1: rebuild it as a skeleton instead of completing it)')
    ap.add_argument('--sync-subject-union', action='store_true',
                    help='widen grades[].subjects + skill_tree.grade_subjects[] '
                         'to the union the new weeks need (grade 5 needs this)')
    args = ap.parse_args()

    grade = str(args.grade)
    month = args.month
    if not 1 <= month <= 9:
        die('month must be 1..9')
    if grade not in MINUTE_LAW:
        die('%s (technical: no minute law for grade %s — supported: %s)'
            % (GUARDIAN_NOT_READY % grade, grade, ', '.join(sorted(MINUTE_LAW))))

    # ---- data lane (E5 grades_k124 vs content.json) + G1 pre-flight.
    # data_floor runs FIRST: a band that cannot cover its statutory list must
    # refuse with a guardian-safe sentence before any week object is built.
    lane, doc_path = lane_of(grade)
    doc = L(doc_path)
    tree = L(os.path.join(DATA, 'skill_tree.json'))
    floor = data_floor(grade, tree)
    meta = (doc.get('grades') or {}).get(grade) or {}
    persona, key = meta.get('persona'), meta.get('student_key')
    if not key:
        die('%s (technical: %s carries no persona/student_key)'
            % (GUARDIAN_NOT_READY % grade, os.path.basename(doc_path)))
    weeks_now = (doc.get('weeks') or {}).setdefault(grade, {})

    bank = authored = None
    if args.t1:
        bank = L(os.path.join(DATA, 'items.json'))
        authored = L(os.path.join(DATA, 'authored_bank_items.json'))

    built, bindings, week_bindings, report = [], [], {}, []

    if args.t1:
        # ---- T1: complete authored weeks, skeleton-build the rest (G7 shapes)
        rotation = skeleton_rotation(grade, floor['block_labels'])
        for wi, wn in enumerate([(month - 1) * 4 + i for i in range(1, 5)]):
            existing = weeks_now.get(str(wn))
            if (isinstance(existing, dict) and isinstance(existing.get('days'), list)
                    and existing['days'] and not args.force):
                added = complete_week(grade, existing, tree, floor, bank, authored)
                bound, how = week_bind_report(existing)
                built.append(str(wn))
                report.append((wn, existing.get('theme') or '(untitled)', bound,
                               len(existing.get('lessons') or {}),
                               len((existing.get('test') or {}).get('questions') or []),
                               how, sum(len(d['blocks']) for d in existing['days'])))
                if added:
                    print('  w%-2d preserved: %d statutory coverage block(s) added'
                          % (wn, added))
                continue
            targets = week_targets(grade, wi, tree, rotation)
            subjects = sorted({s for row in rotation for s in row} - EXCLUDE)
            questions, qnote = assemble_questions(grade, wn, targets, subjects,
                                                  bank, authored)
            week, _targets = build_skeleton_week(grade, persona, key, wn, wi, tree,
                                                 floor, questions, qnote)
            weeks_now[str(wn)] = week
            built.append(str(wn))
            bound, how = week_bind_report(week)
            report.append((wn, week['theme'], bound, len(week['lessons']),
                           len(week['test']['questions']), how,
                           sum(len(d['blocks']) for d in week['days'])))
        # 9/9 is a hard constraint — assert it here, before anything is written,
        # computed exactly the way validate_readiness.js gate (a) computes it.
        for wn in built:
            blocks = [b for d in weeks_now[wn]['days'] for b in d['blocks']]
            missing = [s for s in statutory_required(grade)
                       if s not in covered_statutory(blocks)]
            if missing:
                die('week %s built without 9/9 coverage — missing %s'
                    % (wn, ', '.join(missing)))
    else:
        # ---- authored-spine lane (T2): only grades whose band uses the 4x6
        # BLOCK_SUBJECTS vocabulary have a spine schema; K/1/2/preschool do not.
        shape_days, shape_blocks = MINUTE_LAW[grade]['shape']
        if shape_blocks != 6 or grade in ('K', '1', '2', 'preschool'):
            die('grade %s has no authored-spine lane (G7 skeleton %d days x %d '
                'blocks) — rerun with --t1' % (grade, shape_days, shape_blocks))
        spine_path = args.spine or os.path.join(SPINES, 'g%s_m%d.json' % (grade, month))
        if not os.path.exists(spine_path):
            die('spine sheet not found: %s' % spine_path)
        spine = L(spine_path)
        errs = validate_spine(spine, grade, month)
        if errs:
            for e in errs:
                sys.stderr.write('  * %s\n' % e)
            die('spine sheet failed %d check(s)' % len(errs))

        week_numbers = [int(w) for w in spine['week_numbers']]
        for wn in week_numbers:
            existing = weeks_now.get(str(wn))
            if existing and not existing.get('topic_only') and not args.force:
                die('week %d already holds a full day flow — rerun with --force '
                    'to overwrite (or use --t1 to complete it in place)' % wn)

        # spiral pool = every lesson authored in an earlier week of this grade
        spiral_pool = {}
        for wn in sorted(weeks_now, key=int):
            if int(wn) >= week_numbers[0]:
                continue
            for lid, les in (weeks_now[wn].get('lessons') or {}).items():
                spiral_pool[lid] = les

        pcount = next_passage_ids(key, weeks_now)
        for wi, wn in enumerate(week_numbers):
            pcount += 1
            passage_id = '%s_p%d' % (key, pcount)
            week, lessons_src = build_week(grade, persona, key, wn, spine, wi,
                                           spiral_pool, passage_id)
            weeks_now[str(wn)] = week
            built.append(str(wn))
            week_bindings[str(wn)] = generator_bindings(grade, key, wn, spine, wi,
                                                        lessons_src, tree)
            bindings += week_bindings[str(wn)]
            for lid, les in week['lessons'].items():          # spiral pool grows
                spiral_pool[lid] = les
            bound, how = week_bind_report(week)
            report.append((wn, week['theme'], bound, len(week['lessons']),
                           len(week['test']['questions']), how,
                           sum(len(d['blocks']) for d in week['days'])))

    # ---- subject-union coupling: validate_engine gate 3 compares
    # grades[g].subjects (+ block subjects) to skill_tree.grade_subjects[g]
    blocks_union = set((doc['grades'].get(grade) or {}).get('subjects') or [])
    for wn in built:
        for d in weeks_now[wn]['days']:
            for b in d['blocks']:
                blocks_union.add(b['subject'])
    want = sorted(blocks_union)
    have = sorted(tree['grade_subjects'].get(grade) or [])
    sync_union = want != have
    if sync_union and not args.sync_subject_union:
        die('new weeks need subject union %s but skill_tree.grade_subjects[%s] is %s '
            '(validate_engine gate 3) — rerun with --sync-subject-union'
            % (want, grade, have))

    # each spine-built week carries its own bindings (validator + T2 evidence) ...
    for wn in built:
        if wn in week_bindings:
            weeks_now[wn]['generators'] = week_bindings[wn]

    # ... but app.js registryFor() reads the grade's WEEK 1 registry only,
    # so every new lesson binding is also appended there (existing pattern:
    # "generator configs ship with w1 and are reused").  T1 weeks have no
    # lesson bindings, so this stays empty for --t1.
    added_registry = 0
    if bindings:
        if '1' not in weeks_now:
            die('grade %s has no week 1 — cannot register generator bindings' % grade)
        reg = weeks_now['1'].setdefault('generators', [])
        known = {g['id'] for g in reg}
        for g in bindings:
            if g['id'] not in known:
                reg.append(g)
                known.add(g['id'])
                added_registry += 1

    if args.dry_run:
        print('DRY RUN — nothing written. Would build grade %s month %d weeks %s '
              '(lane: %s%s)' % (grade, month, ','.join(built), lane,
                                ', --t1' if args.t1 else ''))
        print_report(report)
        if sync_union:
            print('  would sync subject union for grade %s -> %s' % (grade, want))
        return

    if sync_union:
        tree['grade_subjects'][grade] = want
        doc['grades'][grade]['subjects'] = want
        W(os.path.join(DATA, 'skill_tree.json'), tree)
        print('synced subject union for grade %s -> %s' % (grade, want))

    gen = str(doc.get('generated_by') or '')
    scaffold_tag = 'tools/build_month_scaffold.py'
    if scaffold_tag not in gen:
        doc['generated_by'] = (gen + ' + ' + scaffold_tag).strip(' +')
    W(doc_path, doc)
    emit_bundles(lane, doc)
    print('wrote grade %s month %d -> weeks %s (%s lane: %s)'
          % (grade, month, ','.join(built), lane, os.path.basename(doc_path)))
    print_report(report)
    if bindings:
        print('  generator bindings: %d this batch, %d newly appended to week-1 '
              'registry' % (len(bindings), added_registry))

    if not args.no_validate:
        r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'validate_readiness.js')],
                           cwd=ROOT, capture_output=True, text=True)
        sys.stdout.write(r.stdout.split('== READINESS SUMMARY ==')[-1])
        if r.returncode != 0:
            die('readiness validator exit %d — batch NOT accepted' % r.returncode)
        matrix = L(os.path.join(ROOT, 'tools', 'readiness_matrix_v2.json'))
        m = str(month)
        print('validator exit 0 — grade %s month %d tier = %s'
              % (grade, month, matrix['tiers'][grade][m]))


if __name__ == '__main__':
    main()
