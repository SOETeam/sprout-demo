#!/usr/bin/env python3
"""SPROUT demo v1 content pipeline.

source file -> demo JSON (no local paths, synthetic names only, no PII).

Sources (all local, never fetched at runtime):
  engine /root/sprout            -> schema names + item bank (assessment CAT)
  prototype apps/sprout/data     -> week schedule, curriculum lessons, tests,
                                    generator configs, quizzes, passages
  master docs SAITTASPROUT       -> open-lesson sheets (materials/),
                                    weeks 2-6 schedule + topic text

Output: /root/sprout-demo/data/content.json  (schema marker sprout_demo_v1.content)
"""
import json, os, re, glob, sys

APPS = "/root/SOETechWebApp-obsidian/apps/sprout"
MASTER = "/root/LNM_BRAIN/SAITTASPROUT"
ENGINE = "/root/sprout"
OUT_DIR = "/root/sprout-demo/data"
W2_LESSONS = "/root/sprout-demo/data/_w2_lessons_grade3.json"
W2_TESTS_DIR = "/root/sprout-demo/data/_w2_tests"

# grade key -> (prototype student key, synthetic persona, grade label, grade number)
GRADES = {
    "preschool": ("luca", "Rookie", "Preschool", 0),
    "3": ("max", "Juniper", "Grade 3", 3),
    "5": ("adonis", "Pixel", "Grade 5", 5),
}

STATUTORY = ["reading", "spelling", "mathematics", "science", "history",
             "civics", "literature", "writing", "english_grammar"]
SUBJECT_MAP = {
    "math": "mathematics", "maths": "mathematics", "ela": "english_grammar",
    "english": "english_grammar", "grammar": "english_grammar",
    "read": "reading", "geo": "history", "art": "literature",
}

# synthetic-name scrubber: real learner names must never reach a served byte
SCRUB = [
    (re.compile(r"\bMAX_YEAR_2026-27\b"), "the year plan"),
    (re.compile(r"\bADONIS_YEAR_2026-27\b"), "the year plan"),
    (re.compile(r"\bLUCA_YEAR_2026-27\b"), "the year plan"),
    (re.compile(r"\bMax\b"), "Juniper"), (re.compile(r"\bmax\b"), "juniper"),
    (re.compile(r"\bAdonis\b"), "Pixel"), (re.compile(r"\badonis\b"), "pixel"),
    (re.compile(r"\bLuca\b"), "Rookie"), (re.compile(r"\bluca\b"), "rookie"),
    (re.compile(r"\bMimi\b"), "a grown-up"), (re.compile(r"\bSophia\b"), "a grown-up"),
    (re.compile(r"\bSophi\b"), "a grown-up"), (re.compile(r"\bDoni\b"), "a grown-up"),
    (re.compile(r"\bSaitta\b"), "SPROUT"), (re.compile(r"\bsaitta\b"), "sprout"),
    (re.compile(r"\bsaittasprout\b"), "sprout"),
]

def scrub(v):
    """Recursively scrub banned strings from every value we ship."""
    if isinstance(v, str):
        for rx, rep in SCRUB:
            v = rx.sub(rep, v)
        return v
    if isinstance(v, list):
        return [scrub(x) for x in v]
    if isinstance(v, dict):
        return {k: scrub(x) for k, x in v.items()}
    return v

def jload(p):
    with open(p) as f:
        return json.load(f)

def jdump(p, obj):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)

def strip_paths(block):
    """Never ship local filesystem paths."""
    b = dict(block)
    b.pop("material_ref", None)
    return b

def md_sheet(path):
    """Parse a source-sheet markdown into lesson content (no invention)."""
    if not os.path.exists(path):
        return None
    txt = open(path).read()
    head = re.match(r"#\s*(.+)", txt)
    title = head.group(1).strip() if head else "Lesson"
    sect = {}
    for m in re.finditer(r"^##\s+(.+)\n(.*?)(?=^##\s+|\Z)", txt, re.S | re.M):
        sect[m.group(1).strip().lower()] = m.group(2).strip()
    explain = sect.get("what to do", "").strip()
    materials = sect.get("materials", "").strip()
    grownup = sect.get("grown-up note", "").strip()
    body = explain
    if materials:
        body += "\n\nMaterials: " + materials
    return {
        "title": title,
        "summary": explain.split("\n")[0][:140] if explain else title,
        "minutes": 15,
        "content": {
            "explain": body or title,
            "examples": [],
            "practice": [],
            "workbook": [],
            "parent_note": grownup,
            "source_sheet": True,
        },
    }

def lesson_index(student, grade_key):
    """All curriculum lesson objects for a student, by id."""
    p = os.path.join(APPS, "data/curriculum", {
        "3": "max_grade3", "5": "adonis_grade5", "preschool": "luca_preschool"}[grade_key] + ".json")
    if not os.path.exists(p):
        return {}
    d = jload(p)
    out = {}
    for m in d.get("modules", []):
        for ls in m.get("lessons", []):
            rec = dict(ls)
            rec["week"] = m.get("week", 1)
            rec["module"] = m.get("id")
            out[ls["id"]] = rec
    return out

def build_week(grade_key, week_no):
    student, persona, label, gnum = GRADES[grade_key]
    lidx = lesson_index(student, grade_key)

    # --- schedule (week 1 lives in the prototype, weeks 2-4 in year_curriculum)
    if week_no == 1:
        sp = os.path.join(APPS, "data/week", student, "week_01.json")
    else:
        sp = os.path.join(MASTER, "year_curriculum", student, "week_%02d.json" % week_no)
    if not os.path.exists(sp):
        return None
    sched = jload(sp)
    days = []
    lessons = {}
    blocks_n = 0
    sheets_n = 0
    for d in sched.get("days", []):
        blocks = []
        for b in d.get("blocks", []):
            nb = strip_paths(b)
            blocks_n += 1
            ref = nb.get("lesson_ref")
            if not ref and b.get("material_ref"):
                cand = os.path.join(MASTER, b["material_ref"])
                if os.path.exists(cand):
                    ref = "%s_w%d_%s" % (student, week_no,
                                         os.path.splitext(os.path.basename(cand))[0])
                    nb["lesson_ref"] = ref
            if ref:
                if ref in lidx and lidx[ref].get("week") == week_no:
                    ls = lidx[ref]
                    lessons[ref] = {
                        "id": ls["id"], "title": ls["title"], "emoji": ls.get("emoji", "\U0001F4D6"),
                        "minutes": ls.get("minutes", 15), "summary": ls.get("summary", ""),
                        "subject": nb.get("subject"), "week": week_no, "content": ls.get("content", {}),
                    }
                elif ref not in lessons:
                    sheet = None
                    for cand in (nb.get("material_ref"), b.get("material_ref")):
                        if cand:
                            sheet = md_sheet(os.path.join(MASTER, cand))
                            if sheet:
                                break
                    if sheet is None:
                        # fallback: any md for this block slot
                        g = None
                    if sheet:
                        sheets_n += 1
                        lessons[ref] = {
                            "id": ref, "title": sheet["title"], "emoji": "\U0001F4D6",
                            "minutes": sheet["minutes"], "summary": sheet["summary"],
                            "subject": nb.get("subject"), "week": week_no,
                            "content": sheet["content"],
                        }
            blocks.append(nb)
        days.append({"day": d.get("day"), "parent_note": d.get("parent_note", ""),
                     "blocks": blocks, "total_min": d.get("total_min")})

    # --- open-lesson sheets that were never linked (still real content)
    wdir = os.path.join(MASTER, "materials", student, "w%d" % week_no)
    for path in sorted(glob.glob(os.path.join(wdir, "*.md"))):
        sheet = md_sheet(path)
        if not sheet:
            continue

    # --- worker-authored week-2 lessons (drafted from master docs, manager-verified)
    if week_no == 2:
        vdir = os.path.dirname(W2_LESSONS)
        parts = [os.path.join(vdir, "_w2_lessons_verified.json")]
        parts += sorted(glob.glob(os.path.join(vdir, "_w2_lessons_gap*.json")))
        parts += sorted(glob.glob(os.path.join(vdir, "_w2_lessons_part*.json")))
        for part in parts:
            if not os.path.exists(part):
                continue
            try:
                arr = jload(part)
            except Exception:
                continue          # truncated worker file: only the verified merge is trusted
            if isinstance(arr, dict):
                arr = [arr]
            if not isinstance(arr, list):
                continue
            for ls in arr:
                if not isinstance(ls, dict):
                    continue
                lid = ls.get("id")
                if not lid or not str(lid).startswith(student + "_w2_l"):
                    continue
                if lid in lessons:
                    continue
                content = ls.get("content") or {}
                if not content.get("explain") or not content.get("practice"):
                    continue          # reject thin/broken worker output
                lessons[lid] = {
                    "id": lid, "title": ls.get("title", lid),
                    "emoji": ls.get("emoji", "\U0001F4D6"),
                    "minutes": ls.get("minutes", 15),
                    "summary": ls.get("summary", ""),
                    "subject": None, "week": 2, "content": content,
                    "authored": "worker-pool",
                }
        # subject inference from the schedule block that references the lesson
        for d in days:
            for b in d["blocks"]:
                ref = b.get("lesson_ref")
                if ref and ref in lessons and not lessons[ref].get("subject"):
                    lessons[ref]["subject"] = b.get("subject")

    week = {
        "week": week_no,
        "theme": sched.get("theme", ""),
        "grade": grade_key,
        "persona": persona,
        "days": days,
        "lessons": lessons,
        "counts": {"blocks": blocks_n, "lesson_objects": len(lessons),
                   "sheets": sheets_n},
    }

    # --- weekly test
    if week_no == 1:
        tp = os.path.join(APPS, "data/tests", "%s_w1_test.json" % student)
        if os.path.exists(tp):
            week["test"] = jload(tp)
    else:
        tp = os.path.join(W2_TESTS_DIR, "%s.json" % grade_key)
        if os.path.exists(tp):
            week["test"] = jload(tp)

    # --- generator configs (week 1 only exist; reused with week tags later)
    gp = os.path.join(APPS, "data/generators", "%s_w1.json" % student)
    if os.path.exists(gp):
        week["generators"] = jload(gp).get("generators", [])

    # --- passages (3rd/5th w1 only)
    pp = os.path.join(APPS, "data/passages", student, "w1.json")
    if os.path.exists(pp):
        week["passages"] = jload(pp).get("passages", [])

    # --- pop quizzes (reused as the cumulative review pool; the year
    #     curriculum's data/cumulative/* references are dangling by design)
    qs = []
    for q in ("%s_q1.json" % student, "%s_q2.json" % student):
        p = os.path.join(APPS, "data/quizzes", q)
        if os.path.exists(p):
            qs.append(jload(p))
    week["quizzes"] = qs
    return week

def topics_only(grade_key, week_no):
    """Weeks 3-6: topic cards only, 'Section coming soon' badge."""
    student, persona, label, gnum = GRADES[grade_key]
    sp = os.path.join(MASTER, "year_curriculum", student, "week_%02d.json" % week_no)
    if os.path.exists(sp):
        sched = jload(sp)
        chips, subs = [], []
        for d in sched.get("days", []):
            for b in d.get("blocks", []):
                s = b.get("subject")
                if s and s not in subs:
                    subs.append(s)
        return {"week": week_no, "theme": sched.get("theme", ""), "goal": sched.get("goal", ""),
                "subject_chips": subs, "topic_only": True, "badge": "Section coming soon",
                "source": "year_curriculum"}
    # weeks 5-6: no JSON exists -> the year doc's WEEK n heading only
    ymd = glob.glob(os.path.join(MASTER, "students", student.upper() + "_YEAR_2026-27.md"))
    if not ymd:
        ymd = glob.glob(os.path.join(MASTER, "students", student, "*_YEAR_2026-27.md"))
    theme, goal = "", ""
    if ymd:
        txt = open(ymd[0]).read()
        m = re.search(r"WEEK\s+%d\s*[—\-–]\s*(.+)" % week_no, txt)
        if m:
            theme = m.group(1).strip().split("\n")[0]
    return {"week": week_no, "theme": theme, "goal": goal, "subject_chips": [],
            "topic_only": True, "badge": "Section coming soon", "source": "year_doc"}

def cat_bank():
    """Seeded IRT item bank (engine item_bank_seed) for the child adaptive-lite CAT."""
    items = []
    for f in ("math.json", "ela.json"):
        p = os.path.join(ENGINE, "item_bank_seed", f)
        if not os.path.exists(p):
            continue
        for it in jload(p):
            items.append({
                "item_id": it["item_id"], "subject": it["subject"],
                "skill_tag": it["skill_tag"], "a": it["irt"]["a"], "b": it["irt"]["b"],
                "text": it["text"], "options": it["options"], "answer": it["answer"],
            })
    return items

def test_q(t):
    """weekly-test question count (tap-mcq uses 'questions', show-me uses 'items')."""
    if not t:
        return 0
    return len(t.get("questions") or t.get("items") or [])


def main():
    out = {"schema": "sprout_demo_v1.content", "builtin": "v1",
           "generated_at": "2026-10-06",
           "grades": {}, "weeks": {}, "counts": {}}
    for gk, (student, persona, label, gnum) in GRADES.items():
        subs = []
        weeks = {}
        for wn in range(1, 7):
            if wn <= 4:
                w = build_week(gk, wn)
            else:
                w = topics_only(gk, wn)
            if not w:
                w = topics_only(gk, wn)
            weeks[str(wn)] = w
            if wn == 1:
                for d in w.get("days", []):
                    for b in d.get("blocks", []):
                        s = b.get("subject")
                        if s and s not in subs:
                            subs.append(s)
        out["weeks"][gk] = weeks
        out["grades"][gk] = {
            "label": label, "grade": gnum, "persona": persona,
            "student_key": student, "subjects": subs,
            "enabled": True,
            "statutory_map": sorted({SUBJECT_MAP.get(s, s) for s in subs}),
        }
    out["assessment"] = {"bank": cat_bank(),
                         "selection_rule": "max-fisher-information-2pl-eap",
                         "domains": ["math", "ela"]}
    out["statutory"] = STATUTORY

    # scrub every shipped string
    out = scrub(out)

    # counts (plan §0 definitions)
    c = {}
    total = 0
    w2_items = 0
    for gk in GRADES:
        w1 = out["weeks"][gk]["1"]
        w2 = out["weeks"][gk]["2"]
        blocks = w1["counts"]["blocks"]
        md_n = len(glob.glob(os.path.join(MASTER, "materials", GRADES[gk][0], "w1/*.md")))
        gen_n = len(w1.get("generators", []))
        c[gk] = {"w1_blocks": blocks, "w1_open_lesson_md": md_n,
                 "w1_generator_configs": gen_n,
                 "w1_headline": blocks + md_n + gen_n,
                 "w1_full": blocks + md_n + gen_n + w1["counts"]["lesson_objects"]
                            + test_q(w1.get("test"))
                            + sum(len(q.get("questions", [])) for q in w1.get("quizzes", []))
                            + len(w1.get("passages", [])),
                 "w2_blocks": w2["counts"]["blocks"],
                 "w2_lesson_objects": w2["counts"]["lesson_objects"],
                 "w2_test_q": test_q(w2.get("test"))}
        c[gk]["w2_items"] = (c[gk]["w2_blocks"] + c[gk]["w2_lesson_objects"]
                             + c[gk]["w2_test_q"])
        total += c[gk]["w1_headline"]
        w2_items += c[gk]["w2_items"]
    c["w1_items_total"] = total
    c["w2_items_total"] = w2_items
    out["counts"] = c
    jdump(os.path.join(OUT_DIR, "content.json"), out)
    with open(os.path.join(OUT_DIR, "content.js"), "w") as f:
        f.write("window.SPROUT_CONTENT = " +
                json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(json.dumps(c, indent=1))
    print("lessons per grade/week:", {g: {w: out["weeks"][g][w]["counts"]["lesson_objects"]
          for w in "1234"} for g in GRADES})
    print("content.js bytes:", os.path.getsize(os.path.join(OUT_DIR, "content.js")))

if __name__ == "__main__":
    main()
