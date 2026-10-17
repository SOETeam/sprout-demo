# Source-extraction scripts (regenerate deliverables)

Provenance for `../pd_readers_k5.md`, `../pd_readers_passages.json`, `../word_sets.json`.
Raw Gutenberg texts and the Dolch Wikipedia snapshot are NOT committed (re-downloadable):

    curl -o pg14642.txt https://www.gutenberg.org/cache/epub/14642/pg14642.txt   # Primer (K)
    curl -o pg14640.txt https://www.gutenberg.org/cache/epub/14640/pg14640.txt   # First Reader (1)
    curl -o pg14668.txt https://www.gutenberg.org/cache/epub/14668/pg14668.txt   # Second Reader (2)
    curl -o pg14880.txt https://www.gutenberg.org/cache/epub/14880/pg14880.txt   # Fourth Reader (4)
    curl -L -o dolch_wiki.html https://en.wikipedia.org/wiki/Dolch_word_list

Then, from this directory:

    python3 parse.py       # -> lessons.json (all lessons parsed + FK stats)
    python3 select.py      # -> passages.json (curated 12/band, ascending difficulty)
    python3 wordlists.py   # -> word_sets.json (35 weekly Dolch/Fry sets)
    python3 build_md.py    # -> ../pd_readers_k5.md

Copy passages.json and word_sets.json up one level into research/ after select/wordlists.
Verbatim check used at review time: every emitted paragraph, whitespace-normalized, must
appear as a substring of the corresponding raw pg*.txt (357/357 passed).
