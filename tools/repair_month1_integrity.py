#!/usr/bin/env python3
"""SPROUT AUTHOR lane — repair month-1 week integrity + declared statutory_map drift.

Idempotent. Safe to re-run after `tools/build_content.py` (which regenerates
content.json from the private sources and would reintroduce the defects below).

What it fixes (validator v2 gates, tools/validate_readiness.js):
  (1) b/test-id + b/test.covers — six weekly tests in weeks 3 and 4 of grade 3,
      grade 5 and preschool are literal copies of the week-2 test: same quizId,
      same title, same items, covers[] pointing at week-2 lesson ids that do not
      resolve in their own week. 36 integrity FAILs total. Each is declared
      `tier: "spiral"` (the G13 documented-fallback mechanism the validator
      accepts) with an honest title/note, so covers[] stay truthful to the item
      set they describe instead of being re-bound to lessons the items never
      asked about.
  (2) b/test.covers (grade 5 week 2) — covers[] still listed ids from a lesson
      rename (`pixel_w2_l1..l4` live in week 4, `pixel_w1_l1/l2` in week 1).
      Re-bound to the in-week lessons of exactly the subjects the item skills
      ask about; coding has no items so no coding lesson is claimed.
  (3) d/test-covers WARN — K/1/2/4 week 1-2 check-ins carry questions but an
      empty covers[]. Bound by question skill -> lesson id, then skill words ->
      lesson title. Unmatched skills are left out rather than guessed.
  (4) a-declared-map WARN — every K-6 grade now declares the nine
      MCL 380.1561(3)(f) subjects. K/1/2 declare the mandated fold labels
      (ela + social_studies + math + science) which expand to the same nine;
      `coding` / `motor` / `art` / `music` are never declared statutory.

Writes data/content.json, data/grades_k124.json and re-emits the two bundles the
app actually loads over <script> tags (data/content.js, data/grades_k124.js).
Zero network, stdlib only.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')

STATUTORY_NINE = ['reading', 'spelling', 'mathematics', 'science', 'history',
                  'civics', 'literature', 'writing', 'english_grammar']
# K/1/2 teach the mandated fold labels; the validator expands these to the nine.
K2_FOLD = ['ela', 'social_studies', 'math', 'science']

# week -> (tier, title, note tail) for the six week-2 test copies
SPIRAL_WEEKS = {
    ('3', '3'): 'Week 3 Test — Spiral review (Week 2 item set)',
    ('3', '4'): 'Week 4 Test — Spiral review (Week 2 item set)',
    ('5', '3'): 'Week 3 Test — Spiral review (Week 2 item set)',
    ('5', '4'): 'Week 4 Test — Spiral review (Week 2 item set)',
    ('preschool', '3'): 'Week 3 Show-Me Time — Spiral review (Week 2 item set)',
    ('preschool', '4'): 'Week 4 Show-Me Time — Spiral review (Week 2 item set)',
}
SPIRAL_NOTE = ('Spiral tier: this is the Week 2 item set reused for Week {w} until a '
               'Week {w} set is authored (G13 documented fallback). covers[] '
               'deliberately name the Week 2 lessons the items were written from.')


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def dump(p, obj):
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write('\n')


def stems(s):
    return [w for w in re.split(r'[^a-z0-9]+', s.lower()) if w]


def bind_covers_by_skill(week):
    """question skill -> the in-week lessons that actually teach it."""
    lessons = week.get('lessons') or {}
    test = week.get('test') or {}
    qs = test.get('questions') or test.get('items') or []
    out, seen = [], set()

    def add(lid):
        if lid in lessons and lid not in seen:
            seen.add(lid)
            out.append(lid)

    for q in qs:
        skill = str(q.get('skill') or '').strip()
        if not skill:
            continue
        # 1) the skill is spelled out in the lesson id (k.bank.story-questions, ...)
        by_id = False
        for lid in lessons:
            if lid == skill or skill in lid:
                add(lid)
                by_id = True
        if by_id:
            continue
        # 2) every stem of the skill appears in the lesson title
        want = {w.rstrip('s') for w in stems(skill)}
        for lid, les in lessons.items():
            have = {w.rstrip('s') for w in stems(les.get('title') or '')}
            if want and want <= have:
                add(lid)
    return out


def covers_for_subjects(week, subjects):
    """Every in-week lesson bound to a block of one of `subjects`."""
    lessons = week.get('lessons') or {}
    out, seen = [], set()
    for day in week.get('days') or []:
        for b in day.get('blocks') or []:
            ref, subj = b.get('lesson_ref'), str(b.get('subject') or '').lower()
            if ref and subj in subjects and ref in lessons and ref not in seen:
                seen.add(ref)
                out.append(ref)
    return out


def main():
    changed = []

    # ---- (4) declared statutory_map -------------------------------------
    content = load(os.path.join(DATA, 'content.json'))
    for g in ('3', '5'):
        meta = content['grades'][g]
        if sorted(meta.get('statutory_map') or []) != sorted(STATUTORY_NINE):
            meta['statutory_map'] = list(STATUTORY_NINE)
            changed.append('content.grades[%s].statutory_map -> the nine MCL subjects' % g)
    if '6' not in content['grades']:
        # grade 6 has no content lane yet, but the statutory declaration is
        # policy, not content: every K-6 grade owes the same nine subjects.
        content['grades']['6'] = {
            'label': 'Grade 6', 'grade': 6, 'persona': None, 'student_key': None,
            'subjects': [], 'enabled': False, 'statutory_map': list(STATUTORY_NINE),
            'note': 'declaration only — no content lane, no skill_tree band yet',
        }
        changed.append('content.grades[6] declared (nine MCL subjects; lane still absent)')

    # ---- (1) + (2) grade 3 / 5 / preschool weeks ------------------------
    for g, weeks in content['weeks'].items():
        for wn, week in weeks.items():
            test = week.get('test')
            if not test:
                continue
            key = (g, wn)
            if key in SPIRAL_WEEKS:
                if test.get('tier') != 'spiral':
                    test['tier'] = 'spiral'
                    test['title'] = SPIRAL_WEEKS[key]
                    note = test.get('note') or ''
                    tail = SPIRAL_NOTE.format(w=int(wn))
                    test['note'] = (note + ' ' + tail).strip() if note else tail
                    changed.append('%s w%s test declared tier=spiral, retitled' % (g, wn))
            elif (g, wn) == ('5', '2'):
                want = covers_for_subjects(week, {
                    'math', 'english_grammar', 'spelling', 'science', 'history'})
                if want and test.get('covers') != want:
                    note = test.get('note') or ''
                    extra = ('covers[] rebound to the in-week lessons of the subjects the '
                             'items ask about (math, sentence structure, spelling, properties '
                             'of matter, ancient civilizations); the two volume items preview '
                             'the Week 4 unit. No coding item is claimed.')
                    test['covers'] = want
                    test['note'] = (note + ' ' + extra).strip()
                    changed.append('5 w2 test.covers rebound -> %d in-week lessons' % len(want))

    dump(os.path.join(DATA, 'content.json'), content)

    # ---- (3) K/1/2/4 empty covers --------------------------------------
    k124 = load(os.path.join(DATA, 'grades_k124.json'))
    for g, meta in k124['grades'].items():
        want = K2_FOLD if g in ('K', '1', '2') else list(STATUTORY_NINE)
        if meta.get('statutory_map') != want:
            meta['statutory_map'] = list(want)
            changed.append('grades_k124.grades[%s].statutory_map -> %s' % (g, want))
        if g in ('K', '1', '2') and meta.get('statutory_subjects') != K2_FOLD:
            # motor/art/music are offered blocks, never MCL 380.1561(3)(f) subjects
            meta['statutory_subjects'] = list(K2_FOLD)
            changed.append('grades_k124.grades[%s].statutory_subjects drops motor/art/music' % g)
    for g, weeks in k124['weeks'].items():
        for wn, week in weeks.items():
            test = week.get('test')
            if not test or test.get('covers'):
                continue
            want = bind_covers_by_skill(week)
            if want:
                test['covers'] = want
                changed.append('%s w%s test.covers bound from question skills -> %d lesson(s)'
                               % (g, wn, len(want)))
            else:
                changed.append('%s w%s test.covers UNBOUND — no skill matched a lesson (left empty)'
                               % (g, wn))
    dump(os.path.join(DATA, 'grades_k124.json'), k124)

    # ---- re-emit the bundles the app loads ------------------------------
    with open(os.path.join(DATA, 'content.js'), 'w', encoding='utf-8') as f:
        f.write('window.SPROUT_CONTENT = ' +
                json.dumps(content, ensure_ascii=False, separators=(',', ':')) + ';\n')
    with open(os.path.join(DATA, 'grades_k124.js'), 'w', encoding='utf-8') as f:
        f.write('/* E5 — K/1/2/4 demo content (weeks 1-2 full, 3-6 topic cards). Generated by\n'
                '   tools/build_e5_content.py from the E3 engine artifacts; do not hand-edit. */\n'
                'window.SPROUT_CONTENT_K124 = ' +
                json.dumps(k124, ensure_ascii=False) + ';\n')

    if changed:
        print('repaired %d item(s):' % len(changed))
        for c in changed:
            print('  - ' + c)
    else:
        print('nothing to repair (already clean)')
    print('re-emitted data/content.js and data/grades_k124.js')


if __name__ == '__main__':
    main()
