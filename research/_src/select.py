#!/usr/bin/env python3
"""Select 8-12 passages per band; emit passages.json for the report."""
import json

SRC = "/root/sprout-demo/research/_src"
d = json.load(open(f"{SRC}/lessons.json"))

PICKS = {
    "K": [  # band K: short, very-high-imageability lessons, spread across the book
        "LESSON II", "LESSON III", "LESSON VI", "LESSON VII", "LESSON VIII",
        "LESSON IX", "LESSON X", "LESSON XVIII", "LESSON XXII", "LESSON XXIV",
        "LESSON XXV", "LESSON XLIV",
    ],
    "1": [
        "LESSON VI", "LESSON VII", "LESSON X", "LESSON XI", "LESSON XIII",
        "LESSON XX", "LESSON XXII", "LESSON XXIII", "LESSON XXVIII",
        "LESSON XXIX", "LESSON XXXI", "LESSON LI",
    ],
    "2": [
        "LESSON XI", "LESSON VI", "LESSON XXVIII", "LESSON LI", "LESSON I",
        "LESSON II", "LESSON XXXVIII", "LESSON LII", "LESSON LIV",
        "LESSON LVI", "LESSON LXI", "LESSON XLV",
    ],
    "4": [
        "II. TRY, TRY AGAIN", "VII. LAZY NED", "IX. MEDDLESOME MATTY",
        "XIII. PICCOLA", "XVI. THE BROWN THRUSH", "XX. FREAKS OF THE FROST",
        "XXII. JEANNETTE AND JO", "XXVI. IN TIME'S SWING",
        "XXXVIII. THE SUMMER SHOWER", "XLV. THE TEMPEST",
        "XLIX. THE SANDPIPER", "LII. THE SNOW MAN",
    ],
}

out = {}
for band, labels in PICKS.items():
    items = []
    for lab in labels:
        m = [x for x in d[band] if x["label"] == lab]
        assert len(m) == 1, (band, lab, len(m))
        p = m[0]
        items.append({
            "label": p["label"],
            "text": p["text"],
            "stats": p["stats"],
            "new_vocab_vs_band": None,  # filled below
        })
    out[band] = items

# cumulative-vocabulary ordering note: compute band-wide coverage later
json.dump(out, open(f"{SRC}/passages.json", "w"), indent=1)

for band, items in out.items():
    tot = sum(i["stats"]["words"] for i in items)
    print(f"band {band}: {len(items)} passages, {tot} total words")
    for i in items:
        s = i["stats"]
        print(f"  {i['label'][:38]:40s} w={s['words']:4d} FK={s['fk_grade']:5.1f} ease={s['flesch_ease']:6.1f}")
