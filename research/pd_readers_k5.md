# Public-Domain Reader Corpus — K / 1 / 2 / 4 (Lane B)

**Status:** research catalog + leveled passages. No licensing cost: every text below is
public domain in the US (all published pre-1930), sourced from Project Gutenberg plain-text
editions. Passages are **verbatim** Gutenberg text — the only edits are mechanical
de-artifacting (see *Extraction method*). No LLM rewriting at any point.

## Corpus at a glance

| Band | Volume | Gutenberg | Passages | Words | FK range of picks |
|---|---|---|---|---|---|
| K | McGuffey's Eclectic Primer, Revised Edition (1879/1896/1909 revisions) | [pg 14642](https://www.gutenberg.org/ebooks/14642) | 12 | 461 | -2.3 … -0.0 |
| 1 | McGuffey's First Eclectic Reader, Revised Edition | [pg 14640](https://www.gutenberg.org/ebooks/14640) | 12 | 731 | -2.3 … +1.8 |
| 2 | McGuffey's Second Eclectic Reader | [pg 14668](https://www.gutenberg.org/ebooks/14668) | 12 | 2549 | +0.3 … +4.1 |
| 4 | McGuffey's Fourth Eclectic Reader, Revised Edition | [pg 14880](https://www.gutenberg.org/ebooks/14880) | 12 | 3079 | +2.7 … +7.2 |

Companion data files:
- `research/word_sets.json` — Dolch stages (verbatim, 1936), Fry 1st/2nd/3rd hundred, and 35 weekly sets (K: 12, G1: 11, G2: 12)
- `research/pd_readers_passages.json` — the 48 passages below, machine-readable, with per-passage stats

## Licensing basis

- All McGuffey volumes: published 1836–1920, revisions pre-1930; Project Gutenberg dedicates its transcriptions to the public domain in the US (Gutenberg Trademark/license terms apply to the *mark*, not the texts).
- Dolch word list: E. W. Dolch, "A Basic Sight Vocabulary" (1936) — word lists are uncopyrightable factual data, and the 1936 publication is public domain anyway.
- Fry instant words: frequency lists (factual data). We store the list, not Fry's book text.
- Aesop: translations by George Fyler Townsend (1867) / James Jacobs (1894) — public domain.
- Caveat: outside the US, check local term rules (life-of-author + 70 in the EU; McGuffey authors died pre-1930, so still PD in the EU as well).

## Extraction method (verbatim guarantee)

1. Downloaded each Gutenberg plain-text edition (`/cache/epub/NNNNN/pgNNNNN.txt`).
2. Stripped the Gutenberg header/footer and transcriber's note block.
3. Split into lessons (`LESSON <roman>.` headings) for Primer/First/Second Readers and
   numbered sections (`I. TITLE. (page)`) for the Fourth Reader.
4. Mechanical de-artifacting only: illustration placeholders `[Illustration: ...]`, bare page
   numbers, standalone letter rows, and standalone phonics/vocab drill blocks (e.g.
   `twit-twee  bough (bow)  ...`). Sentence text is untouched — punctuation, spelling, and
   diction are exactly as Gutenberg transcribes the 19th-century print.
5. Computed word count, words/sentence, syllables/word, Flesch–Kincaid grade, and Flesch
   reading ease per passage with a standard syllable heuristic (script in `research/_src/`).

Readability caveat: FK understates difficulty for these texts because 19th-century vocabulary
is harder than its sentence length suggests — treat FK as a relative comparator across our own
corpus, not as a calibrated grade placement.

## Band K (Kindergarten)

- **Source:** McGuffey's Eclectic Primer, Revised Edition (1879/1896/1909 revisions)
- **Gutenberg:** https://www.gutenberg.org/ebooks/14642
- **Level rationale:** The Primer is the entry volume of the McGuffey series, explicitly written "to precede the First Reader" with "only about six new words" mastered per lesson. Parsed lessons measure FK grade −2.3 to +0.4 with 15–72 words per lesson — the right band for kindergarten read-alouds and first decodable attempts. Lesson order in the book is itself a phonics sequence (CVC families: cat/rat, hat/fan), so selecting lessons in book order gives a free scope-and-sequence.

### K.1 — LESSON II

*20 words · 4 sentences · 5.0 w/s · FK -1.8 · Flesch ease 117*

> The cat has a rat.
>
> The rat ran at Ann.
>
> Ann has a cat.
>
> The cat ran at the rat.

### K.2 — LESSON III

*15 words · 4 sentences · 3.8 w/s · FK -2.3 · Flesch ease 118*

> Ann and Nat.
>
> Ann has a fan.
>
> Nat has a hat.
>
> Ann can fan Nat.

### K.3 — LESSON VI

*25 words · 5 sentences · 5.0 w/s · FK -1.8 · Flesch ease 117*

> Has the lad a dog?
>
> The lad has a fat dog.
>
> The dog has Nat's cap.
>
> Nat and Rab ran.
>
> Rab ran at a cat.

### K.4 — LESSON VII

*26 words · 5 sentences · 5.2 w/s · FK -1.8 · Flesch ease 117*

> See the frog on a log.
>
> Rab sees the frog.
>
> Can the frog see Rab?
>
> The frog can see the dog.
>
> Rab ran at the frog.

### K.5 — LESSON VIII

*23 words · 4 sentences · 5.8 w/s · FK -1.5 · Flesch ease 116*

> See the lamp! It is on a mat.
>
> The mat is on the stand.
>
> The lamp is Nat's, and the mat is Ann's.

### K.6 — LESSON IX

*35 words · 5 sentences · 7.0 w/s · FK -1.1 · Flesch ease 115*

> Tom   nag   not   him   catch   he   his    ch
>
> See the nag! It is Tom's nag.
>
> Can Tom catch his nag?
>
> He can not catch him.
>
> The dog ran at the nag, and the nag ran.

### K.7 — LESSON X

*72 words · 11 sentences · 6.5 w/s · FK -1.2 · Flesch ease 116*

> Tom's nag is fat; his dog is not fat.
>
> Nat is on Tom's nag.
>
> Nat's dog, Rab, can not catch the rat.
>
> See the frog on the log.
>
> A lad sees the frog.
>
> The lad can not catch it.
>
> A cat is on the mat; the cat sees a rat.
>
> Ann's fan is on the stand.
>
> The man has a lamp.
>
> A dog ran at the man.
>
> Ann sat on a log.

### K.8 — LESSON XVIII

*29 words · 5 sentences · 5.8 w/s · FK -0.7 · Flesch ease 110*

> This is a pet bird.
>
> It lives in a new cage.
>
> It will stand on Sue's hand, and sing.
>
> Sue loves her pet bird.
>
> So do I love it.

### K.9 — LESSON XXII

*33 words · 5 sentences · 6.6 w/s · FK -0.9 · Flesch ease 113*

> The day is hot.
>
> The cows are in the shade of the big tree.
>
> They feed on the new grass.
>
> Our cows do not run off.
>
> At night they come to the barn.

### K.10 — LESSON XXIV

*37 words · 5 sentences · 7.4 w/s · FK -0.6 · Flesch ease 112*

> The ship has run on a rock.
>
> Five men are on the ship.
>
> If the boat can not get to them, they will drown.
>
> The boat has brave men in it. They will save the five men.

### K.11 — LESSON XXV

*105 words · 12 sentences · 8.8 w/s · FK -0.0 · Flesch ease 111*

> Come, boys, and feed the cows. The sun has set, and they are at the barn.
>
> Sue has a bell on the neck of her pet cat.
>
> One hot day Ann and Nell sat on the grass in the shade of a big tree. They like to rock their dolls, and sing to them.
>
> The brave men in our boat are on their way to the ship. They will save the men in the ship, if they can. They will not let them drown.
>
> What bird has big eyes? The owl. Can an owl see at night? Yes, an owl can see best at night.

### K.12 — LESSON XLIV

*41 words · 7 sentences · 5.9 w/s · FK -0.6 · Flesch ease 110*

> "Buzz! buzz!" a bee said to Mary.
>
> "What do you mean?" said Mary. "Please tell me once more."
>
> "Buzz! buzz! buzz!" but Mary could not tell its wants.
>
> I think it said, "Please let me get some sweets in this vine.

## Band 1 (Grade 1)

- **Source:** McGuffey's First Eclectic Reader, Revised Edition
- **Gutenberg:** https://www.gutenberg.org/ebooks/14640
- **Level rationale:** Direct successor to the Primer. Parsed lessons run 19–326 words with FK grade −2.3 to +8.1; the selected passages sit in the −2.3 to +2.4 window (mid-year to end-of-year grade 1). Sentences stay under ~11 words, vocabulary stays inside Dolch pre-primer+primer plus new grade-1 sight words, which lets each passage pair cleanly with the weekly word sets.

### 1.1 — LESSON VI

*19 words · 5 sentences · 3.8 w/s · FK -2.3 · Flesch ease 118*

> Ann can catch Rab.
>
> See! She has the hat.
>
> Now Ann can pat Rab.
>
> Let me pat Rab, too.

### 1.2 — LESSON VII

*37 words · 5 sentences · 7.4 w/s · FK -0.9 · Flesch ease 115*

> Ned    eggs    black    left    fed    nest    them    get    will
>
> Ned has fed the hen.
>
> She is a black hen.
>
> She has left the nest.
>
> See the eggs in the nest!
>
> Will the hen let Ned get them?

### 1.3 — LESSON X

*51 words · 6 sentences · 8.5 w/s · FK -0.5 · Flesch ease 114*

> Nell    some    pan    him    yes     do      you    have
>
> Do you see Nell?
>
> Yes; she has a pan with some eggs in it.
>
> Let me have the pan and the eggs, will you, Nell?
>
> Has the black hen left the nest?
>
> I will now run to catch Rab. Will you run, too?

### 1.4 — LESSON XI

*40 words · 6 sentences · 6.7 w/s · FK -1.2 · Flesch ease 116*

> O    whip    Ben    up    still    sit    if    stand    Jip
>
> O Ben! let me get in, will you?
>
> Yes, if you will sit still.
>
> Stand still, Jip, and let Ann get in.
>
> Now, Ben, hand me the whip.
>
> Get up, Jip!
>
> 1,2.

### 1.5 — LESSON XIII

*37 words · 5 sentences · 7.4 w/s · FK -0.6 · Flesch ease 112*

> Look at Tom and his dog. The dog has a black spot on his back. Do you think he is a good dog?
>
> Tom has a big top, too. It is on the box with Kitty's doll.

### 1.6 — LESSON XX

*57 words · 7 sentences · 8.1 w/s · FK +0.2 · Flesch ease 108*

> mam ma'    large    as      pa pa     arms      ride
>
> far        barn     both    Prince    trot      your
>
> Papa, will you let me ride with you on Prince? I will sit still in your arms.
>
> See, mamma! We are both on Prince. How large he is!
>
> Get up, Prince! You are not too fat to trot as far as the barn.

### 1.7 — LESSON XXII

*66 words · 7 sentences · 9.4 w/s · FK +0.4 · Flesch ease 109*

> had    went    call    might    flag    near    swam    swing
>
> Did you call us, mamma?
>
> I went with Tom to the pond. I had my doll, and Tom had his flag.
>
> The fat duck swam to the bank, and we fed her. Did you think we might fall into the pond?
>
> We did not go too near, did we, Tom?
>
> May we go to the swing, now, mamma?

### 1.8 — LESSON XXIII

*95 words · 9 sentences · 10.6 w/s · FK +0.8 · Flesch ease 108*

> here    band     hear     horse    play    they
>
> pass    where    front    fine     hope    comes
>
> Here comes the band! Shall we call mamma and Fanny to see it?
>
> Let us stand still, and hear the men play as they pass.
>
> I hope they will stop here and play for us.
>
> See the large man in front of the band, with his big hat. What has he in his hand? How fine he looks!
>
> Look, too, at the man on that fine horse.
>
> If the men do not stop, let us go with them and see where they go.

### 1.9 — LESSON XXVIII

*67 words · 10 sentences · 6.7 w/s · FK +1.3 · Flesch ease 98*

> peep    while    take    sleep    tuck    safe
>
> Peep, peep! Where have you gone, little chick? Are you lost? Can't you get back to the hen?
>
> Oh, here you are! I will take you back. Here, hen, take this little chick under your wing.
>
> Now, chick, tuck your little, wet feet under you, and go to sleep for a while.
>
> Peep, peep! How safe the little chick feels now!

### 1.10 — LESSON XXIX

*90 words · 11 sentences · 8.2 w/s · FK +0.2 · Flesch ease 108*

> wind    time      there    fence    kite    high
>
> eyes    bright    flies    why      day     shines
>
> This is a fine day. The sun shines bright. There is a good wind, and my kite flies high. I can just see it.
>
> The sun shines in my eyes; I will stand in the shade of this high fence.
>
> Why, here comes my dog! He was under the cart. Did you see him there?
>
> What a good time we have had! Are you not glad that we did not go to the woods with John?
>
> SLATE WORK.

### 1.11 — LESSON XXXI

*90 words · 9 sentences · 10.0 w/s · FK +1.8 · Flesch ease 100*

> bound     Rose       called     got       drown      found       brave
>
> "Here, Ponto! Here, Ponto!" Kate called to her dog. "Come, and get the dolls out of the pond."
>
> Rose went under, but she did not drown. Bess was still on the top of the water.
>
> Ponto came with a bound, and jumped into the pond. He swam around, and got Bess in his mouth, and brought her to the shore.
>
> Ponto then found Rose, and brought her out, too.
>
> Kate said, "Good, old Ponto! Brave old dog!"
>
> What do you think of Ponto?

### 1.12 — LESSON LI

*82 words · 12 sentences · 6.8 w/s · FK +1.2 · Flesch ease 99*

> Ellen, do look at Fido! He sits up in a chair, with my hat on. He looks like a little boy; but it is only Fido.
>
> Now see him shake hands. Give me your paw, Fido. How do you do, sir? Will you take dinner with us. Fido? Speak! Fido says, "Bowwow," which means, "Thank you, I will."
>
> Isn't Fido a good dog, Ellen? He is always so polite.
>
> When school is out, I will try to teach him some other tricks.

## Band 2 (Grade 2)

- **Source:** McGuffey's Second Eclectic Reader
- **Gutenberg:** https://www.gutenberg.org/ebooks/14668
- **Level rationale:** Parsed lessons run 63–414 words with FK grade +0.9 to +12.0; selected passages cluster at FK +0.3 to +4.1 (shorter end of the book, which overlaps late grade 1 and gives grade 2 readers early wins) with two stretch pieces at +4.1. Multi-paragraph narratives with dialogue and poetry appear here for the first time — the right step up from band 1.

### 2.1 — LESSON XI

*102 words · 17 sentences · 6.0 w/s · FK +0.3 · Flesch ease 104*

> WHAT A BIRD TAUGHT.
>
> 1. Why do you come to my apple tree, Little bird so gray? Twit-twit, twit-twit, twit-twit-twee! That was all he would say.
>
> 2. Why do you lock your rosy feet So closely round the spray? Twit-twit, twit-twit, twit-tweet! That was all he would say.
>
> 3. Why on the topmost bough do you get, Little bird so gray? Twit-twit-twee! twit-twit-twit! That was all he would say.
>
> 4. Where is your mate? come, answer me, Little bird so gray. Twit-twit-twit! twit-twit-twee! That was all he would say. Alice Cary.

### 2.2 — LESSON VI

*201 words · 27 sentences · 7.4 w/s · FK +2.2 · Flesch ease 93*

> AFRAID IN THE DARK.
>
> 1.  "Willie, will you run upstairs, and get my needle book from the bureau?"
>
> 2.  But Willie did not stir. "Willie!" said mamma. She thought he had not heard.
>
> 3.  "I'm afraid," said Willie.
>
> 4.  "Afraid of what?"
>
> 5.  "It's dark up there."
>
> 6.  "What is the dark?" asked mamma. "See! It is nothing but a shadow." And she held her hand between the lamp and the workbasket on the table.
>
> 7. "Now it is dark in the basket; but as soon as I take my hand away, it is light."
>
> 8. "Come and stand between the lamp and the wall, Willie. See! There is your shadow on the wall. Can your shadow hurt you?"
>
> 9. "Oh no, mamma! I am sure it can not hurt me."
>
> 10. "Well, the dark is only a big shadow over everything."
>
> 11. "What makes the big shadow, mamma?"
>
> 12. "I will tell you all about that, Willie, when you are a little older. But now, I wish you would find me a brave boy who is not afraid of shadows, to run upstairs and get my needlebook."
>
> 13. "I am bravo, mamma. I will go. --Here it is."
>
> 14. "Thank you, my brave little man. You see the dark didn't hurt you."
>
> SLATE WORK.

### 2.3 — LESSON XXVIII

*252 words · 23 sentences · 11.0 w/s · FK +2.5 · Flesch ease 97*

> SAM AND HARRY.
>
> 1. One fine summer afternoon, Sam was walking home from school. He went along slowly, reading a book.
>
> 2. Sam had spent all his money for the book, but he was a happy boy.
>
> 3. At length he came into the highroad, where there was a gate. A blind man stood, holding it open.
>
> 4. The poor man said, "Please give me a few cents to buy some bread!" But Sam gave him nothing.
>
> 5. What! did Sam give the poor blind man nothing? Yes; for, as I told you, he had spent all his money.
>
> 6. So Sam walked on, very sad. Soon after, a fine carriage came up, and in it were Harry and his mother.
>
> 7. The blind man stood, and held out his hat. "Let us give the poor man something," said Harry to his mother.
>
> 8. His mother gave him some cents. Harry took them, but did not put them into the man's hat.
>
> 9. He threw them into the hedge as far as he could. The poor man could not find them, for, you know, ho was blind.
>
> 10. Sam had turned back to look at the fine carriage. He saw Harry throw the cents into the hedge; so he came back at once, and looked for the money until he found it all for the blind man.
>
> 11. This took so long a time, that he almost lost his supper.
>
> 12. Which of the boys do you think was truly kind to the poor man?
>
> 13. I know which he thanked most in his heart.

### 2.4 — LESSON LI

*226 words · 20 sentences · 11.3 w/s · FK +1.2 · Flesch ease 107*

> lain    weak    stiff    shrill    rode    bleak
>
> THE STORY TELLER (CONCLUDED)
>
> 1. "One cold, bleak night, the snow fell fast, and the wind blew loud and shrill. It was quite dark. Not a star was to be seen in the sky.
>
> 2. "These good men sent out a dog, to hunt for those who might want help. In an hour or two, the dog was heard coming back.
>
> 3. "On looking out, they saw him with a boy on his back. The poor child was stiff with cold. He could but just hold on to the dog's back.
>
> 4. "He had lain for a long time in the snow, and was too weak to walk.
>
> 5. "He felt something pull him by the coat, and heard the bark of a dog. He put out his hand, and felt the dog. The dog gave him another pull.
>
> 6. "This gave the poor boy some hope, and he took hold of the dog. He drew himself out of the snow, but ho could not stand or walk.
>
> 7. "He got on the dog's back, and put his arms round the dog's neck, and held on. He felt sure that the dog did not mean to do him any harm.
>
> 8. "Thus he rode all the way to the good men's house.
>
> 9. "They took care of him, till the snow was gone. Then they sent him to his home."

### 2.5 — LESSON I

*181 words · 21 sentences · 8.6 w/s · FK +2.6 · Flesch ease 92*

> branch'es     kiss    burns     Mrs.    e vents'
>
> an oth'er     Mr.     stool     lamp    mends
>
> EVENING AT HOME.
>
> 1. It is winter. The cold wind whistles through the branches of the trees.
>
> 2. Mr. Brown has done his day's work, and his children, Harry and Kate, have come home from school. They learned their lessons well to-day, and both feel happy
>
> 3. Tea is over. Mrs. Brown has put the little sitting room in order. The fire burns brightly. One lamp gives light enough for all. On the stool is a basket of fine apples. They seem to say, "Won't you have one?"
>
> 4. Harry and Kate read a story in a new book. The father reads his newspaper, and the mother mends Harry's stockings.
>
> 5. By and by, they will tell one another what they have been reading about, and will have a chat over the events of the day.
>
> 6. Harry and Kate's bedtime will come first. I think I see them kiss their dear father and mother a sweet good night.
>
> 7. Do you not wish that every boy and girl could have a home like this?

### 2.6 — LESSON II

*165 words · 20 sentences · 8.2 w/s · FK +2.1 · Flesch ease 94*

> BUBBLES.
>
> 1. The boys have come out on the porch to blow bubbles. The old cat is asleep on the mat by the door.
>
> 2. "Ha! ha!" laughs Robert, as a bubble comes down softly on the old cat's back, and does not burst.
>
> 3. Willie tries to make his bubble do the same. This time it comes down on the cat's face, and makes her sneeze.
>
> 4. "She would rather wash her face without soap," says Harry. "Now let us see who can make the biggest bubble."
>
> 5. "Mine is the biggest," says Robert. "See how high it floats in the air! I can see--ah! it has burst."
>
> 6. "I can see the house and the trees and the sky in mine," says Willie; "and such beautiful colors."
>
> 7.  "How many, Willie?"
>
> 8. "Red, one; blue, two; there--they are all out. Let us try again."
>
> 9. "I know how many colors there are," says Harry. "Just as many as there are in the rainbow."
>
> 10. "Do you know how many that is?"

### 2.7 — LESSON XXXVIII

*295 words · 29 sentences · 10.2 w/s · FK +2.5 · Flesch ease 95*

> beam        thick      pine       next      groove     scales
>
> THE NEW SCALES.
>
> I. "Herbert, will you please peel my orange?" said Lucy. Herbert was reading his new book, but he put it down at once, and took the orange from his little sister.
>
> 2. "Shall I make a pair of scales, Lucy, for you to use when you play store?"
>
> 3. "Oh yes! but how can you do that'!"
>
> 4.  "I'll show you. First, we must take the peel off in two little cups, one just as large as the other. While I do this, see if you can find me two nice sticks about ten inches long."
>
> 5. Lucy ran out to the woodhouse to find the sticks.--" Will these do?"
>
> 6. "No, they are too hard. Find some pine sticks if you can."
>
> 7.  "Here are some."
>
> 8. "These will do nicely. Now I must make a scale beam and a post. Can you find me a little block for a post, Lucy'!"
>
> 9. "Will a ribbon block do, Herbert?"
>
> 10.  "Yes, if it is not too thick."
>
> 11.  "Here is one an inch thick."
>
> 12. "That will be just right. Now get the little gimlet."
>
> 13. Herbert worked away until he had made the beam and the post. Then he made a hole in the middle of the block, and put the post in. Next, he put the beam into a little groove at the top of the post, so that it would balance nicely.
>
> 14. "Now, Lucy, we must have a needle and some thread. We must put four threads to each cup; then we will tie the threads to the ends of the beam.
>
> 15. "There, Lucy, what do you think of that?"
>
> 16. "Why, Herbert, that is just as nice as the real scales in father's store; and you may have all my orange for making them."

### 2.8 — LESSON LII

*184 words · 15 sentences · 12.3 w/s · FK +2.3 · Flesch ease 101*

> THE OWL.
>
> 1. "Where did you get that owl, Harry?"
>
> 2. "Fred and I found him in the old, hollow oak."
>
> 3. "How did you know he was there?"
>
> 4. "I'll tell you. Fred and I were playing 'hide and seek' round the old barn, one night just at dusk.
>
> 5. "I was just creeping round the corner, when I heard a loud squeak, and a big bird flew up with something in his claws.
>
> 6. "I called Fred, and we watched him as he flew to the woods. Fred thought the bird was an owl, and that he had a nest in the old oak.
>
> 7. "The next day we went to look for him, and, sure enough, he was there."
>
> 8. "But how did you catch him? I should think he could fight like a good fellow with that sharp bill."
>
> 9. "He can when he is wide awake; but owls can't see very well in the daytime, and he was taking a nap.
>
> 10. "He opened his great eyes, and ruffled up his feathers, and said, "Whoo! Whoo!' 'Never mind who,' Fred said, and slipped him into a bag."

### 2.9 — LESSON LIV

*208 words · 20 sentences · 10.4 w/s · FK +2.9 · Flesch ease 93*

> broad    knee    fig    fresh    city    trout    un der neath'
>
> GRANDFATHER'S STORY.
>
> 1. "Come and sit by my knee, Jane, and grandfather will tell you a strange story.
>
> 2. "One bright Summer day, I was in a garden in a city, with a friend. "We rested underneath a fig tree. The broad leaves were green and fresh.
>
> 3. "We looked up at the ripe, purple figs. And what do you think came down through the branches of the fig tree over our heads?"
>
> 4. "Oh, a bird, grandfather, a bird!" said little Jane, clapping her hands.
>
> 5. "No, not a bird. It was a fish; a trout, my little girl."
>
> 6. "Not a fish, grandfather! A trout come through the branches of a tree in the city'! I am sure you must be in fun."
>
> 7. "No, Jane, I tell you the truth. My friend and I were very much surprised to see a fish falling from a fig tree.
>
> 8. "But we ran from under the tree, and saw a fishhawk flying, and an eagle after him.
>
> 9. "The hawk had caught the fish, and was carrying it home to his nest, when the eagle saw it and wanted it.
>
> 10. "They fought for it. The fish was dropped, and they both lost it. So much for fighting!"

### 2.10 — LESSON LVI

*292 words · 25 sentences · 11.7 w/s · FK +3.6 · Flesch ease 90*

> A GOOD OLD MAN.
>
> 1.  There once lived an old man in a snug, little cottage. It had two rooms and only two windows. A small garden lay just behind it.
>
> 2. Old as the poor man was, he used to work in the fields. Often he would come home very tired and weak, with his hoe or spade on his shoulder.
>
> 3. And who do you think met him at the door! Mary and Jane, his two little grandchildren.
>
> 4. They were too young to work, except to weed in the garden, or bring water from the spring.
>
> 5. In winter, as they were too poor to buy much wood or coal, they had little fire; so they used to sit close together to keep warm. Mary would sit on one of the old man's knees, and Jane on the other.
>
> 6. Sometimes their grandfather would tell them a droll story. Sometimes he would teach them a hymn.
>
> 7. He would often talk to them of their father, who had gone to sea, or of their good, kind mother, who was in her grave. Every night he prayed God to bless them, and to bring back their father in safety.
>
> 8. The old man grew weaker every year; but the little girls were glad to work for him, who had been so good to them.
>
> 9. One cold, windy night, they heard a knock at the door. The little girls ran and opened it. Oh, joy to them! There stood their father.
>
> 10. He had been at sea a long time. He had saved some money, and had now come home to stay.
>
> 11. After this the old man did not have to work. His son worked for him, and his grandchildren took care of him. Many happy days they spent together.

### 2.11 — LESSON LXI

*269 words · 26 sentences · 10.3 w/s · FK +3.1 · Flesch ease 92*

> THE BROKEN WINDOW. (CONCLUDED.)
>
> 1. George started off, and felt much happier for having made up his mind to do what was right.
>
> 2. He rang the doorbell. When the man came out, George said, "Sir, I threw a snowball through your window. But I did not intend to do it. I am very sorry, and wish to pay you. Here is the dollar my father gave me as a New- year gift."
>
> 3. The gentleman took the dollar, and asked George if he had no more money. George said he had not. "Well," said he, "this will do."
>
> 4. So, after asking George his name, and where he lived, he called him an honest boy, and shut the door.
>
> 5. George went home at dinner time, with a face as rosy, and eyes as bright, as if nothing had gone wrong. At dinner, Mr. Ellet asked him what he had bought with his money.
>
> 6. George very honestly told him all about the broken window, and said he felt very well without any money to spend.
>
> 7. When dinner was over, Mr. Ellet told George to go and look in his cap. He did so, and found two silver dollars there.
>
> 8. The man, whose window had been broken, had been there, and told Mr. Ellet about it. He gave back George's dollar and another besides.
>
> 9. A short time after this, the man came and told Mr. Ellet that he wanted a good boy to stay in his store.
>
> 10. As soon as George left school, he went to live with this man, who was a rich merchant. In a few years he became the merchant's partner.

### 2.12 — LESSON XLV

*174 words · 16 sentences · 10.9 w/s · FK +4.1 · Flesch ease 85*

> MARY'S STORY.
>
> 1. Father, and Charles, and Lucy, and I went to the beach yesterday. We took our dinner, and stayed all day.
>
> 2. Father and Charles went out a little way from the shore in a boat, and fished, while Lucy and I gathered sea mosses.
>
> 3. We took off our shoes and stockings, and waded into the shallow water. We had a pail to put our seaweeds in.
>
> 4. We found such beautiful ones. Some wore purple, some pink, and some brown. When they were spread out in the water, the purple ones looked like plumes, and the brown ones like little trees.
>
> 5. Such a funny thing happened to Lucy. She slipped on a stone, and down she went into the water. How we both laughed! But the wind and sun soon dried Lucy's dress.
>
> 6. Then father came and took us in the boat for a row. After that we had a picnic dinner in the woods.
>
> 7. Then father spread his coat on the grass, and took a nap while we children played on the beach.

## Band 4 (Grade 4)

- **Source:** McGuffey's Fourth Eclectic Reader, Revised Edition
- **Gutenberg:** https://www.gutenberg.org/ebooks/14880
- **Level rationale:** No grade-3 volume is needed for the K/1/2/4 lane plan; the Third Reader (pg 14766) is catalogued below as a spare. The Fourth Reader's parsed sections run 137–1,935 words with FK +2.0 to +15.9. Selected passages span FK +2.7 to +7.2 — mostly fables, poems, and short moral tales, which is on-grade for 4 with the verse pieces as read-aloud stretch. Sections are labeled with the book's own Roman-numeral section headings.

### 4.1 — II. TRY, TRY AGAIN

*181 words · 18 sentences · 10.1 w/s · FK +3.5 · Flesch ease 88*

> 1. 'T is a lesson you should heed, Try, try again; If at first you don't succeed, Try, try again; Then your courage should appear, For, if you will persevere, You will conquer, never fear; Try, try again.
>
> 2. Once or twice though you should fail, Try, try again; If you would at last prevail, Try, try again; If we strive, 'tis no disgrace Though we do not win the race; What should you do in the case? Try, try again.
>
> 3. If you find your task is hard, Try, try again; Time will bring you your reward, Try, try again. All that other folks can do, Why, with patience, should not you? Only keep this rule in view: Try, try again.
>
> DEFINITIONS.--l. Cour'age, resolution. Con'quer, gain the vic-tory. 2. Pre-vail, overcome.  Dis-grace', shame. Win, gain, ob-tain. 3. Re-ward', anything given in return for good or bad con-duct. Pa'-tience, constany in labor.
>
> EXERCISES.--What does the mark before "'T is" mean? What is it called? What point is used after the word "case" in the second stanza? Why?

### 4.2 — VII. LAZY NED

*143 words · 13 sentences · 11.0 w/s · FK +4.8 · Flesch ease 80*

> 1. "'T is royal fun," cried lazy Ned, "To coast, upon my fine, new sled, And beat the other boys; But then, I can not bear to climb The tiresome hill, for every time It more and more annoys."
>
> 2. So, while his schoolmates glided by, And gladly tugged uphill, to try Another merry race, Too indolent to share their plays, Ned was compelled to stand and gaze, While shivering in his place.
>
> 3. Thus, he would never take the pains To seek the prize that labor gains, Until the time had passed; For, all his life, he dreaded still The silly bugbear of uphill, And died a dunce at last.
>
> DEFINITIONS.-l. Roy'al, excellent, noble. Coast, to slide. An--noys', troubles. 2. In'do-lent, lazy. 3. Prize, a reward. Bug-bear, something frightful. Dunce, a silly fellow.
>
> EXERCISES.--What did Ned like? What did he not like?

### 4.3 — IX. MEDDLESOME MATTY

*369 words · 31 sentences · 11.9 w/s · FK +4.7 · Flesch ease 82*

> 1. Oh, how one ugly trick has spoiled The sweetest and the best! Matilda, though a pleasant child, One grievous fault possessed, Which, like a cloud before the skies, Hid all her better qualities.
>
> 2. Sometimes, she'd lift the teapot lid To peep at what was in it; Or tilt, the kettle, if you did But turn your back a minute. In vain you told her not to touch, Her trick of meddling grew so much.
>
> 3. Her grand mamma went out one day, And, by mistake, she laid Her spectacles and snuffbox gay, Too near the little maid; "Ah! well," thought she, "I'll try them on, As soon as grand mamma is gone."
>
> 4. Forthwith, she placed upon her nose The glasses large and wide; And looking round, as I suppose, The snuffbox, too, she spied. "Oh, what a pretty box is this! I'll open it," said little miss.
>
> 5. "I know that grandmamma would say, 'Don't meddle with it, dear;' But then she's far enough away, And no one else is near; Beside, what can there be amiss In opening such a box as this?"
>
> 6. So, thumb and finger went to work To move the stubborn lid; And, presently, a mighty jerk The mighty mischief did; For all at once, ah! woeful case! The snuff came puffing in her face.
>
> 7. Poor eyes, and nose, and mouth, and chin A dismal sight presented; And as the snuff got further in, Sincerely she repented. In vain she ran about for ease, She could do nothing else but sneeze.
>
> 8. She dashed the spectacles away, To wipe her tingling eyes; And, as in twenty bits they lay, Her grandmamma she spies. "Heyday! and what's the matter now?" Cried grandmamma, with angry brow.
>
> 9. Matilda, smarting with the pain, And tingling still, and sore, Made many a promise to refrain From meddling evermore; And 't is a fact, as I have heard, She ever since has kept her word.
>
> DEFINITIONS.-l. Qual'i-ties, traits of character. 2. Med'-dling, interfering without right. 4. Forth-with', at once. Spied, saw. 5. A-miss', wrong, faulty. 6. Woe'ful, sad, sorrowful 8. Tin'gling, smarting. 9. Re-frain', to keep from.
>
> EXERCISES.--What did Matilda do? How was she punished?  What effect did it have on her?

### 4.4 — XIII. PICCOLA

*378 words · 37 sentences · 10.2 w/s · FK +4.5 · Flesch ease 81*

> By Celia Laighton Thaxter, who was born at Portsmouth, N. H., June 29, 1836. Much of her childhood was passed at White Island, one of the Isles of Shoals, off the coast of New Hampshire. "Among the Isles of Shoals," is her most noted work in prose. She published a volume of poems, many of which are favorites with children. She died in 1894.
>
> 1. Poor, sweet Piccola! Did you hear What happened to Piccola, children dear? 'T is seldom Fortune such favor grants As fell to this little maid of France.
>
> 2. 'T was Christmas time, and her parents poor Could hardly drive the wolf from the door, Striving with poverty's patient pain Only to live till summer again.
>
> 3. No gift for Piccola! sad were they When dawned the morning of Christmas day! Their little darling no joy might stir; St. Nicholas nothing would bring to her!
>
> 4. But Piccola never doubted at all That something beautiful must befall Every child upon Christmas day, And so she slept till the dawn was gray.
>
> 5. And full of faith, when at last she woke, She stole to her shoe as the morning broke; Such sounds of gladness filled all the air, 'T was plain St. Nicholas had been there.
>
> 6. In rushed Piccola, sweet, half wild-- Never was seen such a joyful child-- "See what the good saint brought!" she cried, And mother and father must peep inside.
>
> 7. Now such a story I never heard! There was a little shivering bird! A sparrow, that in at the window flew, Had crept into Piccola's tiny shoe!
>
> 8. "How good poor Piccola must have been!" She cried, as happy as any queen, While the starving sparrow she fed and warmed, And danced with rapture, she was so charmed.
>
> 9. Children, this story I tell to you Of Piccola sweet and her bird, is true. In the far-off land of France, they say, Still do they live to this very day.
>
> DEFINITIONS.--3. Dawned, began to grow light. Stir, excite. 4. Be-fall, happen. 7. Shiv'er-ing, trembling from cold. Ti'ny, very small. 8. Rapture, great joy. Charmed, greatly.
>
> EXERCISES.--What is meant by "driving the wolf from the door"? In the third stanza, what does "St." before Nicholas mean? Who is St. Nicholas? What did Piccola find in her shoe on Christmas morning?

### 4.5 — XVI. THE BROWN THRUSH

*220 words · 23 sentences · 9.6 w/s · FK +2.7 · Flesch ease 92*

> Lucy Larcom, the author of the following poem, was born in 1826, and passed many years of her life as a factory girl at Lowell, Mass. She died in 1893.
>
> 1. There's a merry brown thrush sitting up in a tree; "He's singing to me! he's singing to me!" And what does he say, little girl, little boy? "Oh, the world's running over with joy! Don't You hear? Don't you see? Hush! look! In my tree I'm as happy as happy can be!"
>
> 2. And the brown thrush keeps singing, "A nest do you see, And five eggs hid by me in the juniper tree? Don't meddle! don't touch! little girl, little boy, Or the world will lose some of its joy! Now I'm glad! now I'm free! And I always shall be, If you never bring sorrow to me."
>
> 3. So the merry brown thrush sings away in the tree, To you and to me, to you and to me; And he sings all the day, little girl, little boy, "Oh, the world's running over with joy! But long it won't be, Don't you know? Don't you see? Unless we're as good as can be."
>
> EXERCISES.--What is a thrush? Why was the thrush so happy? Do you think he would have been happy if the little boy or girl had robbed the nest?

### 4.6 — XX. FREAKS OF THE FROST

*347 words · 21 sentences · 16.5 w/s · FK +6.1 · Flesch ease 81*

> By Hannah Flagg Gould, who was born at Lancaster, Vermont, in 1789. She published several volumes of poems (one for children) and one collection of prose articles, entitled "Gathered Leaves." She died in 1865.
>
> 1. The Frost looked forth one still, clear night, And whispered, "Now I shall be out of sight; So through the valley and over the height In silence I'll take my way; I will not go on, like that blustering train, The wind and the snow, the hail and the rain, Who make so much bustle and noise in vain, But I'll be as busy as they."
>
> 2. Then he flew to the mountain, and powdered its crest; He lit on the trees, and their boughs he dressed In diamond beads; and over the breast Of the quivering lake, he spread A coat of mail, that it need not fear The downward point of many a spear, That he hung on its margin, far and near, Where a rock could rear its head.
>
> 3. He went to the windows of those who slept, And over each pane, like a fairy, crept; Wherever he breathed, wherever he stepped, By the light of the morn were seen Most beautiful things; there were flowers and trees; There were bevies of birds, and swarms of bees; There were cities with temples and towers, and these All pictured in silver sheen.
>
> 4. But he did one thing that was hardly fair; He peeped in the cupboard, and, finding there That all had forgotten for him to prepare, "Now just to set them a-thinking, I'll bite this basket of fruit," said he, "This costly pitcher I'll burst in three; And the glass of water they've left for me Shall 'tchick!' to tell them I'm drinking."
>
> DEFINITIONS.--l. Blus'ter-ing, being noisy and loud. Bus'tle, stir. 2. Crest, the top. Quiv'er-ing, trembling, shaking. Mar'gin, edge, border. 3. Bev'ies, flocks. Pic'tured, painted. Sheen, brightness, splendor of appearance.
>
> EXERCISES.--What did the frost say? What did he do to the mountain? The trees? The lake? What is a "coat of mail"? What did he do to the window? The pitcher?

### 4.7 — XXII. JEANNETTE AND JO

*266 words · 16 sentences · 16.6 w/s · FK +6.9 · Flesch ease 75*

> By Mary Mapes Dodge, who was born in New York City in 1838. She is the editor of the "St. Nicholas" magazine, and has written many stories for children.
>
> 1. Two girls I know--Jeannette and Jo, And one is always moping; The other lassie, come what may, Is ever bravely hoping.
>
> 2. Beauty of face and girlish grace Are theirs, for joy or sorrow; Jeannette takes brightly every day, And Jo dreads each to-morrow.
>
> 3. One early morn they watched the dawn-- I saw them stand together; Their whole day's sport, 't was very plain, Depended on the weather.
>
> 4. "'T will storm!" cried Jo. Jeannette spoke low; "Yes, but 't will soon be over." And, as she spoke, the sudden shower Came, beating down the clover.
>
> 5. "I told you so!" cried angry Jo: "It always is a-raining!" Then hid her face in dire despair, Lamenting and complaining.
>
> 6. But sweet Jeannette, quite hopeful yet,-- I tell it to her honor,-- Looked up and waited till the sun Came streaming in upon her.
>
> 7. The broken clouds sailed off in crowds, Across a sea of glory. Jeannette and Jo ran, laughing, in-- Which ends my simple story.
>
> 8. Joy is divine. Come storm, come shine, The hopeful are the gladdest; And doubt and dread, children, believe Of all things are the saddest.
>
> 9. In morning's light, let youth be bright; Take in the sunshine tender; Then, at the close, shall life's decline Be full of sunset splendor.
>
> 10. And ye who fret, try, like Jeannette, To shun all weak complaining; And not, like Jo, cry out too soon-- "It always is a-raining!"

### 4.8 — XXVI. IN TIME'S SWING

*294 words · 33 sentences · 8.9 w/s · FK +4.1 · Flesch ease 82*

> By Lucy Larcom.
>
> 1. Father Time, your footsteps go Lightly as the falling snow. In your swing I'm sitting, see! Push me softly; one, two; three, Twelve times only. Like a sheet, Spread the snow beneath my feet. Singing merrily, let me swing Out of winter into spring.
>
> 2. Swing me out, and swing me in! Trees are bare, but birds begin Twittering to the peeping leaves, On the bough beneath the eaves. Wait,--one lilac bud I saw. Icy hillsides feel the thaw. April chased off March to-day; Now I catch a glimpse of May.
>
> 3. Oh, the smell of sprouting grass! In a blur the violets pass. Whispering from the wildwood come Mayflower's breath and insect's hum. Roses carpeting the ground; Thrushes, orioles, warbling sound:-- Swing me low, and swing me high, To the warm clouds of July.
>
> 4. Slower now, for at my side White pond lilies open wide. Underneath the pine's tall spire Cardinal blossoms burn like fire. They are gone; the golden-rod Flashes from the dark green sod. Crickets in the grass I hear; Asters light the fading year.
>
> 5. Slower still! October weaves Rainbows of the forest leaves. Gentians fringed, like eyes of blue, Glimmer out of sleety dew. Meadow green I sadly miss: Winds through withered sedges hiss. Oh, 't is snowing, swing me fast, While December shivers past!
>
> 6. Frosty-bearded Father Time, Stop your footfall on the rime! Hard you push, your hand is rough; You have swung me long enough. "Nay, no stopping," say you? Well, Some of your best stories tell, While you swing me--gently, do!-- From the Old Year to the New.
>
> DEFINITIONS.--2. Twit'ter-ing, making a succession of small, chirping noises. Glimpse, a short, hurried view. 3. Blur, a dim, confused appearance. 6. Rime, whitefrost, hoarfrost.

### 4.9 — XXXVIII. THE SUMMER SHOWER

*235 words · 15 sentences · 15.7 w/s · FK +7.2 · Flesch ease 71*

> The author, Thomas Buchanan Read, was born in Chester Co., Pa., March 12, 1822. His life was devoted to the fine arts, and he attained a high reputation both as artist and poet. He died in New York, May 11, 1872.
>
> 1. Before the stout harvesters falleth the grain, As when the strong stormwind is reaping the plain, And loiters the boy in the briery lane; But yonder aslant comes the silvery rain, Like a long line of spears brightly burnished and tall.
>
> 2. Adown the white highway like cavalry fleet, It dashes the dust with its numberless feet. Like a murmurless school, in their leafy retreat, The wild birds sit listening the drops round them beat; And the boy crouches close to the blackberry wall.
>
> 3. The swallows alone take the storm on the wing, And, taunting the tree-sheltered laborers, sing. Like pebbles the rain breaks the face of the spring, While a bubble darts up from each widening ring; And the boy in dismay hears the loud shower fall.
>
> 4. But soon are the harvesters tossing their sheaves; The robin darts out from his bower of leaves; The wren peereth forth from the moss-covered eaves; And the rain-spattered urchin now gladly perceives That the beautiful bow bendeth over them all.
>
> DEFINITIONS.--l. A-slant', toward one side. 2. High'way, a public road. Re-treat', a place of refuge or safety, Crouch'es, stoops low. 3. Taunt'ing, deriding, mocking. 4. Ur'chin, a child.

### 4.10 — XLV. THE TEMPEST

*202 words · 16 sentences · 12.6 w/s · FK +4.8 · Flesch ease 83*

> By James T. Fields (born 1817, died 1881), who was born at Portsmouth, N. H. He was a poet, and the author, also, of some well known prose works. Of these, his "Yesterdays with Authors" is the most noted.
>
> 1. We were crowded in the cabin; Not a soul would dare to sleep: It was midnight on the waters, And a storm was on the deep.
>
> 2. 'T is a fearful thing in winter To be shattered by the blast, And to hear the rattling trumpet Thunder, "Cut away the mast!"
>
> 3. So we shuddered there in silence, For the stoutest held his breath, While the hungry sea was roaring, And the breakers threatened death.
>
> 4. And as thus we sat in darkness, Each one busy in his prayers, "We are lost!" the captain shouted, As he staggered down the stairs.
>
> 5. But his little daughter whispered, As she took his icy hand, "Is n't God upon the ocean, Just the same as on the land?"
>
> 6. Then we kissed the little maiden, And we spoke in better cheer; And we anchored safe in harbor When the morn was shining clear.
>
> DEFINITIONS.--l. Deep, the ocean. 2. Blast, tempest. 3. Break'ers, waves of the sea broken by rocks. 6. Cheer, state of mind.

### 4.11 — XLIX. THE SANDPIPER

*288 words · 25 sentences · 11.5 w/s · FK +5.4 · Flesch ease 77*

> By CELIA THAXTER.
>
> 1. Across the lonely beach we flit, One little sandpiper and I, And fast I gather, bit by bit, The scattered driftwood, bleached and dry. The wild waves reach their hands for it, The wild wind raves, the tide runs high, As up and down the beach we flit, One little sandpiper and I.
>
> 2. Above our heads the sullen clouds Scud, black and swift, across the sky; Like silent ghosts in misty shrouds Stand out the white lighthouses high. Almost as far as eye can reach I see the close-reefed vessels fly, As fast we flit across the beach, One little sandpiper and I.
>
> 3. I watch him as he skims along, Uttering his sweet and mournful cry; He starts not at my fitful song, Nor flash of fluttering drapery. He has no thought of any wrong, He scans me with a fearless eye; Stanch friends are we, well-tried and strong, The little sandpiper and I.
>
> 4. Comrade, where wilt thou be to-night, When the loosed storm breaks furiously? My driftwood fire will burn so bright! To what warm shelter canst thou fly? I do not fear for thee, though wroth The tempest rushes through the sky; For are we not God's children both, Thou, little sandpiper, and I?
>
> DEFINITIONS.--l. Sand'pi-per, a bird of the snipe family, found along the seacoast. Drift'wood. wood tossed on shore by the waves. Bleached, whitened. Tide, the regular rise and fall of the ocean which occurs twice in a little over twenty-four hours. 2. Scud, fly hastily. Shrouds, Winding sheets, dresses of the dead. Close'reefed, with sails contracted as much as possible. 3. Fit'ful, irregularly variable. Draper-y, garments. Scans, looks at care-fully. Stanch, firm. 4. Wroth, angry.

### 4.12 — LII. THE SNOW MAN

*156 words · 18 sentences · 8.7 w/s · FK +3.2 · Flesch ease 87*

> By Marian Douglas.
>
> 1. Look! how the clouds are flying south! The winds pipe loud and shrill! And high above the white drifts stands The snow man on the hill.
>
> 2. Blow, wild wind from the icy north! Here's one who will not fear To feel thy coldest touch, or shrink Thy loudest blast to hear.
>
> 3. Proud triumph of the schoolboy's skill! Far rather would I be A winter giant, ruling o'er A frosty realm, like thee,
>
> 4. And stand amid the drifted snow, Like thee, a thing apart, Than be a man who walks with men, But has a frozen heart!
>
> DEFINITIONS.--l. Pipe, whistle. 2. Shrink, to draw back on account of fear. 3. Triumph, success causing exultation. Realm, the territory over which authority is used, dominion.
>
> EXERCISES.--With what is the snow man compared in this poem? What is meant by a man with "a frozen heart"? Do you think such a man would follow the Golden Rule?

## Weekly decodable word sets (K–2)

**35 weekly sets** built from Dolch stages in published order (the Dolch
progression is already roughly grade-leveled) plus Fry hundreds for coverage of non-Dolch
high-frequency words. Cumulative new words by grade: K = 92 (all Dolch pre-primer+primer),
G1 = 41 Dolch grade-1 + Fry 1st-100 new words, G2 = Dolch grade 2+3 + Fry 2nd/3rd-100 new
words. Full structured JSON in `research/word_sets.json` (`weekly_sets[]` with
`grade`, `week`, `id`, `title`, `new_words[]`, `new_count`; plus complete `dolch_stages` and
`fry_hundreds` blocks).

| Set | Grade | Week | Title | New words |
|---|---|---|---|---|
| K-w01 | K | 1 | Dolch pre primer (1/4) | 10 |
| K-w02 | K | 2 | Dolch pre primer (2/4) | 10 |
| K-w03 | K | 3 | Dolch pre primer (3/4) | 10 |
| K-w04 | K | 4 | Dolch pre primer (4/4) | 10 |
| K-w05 | K | 5 | Dolch primer (1/8) | 7 |
| K-w06 | K | 6 | Dolch primer (2/8) | 7 |
| K-w07 | K | 7 | Dolch primer (3/8) | 7 |
| K-w08 | K | 8 | Dolch primer (4/8) | 7 |
| K-w09 | K | 9 | Dolch primer (5/8) | 7 |
| K-w10 | K | 10 | Dolch primer (6/8) | 7 |
| K-w11 | K | 11 | Dolch primer (7/8) | 7 |
| K-w12 | K | 12 | Dolch primer (8/8) | 3 |
| 1-w01 | 1 | 1 | Dolch grade 1 (1/3) | 14 |
| 1-w02 | 1 | 2 | Dolch grade 1 (2/3) | 14 |
| 1-w03 | 1 | 3 | Dolch grade 1 (3/3) | 13 |
| 1-w04 | 1 | 4 | Fry 1st 100 new words (1/9) | 4 |
| 1-w05 | 1 | 5 | Fry 1st 100 new words (2/9) | 4 |
| 1-w06 | 1 | 6 | Fry 1st 100 new words (3/9) | 4 |
| 1-w07 | 1 | 7 | Fry 1st 100 new words (4/9) | 4 |
| 1-w08 | 1 | 8 | Fry 1st 100 new words (5/9) | 4 |
| 1-w09 | 1 | 9 | Fry 1st 100 new words (6/9) | 4 |
| 1-w10 | 1 | 10 | Fry 1st 100 new words (7/9) | 4 |
| 1-w11 | 1 | 11 | Fry 1st 100 new words (8/9) | 1 |
| 2-w01 | 2 | 1 | Dolch grade 2 (1/2) | 24 |
| 2-w02 | 2 | 2 | Dolch grade 2 (2/2) | 23 |
| 2-w03 | 2 | 3 | Dolch grade 3 (1/2) | 21 |
| 2-w04 | 2 | 4 | Dolch grade 3 (2/2) | 20 |
| 2-w05 | 2 | 5 | Fry 2nd/3rd 100 new words (1/8) | 15 |
| 2-w06 | 2 | 6 | Fry 2nd/3rd 100 new words (2/8) | 15 |
| 2-w07 | 2 | 7 | Fry 2nd/3rd 100 new words (3/8) | 15 |
| 2-w08 | 2 | 8 | Fry 2nd/3rd 100 new words (4/8) | 15 |
| 2-w09 | 2 | 9 | Fry 2nd/3rd 100 new words (5/8) | 15 |
| 2-w10 | 2 | 10 | Fry 2nd/3rd 100 new words (6/8) | 15 |
| 2-w11 | 2 | 11 | Fry 2nd/3rd 100 new words (7/8) | 15 |
| 2-w12 | 2 | 12 | Fry 2nd/3rd 100 new words (8/8) | 15 |

First week of each grade, for spot-check:

- **K-w01** (Dolch pre primer (1/4)): a, and, away, big, blue, can, come, down, find, for
- **1-w01** (Dolch grade 1 (1/3)): after, again, an, any, as, ask, by, could, every, fly, from, give, going, had
- **2-w01** (Dolch grade 2 (1/2)): always, around, because, been, before, best, both, buy, call, cold, does, don't, fast, first, five, found, gave, goes, green, its, left, made, many, off

### Supplementary public-domain sources (not used in the 48 passages, available for expansion)

| Source | Gutenberg | Use |
|---|---|---|
| McGuffey's Third Eclectic Reader | https://www.gutenberg.org/ebooks/14766 | Grade 2→3 bridge band if a grade-3 lane is added |
| McGuffey's Fifth Eclectic Reader | https://www.gutenberg.org/ebooks/15040 | Grade 5 lane |
| McGuffey's Sixth Eclectic Reader | https://www.gutenberg.org/ebooks/16751 | Grade 5+ stretch |
| The New McGuffey First Reader (1879) | https://www.gutenberg.org/ebooks/1489 | Alternate grade-1 text |
| The New McGuffey Fourth Reader | https://www.gutenberg.org/ebooks/1490 | Alternate grade-4 text |
| McGuffey's Eclectic Spelling Book | https://www.gutenberg.org/ebooks/15456 | Spelling/phonics lists, PD |
| The Elson Readers, Book 5 | https://www.gutenberg.org/ebooks/9106 | Elson series only survives on Gutenberg at Book 5 — grade 5, not in the K/1/2/4 lane; Elson Grammar School Literature book 4 (https://www.gutenberg.org/ebooks/6963) is junior-high literature, not a grade-4 reader |
| The Aesop for Children (1919, Milo Winter illus.) | https://www.gutenberg.org/ebooks/19994 | Fable prose at ~FK 4–6; pairs with grade 2–4 |
| Aesop's Fables, Vols. 1–10 (Jacobes/Vance trim) | https://www.gutenberg.org/ebooks/19616 | Alternate fable source |
| Three Hundred Aesop's Fables (Jacobs) | https://www.gutenberg.org/ebooks/21 | Full fable corpus |

**Elson note:** the brief asked for Elson Readers. Gutenberg hosts only *The Elson Readers, Book 5* (pg 9106) — too advanced for K/1/2/4 — and the *Elson Grammar School Literature* series (books 4–6), which is a junior-high literature anthology rather than a primary reader. So Elson is catalogued but not used; McGuffey covers all four bands with a graded series.

## Pairing suggestion (research note, not implementation)

Each band's passages are in ascending difficulty order, so a curriculum can walk the list
top-to-bottom while the weekly word sets run on their own 35-week clock; a passage is
"unlocked" once its running vocabulary sits inside Dolch pre-primer→grade-3 + Fry 1–3
hundreds. Per-passage unique vocabularies are in `pd_readers_passages.json` for that check.

