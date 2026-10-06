/* SaittaSprout practice generator — v1 (week-1 lesson engine).
   Seeded, deterministic, ZERO network, ZERO AI. Algorithmic families only.
   Same date + student + generatorId + cursor => byte-identical item, offline, forever.

   Seed design (MAGNATE correction #9): a single 32-bit hash over
   "YYYY-MM-DD|student|generatorId" carries a real birthday-collision risk across a
   school year, so the seed is built by CONCATENATING TWO INDEPENDENT 32-BIT HASHES
   (FNV-1a + MurmurHash3 x86_32) into a 53-bit-safe integer (seed64). The attempt
   index (cursor) is then mixed into the PRNG seed, so a second session on the same
   day continues the stream instead of replaying it.

   Same-day replay behavior (documented, per correction #9):
     - Normal path: the cursor lives in store.streams[student]["YYYY-MM-DD|genId"],
       so reopening a lesson the same day resumes at the next variant.
     - After a store clear / fresh device: the stream restarts at cursor 0 and the
       same ordered variant sequence is produced again for that date. This is
       intentional and deterministic — it is what makes USB progress transferable.
   The variant stream is unbounded (families generate indefinitely), so a session
   never runs dry even when the cursor restarts.

   Difficulty machine (design 2.2): correct => level + 1 (clamped to levels[]),
   wrong => hint + level - 1 (clamped). Never unbounded. */
(function () {
  'use strict';

  var SCHEMA = 'saittasprout.generators/1';

  /* ---------------- hashing ---------------- */

  function fnv1a32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /* MurmurHash3 x86_32 — independent of FNV-1a (different constants/rotations),
     so the concat below is a genuine two-hash seed, not a re-hash of one digest. */
  function murmur3(str, seed) {
    var len = str.length, h1 = seed >>> 0, c1 = 0xcc9e2d51, c2 = 0x1b873593, i = 0;
    while (i + 4 <= len) {
      var k1 = (str.charCodeAt(i) & 0xff) | ((str.charCodeAt(i + 1) & 0xff) << 8) |
        ((str.charCodeAt(i + 2) & 0xff) << 16) | ((str.charCodeAt(i + 3) & 0xff) << 24);
      k1 = Math.imul(k1, c1); k1 = (k1 << 15) | (k1 >>> 17); k1 = Math.imul(k1, c2);
      h1 ^= k1; h1 = (h1 << 13) | (h1 >>> 19); h1 = (Math.imul(h1, 5) + 0xe6546b64) | 0;
      i += 4;
    }
    var k1t = 0, tail = len & 3;
    if (tail === 3) { k1t ^= (str.charCodeAt(i + 2) & 0xff) << 16; }
    if (tail >= 2) { k1t ^= (str.charCodeAt(i + 1) & 0xff) << 8; }
    if (tail >= 1) {
      k1t ^= (str.charCodeAt(i) & 0xff);
      k1t = Math.imul(k1t, c1); k1t = (k1t << 15) | (k1t >>> 17); k1t = Math.imul(k1t, c2);
      h1 ^= k1t;
    }
    h1 ^= len;
    h1 ^= h1 >>> 16; h1 = Math.imul(h1, 0x85ebca6b);
    h1 ^= h1 >>> 13; h1 = Math.imul(h1, 0xc2b2ae35);
    h1 ^= h1 >>> 16;
    return h1 >>> 0;
  }

  /* 53-bit-ish seed: high 32 bits from Murmur, low 32 bits from FNV-1a. */
  function seed64(str) {
    var a = fnv1a32(str), b = murmur3(str, 0x9e3779b9);
    return (b * 4294967296 + a) % 9007199254740991; /* safe integer, two full hashes */
  }

  function seedString(dateStr, student, genId) {
    return String(dateStr) + '|' + String(student) + '|' + String(genId);
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Deterministic PRNG for one variant: base seed mixed with the cursor.
     Two different (seed, cursor) pairs land on different substreams. */
  function rngFor(seed64val, cursor) {
    var lo = seed64val % 4294967296;
    var hi = Math.floor(seed64val / 4294967296);
    var mixed = (lo ^ Math.imul(hi ^ (cursor | 0), 0x9e3779b1)) >>> 0;
    mixed = (mixed ^ Math.imul((cursor | 0) + 1, 0x85ebca6b)) >>> 0;
    return mulberry32(mixed);
  }

  /* ---------------- rng helpers ---------------- */

  function ri(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function shuffle(rng, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  /* Build a 4-option MCQ: correct answer at a seeded index, distractors distinct. */
  function mcq(rng, correct, distractors, hint, praise) {
    var pool = [], seen = {};
    var c = String(correct);
    seen[c] = 1;
    pool.push(c);
    var ds = shuffle(rng, distractors);
    for (var i = 0; i < ds.length && pool.length < 4; i++) {
      var d = String(ds[i]);
      if (d === c || seen[d]) { continue; }
      seen[d] = 1; pool.push(d);
    }
    /* Only pad with a numeric neighbour when the answer itself is a number.
       Otherwise keep the 3-option set rather than ship a nonsense distractor. */
    var n = pool.length;
    if (n < 4 && /^-?\d+(\.\d+)?$/.test(c)) {
      var step = 1;
      while (n < 4 && step < 50) {
        var alt = String(correct + (Number(c) >= 0 ? step : -step));
        if (!seen[alt]) { seen[alt] = 1; pool.push(alt); n++; }
        step++;
      }
    }
    var order = shuffle(rng, pool);
    var idx = order.indexOf(c);
    return { options: order, correctIndex: idx, hint: hint, praise: praise };
  }

  /* ---------------- families ---------------- */
  /* family(params, rng, ctx) -> {question, options, correctIndex, hint, praise}
     ctx = {level, cursor} */

  var families = {};

  /* 1 — skip counting by 2s/3s/5s/10s (C3: step 3 added) */
  families['sequence.skip_count'] = function (p, rng, ctx) {
    var steps = p.steps || [2, 5, 10];
    var step = pick(rng, steps);
    var to = p.to || 100;
    var maxStart = Math.max(0, to - step * 5);
    var nTerms = p.terms || 5;
    var startIdx = ri(rng, 0, Math.max(0, Math.floor(maxStart / step)));
    var start = step * startIdx;
    var seq = [];
    for (var i = 0; i < nTerms + 1; i++) { seq.push(start + step * i); }
    var mode = p.mode || 'next';
    var correct, q;
    if (mode === 'offstep') {
      var pos = ri(rng, 1, seq.length - 1);
      correct = seq[pos];
      seq[pos] = correct + pick(rng, [-step - 1, -1, 1, step + 1]);
      q = 'One number in this skip-count is wrong. What should come at position ' + (pos + 1) + '?\n' + seq.join(', ');
    } else if (mode === 'position') {
      var k = p.k || 3;
      var blank = ri(rng, 0, seq.length - 1);
      correct = seq[blank];
      seq[blank] = '?';
      q = 'What number is missing from this ' + step + 's pattern (position ' + (blank + 1) + ')?\n' + seq.join(', ');
      void k;
    } else {
      correct = seq[seq.length - 1];
      q = 'What number comes next? Count by ' + step + 's.\n' + seq.slice(0, seq.length - 1).join(', ') + ', ___';
    }
    var distr = [correct + step, correct - step, correct + 2 * step, correct - 2 * step, correct + 1, correct - 1];
    var m = mcq(rng, correct, distr, 'The step between every number is ' + step + '. Add it to the last number.', 'Yes! The step is ' + step + '.');
    return { question: q, options: m.options, correctIndex: m.correctIndex, hint: m.hint, praise: m.praise };
  };

  /* 2 — multiplication facts / equal groups / repeated addition (x0-x5) */
  families['math.mult'] = function (p, rng, ctx) {
    var facts = p.facts || [0, 1, 2, 3, 4, 5];
    var a = pick(rng, facts);
    var bmax = p.bmax == null ? 10 : p.bmax;
    var b = ri(rng, 0, bmax);
    var framing = p.framing || 'fact';
    var correct = a * b, q, hint, praise;
    if (framing === 'groups') {
      q = a + ' groups of ' + b + ' = ?\nEach group has ' + b + ' in it.';
      hint = 'Say it as "' + a + ' groups of ' + b + '", then count by ' + b + 's ' + a + ' times.';
      praise = 'Yes! ' + a + ' x ' + b + ' = ' + correct + '.';
    } else if (framing === 'repeat') {
      var parts = [];
      for (var i = 0; i < a; i++) { parts.push(b); }
      q = 'Repeated addition: ' + (parts.length ? parts.join(' + ') : '0') + ' = ?';
      hint = 'Adding ' + b + ' a total of ' + a + ' times is the same as ' + a + ' x ' + b + '.';
      praise = 'Right — ' + a + ' x ' + b + ' = ' + correct + '.';
    } else {
      q = a + ' x ' + b + ' = ?';
      hint = 'Count by ' + (a || 1) + 's ' + b + ' times' + (a === 0 ? ' — zero groups is always 0.' : '.');
      praise = 'Yes! ' + a + ' x ' + b + ' = ' + correct + '.';
    }
    var distr = [correct + a, correct - a, correct + b, correct - b, correct + 1, correct + 2];
    if (correct === 0) { distr = [1, 2, a || 3, b || 4, 5]; }
    var m = mcq(rng, correct, distr, hint, praise);
    return { question: q, options: m.options, correctIndex: m.correctIndex, hint: m.hint, praise: m.praise };
  };

  /* 3 — place value: 3- AND 4-digit numbers, digit value/place, read/write with
     place-value blocks (C2: covers the D3 card's "read and write 6 three-digit
     numbers with place-value blocks" as well as max_w1_l3's 4-digit work). */
  families['math.place_value'] = function (p, rng, ctx) {
    var mode = p.mode || 'place';
    var digits = p.digits || 3;
    function makeNumber() {
      var s = String(ri(rng, 1, 9));
      for (var i = 1; i < digits; i++) { s += ri(rng, 0, 9); }
      return parseInt(s, 10);
    }
    var places = digits === 4 ? ['ones', 'tens', 'hundreds', 'thousands'] : ['ones', 'tens', 'hundreds'];
    var weights = digits === 4 ? [1, 10, 100, 1000] : [1, 10, 100];
    var n = makeNumber(), q, correct, distr, hint, praise;
    if (mode === 'blocks') {
      /* read place-value blocks -> write the number (D3 card) */
      var h = ri(rng, 1, 9), t = ri(rng, 0, 9), o = ri(rng, 0, 9);
      var th = digits === 4 ? ri(rng, 1, 9) : 0;
      correct = th * 1000 + h * 100 + t * 10 + o;
      q = 'Place-value blocks: ' + th + ' thousands, ' + h + ' hundreds, ' + t + ' tens and ' + o + ' ones. What number do they show?';
      hint = 'Add the values: thousands first, then hundreds, tens and ones.';
      praise = 'Yes — ' + correct.toLocaleString('en-US') + ' is the number the blocks show.';
      distr = [h * 100 + t * 10 + o, correct + 10, correct - 10, th * 1000 + t * 100 + h * 10 + o, correct + 1];
    } else if (mode === 'value') {
      var pi = ri(rng, 0, places.length - 1);
      var d = parseInt(String(n)[String(n).length - 1 - pi], 10);
      correct = d * weights[pi];
      q = 'In ' + n.toLocaleString('en-US') + ', what is the VALUE of the digit in the ' + places[pi] + ' place?';
      hint = 'The ' + places[pi] + ' place is worth ' + weights[pi].toLocaleString('en-US') + ', so the digit means ' + d + ' x ' + weights[pi].toLocaleString('en-US') + '.';
      praise = 'Correct! That digit means ' + correct.toLocaleString('en-US') + '.';
      distr = [d, d * weights[(pi + 1) % places.length], d * weights[Math.max(0, pi - 1)], correct + weights[pi], correct - weights[pi]];
    } else if (mode === 'read') {
      /* read the number, write it in standard form (read/write blocks skill) */
      var words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
      var w = digits === 4
        ? words[Math.floor(n / 1000)] + ' thousand ' + words[Math.floor((n % 1000) / 100)] + ' hundred ' + (n % 100)
        : words[Math.floor(n / 100)] + ' hundred ' + (n % 100);
      correct = n;
      q = 'Write this number in digits: "' + w + '"';
      hint = 'Say it in chunks: thousands, then hundreds, then the last two digits.';
      praise = 'Yes — ' + n.toLocaleString('en-US') + '.';
      distr = [n + 10, n - 10, parseInt(String(n).split('').reverse().join(''), 10), n + 100];
    } else {
      var pj = ri(rng, 0, places.length - 1);
      var digit = parseInt(String(n)[String(n).length - 1 - pj], 10);
      correct = String(digit);
      q = 'In ' + n.toLocaleString('en-US') + ', which digit is in the ' + places[pj] + ' place?';
      hint = 'Count places from the right: ones, tens, hundreds' + (digits === 4 ? ', thousands' : '') + '.';
      praise = 'Right! The ' + places[pj] + ' place holds ' + digit + '.';
      distr = String(n).split('').concat(['0']);
    }
    var m = mcq(rng, correct, distr, hint, praise);
    return { question: q, options: m.options, correctIndex: m.correctIndex, hint: m.hint, praise: m.praise };
  };

  /* 4 — multi-digit addition (C1: WITH regrouping + the D4 card's
     "add 4 two-digit numbers with regrouping") */
  families['math.multi_digit_add'] = function (p, rng, ctx) {
    var mode = p.mode || 'two';
    var addends = [], q, correct, hint, praise, i;
    if (mode === 'four') {
      var nums = [];
      for (i = 0; i < 4; i++) { nums.push(ri(rng, 12, 89)); }
      /* force regrouping somewhere so the skill is actually practised */
      if ((nums[0] % 10) + (nums[1] % 10) + (nums[2] % 10) + (nums[3] % 10) < 10) { nums[0] += 7; }
      correct = nums[0] + nums[1] + nums[2] + nums[3];
      q = 'Add all four two-digit numbers. Show your regrouping.\n' + nums.join(' + ') + ' = ?';
      hint = 'Add the ones first and regroup if they reach 10, then add the tens.';
      praise = 'Yes! ' + nums.join(' + ') + ' = ' + correct + '.';
      addends = nums;
      var m4 = mcq(rng, correct, [correct + 10, correct - 10, correct + 1, correct - 1, correct + 20], hint, praise);
      return { question: q, options: m4.options, correctIndex: m4.correctIndex, hint: m4.hint, praise: m4.praise };
    }
    var digits = p.digits || 2;
    function num() {
      var lo = digits === 3 ? 120 : 25, hi = digits === 3 ? 899 : 89;
      var v = ri(rng, lo, hi);
      return v;
    }
    var a1 = num(), a2 = num();
    /* guarantee a regroup in the ones column */
    if ((a1 % 10) + (a2 % 10) < 10) { a1 += (10 - ((a1 % 10) + (a2 % 10))) + ri(rng, 0, 4); if (digits === 3 && a1 > 999) { a1 = 468; } }
    correct = a1 + a2;
    q = a1 + ' + ' + a2 + ' = ?';
    hint = (a1 % 10) + ' + ' + (a2 % 10) + ' in the ones column reaches 10 or more — write the ones digit and carry the ten.';
    praise = 'Yes! ' + a1 + ' + ' + a2 + ' = ' + correct + '.';
    var m = mcq(rng, correct, [correct + 10, correct - 10, correct + 1, correct - 1, (a1 + a2) + 9], hint, praise);
    return { question: q, options: m.options, correctIndex: m.correctIndex, hint: m.hint, praise: m.praise };
  };

  /* 5 — closed-syllables spelling (the 3rd-grade learner's week-1 10-word list) */
  families['word.spell_task'] = function (p, rng, ctx) {
    var words = p.words || [];
    var task = p.task || 'vowel';
    var vowels = { a: 'short a', e: 'short e', i: 'short i', o: 'short o', u: 'short u' };
    if (task === 'missing') {
      var w = pick(rng, words);
      var pos = ri(rng, 1, w.length - 1);
      var masked = w.slice(0, pos) + '_' + w.slice(pos + 1);
      var correct = w[pos];
      var pool = 'aeiouy'.split('');
      var m = mcq(rng, correct, pool, 'Say the word slowly and listen for the vowel sound in the closed syllable.', 'Yes — ' + w + ' fills the blank.');
      return {
        question: 'Which letter completes this closed-syllable word?\n' + masked,
        options: m.options, correctIndex: m.correctIndex, hint: m.hint, praise: m.praise
      };
    }
    if (task === 'which_closed') {
      var target = pick(rng, words);
      var others = words.filter(function (x) { return x !== target; });
      var m2 = mcq(rng, target, others, 'A closed syllable ends in a consonant and has one short vowel sound.', 'Yes — ' + target + ' is a closed syllable.');
      return {
        question: 'Which word is a closed syllable (one short vowel, ends in a consonant)?',
        options: m2.options, correctIndex: m2.correctIndex, hint: m2.hint, praise: m2.praise
      };
    }
    if (task === 'sort') {
      var group = shuffle(rng, words).slice(0, 4);
      var sound = group[0][0] in vowels ? null : null;
      void sound;
      var vs = group.map(function (x) { return vowels[x[0]] || 'short vowel'; });
      var main = vs[0];
      var correctGroup = group.filter(function (x) { return (vowels[x[0]] || '') === main; });
      var othersG = group.filter(function (x) { return (vowels[x[0]] || '') !== main; });
      var ans = correctGroup.join(', ');
      var wrongG = othersG.join(', ');
      var m3 = mcq(rng, ans, [wrongG, group.slice().reverse().join(', '), group.join(', ')], 'Sort by the vowel sound you hear in each word.', 'Yes — those words share the same short vowel sound.');
      return {
        question: 'Which words share the same short vowel sound as "' + group[0] + '"?\nWords: ' + group.join(', '),
        options: m3.options, correctIndex: m3.correctIndex, hint: m3.hint, praise: m3.praise
      };
    }
    /* default: classify the vowel sound */
    var w2 = pick(rng, words);
    var v = w2[0];
    var correctV = vowels[v] || 'short vowel';
    var wrongVs = Object.keys(vowels).filter(function (k) { return k !== v; }).map(function (k) { return vowels[k]; });
    var m4 = mcq(rng, correctV, wrongVs, 'Say the word and listen for the vowel inside the closed syllable.', 'Yes — ' + w2 + ' has a ' + correctV + '.');
    return {
      question: 'What short vowel sound do you hear in "' + w2 + '"?',
      options: m4.options, correctIndex: m4.correctIndex, hint: m4.hint, praise: m4.praise
    };
  };

  /* 6 — reading cloze cut algorithmically from STORED week-1 passages */
  families['text.cloze'] = function (p, rng, ctx) {
    var passages = p.passages || [];
    var ps = pick(rng, passages);
    var sents = String(ps.text || '').split(/(?<=[.!?])\s+/).filter(function (s) { return s.split(/\s+/).length >= 6; });
    if (!sents.length) { sents = String(ps.text || '').split(/\s+/).slice(0, 12); }
    var s = pick(rng, sents);
    var tokens = s.split(/\s+/);
    var cand = [];
    for (var i = 1; i < tokens.length - 1; i++) {
      var t = tokens[i].replace(/[^A-Za-z']/g, '');
      if (t.length >= 4 && t.length <= 12 && !/^(the|and|that|with|from|they|were|have|this|when|what|where|your|been|said)$/i.test(t)) { cand.push(i); }
    }
    if (!cand.length) { cand = [1]; }
    var idx = pick(rng, cand);
    var correct = tokens[idx].replace(/[^A-Za-z']/g, '');
    var shown = tokens.slice();
    shown[idx] = '_____';
    var pool = (ps.pool || []).filter(function (x) { return x.toLowerCase() !== correct.toLowerCase(); });
    var m = mcq(rng, correct, pool, 'Read the whole sentence aloud and pick the word that fits the meaning.', 'Yes — "' + correct + '" is the word that fits.');
    return {
      question: 'Fill in the blank from the passage "' + (ps.title || 'week 1 passage') + '":\n' + shown.join(' '),
      options: m.options, correctIndex: m.correctIndex, hint: m.hint, praise: m.praise
    };
  };

  /* 7 — living / non-living (learner D1-D4 science) */
  families['bank.classify'] = function (p, rng, ctx) {
    var items = p.items || [];
    var task = p.task || 'is_it';
    var it = pick(rng, items);
    var correct, q, distr, hint, praise;
    if (task === 'which_one') {
      var want = p.want || 'living';
      var pool = items.filter(function (x) { return (x.kind === 'living') === (want === 'living'); });
      var other = items.filter(function (x) { return (x.kind === 'living') !== (want === 'living'); });
      if (!pool.length || !other.length) { pool = items; other = items; }
      var right = pick(rng, pool);
      correct = right.name;
      distr = other.map(function (x) { return x.name; });
      q = 'Which one is ' + (want === 'living' ? 'LIVING' : 'NOT living') + '?';
      hint = want === 'living'
        ? 'Living things grow, need food and water, and move on their own.'
        : 'Non-living things never grow, eat or breathe.';
      praise = 'Yes — ' + right.name + ' is ' + (want === 'living' ? 'living' : 'not living') + '.';
    } else if (task === 'why') {
      correct = it.why;
      distr = items.filter(function (x) { return x.why !== it.why; }).map(function (x) { return x.why; });
      q = 'Why is "' + it.name + '" ' + (it.kind === 'living' ? 'living' : 'not living') + '?';
      hint = 'Ask: does it grow, need food and water, and breathe?';
      praise = 'Yes — ' + it.why;
    } else {
      correct = it.kind === 'living' ? 'living' : 'not living';
      distr = items.filter(function (x) { return (x.kind === 'living') !== (it.kind === 'living'); })
        .map(function (x) { return x.kind === 'living' ? 'living' : 'not living'; });
      distr.push('once living, now gone', 'grows but does not breathe');
      q = 'Is "' + it.name + '" living or not living?';
      hint = 'Living things grow, need food and water, and respond to the world around them.';
      praise = 'Yes — ' + it.name + ' is ' + correct + '.';
    }
    var m = mcq(rng, correct, distr, hint, praise);
    return { question: q, options: m.options, correctIndex: m.correctIndex, hint: m.hint, praise: m.praise };
  };

  /* 8 — community-helpers ORDERING + timeline slots (design gen 8) */
  families['sequence.order'] = function (p, rng, ctx) {
    var sets = p.sets || [];
    var task = p.task || 'next';
    var s = pick(rng, sets);
    var ev = s.events;
    var q, correct, distr, hint, praise;
    if (task === 'order') {
      var right = ev.join(' → ');
      var rotated = ev.slice(1).concat(ev.slice(0, 1)).join(' → ');
      var reversed = ev.slice().reverse().join(' → ');
      var swapped = ev.slice();
      if (swapped.length > 1) { var t0 = swapped[0]; swapped[0] = swapped[1]; swapped[1] = t0; }
      correct = right;
      distr = [rotated, reversed, swapped.join(' → ')];
      q = 'Which is the correct order for "' + s.title + '"?';
      hint = 'Start with what happens first and follow the story to the end.';
      praise = 'Yes! ' + right;
    } else if (task === 'last') {
      correct = ev[ev.length - 1];
      distr = ev.slice(0, ev.length - 1);
      q = 'In "' + s.title + '", which happens LAST?';
      hint = 'Picture the whole sequence and stop at the very end.';
      praise = 'Yes — "' + correct + '" happens last.';
    } else if (task === 'first') {
      correct = ev[0];
      distr = ev.slice(1);
      q = 'In "' + s.title + '", which happens FIRST?';
      hint = 'Picture the whole sequence and start at the beginning.';
      praise = 'Yes — "' + correct + '" happens first.';
    } else {
      var pos = ri(rng, 1, Math.max(1, ev.length - 2));
      correct = ev[pos];
      distr = ev.filter(function (x, i) { return i !== pos; });
      q = 'In "' + s.title + '", what happens right after "' + ev[pos - 1] + '"?';
      hint = 'Find "' + ev[pos - 1] + '" in the sequence and read the step after it.';
      praise = 'Yes — after "' + ev[pos - 1] + '" comes "' + correct + '".';
    }
    var m = mcq(rng, correct, distr, hint, praise);
    return { question: q, options: m.options, correctIndex: m.correctIndex, hint: m.hint, praise: m.praise };
  };

  /* 9 — history RECALL (MAGNATE correction #6: D2 "answer 5 community helpers
     questions from memory" needed a recall mode; this is generator family 22). */
  families['bank.recall'] = function (p, rng, ctx) {
    var items = p.items || [];
    if (!items.length) { items = [{ q: 'No recall items loaded.', options: ['—'], correct: 0, hint: '', praise: '' }]; }
    var it = items[ctx.cursor % items.length];
    var order = shuffle(rng, it.options.map(function (o, i) { return i; }));
    var opts = order.map(function (i) { return it.options[i]; });
    return {
      question: it.q,
      options: opts,
      correctIndex: opts.indexOf(it.options[it.correct]),
      hint: it.hint,
      praise: it.praise || 'Yes! You remembered it.'
    };
  };

  /* 10 — science: scientific method / observation / data (C5 — the 5th-grade learner's rows are
     method+observation+data-reading, classification is the 3rd-grade week-1 science) */
  families['bank.method'] = function (p, rng, ctx) {
    var items = p.items || [];
    if (!items.length) { items = [{ q: 'No items loaded.', options: ['—'], correct: 0, hint: '' }]; }
    var it = items[ctx.cursor % items.length];
    var order = shuffle(rng, it.options.map(function (o, i) { return i; }));
    var opts = order.map(function (i) { return it.options[i]; });
    return {
      question: it.q,
      options: opts,
      correctIndex: opts.indexOf(it.options[it.correct]),
      hint: it.hint,
      praise: it.praise || 'Yes — that is the right step.'
    };
  };

  /* 11 — spelling PATTERNS (-tion / -sion, 5th-grade week-1 list) */
  families['word.pattern'] = function (p, rng, ctx) {
    var words = p.words || [];
    var task = p.task || 'ending';
    if (task === 'which_sion') {
      var target = words.filter(function (w) { return /sion$/.test(w); });
      var others = words.filter(function (w) { return !/sion$/.test(w); });
      if (!target.length || !others.length) { target = words; others = words; }
      var t = pick(rng, target);
      var m = mcq(rng, t, others, 'Both -tion and -sion make a "shun" sound; look at the last three letters.', 'Yes — ' + t + ' ends in -sion.');
      return { question: 'Which word ends in -sion?', options: m.options, correctIndex: m.correctIndex, hint: m.hint, praise: m.praise };
    }
    if (task === 'missing') {
      var w = pick(rng, words);
      var stem = w.replace(/(tion|sion)$/, '');
      var m2 = mcq(rng, w.replace(stem, '____'), [w, w + 'e', w.replace(/tion$/, 'shun').replace(/sion$/, 'shun')], 'Listen for the "shun" ending, then choose the letters that spell it.', 'Yes — the ending is spelled -tion or -sion.');
      var correctFull = w;
      var m3 = mcq(rng, correctFull, [w.slice(0, -4) + 'shun', w.slice(0, -4) + 'tionn', w.slice(0, -4) + 'sen'], 'Say the word: the last sound is "shun".', 'Yes — ' + w + '.');
      return { question: 'How do you spell "' + stem + ' + shun"?', options: m3.options, correctIndex: m3.correctIndex, hint: m3.hint, praise: m3.praise };
    }
    if (task === 'sort') {
      var group = shuffle(rng, words).slice(0, 5);
      var tions = group.filter(function (x) { return /tion$/.test(x); });
      var sions = group.filter(function (x) { return /sion$/.test(x); });
      var lead = /tion$/.test(group[0]) ? tions : sions;
      var other = /tion$/.test(group[0]) ? sions : tions;
      if (!lead.length) { lead = group.slice(0, 2); other = group.slice(2); }
      var m4 = mcq(rng, lead.join(', '), [other.join(', '), group.slice().reverse().join(', '), group.join(', ')],
        'All the words that share the same three-letter ending belong together.', 'Yes — those words share an ending.');
      return {
        question: 'Which words share the same ending as "' + group[0] + '"?\nWords: ' + group.join(', '),
        options: m4.options, correctIndex: m4.correctIndex, hint: m4.hint, praise: m4.praise
      };
    }
    var w3 = pick(rng, words);
    var end = /sion$/.test(w3) ? '-sion' : '-tion';
    var others3 = ['-tion', '-sion', '-shun', '-chan'].filter(function (x) { return x !== end; });
    var m5 = mcq(rng, end, others3, 'Say the last sound of the word: "shun". -tion and -sion both spell it.', 'Yes — ' + w3 + ' ends in ' + end + '.');
    return {
      question: 'Which ending does "' + w3 + '" use?',
      options: m5.options, correctIndex: m5.correctIndex, hint: m5.hint, praise: m5.praise
    };
  };

  /* 12 — area & perimeter (rectangles, squares, missing side from area) */
  families['math.area_perimeter'] = function (p, rng, ctx) {
    var mode = p.mode || 'area';
    var l, w, q, correct, hint, praise;
    if (mode === 'missing_side') {
      var area = ri(rng, 4, 12) * ri(rng, 3, 9);
      w = pick(rng, [3, 4, 5, 6, 7, 8, 9]);
      if (area % w !== 0) { w = 6; }
      l = area / w;
      correct = l;
      q = 'A rectangle has an area of ' + area + ' square units and a width of ' + w + ' units. How long is it?';
      hint = 'Area = length x width, so length = area ÷ width = ' + area + ' ÷ ' + w + '.';
      praise = 'Yes — ' + area + ' ÷ ' + w + ' = ' + l + ' units.';
      var m0 = mcq(rng, correct, [w, l + 1, l - 1, area, l + w], hint, praise);
      return { question: q, options: m0.options, correctIndex: m0.correctIndex, hint: m0.hint, praise: m0.praise };
    }
    l = ri(rng, 3, 12); w = ri(rng, 2, 9);
    if (mode === 'perimeter') {
      correct = 2 * (l + w);
      q = 'A rectangle is ' + l + ' by ' + w + '. What is its PERIMETER?';
      hint = 'Perimeter walks the edge: ' + l + ' + ' + w + ' + ' + l + ' + ' + w + '.';
      praise = 'Yes — 2 x (' + l + ' + ' + w + ') = ' + correct + ' units.';
      var m1 = mcq(rng, correct, [l * w, correct + 2, correct - 2, l + w, correct + 4], hint, praise);
      return { question: q, options: m1.options, correctIndex: m1.correctIndex, hint: m1.hint, praise: m1.praise };
    }
    if (mode === 'square') {
      var side = ri(rng, 3, 12);
      correct = p.what === 'perimeter' ? 4 * side : side * side;
      q = 'A square has a side of ' + side + ' units. What is its ' + (p.what === 'perimeter' ? 'PERIMETER' : 'AREA') + '?';
      hint = p.what === 'perimeter' ? 'A square has 4 equal sides: ' + side + ' x 4.' : 'Area of a square = side x side = ' + side + ' x ' + side + '.';
      praise = 'Yes — ' + correct + (p.what === 'perimeter' ? ' units.' : ' square units.');
      var m2 = mcq(rng, correct, [side * 2, 4 * side + 2, side + side, correct + side, correct - 1], hint, praise);
      return { question: q, options: m2.options, correctIndex: m2.correctIndex, hint: m2.hint, praise: m2.praise };
    }
    correct = l * w;
    q = 'A rectangle is ' + l + ' by ' + w + '. What is its AREA?';
    hint = 'Area of a rectangle = length x width = ' + l + ' x ' + w + '.';
    praise = 'Yes — ' + l + ' x ' + w + ' = ' + correct + ' square units.';
    var m3 = mcq(rng, correct, [2 * (l + w), correct + l, correct - w, l + w, correct + 1], hint, praise);
    return { question: q, options: m3.options, correctIndex: m3.correctIndex, hint: m3.hint, praise: m3.praise };
  };

  /* 13 — fractions: sense / equivalent / of-a-set / compare (5th grade) */
  families['math.fraction'] = function (p, rng, ctx) {
    var mode = p.mode || 'sense';
    var q, correct, hint, praise, distr;
    if (mode === 'denominator') {
      var den = ri(rng, 3, 12), num = ri(rng, 1, den - 1);
      correct = String(den);
      q = 'In the fraction ' + num + '/' + den + ', what does the denominator tell you?';
      distr = [String(den), String(num), String(den - num), 'the number of parts shaded', 'how many equal parts the whole is cut into'];
      /* the correct answer is the full sentence — build it explicitly */
      correct = 'How many equal parts the whole is cut into';
      distr = [ 'How many parts are shaded', String(num), String(den - num), 'The size of one part', 'The total number of fractions' ];
      hint = 'The denominator is the bottom number: it counts the equal parts in the whole.';
      praise = 'Yes — the denominator ' + den + ' means ' + den + ' equal parts.';
    } else if (mode === 'numerator') {
      var den2 = ri(rng, 4, 12), num2 = ri(rng, 1, den2 - 1);
      correct = String(num2);
      q = 'In the fraction ' + num2 + '/' + den2 + ', what does the numerator tell you?';
      distr = [String(den2), String(den2 - num2), 'the equal parts', 'the whole', 'nothing'];
      hint = 'The numerator is the top number: it counts the parts you are talking about.';
      praise = 'Yes — the numerator ' + num2 + ' counts ' + num2 + ' of the ' + den2 + ' parts.';
    } else if (mode === 'shaded') {
      var d3 = pick(rng, [4, 5, 6, 8, 10]);
      var n3 = ri(rng, 1, d3 - 1);
      correct = n3 + '/' + d3;
      q = 'A shape is cut into ' + d3 + ' equal parts and ' + n3 + ' are shaded. Which fraction shows the shaded part?';
      distr = [d3 + '/' + n3, (d3 - n3) + '/' + d3, String(n3), String(d3), '1/' + n3];
      hint = 'Denominator = total equal parts, numerator = the shaded ones.';
      praise = 'Yes — ' + n3 + ' of ' + d3 + ' parts is ' + n3 + '/' + d3 + '.';
    } else if (mode === 'improper') {
      var w2 = ri(rng, 2, 4), d4 = ri(rng, 3, 6), n4 = w2 * d4 + ri(rng, 1, d4 - 1);
      correct = Math.floor(n4 / d4);
      q = 'The improper fraction ' + n4 + '/' + d4 + ' is more than how many wholes?';
      distr = [correct, correct - 1, correct + 1, d4, n4].map(String);
      hint = n4 + ' ÷ ' + d4 + ' gives the number of full wholes.';
      praise = 'Yes — ' + n4 + '/' + d4 + ' = ' + correct + ' wholes and ' + (n4 % d4) + '/' + d4 + '.';
    } else if (mode === 'equiv_missing') {
      var den5 = pick(rng, [2, 3, 4, 5, 6, 7, 8, 9, 10]);
      var num5 = ri(rng, 1, den5 - 1);
      var factor = pick(rng, [2, 3, 4, 5]);
      correct = String(num5 * factor);
      q = 'Find the missing numerator: ' + num5 + '/' + den5 + ' = ?/' + (den5 * factor);
      distr = [String(num5 + factor), String(den5 * factor), String(num5 * factor + 1), String(num5), String(factor)];
      hint = 'The bottom was multiplied by ' + factor + ', so multiply the top by ' + factor + ' too.';
      praise = 'Yes — ' + num5 + ' x ' + factor + ' = ' + num5 * factor + '.';
    } else if (mode === 'equiv_missing_den') {
      var denA = pick(rng, [2, 3, 4, 5, 6, 8]);
      var numA = ri(rng, 1, denA - 1);
      var fA = pick(rng, [2, 3, 4, 5]);
      correct = String(denA * fA);
      q = 'Find the missing denominator: ' + numA + '/' + denA + ' = ' + (numA * fA) + '/?';
      distr = [String(denA + fA), String(denA * fA + 1), String(denA), String(numA * fA), String(Math.max(1, denA * fA - 1))];
      hint = 'The top was multiplied by ' + fA + ', so multiply the bottom by ' + fA + ' too.';
      praise = 'Yes - ' + denA + ' x ' + fA + ' = ' + (denA * fA) + '.';
    } else if (mode === 'equiv_check') {
      var d6 = pick(rng, [2, 3, 4, 5, 6, 7, 8]);
      var a1 = ri(rng, 1, d6 - 1), f = pick(rng, [2, 3, 4, 5]);
      var pair = (a1 * f) + '/' + (d6 * f);
      var nonNum = a1 + 1 > d6 ? a1 - 1 : a1 + 1;
      var wrong = nonNum + '/' + d6;
      correct = pair;
      q = 'Which fraction is equal to ' + a1 + '/' + d6 + '?';
      distr = [wrong, (a1 * f + 1) + '/' + (d6 * f), (d6) + '/' + a1, '1/' + d6];
      hint = 'Multiply the top and the bottom of ' + a1 + '/' + d6 + ' by the same number.';
      praise = 'Yes — ' + a1 + '/' + d6 + ' = ' + pair + '.';
    } else if (mode === 'of_set') {
      var den7 = pick(rng, [2, 3, 4, 5, 6]);
      var set = den7 * ri(rng, 2, 8);
      var n7 = ri(rng, 1, den7 - 1);
      correct = (set / den7) * n7;
      q = 'What is ' + n7 + '/' + den7 + ' of ' + set + '?';
      distr = [set - correct, correct + den7, correct + 1, set, Math.round(set / den7)].map(String);
      hint = 'Divide ' + set + ' by ' + den7 + ' to find one part, then take ' + n7 + ' parts.';
      praise = 'Yes — ' + set + ' ÷ ' + den7 + ' = ' + (set / den7) + ', and ' + n7 + ' x ' + (set / den7) + ' = ' + correct + '.';
    } else if (mode === 'compare') {
      var den8 = pick(rng, [3, 4, 5, 6, 8, 10, 12]);
      var n8 = ri(rng, 1, den8 - 1);
      var cmpA = n8 + '/' + den8;
      var symbol = '=';
      if (n8 * 2 > den8) { symbol = '>'; }
      if (n8 * 2 < den8) { symbol = '<'; }
      var WORD = { '<': 'less than', '>': 'greater than', '=': 'equal to' };
      correct = WORD[symbol];
      q = 'Compare: is ' + n8 + '/' + den8 + ' less than, greater than or equal to 1/2?';
      distr = ['less than', 'greater than', 'equal to', 'none of these'].filter(function (x) { return x !== correct; });
      hint = 'Half of ' + den8 + ' is ' + (den8 / 2) + '. Is ' + n8 + ' more, less, or equal to that?';
      praise = 'Yes — ' + cmpA + ' 1/2 because ' + n8 + ' is ' + (n8 > den8 / 2 ? 'more than' : (n8 < den8 / 2 ? 'less than' : 'equal to')) + ' half of ' + den8 + '.';
    } else { /* mixed review: missing value / multi-step */
      var den9 = pick(rng, [3, 4, 5, 6, 8]);
      var n9 = ri(rng, 1, den9 - 1);
      var total = den9 * ri(rng, 3, 9);
      correct = (total / den9) * n9;
      q = 'Mixed review: ' + n9 + '/' + den9 + ' of ' + total + ' = ?';
      distr = [total - correct, correct + n9, total, (total / den9), correct + 1].map(String);
      hint = 'One part = ' + total + ' ÷ ' + den9 + ', then multiply by the numerator.';
      praise = 'Yes — ' + correct + '.';
    }
    var m = mcq(rng, correct, distr, hint, praise);
    return { question: q, options: m.options, correctIndex: m.correctIndex, hint: m.hint, praise: m.praise };
  };

  /* 14 — map skills sequence/label (5th-grade history week-1) */
  families['bank.map_skills'] = function (p, rng, ctx) {
    var items = p.items || [];
    if (!items.length) { items = [{ q: 'No items loaded.', options: ['—'], correct: 0, hint: '' }]; }
    var it = items[ctx.cursor % items.length];
    var order = shuffle(rng, it.options.map(function (o, i) { return i; }));
    var opts = order.map(function (i) { return it.options[i]; });
    return {
      question: it.q, options: opts,
      correctIndex: opts.indexOf(it.options[it.correct]),
      hint: it.hint, praise: it.praise || 'Yes — that is right.'
    };
  };

  /* ---------------- registry access ---------------- */

  function getGen(reg, id) {
    if (!reg || !reg.generators) { return null; }
    for (var i = 0; i < reg.generators.length; i++) {
      if (reg.generators[i].id === id) { return reg.generators[i]; }
    }
    return null;
  }

  function levelParams(gen, level) {
    var levels = gen.levels || [];
    var found = null, lowest = null;
    for (var i = 0; i < levels.length; i++) {
      if (levels[i].level === level) { found = levels[i]; }
      if (lowest === null || levels[i].level < lowest) { lowest = levels[i].level; }
    }
    if (!found && levels.length) { found = levels[0]; }
    return found || { level: 1, params: {} };
  }

  function clampLevel(gen, level) {
    var levels = gen.levels || [{ level: 1 }];
    var lo = levels[0].level, hi = levels[0].level;
    for (var i = 0; i < levels.length; i++) {
      if (levels[i].level < lo) { lo = levels[i].level; }
      if (levels[i].level > hi) { hi = levels[i].level; }
    }
    if (level < lo) { return lo; }
    if (level > hi) { return hi; }
    return level;
  }

  /* Build one item. opts = {date, student, level, cursor} */
  function itemFor(reg, genId, opts) {
    var gen = getGen(reg, genId);
    if (!gen) { return null; }
    opts = opts || {};
    var level = clampLevel(gen, opts.level == null ? 1 : opts.level);
    var cursor = opts.cursor || 0;
    var seed = seed64(seedString(opts.date || '1970-01-01', opts.student || 'x', gen.id));
    var rng = rngFor(seed, cursor);
    var lp = levelParams(gen, level);
    var ctx = { level: level, cursor: cursor, student: opts.student, date: opts.date };

    if (gen.mode === 'bank') {
      /* bank rotation: deterministic seeded rotation + option shuffle.
         cursor indexes into the (possibly group-filtered) item list. */
      var pool = (gen.items || []).slice();
      if (lp.params && lp.params.group) {
        var g = lp.params.group;
        var filtered = pool.filter(function (it) { return it.group === g; });
        if (filtered.length) { pool = filtered; }
      }
      if (!pool.length) { return null; }
      var src = pool[cursor % pool.length];
      var order = shuffle(rng, src.options.map(function (o, i) { return i; }));
      var opts2 = order.map(function (i) { return src.options[i]; });
      return {
        question: src.question,
        options: opts2,
        correctIndex: opts2.indexOf(src.options[src.correctIndex]),
        hint: src.hint,
        praise: src.praise || 'Yes! That is right.',
        level: level
      };
    }

    var fn = families[gen.family];
    if (!fn) { return null; }
    var params = {};
    var base = lp.params || {};
    for (var k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) { params[k] = base[k]; } }
    /* bank-ish families (word/classify/recall) read authored arrays from params */
    if (gen.banks) {
      for (var b in gen.banks) {
        if (Object.prototype.hasOwnProperty.call(gen.banks, b) && !params[b]) { params[b] = gen.banks[b]; }
      }
    }
    var item = fn(params, rng, ctx);
    if (!item) { return null; }
    item.level = level;
    return item;
  }

  /* Difficulty state machine (design 2.2):
     correct -> level+1 (clamped), wrong -> hint + level-1 (clamped). */
  function step(state, correct, gen) {
    var s = {};
    for (var k in state) { if (Object.prototype.hasOwnProperty.call(state, k)) { s[k] = state[k]; } }
    var levels = (gen && gen.levels) || [{ level: 1 }];
    var lo = levels[0].level, hi = levels[0].level;
    for (var i = 0; i < levels.length; i++) {
      if (levels[i].level < lo) { lo = levels[i].level; }
      if (levels[i].level > hi) { hi = levels[i].level; }
    }
    s.cursor = (s.cursor || 0) + 1;
    s.attempts = (s.attempts || 0) + 1;
    s.level = s.level == null ? 1 : s.level;
    if (correct) {
      s.correct = (s.correct || 0) + 1;
      s.streak = (s.streak || 0) + 1;
      s.best = Math.max(s.best || 0, s.streak);
      s.level = Math.min(s.level + 1, hi);
      s.lastResult = 'correct';
    } else {
      s.streak = 0;
      s.level = Math.max(s.level - 1, lo);
      s.lastResult = 'wrong';
      s.hintShown = true;
    }
    if (correct) { s.hintShown = false; }
    return s;
  }

  function newState(gen) {
    var levels = (gen && gen.levels) || [{ level: 1 }];
    return { level: levels[0].level, cursor: 0, attempts: 0, correct: 0, streak: 0, best: 0 };
  }

  /* Variant budget (MAGNATE correction #10): enumerate the first `n` variants at a
     given level and count distinct renderings. Returns unique count + verdict:
     unique >= 60 => "capacity"; else levels >= 2 => "spans-levels"; else "fail". */
  function variantBudget(reg, genId, level, n) {
    var gen = getGen(reg, genId);
    if (!gen) { return { unique: 0, verdict: 'fail', why: 'no such generator' }; }
    n = n || 120;
    var seen = {}, unique = 0;
    for (var c = 0; c < n; c++) {
      var it = itemFor(reg, genId, { date: '2026-10-06', student: reg.student || 'max', level: level, cursor: c });
      if (!it) { continue; }
      var key = it.question + '§' + it.options.join('§');
      if (!seen[key]) { seen[key] = 1; unique++; }
    }
    var levelCount = (gen.levels || []).length;
    var verdict = unique >= 60 ? 'capacity' : (levelCount >= 2 ? 'spans-levels' : 'fail');
    return { unique: unique, levels: levelCount, verdict: verdict, mode: gen.mode };
  }

  var api = {
    SCHEMA: SCHEMA,
    families: families,
    fnv1a32: fnv1a32,
    murmur3: murmur3,
    seed64: seed64,
    seedString: seedString,
    rngFor: rngFor,
    mulberry32: mulberry32,
    itemFor: itemFor,
    step: step,
    newState: newState,
    clampLevel: clampLevel,
    levelParams: levelParams,
    getGen: getGen,
    variantBudget: variantBudget,
    ri: ri, pick: pick, shuffle: shuffle, mcq: mcq
  };

  if (typeof window !== 'undefined') { window.SPRUT_GEN = api; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})();
