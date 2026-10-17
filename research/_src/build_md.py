#!/usr/bin/env python3
"""Emit research/pd_readers_k5.md from passages.json + word_sets.json."""
import json

SRC = "/root/sprout-demo/research/_src"
OUT = "/root/sprout-demo/research/pd_readers_k5.md"

pas = json.load(open(f"{SRC}/passages.json"))
ws = json.load(open(f"{SRC}/word_sets.json"))

BANDS = {
    "K": {
        "title": "Band K (Kindergarten)",
        "source": "McGuffey's Eclectic Primer, Revised Edition (1879/1896/1909 revisions)",
        "pg": 14642,
        "url": "https://www.gutenberg.org/ebooks/14642",
        "rationale": (
            "The Primer is the entry volume of the McGuffey series, explicitly written \"to precede "
            "the First Reader\" with \"only about six new words\" mastered per lesson. Parsed lessons "
            "measure FK grade \u22122.3 to +0.4 with 15\u201372 words per lesson \u2014 the right band for "
            "kindergarten read-alouds and first decodable attempts. Lesson order in the book is itself "
            "a phonics sequence (CVC families: cat/rat, hat/fan), so selecting lessons in book order "
            "gives a free scope-and-sequence."
        ),
    },
    "1": {
        "title": "Band 1 (Grade 1)",
        "source": "McGuffey's First Eclectic Reader, Revised Edition",
        "pg": 14640,
        "url": "https://www.gutenberg.org/ebooks/14640",
        "rationale": (
            "Direct successor to the Primer. Parsed lessons run 19\u2013326 words with FK grade \u22122.3 "
            "to +8.1; the selected passages sit in the \u22122.3 to +2.4 window (mid-year to end-of-year "
            "grade 1). Sentences stay under ~11 words, vocabulary stays inside Dolch pre-primer+primer "
            "plus new grade-1 sight words, which lets each passage pair cleanly with the weekly word sets."
        ),
    },
    "2": {
        "title": "Band 2 (Grade 2)",
        "source": "McGuffey's Second Eclectic Reader",
        "pg": 14668,
        "url": "https://www.gutenberg.org/ebooks/14668",
        "rationale": (
            "Parsed lessons run 63\u2013414 words with FK grade +0.9 to +12.0; selected passages cluster "
            "at FK +0.3 to +4.1 (shorter end of the book, which overlaps late grade 1 and gives grade 2 "
            "readers early wins) with two stretch pieces at +4.1. Multi-paragraph narratives with "
            "dialogue and poetry appear here for the first time \u2014 the right step up from band 1."
        ),
    },
    "4": {
        "title": "Band 4 (Grade 4)",
        "source": "McGuffey's Fourth Eclectic Reader, Revised Edition",
        "pg": 14880,
        "url": "https://www.gutenberg.org/ebooks/14880",
        "rationale": (
            "No grade-3 volume is needed for the K/1/2/4 lane plan; the Third Reader (pg 14766) is "
            "catalogued below as a spare. The Fourth Reader's parsed sections run 137\u20131,935 words "
            "with FK +2.0 to +15.9. Selected passages span FK +2.7 to +7.2 \u2014 mostly fables, poems, "
            "and short moral tales, which is on-grade for 4 with the verse pieces as read-aloud "
            "stretch. Sections are labeled with the book's own Roman-numeral section headings."
        ),
    },
}

SUPPLEMENT = """
### Supplementary public-domain sources (not used in the 48 passages, available for expansion)

| Source | Gutenberg | Use |
|---|---|---|
| McGuffey's Third Eclectic Reader | https://www.gutenberg.org/ebooks/14766 | Grade 2\u21923 bridge band if a grade-3 lane is added |
| McGuffey's Fifth Eclectic Reader | https://www.gutenberg.org/ebooks/15040 | Grade 5 lane |
| McGuffey's Sixth Eclectic Reader | https://www.gutenberg.org/ebooks/16751 | Grade 5+ stretch |
| The New McGuffey First Reader (1879) | https://www.gutenberg.org/ebooks/1489 | Alternate grade-1 text |
| The New McGuffey Fourth Reader | https://www.gutenberg.org/ebooks/1490 | Alternate grade-4 text |
| McGuffey's Eclectic Spelling Book | https://www.gutenberg.org/ebooks/15456 | Spelling/phonics lists, PD |
| The Elson Readers, Book 5 | https://www.gutenberg.org/ebooks/9106 | Elson series only survives on Gutenberg at Book 5 \u2014 grade 5, not in the K/1/2/4 lane; Elson Grammar School Literature book 4 (https://www.gutenberg.org/ebooks/6963) is junior-high literature, not a grade-4 reader |
| The Aesop for Children (1919, Milo Winter illus.) | https://www.gutenberg.org/ebooks/19994 | Fable prose at ~FK 4\u20136; pairs with grade 2\u20134 |
| Aesop's Fables, Vols. 1\u201310 (Jacobes/Vance trim) | https://www.gutenberg.org/ebooks/19616 | Alternate fable source |
| Three Hundred Aesop's Fables (Jacobs) | https://www.gutenberg.org/ebooks/21 | Full fable corpus |

**Elson note:** the brief asked for Elson Readers. Gutenberg hosts only *The Elson Readers, Book 5* (pg 9106) \u2014 too advanced for K/1/2/4 \u2014 and the *Elson Grammar School Literature* series (books 4\u20136), which is a junior-high literature anthology rather than a primary reader. So Elson is catalogued but not used; McGuffey covers all four bands with a graded series.
"""

lines = []
A = lines.append
A("# Public-Domain Reader Corpus \u2014 K / 1 / 2 / 4 (Lane B)")
A("")
A("**Status:** research catalog + leveled passages. No licensing cost: every text below is")
A("public domain in the US (all published pre-1930), sourced from Project Gutenberg plain-text")
A("editions. Passages are **verbatim** Gutenberg text \u2014 the only edits are mechanical")
A("de-artifacting (see *Extraction method*). No LLM rewriting at any point.")
A("")
A("## Corpus at a glance")
A("")
A("| Band | Volume | Gutenberg | Passages | Words | FK range of picks |")
A("|---|---|---|---|---|---|")
for b, m in BANDS.items():
    items = pas[b]
    tot = sum(i["stats"]["words"] for i in items)
    fks = [i["stats"]["fk_grade"] for i in items]
    A(f"| {b} | {m['source']} | [pg {m['pg']}]({m['url']}) | {len(items)} | {tot} "
      f"| {min(fks):+.1f} \u2026 {max(fks):+.1f} |")
A("")
A("Companion data files:")
A("- `research/word_sets.json` \u2014 Dolch stages (verbatim, 1936), Fry 1st/2nd/3rd hundred, and 35 weekly sets (K: 12, G1: 11, G2: 12)")
A("- `research/pd_readers_passages.json` \u2014 the 48 passages below, machine-readable, with per-passage stats")
A("")
A("## Licensing basis")
A("")
A("- All McGuffey volumes: published 1836\u20131920, revisions pre-1930; Project Gutenberg dedicates its transcriptions to the public domain in the US (Gutenberg Trademark/license terms apply to the *mark*, not the texts).")
A("- Dolch word list: E. W. Dolch, \"A Basic Sight Vocabulary\" (1936) \u2014 word lists are uncopyrightable factual data, and the 1936 publication is public domain anyway.")
A("- Fry instant words: frequency lists (factual data). We store the list, not Fry's book text.")
A("- Aesop: translations by George Fyler Townsend (1867) / James Jacobs (1894) \u2014 public domain.")
A("- Caveat: outside the US, check local term rules (life-of-author + 70 in the EU; McGuffey authors died pre-1930, so still PD in the EU as well).")
A("")
A("## Extraction method (verbatim guarantee)")
A("")
A("1. Downloaded each Gutenberg plain-text edition (`/cache/epub/NNNNN/pgNNNNN.txt`).")
A("2. Stripped the Gutenberg header/footer and transcriber's note block.")
A("3. Split into lessons (`LESSON <roman>.` headings) for Primer/First/Second Readers and")
A("   numbered sections (`I. TITLE. (page)`) for the Fourth Reader.")
A("4. Mechanical de-artifacting only: illustration placeholders `[Illustration: ...]`, bare page")
A("   numbers, standalone letter rows, and standalone phonics/vocab drill blocks (e.g.")
A("   `twit-twee  bough (bow)  ...`). Sentence text is untouched \u2014 punctuation, spelling, and")
A("   diction are exactly as Gutenberg transcribes the 19th-century print.")
A("5. Computed word count, words/sentence, syllables/word, Flesch\u2013Kincaid grade, and Flesch")
A("   reading ease per passage with a standard syllable heuristic (script in `research/_src/`).")
A("")
A("Readability caveat: FK understates difficulty for these texts because 19th-century vocabulary")
A("is harder than its sentence length suggests \u2014 treat FK as a relative comparator across our own")
A("corpus, not as a calibrated grade placement.")
A("")
for b, m in BANDS.items():
    A(f"## {m['title']}")
    A("")
    A(f"- **Source:** {m['source']}")
    A(f"- **Gutenberg:** {m['url']}")
    A(f"- **Level rationale:** {m['rationale']}")
    A("")
    for n, p in enumerate(pas[b], 1):
        s = p["stats"]
        A(f"### {b}.{n} \u2014 {p['label']}")
        A("")
        A(f"*{s['words']} words \u00b7 {s['sentences']} sentences \u00b7 {s['words_per_sentence']:.1f} w/s "
          f"\u00b7 FK {s['fk_grade']:+.1f} \u00b7 Flesch ease {s['flesch_ease']:.0f}*")
        A("")
        for para in p["text"].split("\n\n"):
            A(f"> {para}")
            A(">")
        if lines[-1] == ">":
            lines.pop()
        A("")
A("## Weekly decodable word sets (K\u20132)")
A("")
A(f"**{len(ws['weekly_sets'])} weekly sets** built from Dolch stages in published order (the Dolch")
A("progression is already roughly grade-leveled) plus Fry hundreds for coverage of non-Dolch")
A("high-frequency words. Cumulative new words by grade: K = 92 (all Dolch pre-primer+primer),")
A("G1 = 41 Dolch grade-1 + Fry 1st-100 new words, G2 = Dolch grade 2+3 + Fry 2nd/3rd-100 new")
A("words. Full structured JSON in `research/word_sets.json` (`weekly_sets[]` with")
A("`grade`, `week`, `id`, `title`, `new_words[]`, `new_count`; plus complete `dolch_stages` and")
A("`fry_hundreds` blocks).")
A("")
A("| Set | Grade | Week | Title | New words |")
A("|---|---|---|---|---|")
for s in ws["weekly_sets"]:
    A(f"| {s['id']} | {s['grade']} | {s['week']} | {s['title']} | {s['new_count']} |")
A("")
A("First week of each grade, for spot-check:")
A("")
for gid in ("K-w01", "1-w01", "2-w01"):
    s = next(x for x in ws["weekly_sets"] if x["id"] == gid)
    A(f"- **{gid}** ({s['title']}): {', '.join(s['new_words'])}")
A("")
A(SUPPLEMENT.strip())
A("")
A("## Pairing suggestion (research note, not implementation)")
A("")
A("Each band's passages are in ascending difficulty order, so a curriculum can walk the list")
A("top-to-bottom while the weekly word sets run on their own 35-week clock; a passage is")
A("\"unlocked\" once its running vocabulary sits inside Dolch pre-primer\u2192grade-3 + Fry 1\u20133")
A("hundreds. Per-passage unique vocabularies are in `pd_readers_passages.json` for that check.")
A("")

open(OUT, "w").write("\n".join(lines) + "\n")
print("wrote", OUT, len(lines), "lines")
