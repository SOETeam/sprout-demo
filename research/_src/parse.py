#!/usr/bin/env python3
"""Parse McGuffey lessons from Gutenberg plain text; compute stats; emit JSON."""
import json, re, sys, unicodedata

SRC = "/root/sprout-demo/research/_src"

def load(pg):
    t = open(f"{SRC}/pg{pg}.txt", encoding="utf-8").read().replace("\r\n", "\n")
    a = t.find("*** START OF THE PROJECT GUTENBERG EBOOK")
    a = t.find("\n", a) + 1
    b = t.find("*** END OF THE PROJECT GUTENBERG EBOOK")
    t = t[a:b]
    # strip transcriber notes block at head
    t = re.sub(r"^\[Transcriber's Notes:.*?\]\s*", "", t, flags=re.S)
    return t

ROMAN = re.compile(r"^(LESSON\s+([IVXL]+)\.?(?:\s*\.?--\s*REVIEW\.?)?|([IVXL]+)\.\s+[A-Z][A-Z' ,\-\?\!]+\.?\s*\(\d+\))\s*$")

def sections(text, kind):
    lines = text.split("\n")
    heads = []
    for i, ln in enumerate(lines):
        l = ln.strip()
        if kind == "lesson":
            if re.match(r"^LESSON\s+[IVXL]+", l):
                heads.append((i, re.sub(r"\s*\.?--\s*REVIEW\.?", "", l).strip().rstrip(".")))
        else:
            m = re.match(r"^([IVXL]+)\.\s+([A-Z][A-Z' ,\-\?\!]+?)\.?\s*\(\d+\)\s*$", l)
            if m:
                heads.append((i, f"{m.group(1)}. {m.group(2).strip('.')}"))
    out = []
    for n, (i, label) in enumerate(heads):
        end = heads[n + 1][0] if n + 1 < len(heads) else len(lines)
        body = "\n".join(lines[i + 1:end])
        out.append({"label": label, "body": body})
    return out

def clean(body):
    # remove illustration markers, page numerals, standalone letters/phonics drills, [Sound] etc
    body = re.sub(r"\[Illustration[^\]]*\]", " ", body)
    body = re.sub(r"\n\s*\d{1,4}\s*\n", "\n", body)          # page numbers
    body = re.sub(r"\n{3,}", "\n\n", body)
    paras = []
    for p in body.split("\n\n"):
        p = " ".join(x.strip() for x in p.split("\n")).strip()
        if not p: continue
        if re.match(r"^\[.*\]$", p): continue
        # drop pure phonics-drill lines (letters separated by 2+ spaces or lone letters)
        if re.fullmatch(r"[A-Za-z](\s{2,}[A-Za-z])*", p): continue
        if re.fullmatch(r"[A-Za-z,' ]{1,40}", p) and not re.search(r"[.!?]", p) and len(p.split()) <= 8:
            # short header word lists like "at the ran has" or "a fan  a hat"
            if re.search(r"  ", p) or len(p.split()) <= 3:
                continue
        paras.append(p)
    # drop pronunciation/vocab key blocks: paragraphs with no sentence punctuation
    # that contain mid-word apostrophes or parenthesized pronunciations
    body2 = []
    for p in paras:
        if not re.search(r"[.!?]", p) and re.search(r"[a-z]['’][a-z]|\(\s*[a-z]", p):
            continue
        body2.append(p)
    paras = body2
    return "\n\n".join(paras)

VOWELS = "aeiouy"

def syllables(word):
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w: return 0
    if w.endswith("e") and not w.endswith(("le", "ee", "ye")) and len(w) > 3:
        w = w[:-1]
    count, prev = 0, False
    for ch in w:
        v = ch in VOWELS
        if v and not prev: count += 1
        prev = v
    if w.endswith("le") and len(w) > 2 and w[-3] not in VOWELS:
        count += 1
    return max(1, count)

def stats(text):
    t = re.sub(r"\((?:[A-Za-z'\- ]|\d)*\)", "", text)  # parenthetical defs
    t = re.sub(r"[—–]", " ", t)
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", t) if re.search(r"[A-Za-z]", s)]
    words = re.findall(r"[A-Za-z']+", t)
    if not sentences or not words:
        return None
    syl = sum(syllables(w) for w in words)
    wps = len(words) / len(sentences)
    spw = syl / len(words)
    fk = 0.39 * wps + 11.8 * spw - 15.59
    fre = 206.835 - 1.015 * wps - 84.6 * spw
    return {"words": len(words), "sentences": len(sentences),
            "words_per_sentence": round(wps, 1),
            "syllables_per_word": round(spw, 2),
            "fk_grade": round(fk, 1), "flesch_ease": round(fre, 1)}

def vocab(text):
    return sorted(set(w.lower() for w in re.findall(r"[A-Za-z']+", text)))

books = {
    "K":  {"pg": 14642, "kind": "lesson", "title": "McGuffey's Eclectic Primer, Revised Edition"},
    "1":  {"pg": 14640, "kind": "lesson", "title": "McGuffey's First Eclectic Reader, Revised Edition"},
    "2":  {"pg": 14668, "kind": "lesson", "title": "McGuffey's Second Eclectic Reader"},
    "4":  {"pg": 14880, "kind": "section", "title": "McGuffey's Fourth Eclectic Reader, Revised Edition"},
}

result = {}
for band, meta in books.items():
    secs = sections(load(meta["pg"]), meta["kind"])
    parsed = []
    for s in secs:
        body = clean(s["body"])
        st = stats(body)
        if not st or st["words"] < 15:
            continue
        parsed.append({"label": s["label"], "text": body, "stats": st, "vocab": vocab(body)})
    result[band] = parsed
    print(f"band {band}: {len(parsed)} usable sections from pg{meta['pg']}")

json.dump(result, open(f"{SRC}/lessons.json", "w"), indent=1)
for band in result:
    print(f"--- band {band}")
    for p in result[band]:
        st = p["stats"]
        print(f"  {p['label'][:40]:42s} w={st['words']:4d} sent={st['sentences']:3d} wps={st['words_per_sentence']:5.1f} FK={st['fk_grade']:5.1f}")
