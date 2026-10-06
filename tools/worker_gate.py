
#!/usr/bin/env python3
"""Worker-artifact gate (amended worker-pool-protocol):
parse-verify EVERY worker file (truncation check included), repair only complete
top-level records, validate against the packet acceptance criteria, and report
missing ids so re-packets are precise."""
import json, os, sys, glob

D = "/root/sprout-demo/data"
P = "/root/LNM_BRAIN/AGENT_DISPATCH/WORKER_POOL/packets"
EXPECTED = ["max_w2_l%d" % i for i in range(1, 25)]

def complete_objects(raw):
    """Return the list of complete top-level {...} objects found in raw."""
    out, depth, in_str, esc, start = [], 0, False, False, None
    for i, ch in enumerate(raw):
        if in_str:
            if esc: esc = False
            elif ch == "\\": esc = True
            elif ch == '"': in_str = False
            continue
        if ch == '"': in_str = True
        elif ch == "{":
            if depth == 0: start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    out.append(json.loads(raw[start:i + 1]))
                except Exception:
                    pass
                start = None
    return out

def valid_lesson(ls):
    if not isinstance(ls, dict): return False, "not an object"
    lid = ls.get("id")
    if not lid or not str(lid).startswith("max_w2_l"): return False, "bad id"
    c = ls.get("content") or {}
    ex = c.get("explain") or ""
    if len(ex) < 80: return False, "explain too short (%d)" % len(ex)
    pr = c.get("practice") or []
    if len(pr) < 3: return False, "practice < 3"
    for q in pr:
        if not isinstance(q, dict): return False, "practice item not an object"
        if len(q.get("options") or []) != 4: return False, "options != 4"
        ci = q.get("correctIndex")
        if not isinstance(ci, int) or not (0 <= ci <= 3): return False, "correctIndex out of range"
    return True, ""

def main():
    got, problems = {}, []
    for p in sorted(glob.glob(D + "/_w2_lessons_part*.json")):
        raw = open(p).read()
        objs = complete_objects(raw)
        base = os.path.basename(p)
        parsed_whole = True
        try: json.loads(raw)
        except Exception: parsed_whole = False
        kept = 0
        for ls in objs:
            ok, why = valid_lesson(ls)
            if not ok:
                problems.append(base + " " + str(ls.get("id")) + ": " + why); continue
            lid = ls["id"]
            if lid in got: continue
            got[lid] = ls; kept += 1
        print("%s bytes=%d whole_parse=%s complete_objs=%d kept=%d" % (base, len(raw), parsed_whole, len(objs), kept))
    for p in sorted(glob.glob(D + "/_w2_tests/*.json")):
        raw = open(p).read()
        try:
            t = json.loads(raw)
            qs = t.get("questions") or t.get("items") or []
            print("test", os.path.basename(p), "bytes", len(raw), "parses=True questions", len(qs))
        except Exception as e:
            print("test", os.path.basename(p), "bytes", len(raw), "parses=False", str(e)[:70])
    missing = [l for l in EXPECTED if l not in got]
    print("kept lessons:", len(got), "missing:", missing)
    if problems: print("problems:", problems[:8])
    # write repaired merge for build_content.py's glob (data/_w2_lessons_part*.json stays raw;
    # this file is the verified merge the pipeline must prefer)
    if got:
        with open(D + "/_w2_lessons_verified.json", "w") as f:
            json.dump([got[k] for k in sorted(got)], f, indent=1, ensure_ascii=False)
        print("wrote", D + "/_w2_lessons_verified.json")
    # re-packets ONLY for the missing ids, with headroom
    import textwrap
    src = json.load(open(P + "/sprout-w2-ctx/lessons_grade3_w2_source.json"))
    for n in range(0, len(missing), 4):
        chunk = missing[n:n + 4]
        pk = {
            "id": "sprout-w2-lessons-r%d" % (n // 4 + 1),
            "models": ["nvidia/nemotron-3-ultra-550b-a55b:free", "dots-studio/dots-3-note-preview:free", "inclusionai/ling-3.0-flash-sante:free"],
            "task": ("Re-draft ONLY these week-2 open lessons for grade 3, ids: %s.\n"
                     "Output a JSON array of exactly %d objects, shape: "
                     '{"id","title","emoji","minutes":15,"summary","content":{"explain","examples":[2-4 strings],'
                     '"practice":[{"question","options":[4 strings],"correctIndex":0-3,"hint","praise"} x3-5],'
                     '"workbook":[{"prompt","answer"} x0-2]}}.\n'
                     "Cover ONLY the schedule blocks and year-doc text in the source file. Grade-3 wording. "
                     "NEVER use the words Max, Adonis, Luca, Mimi, Sophi, Doni, Saitta. No child is ever wrong/failing. "
                     "Output ONLY the JSON array, no prose, no markdown fences. Keep every string SHORT so nothing is cut off."
                     % (", ".join(chunk), len(chunk))),
            "context_files": [P + "/sprout-w2-ctx/lessons_grade3_w2_source.json"],
            "output_path": "/root/sprout-demo/data/_w2_lessons_gap%d.json" % (n // 4 + 1),
            "max_tokens": 10000,
        }
        with open(P + "/sprout-w2-lessons-r%d.json" % (n // 4 + 1), "w") as f:
            json.dump(pk, f, indent=1)
        print("re-packet", pk["id"], "for", chunk)

if __name__ == "__main__":
    main()
