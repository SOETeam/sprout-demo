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

# minute law (roadmap §2.3 step 2): minutes per block, per day
MINUTE_LAW = {
    '3': {'days': [[65, 60, 15, 25, 25, 20]] * 4, 'totals': [210, 210, 210, 210]},
    '5': {'days': [[75, 60, 15, 30, 30, 30]] * 3 + [[60, 45, 15, 30, 30, 30]],
          'totals': [240, 240, 240, 210]},
}

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


# ------------------------------------------------------------------ spine
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


# ------------------------------------------------------- day / lesson build
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


def emit_bundles(content):
    with open(os.path.join(DATA, 'content.js'), 'w', encoding='utf-8') as f:
        f.write('window.SPROUT_CONTENT = ' +
                json.dumps(content, ensure_ascii=False, separators=(',', ':')) + ';\n')


def main():
    ap = argparse.ArgumentParser(description='build one SPROUT grade-month from a spine sheet')
    ap.add_argument('--grade', required=True)
    ap.add_argument('--month', required=True, type=int)
    ap.add_argument('--spine', default=None)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--no-validate', action='store_true')
    ap.add_argument('--force', action='store_true',
                    help='overwrite an existing full week (default: refuse)')
    ap.add_argument('--sync-subject-union', action='store_true',
                    help='widen content.grades[].subjects + skill_tree.grade_subjects[] '
                         'to the union the new weeks need (grade 5 needs this)')
    args = ap.parse_args()

    grade = str(args.grade)
    month = args.month
    if not 1 <= month <= 9:
        die('month must be 1..9')
    if grade not in MINUTE_LAW:
        die('minute law not defined for grade %s (have %s)'
            % (grade, ', '.join(sorted(MINUTE_LAW))))

    spine_path = args.spine or os.path.join(SPINES, 'g%s_m%d.json' % (grade, month))
    if not os.path.exists(spine_path):
        die('spine sheet not found: %s' % spine_path)
    spine = L(spine_path)

    errs = validate_spine(spine, grade, month)
    if errs:
        for e in errs:
            sys.stderr.write('  * %s\n' % e)
        die('spine sheet failed %d check(s)' % len(errs))

    content = L(os.path.join(DATA, 'content.json'))
    tree = L(os.path.join(DATA, 'skill_tree.json'))
    meta = content['grades'].get(grade) or {}
    persona, key = meta.get('persona'), meta.get('student_key')
    if not key:
        die('content.json has no persona/student_key for grade %s' % grade)

    weeks_now = content['weeks'].setdefault(grade, {})
    week_numbers = [int(w) for w in spine['week_numbers']]
    for wn in week_numbers:
        existing = weeks_now.get(str(wn))
        if existing and not existing.get('topic_only') and not args.force:
            die('week %d already holds a full day flow — rerun with --force to overwrite' % wn)

    # spiral pool = every lesson authored in an earlier week of this grade
    spiral_pool = {}
    for wn in sorted(weeks_now, key=int):
        if int(wn) >= week_numbers[0]:
            continue
        for lid, les in (weeks_now[wn].get('lessons') or {}).items():
            spiral_pool[lid] = les

    pcount = next_passage_ids(key, weeks_now)
    built, bindings, week_bindings, report = [], [], {}, []
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
        how = {}
        for d in week['days']:
            for b in d['blocks']:
                how[b.get('_bind')] = how.get(b.get('_bind'), 0) + 1
                b.pop('_bind', None)
        bound = how.get('exact', 0) + how.get('same-week', 0)
        report.append((wn, week['theme'], bound, len(week['lessons']),
                       len(week['test']['questions']), how))

    # ---- subject-union coupling: validate_engine gate 3 compares
    # content.grades[g].subjects (+ block subjects) to skill_tree.grade_subjects[g]
    blocks_union = set(content['grades'][grade].get('subjects') or [])
    for wn in built:
        for d in weeks_now[wn]['days']:
            for b in d['blocks']:
                blocks_union.add(b['subject'])
    want = sorted(blocks_union)
    have = sorted(tree['grade_subjects'].get(grade) or [])
    if want != have:
        if not args.sync_subject_union:
            die('new weeks need subject union %s but skill_tree.grade_subjects[%s] is %s '
                '(validate_engine gate 3) — rerun with --sync-subject-union'
                % (want, grade, have))
        tree['grade_subjects'][grade] = want
        content['grades'][grade]['subjects'] = want
        W(os.path.join(DATA, 'skill_tree.json'), tree)
        print('synced subject union for grade %s -> %s' % (grade, want))

    # each week carries its own bindings (validator + T2 evidence) ...
    for wn in built:
        weeks_now[wn]['generators'] = week_bindings[wn]

    # ... but app.js registryFor() reads the grade's WEEK 1 registry only,
    # so every new lesson binding is also appended there (existing pattern:
    # "generator configs ship with w1 and are reused").
    if '1' not in weeks_now:
        die('grade %s has no week 1 — cannot register generator bindings' % grade)
    reg = weeks_now['1'].setdefault('generators', [])
    known = {g['id'] for g in reg}
    added = 0
    for g in bindings:
        if g['id'] not in known:
            reg.append(g)
            known.add(g['id'])
            added += 1

    if args.dry_run:
        print('DRY RUN — nothing written. Would build grade %s month %d weeks %s'
              % (grade, month, built))
        for wn, theme, bound, nl, nq, how in report:
            print('  w%-2d %-42s lessons=%d  bound=%d/24  test=%dq  %s'
                  % (wn, theme[:42], nl, bound, nq, how))
        return

    W(os.path.join(DATA, 'content.json'), content)
    emit_bundles(content)
    print('wrote grade %s month %d -> weeks %s (content.json + content.js)'
          % (grade, month, ','.join(built)))
    for wn, theme, bound, nl, nq, how in report:
        print('  w%-2d %-42s lessons=%d  bound=%d/24  test=%dq  %s'
              % (wn, theme[:42], nl, bound, nq, how))
    print('  generator bindings: %d this batch, %d newly appended to week-1 registry'
          % (len(bindings), added))

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
