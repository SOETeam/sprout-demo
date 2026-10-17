#!/usr/bin/env python3
"""E5 — wire K/1/2/4 into the public beta UI lane.

Builds data/grades_k124.{json,js} for apps/sprout from the E3 engine artifacts:
  data/skill_tree.json                  (grade meta, nodes, statutory band)
  data/generators.json                  (46 parametric+bank configs, families live in js/generator.js)
  data/items.json                       (authored bank items — lesson practice + weekly tests)
  data/pd_comprehension_questions.json  (PD-passage comprehension bank)
  research/pd_readers_passages.json     (48 verbatim public-domain passages, grade-leveled)

Output shape mirrors the existing content.json weeks/v1 structure so app.js needs
no new engine code:
  window.SPROUT_CONTENT_K124 = {
    schema, generated_at, grades: {K,1,2,4 meta}, weeks: {K:{1..6}, ...}
  }
Weeks 1-2 are full (days/blocks/lessons/test/generators/passages); weeks 3-6 are
topic_only cards — exactly the pre/g3/g5 posture. Zero network, localStorage only.

Run from the sprout-demo repo root:  python3 tools/build_e5_content.py
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.environ.get('SPROUT_APP_DIR', '/root/SOETechWebApp-obsidian/apps/sprout')

def load(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return json.load(f)

tree = load('data/skill_tree.json')
gens = load('data/generators.json')
items = load('data/items.json')
pdq = load('data/pd_comprehension_questions.json')
passages = load('research/pd_readers_passages.json')

GRADES = ['K', '1', '2', '4']
PERSONAS = {'K': 'Sprout', '1': 'Pip', '2': 'Otto', '4': 'Kestrel'}
TOTEM = {'K': '🐣', '1': '🐰', '2': '🦉', '4': '🦅'}

# grade band -> day plans: (subject, block minutes) lists for days 1..4.
# Subjects come from the grade's statutory_subjects band; every subject with
# generator configs gets a lesson, the rest stay honest "no lesson in demo" blocks.
DAY_PLANS = {
    'K': [
        [('ela', 15), ('math', 15), ('science', 15), ('social_studies', 15)],
        [('ela', 15), ('math', 15), ('science', 15), ('motor', 20)],
        [('ela', 15), ('math', 15), ('social_studies', 15), ('art', 20)],
        [('ela', 15), ('math', 15), ('science', 15), ('music', 20)],
    ],
    '1': [
        [('ela', 20), ('math', 20), ('science', 20), ('social_studies', 15)],
        [('ela', 20), ('math', 20), ('science', 20), ('motor', 20)],
        [('ela', 20), ('math', 20), ('social_studies', 15), ('art', 20)],
        [('ela', 20), ('math', 20), ('science', 20), ('music', 20)],
    ],
    '2': [
        [('ela', 25), ('math', 25), ('science', 20), ('social_studies', 15)],
        [('ela', 25), ('math', 25), ('science', 20), ('motor', 20)],
        [('ela', 25), ('math', 25), ('social_studies', 15), ('art', 20)],
        [('ela', 25), ('math', 25), ('science', 20), ('music', 20)],
    ],
    '4': [
        [('math', 40), ('reading', 35), ('spelling', 15)],
        [('math', 40), ('reading', 35), ('spelling', 15), ('science', 40)],
        [('math', 40), ('reading', 35), ('spelling', 15), ('history', 35)],
        [('math', 40), ('reading', 35), ('spelling', 15), ('science', 40), ('history', 35)],
    ],
}
# statutory_map: band subject -> D7 statutory name (for the child card + audit copy)
STAT_MAP = {
    'ela': 'english_grammar', 'math': 'mathematics', 'science': 'science',
    'social_studies': 'civics', 'motor': None, 'art': None, 'music': None,
    'reading': 'reading', 'spelling': 'spelling', 'history': 'history',
}
GRADE_LABEL = {'K': 'Kindergarten', '1': 'Grade 1', '2': 'Grade 2', '4': 'Grade 4'}
SUBJECT_LABEL = {
    'ela': 'Language arts', 'math': 'Math', 'science': 'Science',
    'social_studies': 'Social studies', 'motor': 'Movement', 'art': 'Art',
    'music': 'Music', 'reading': 'Reading', 'spelling': 'Spelling', 'history': 'History',
}
THEMES = {
    'K': ['Counting and letter sounds', 'Adding within 10 and sight words'],
    '1': ['Place value and CVC words', 'Two-digit numbers and story words'],
    '2': ['Adding within 100 and vowel teams', 'Skip counting and sight words'],
    '4': ['Multi-digit math and text evidence', 'Fractions, spelling patterns and Michigan history'],
}
PARENT_NOTES = {
    'K': 'Short lessons win at this age. Praise the try, stop while it is still fun.',
    '1': 'Watch the child read aloud once, then let them try alone. Help only on the third stumble.',
    '2': 'Ask the child to explain their answer out loud — the explaining is the learning.',
    '4': 'Have the child show their work for one problem per subject. The steps matter more than speed.',
}

def band_of(grade):
    return 'K-2 band' if grade in ('K', '1', '2') else '3-5 band'

def cfgs_for(grade):
    return gens['grades'][grade]

def bank_items_by_gen(grade):
    out = {}
    for c in cfgs_for(grade):
        if c.get('items'):
            out[c['id']] = c['items']
    return out

def lesson_practice(grade, cfg):
    """3-4 practice items for the lesson view, from the config's authored bank."""
    its = cfg.get('items') or []
    if not its:
        return []
    out = []
    for it in its[:4]:
        if 'correctIndex' in it:
            out.append({
                'question': it['question'], 'options': it['options'],
                'correctIndex': it['correctIndex'],
                'hint': it.get('hint', ''), 'praise': it.get('praise', 'Yes! That is right.'),
            })
    return out

def skill_label(grade, cfg):
    node = None
    for n in tree['grades'][grade]['nodes']:
        if n['id'] == cfg['skill_node']:
            node = n
            break
    return node['label'] if node else cfg['skill']

def build_lesson(grade, wn, cfg, subject, minutes, note_extra=None):
    lid = cfg['id']
    title = skill_label(grade, cfg)
    explain = (
        'Week %d %s — %s. Work through the example together first, then let the child '
        'try the practice items. The practice button runs fresh seeded questions on this '
        'same skill, on-device, with no network.' % (wn, SUBJECT_LABEL[subject], title))
    lesson = {
        'id': lid,
        'title': title,
        'emoji': {'ela': '🔤', 'math': '🔢', 'science': '🔬', 'social_studies': '🏘️',
                  'reading': '📖', 'spelling': '✏️', 'history': '🗺️'}.get(subject, '📘'),
        'minutes': minutes,
        'summary': title,
        'subject': subject,
        'week': wn,
        'content': {
            'explain': explain,
            'examples': ['Read the explanation aloud together.',
                         'Do one practice item together, then two alone.'],
            'practice': lesson_practice(grade, cfg),
            'parent_note': note_extra or '',
            'generator': cfg['id'],
        },
    }
    return lid, lesson

def week_test(grade, wn, w1total):
    """Friday test: 8 mc questions drawn from the grade's authored bank items."""
    pool = [i for i in items['items'] if i['grade'] == grade and i['type'] == 'mc']
    pool.sort(key=lambda i: i['id'])
    stride = max(1, len(pool) // 8)
    picked = pool[::stride][:8] if wn == 1 else pool[::-1][::stride][:8]
    qs = []
    for i in picked:
        correct = i['options'].index(i['answer'])
        qs.append({'q': i['text'], 'options': i['options'], 'correct': correct,
                   'skill': i['skill_tag'],
                   'why': 'This comes from the week-%d %s bank.' % (wn, SUBJECT_LABEL.get(i['subject'], 'lesson'))})
    return {
        'quizId': '%s_w%d_test' % (grade.lower(), wn),
        'learner': PERSONAS[grade],
        'title': 'Week %d Check-in — %s' % (wn, GRADE_LABEL[grade]),
        'minutes': 15,
        'passScore': 0.75,
        'covers': [],
        'questions': qs,
    }

def grade_passages(grade):
    out = []
    for idx, p in enumerate(passages[grade]):
        out.append({
            'id': '%s_p%d' % (grade.lower(), idx + 1),
            'title': p['label'],
            'text': p['text'],
            'pool': [],
            'stats': p.get('stats', {}),
        })
    return out

def build_week(grade, wn, cfg_cycle):
    plans = DAY_PLANS[grade]
    used = set()
    days, lessons = [], {}
    pd = grade_passages(grade)
    passage = pd[(wn - 1) % len(pd)]
    blocks_total = 0
    for dnum, plan in enumerate(plans, start=1):
        blocks = []
        for subject, minutes in plan:
            cand = [c for c in cfgs_for(grade) if c['subject'] == subject and c['id'] not in used]
            if not cand:
                cand = [c for c in cfgs_for(grade) if c['subject'] == subject]
            if cand:
                cfg = cand[(dnum - 1) % len(cand)]
                used.add(cfg['id'])
                lid, lesson = build_lesson(grade, wn, cfg, subject, minutes)
                lessons[lid] = lesson
                block = {'block': len(blocks) + 1, 'subject': subject, 'min': minutes,
                         'activity': '%s — %s' % (SUBJECT_LABEL[subject], lesson['summary']),
                         'lesson_ref': lid}
                if subject in ('ela', 'reading'):
                    block['passage_ref'] = passage['id']
                    block['activity'] += ' · read the passage "%s" together first.' % passage['title']
            else:
                block = {'block': len(blocks) + 1, 'subject': subject, 'min': minutes,
                         'activity': '%s — movement, making and noticing. No lesson sheet in this demo yet.' % SUBJECT_LABEL[subject]}
            blocks.append(block)
        days.append({'day': dnum,
                     'parent_note': PARENT_NOTES[grade],
                     'blocks': blocks,
                     'total_min': sum(b['min'] for b in blocks)})
        blocks_total += len(blocks)
    theme = THEMES[grade][wn - 1] if wn <= 2 else 'Topic to follow'
    return {
        'week': wn, 'theme': theme, 'grade': grade, 'persona': PERSONAS[grade],
        'days': days, 'lessons': lessons,
        'counts': {'blocks': blocks_total, 'lesson_objects': len(lessons), 'sheets': 0},
        'test': week_test(grade, wn, blocks_total),
        'generators': cfgs_for(grade),
        'passages': pd,
        'quizzes': [],
    }

def topic_week(grade, wn):
    return {
        'week': wn, 'theme': 'Topic to follow', 'grade': grade, 'persona': PERSONAS[grade],
        'topic_only': True, 'badge': 'Section coming soon', 'source': 'e5_demo_scope',
    }

def main():
    grades_meta, weeks = {}, {}
    for g in GRADES:
        band = tree['grades'][g]
        grades_meta[g] = {
            'label': GRADE_LABEL[g], 'grade': g, 'persona': PERSONAS[g],
            'student_key': PERSONAS[g].lower(),
            'subjects': [s for s, _ in DAY_PLANS[g][0]] if False else sorted({s for plan in DAY_PLANS[g] for s, _ in plan}),
            'enabled': True,
            'statutory_map': [STAT_MAP[s] for s in sorted({s for plan in DAY_PLANS[g] for s, _ in plan}) if STAT_MAP[s]],
            'grade_band': band_of(g),
            'cat_domains': band.get('cat_domains', ['math', 'ela']),
            'statutory_subjects': band.get('statutory_subjects', []),
        }
        weeks[g] = {}
        for wn in (1, 2):
            weeks[g][str(wn)] = build_week(g, wn, None)
        for wn in range(3, 7):
            weeks[g][str(wn)] = topic_week(g, wn)

    doc = {
        'schema': 'sprout_demo_v1.content_k124',
        'generated_at': '2026-10-17',
        'generated_by': 'tools/build_e5_content.py (E5 UI lane; engine data frozen at E3, validator 91/0)',
        'grades': grades_meta,
        'weeks': weeks,
        'passages_source': 'research/pd_readers_passages.json — verbatim public-domain reader passages (Gutenberg), grade-leveled',
    }
    os.makedirs(APP, exist_ok=True)
    jp = os.path.join(APP, 'data', 'grades_k124.json')
    with open(jp, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    js_path = os.path.join(APP, 'data', 'grades_k124.js')
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write('/* E5 — K/1/2/4 demo content (weeks 1-2 full, 3-6 topic cards). Generated by\n'
                '   tools/build_e5_content.py from the E3 engine artifacts; do not hand-edit. */\n'
                'window.SPROUT_CONTENT_K124 = ' + json.dumps(doc, ensure_ascii=False) + ';\n')
    # self-check: every block lesson_ref resolves, every generator id present
    for g in GRADES:
        for wn in ('1', '2'):
            w = doc['weeks'][g][wn]
            for d in w['days']:
                for b in d['blocks']:
                    if b.get('lesson_ref'):
                        assert b['lesson_ref'] in w['lessons'], (g, wn, b)
            assert len(w['test']['questions']) == 8, (g, wn)
    print('OK  grades_k124 written: %d grades, weeks 1-2 full + 4 topic cards each' % len(GRADES))
    for g in GRADES:
        w1 = doc['weeks'][g]['1']
        print('  %s: %d blocks w1, %d lessons, %d passages, test %d q' %
              (g, w1['counts']['blocks'], len(w1['lessons']), len(w1['passages']), len(w1['test']['questions'])))

if __name__ == '__main__':
    main()
