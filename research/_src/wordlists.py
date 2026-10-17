#!/usr/bin/env python3
"""Build ~30 weekly decodable word sets (K-2) from Dolch stages + Fry 1st/2nd/3rd 100."""
import json, re, html

SRC = "/root/sprout-demo/research/_src"

# --- Dolch (E.W. Dolch, "A Basic Sight Vocabulary", 1936 — public domain) ---
t = open(f"{SRC}/dolch_wiki.html", encoding="utf-8").read()
t = re.sub(r"<(script|style).*?</\1>", "", t, flags=re.S)
t = re.sub(r"<[^>]+>", "\n", t)
t = html.unescape(t)
lines = [l.strip() for l in t.split("\n") if l.strip()]
txt = "\n".join(lines)

def grab(pattern):
    m = re.search(pattern, txt)
    assert m, pattern
    return [w.strip().lower() for w in m.group(1).split(",")]

dolch = {
    "pre_primer": grab(r"Pre-primer\s*:\s*\(40 words\)\s*([^\n]+)"),
    "primer":     grab(r"Primer\s*:\s*\(52 words\)\s*([^\n]+)"),
    "grade_1":    grab(r"1st Grade\s*:\s*\(41 words\)\s*([^\n]+)"),
    "grade_2":    grab(r"2nd Grade\s*:\s*\(47 words\)\s*([^\n]+)"),
    "grade_3":    grab(r"3rd Grade\s*:\s*\(41 words\)\s*([^\n]+)"),
    "nouns":      grab(r"\(97 words\)\s*([^\n]+)"),
}
for k, v in dolch.items():
    print(k, len(v))

# --- Fry instant words (Fry, "Teaching Reading Isn't Enough" 1968/1980 lists;
#     word-frequency lists are factual data) — 1st/2nd/3rd hundred as transcribed
#     from sightwords.com canonical ordering ---
fry_1 = """a about all am an and are as at be been but by called can come could day did do down
each find first for from get go had has have he her him his how I if in into is it its like long
look made make many may more my no not now number of on on one or other out part people said see
she so some than that the their them then there these they this time to two up use was water way
we were what when which who will with words would write you your""".split()
fry_2 = """after again air also America animal another answer any around ask away back because before
big boy came change different does end even follow form found give good great hand help here home
house just kind know land large learn letter line little live man me means men most mother move much
must name need new off old only our over page picture place play point put read right same say
sentence set should show small sound spell still study such take tell things think three through too
try turn us very want well went where why work world years""".split()
fry_3 = """above add almost along always began begin being below between book both car carry children
city close country cut don't earth eat enough every example eyes face family far father feet few food
four girl got group grow hard head hear high idea important Indian it's keep last late leave left let
life light list might mile miss mountains near never next night often once open own paper plant real
river run saw school sea second seem side something sometimes song soon start state stop story talk
those thought together took tree under until walk watch while white without young""".split()
def dedup(ws):
    seen=set(); out=[]
    for w in ws:
        w=w.lower()
        if w not in seen: seen.add(w); out.append(w)
    return out
fry = {"hundred_1": dedup(fry_1), "hundred_2": dedup(fry_2), "hundred_3": dedup(fry_3)}
assert len(fry["hundred_1"]) == 100, len(fry["hundred_1"])
assert len(fry["hundred_2"]) == 100, len(fry["hundred_2"])
assert len(fry["hundred_3"]) == 100, len(fry["hundred_3"])

# --- weekly sets: cumulative 36 weeks (K 12, G1 12, G2 12) ---
sets = []
def emit(grade, week, name, words, review_from=None):
    sets.append({
        "grade": grade, "week": week, "id": f"{grade}-w{week:02d}",
        "title": name, "new_words": words,
        "new_count": len(words),
    })

K_SPLIT = [("pre_primer", 4), ("primer", 8)]  # 4 weeks pre-primer, 8 weeks primer
w = 1
for stage, nweeks in K_SPLIT:
    words = dolch[stage]
    per = -(-len(words) // nweeks)
    for i in range(nweeks):
        chunk = words[i * per:(i + 1) * per]
        if chunk:
            emit("K", w, f"Dolch {stage.replace('_', ' ')} ({i+1}/{nweeks})", chunk)
            w += 1
# K nouns sprinkled: weeks already counted; add noun practice into weeks via extra field later

# Grade 1: Dolch grade_1 (41) + Fry hundred_1 not already in Dolch, over 12 weeks
w = 1
g1 = dolch["grade_1"]
emit("1", w, "Dolch grade 1 (1/3)", g1[0:14]); w += 1
emit("1", w, "Dolch grade 1 (2/3)", g1[14:28]); w += 1
emit("1", w, "Dolch grade 1 (3/3)", g1[28:41]); w += 1
known = set(dolch["pre_primer"]) | set(dolch["primer"]) | set(g1)
fry_new = [x for x in fry["hundred_1"] if x not in known]
per = -(-len(fry_new) // 9)
for i in range(9):
    chunk = fry_new[i * per:(i + 1) * per]
    if chunk:
        emit("1", w, f"Fry 1st 100 new words ({i+1}/9)", chunk); w += 1

# Grade 2: Dolch grade_2 (47) + grade_3 (41) + Fry 2nd/3rd 100 new words, 12 weeks
w = 1
g2 = dolch["grade_2"]; g3 = dolch["grade_3"]
emit("2", w, "Dolch grade 2 (1/2)", g2[0:24]); w += 1
emit("2", w, "Dolch grade 2 (2/2)", g2[24:47]); w += 1
emit("2", w, "Dolch grade 3 (1/2)", g3[0:21]); w += 1
emit("2", w, "Dolch grade 3 (2/2)", g3[21:41]); w += 1
known |= set(g2) | set(g3)
fry_new2 = [x for x in (fry["hundred_2"] + fry["hundred_3"]) if x not in known]
per = -(-len(fry_new2) // 8)
for i in range(8):
    chunk = fry_new2[i * per:(i + 1) * per]
    if chunk:
        emit("2", w, f"Fry 2nd/3rd 100 new words ({i+1}/8)", chunk); w += 1

print("total sets:", len(sets), "| by grade:",
      {g: sum(1 for s in sets if s["grade"] == g) for g in ("K", "1", "2")})
print("total new words:", sum(s["new_count"] for s in sets))

doc = {
    "$comment": ("Weekly high-frequency word sets for K-2 decodable-reader pairing. "
                 "Word list sources: Dolch, E.W. 'A Basic Sight Vocabulary' (1936, public domain); "
                 "Fry instant words frequency lists (factual word-frequency data). "
                 "Word lists themselves are uncopyrightable factual data; no passage text here."),
    "dolch_stages": dolch,
    "fry_hundreds": fry,
    "weekly_sets": sets,
}
json.dump(doc, open(f"{SRC}/word_sets.json", "w"), indent=1)
print("written word_sets.json")
