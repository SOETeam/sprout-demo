/* SPROUT pacing provider — window.SPRUT_PACING
 *
 * Contract: PROPOSALS/SPROUT_ENGINE_ARCH_2026-10-17.md §7 (reserved module)
 * Data:     data/pacing.js -> window.SPROUT_PACING_DATA (time_norms/v1 + state_time_presets/v1)
 * Rules this file keeps:
 *   - PURE FUNCTIONS ONLY. No DOM, no localStorage, no fetch, no timers, no Date, and
 *     no mutation of any argument. Every block that comes out is a fresh copy.
 *   - NON-BREAKING: recalc_blocks() is an identity function when profile is null/absent
 *     (or when the pacing data / grade cannot be resolved), so existing flows that never
 *     pass a profile behave exactly as before.
 *   - Minutes are CALIBRATED, never copied: block.min = instruction + practice, scaled by
 *     the profile time factor and clamped inside the subject norm.
 *   - Nothing here ever touches scoring: mastery gate stays 0.80, item content untouched,
 *     no pass marks, no "remedial" label (arch §9).
 *
 * CALIBRATION (block.min = instruction + practice) — the SaittaSprout lane's table
 *   Source: LNM_BRAIN/SAITTASPROUT/build_recalibrate_week.py, owner GO 2026-10-17 09:26,
 *   FORMULA TABLE, RULE 1:  block.min = linked lesson.minutes (INSTRUCTION) + practice segment
 *     math grade 3 (max)             lesson.minutes + 30   (20 worksheet + 10 game-practice)
 *     math grade 5 (adonis)          lesson.minutes + 35   (25 worksheet + 10 game-practice)
 *     reading / literature           lesson.minutes + 15   (15 silent reading)
 *     writing                        lesson.minutes + 5    (5 overshoot buffer)
 *     spelling, science, history,
 *     civics, english_grammar        lesson.minutes + 5    (5 wrap)
 *     coding                         lesson.minutes + 5    (no owner row -> default wrap)
 *   The table ships no preschool row: preschool keeps its authored slot minutes and only
 *   gets the instruction/practice split + chunking (instruction = linked lesson.minutes).
 *   Result at factor 1.0 reproduces the lane's recalibrated day exactly (g3 d1 = 45/35/
 *   20/30/30/25 = 185 min — see build_recalibrate_week.py output), then the profile time
 *   factor and the subject norm [lo, hi] from data/pacing.js are applied on top (arch §7c:
 *   minutes are calibrated, never copied).
 */
(function (root) {
  'use strict';

  var DATA_KEY = 'SPROUT_PACING_DATA';

  /* arch §6: default attention_minutes by grade band (12 g3 / 15 g5; preschool path is
     show-me/portfolio, so a shorter default is used and never scored). */
  var DEFAULT_ATTENTION = { '3': 12, '5': 15, preschool: 10 };

  /* same normalization the demo engine uses (app.js SUBJECT_MAP) so block subjects
     ("math") and statutory subjects ("mathematics") resolve to one norms key */
  var SUBJECT_ALIAS = {
    math: 'mathematics', maths: 'mathematics', ela: 'english_grammar',
    english: 'english_grammar', grammar: 'english_grammar', read: 'reading',
    reading_comp: 'reading', lit: 'literature'
  };

  /* TIME_NORMS §9 seatwork red flags cover CORE subjects only */
  var SEATWORK_CORE = ['mathematics', 'reading', 'writing', 'english_grammar', 'spelling'];

  /* profile flags that opt a child into the §7 ND load multiplier (arch §6: presentation
     only — parent-reported preferences, never a diagnosis, never a scoring effect).
     TIME_NORMS §7 gives autism x1.0 total time ("restructure, don't inflate") — those
     profiles chunk and pre-label, they do NOT get the x1.3 load. */
  var ND_FLAGS = ['nd', 'neurodivergent', 'adhd', 'dyslexia', 'audhd', 'twice-exceptional', '2e'];
  var NO_LOAD_FLAGS = ['autism', 'autistic'];

  /* ------------------------------------------------------------------
   * CALIBRATION — PRACTICE_SEGMENT[grade][subject] = the lane's practice segment.
   * block.min = instruction (linked lesson.minutes) + practice segment — see the
   * FORMULA TABLE quoted in the file header (build_recalibrate_week.py, RULE 1).
   * Grades without a lane row (preschool) and blocks without a linked lesson fall
   * back to SPLIT_ONLY: keep the authored slot minutes and split them instead.
   * ------------------------------------------------------------------ */
  var LANE_GRADES = ['3', '5'];

  var PRACTICE_SEGMENT = {
    '3': {
      mathematics: 30, reading: 15, literature: 15, writing: 5, spelling: 5,
      science: 5, history: 5, civics: 5, english_grammar: 5, coding: 5
    },
    '5': {
      mathematics: 35, reading: 15, literature: 15, writing: 5, spelling: 5,
      science: 5, history: 5, civics: 5, english_grammar: 5, coding: 5
    }
  };

  /* split-only practice segment (minutes of the authored slot that are practice):
     reading-family gets 15 silent reading, everything else the 5-min wrap — the same
     defaults the lane uses, applied to a slot whose minutes we do not rewrite. */
  var SPLIT_SEGMENT = {
    reading: 15, literature: 15, writing: 5, spelling: 5, science: 5,
    history: 5, civics: 5, english_grammar: 5, coding: 5, mathematics: 5
  };

  function laneSegment(grade, subject) {
    var g = gradeKey(grade);
    if (!g || LANE_GRADES.indexOf(g) < 0) return null;
    var bank = PRACTICE_SEGMENT[g];
    return bank && isNum(bank[subject]) ? bank[subject] : null;
  }

  /* ---------------- small pure helpers ---------------- */

  function data() { return root[DATA_KEY] || null; }
  function isNum(n) { return typeof n === 'number' && isFinite(n); }
  function clamp(n, lo, hi) { return n < lo ? lo : (n > hi ? hi : n); }
  function round1(n) { return Math.round(n * 10) / 10; }

  function normSubject(subject) {
    if (typeof subject !== 'string') return null;
    var s = subject.toLowerCase().trim();
    if (!s) return null;
    return SUBJECT_ALIAS[s] || s;
  }

  function gradeKey(grade) {
    if (grade === null || grade === undefined) return null;
    var g = String(grade).toLowerCase().trim();
    if (g === '3' || g === 'g3' || g === 'grade 3' || g === 'third') return '3';
    if (g === '5' || g === 'g5' || g === 'grade 5' || g === 'fifth') return '5';
    if (g === '0' || g === 'preschool' || g === 'pk' || g === 'k') return 'preschool';
    return null;
  }

  function gradeFrom(obj) {
    if (!obj) return null;
    return gradeKey(obj.grade_band !== undefined ? obj.grade_band
      : (obj.grade !== undefined ? obj.grade
        : (obj.gk !== undefined ? obj.gk : null)));
  }

  /* Grade resolution for overload_guard(day):
     1) explicit ctx.profile / ctx.grade / day.grade_band
     2) day total matched against daily_totals (180/210/240 are unambiguous in the
        shipped templates)
     3) null -> caller gets the most permissive available caps and a grade_source note   */
  function resolveGrade(day, ctx) {
    ctx = ctx || {};
    var g = gradeFrom(ctx.profile) || gradeFrom(ctx) || gradeFrom(day);
    if (g) return { grade: g, source: 'explicit' };
    var d = data();
    if (d && day && !Array.isArray(day)) {
      var totals = d.daily_totals || {};
      var total = isNum(day.total_min) ? day.total_min : sumBlocks(day.blocks);
      if (isNum(total)) {
        for (var k in totals) {
          if (Object.prototype.hasOwnProperty.call(totals, k) && totals[k] === total) {
            return { grade: gradeKey(k), source: 'inferred-from-total' };
          }
        }
      }
    }
    return { grade: null, source: null };
  }

  function sumBlocks(blocks) {
    if (!Array.isArray(blocks)) return null;
    var t = 0;
    for (var i = 0; i < blocks.length; i++) {
      var m = blocks[i] && blocks[i].min;
      if (isNum(m)) t += m;
    }
    return t;
  }

  /* Infer the grade band from a full day's block total (see resolveGrade note). */
  function inferGrade(blocks) {
    var d = data();
    var totals = (d && d.daily_totals) || {};
    var total = sumBlocks(blocks);
    if (!isNum(total)) return null;
    for (var k in totals) {
      if (Object.prototype.hasOwnProperty.call(totals, k) && totals[k] === total) return gradeKey(k);
    }
    return null;
  }

  /* Chunk cap hi for a band. A band with no row of its own (preschool) and an unknown
     band both fall back to the most permissive published cap — fewer false positives,
     never a hidden overload: raw blocks still exceed it and get flagged. */
  function chunkCapHi(grade, d) {
    var caps = (d && d.chunk_caps) || {};
    if (grade && caps[grade] && isNum(caps[grade][1])) return caps[grade][1];
    var best = null;
    for (var k in caps) {
      if (Object.prototype.hasOwnProperty.call(caps, k) && caps[k] && isNum(caps[k][1])) {
        if (best === null || caps[k][1] > best) best = caps[k][1];
      }
    }
    return best;
  }

  /* Seatwork cap. A KNOWN band with no §9 row (preschool) -> no check (null).
     An UNKNOWN band -> the most permissive published cap. */
  function seatworkCap(grade, d) {
    var caps = (d && d.max_seatwork) || {};
    if (grade) return isNum(caps[grade]) ? caps[grade] : null;
    var best = null;
    for (var k in caps) {
      if (Object.prototype.hasOwnProperty.call(caps, k) && isNum(caps[k])) {
        if (best === null || caps[k] > best) best = caps[k];
      }
    }
    return best;
  }

  function wantsNdTime(profile) {
    if (!profile) return false;
    if (profile.nd_default_time === true) return true;
    var s = profile.supports || {};
    var mode = profile.pace_mode || profile.pace || profile.time_support || profile.modifier ||
      s.pace_mode || s.time_mode || profile.profile;
    if (typeof mode !== 'string') return false;
    var m = mode.toLowerCase().trim();
    if (NO_LOAD_FLAGS.indexOf(m) >= 0) return false;   /* §7: autism = x1.0, restructure only */
    return ND_FLAGS.indexOf(m) >= 0;
  }

  /* ---------------- provider surface (arch §7) ---------------- */

  function version() { var d = data(); return d ? d.norms_version : null; }
  function sourceDoc() { var d = data(); return d ? d.source_doc : null; }
  function timeNorms() { var d = data(); return d ? d.per_subject_norm_hours_totals : null; }
  function statePresets() { var d = data(); return d ? d.state_presets : null; }

  function statePreset(state) {
    var list = statePresets();
    if (!list || !state) return null;
    var want = String(state).toLowerCase().trim();
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p) continue;
      if (String(p.state).toLowerCase() === want || String(p.name).toLowerCase() === want) return p;
    }
    return null;
  }

  function normsFor(grade, subject) {
    var d = data(), g = gradeKey(grade), s = normSubject(subject);
    if (!d || !g || !s) return null;
    var bank = (d.per_subject_norm_hours_totals || {})[g];
    var n = bank && bank[s];
    if (!n) return null;
    return {
      grade: g, subject: s, base: n.base_min, lo: n.lo_min, hi: n.hi_min,
      floor: n.floor_min === undefined ? null : n.floor_min,
      hours_per_day: n.hours_per_day, hours_per_week_upper: n.hours_per_week_upper,
      source: n.source || null, note: n.note || null, norms_version: d.norms_version
    };
  }

  /* calibrationFor(grade, subject) — the lane row that applies to this band/subject.
     Returns {grade, subject, segment, lane, formula} or null when no row exists. */
  function calibrationFor(grade, subject) {
    var g = gradeKey(grade), s = normSubject(subject);
    if (!g || !s) return null;
    var seg = laneSegment(g, s);
    if (seg === null) {
      if (!isNum(SPLIT_SEGMENT[s])) return null;
      return {
        grade: g, subject: s, segment: SPLIT_SEGMENT[s], lane: false,
        formula: 'split-only (no lane row for this band): practice = ' + SPLIT_SEGMENT[s] +
          ' min of the authored slot'
      };
    }
    return {
      grade: g, subject: s, segment: seg, lane: true,
      formula: 'lesson.minutes + ' + seg + '   (SaittaSprout lane RULE 1)'
    };
  }

  /* profile_time_factor = clamp(attention_minutes / DEFAULT_ATTENTION[grade], 0.6, 1.4)
     x (ND load multiplier when the profile opts in) — arch §7c + TIME_NORMS §7. */
  function timeFactor(profile, grade) {
    var d = data();
    if (!profile) return 1;
    var g = gradeKey(grade) || gradeFrom(profile);
    var sup = profile.supports || profile;
    var def = g && DEFAULT_ATTENTION[g] ? DEFAULT_ATTENTION[g] : null;
    var attention = isNum(sup.attention_minutes) ? sup.attention_minutes : def;
    var factor = 1;
    if (def && isNum(attention) && attention > 0) factor = clamp(attention / def, 0.6, 1.4);
    var mult = 1;
    if (isNum(sup.time_multiplier) && sup.time_multiplier > 0) mult = sup.time_multiplier;
    else if (d && wantsNdTime(profile) && isNum(d.nd_modifiers.default_time)) mult = d.nd_modifiers.default_time;
    return clamp(round1(factor * mult), 0.1, 3);
  }

  function attentionFor(profile, grade, capHi) {
    var g = gradeKey(grade) || gradeFrom(profile);
    var sup = (profile && (profile.supports || profile)) || {};
    var a = isNum(sup.attention_minutes) && sup.attention_minutes > 0
      ? sup.attention_minutes
      : (g && DEFAULT_ATTENTION[g] ? DEFAULT_ATTENTION[g] : null);
    if (a === null) a = capHi || 15;
    /* never chunk bigger than the grade's cap hi — chunking must satisfy the guard */
    if (isNum(capHi) && capHi > 0) a = Math.min(a, capHi);
    return a;
  }

  /* chunk plan for a set number of minutes: chunks + max chunk length + break chips */
  function chunkPlan(minutes, profile, grade) {
    var d = data();
    if (!isNum(minutes) || minutes <= 0) return { chunks: 1, chunk_size: minutes, breaks: 0, attention: null };
    var capHi = chunkCapHi(gradeKey(grade) || gradeFrom(profile), d);
    var attention = attentionFor(profile, grade, capHi);
    var chunks = Math.max(1, Math.ceil(minutes / attention));
    var size = Math.ceil(minutes / chunks);
    return {
      chunks: chunks, chunk_size: size,
      breaks: chunks > 1 ? chunks - 1 : 0,
      attention: attention,
      cap_hi: capHi
    };
  }

  /* splitFor(block, grade, subject, lesson) -> {base, instruction, practice, source}
     Lane row (g3/g5) + linked lesson  -> base = lesson.minutes + segment   (RULE 1)
     No lane row (preschool) or no lesson -> base = the authored slot; instruction =
     linked lesson.minutes when it fits, practice = the segment (remainder).           */
  function splitFor(block, grade, subject, lesson) {
    var seg = laneSegment(grade, subject);
    var lessonMin = lesson && isNum(lesson.minutes) && lesson.minutes > 0 ? lesson.minutes : null;
    var slot = isNum(block.min) && block.min > 0 ? block.min : null;

    if (seg !== null && lessonMin !== null) {
      return { base: lessonMin + seg, instruction: lessonMin, practice: seg, source: 'lane' };
    }
    if (slot === null) {
      /* no authored minutes to fall back on: build from whatever we do know */
      if (lessonMin !== null) {
        var s2 = seg !== null ? seg : (SPLIT_SEGMENT[subject] || 0);
        return { base: lessonMin + s2, instruction: lessonMin, practice: s2, source: 'lane-no-slot' };
      }
      if (seg !== null || SPLIT_SEGMENT[subject]) {
        var s3 = seg !== null ? seg : SPLIT_SEGMENT[subject];
        return { base: s3, instruction: 0, practice: s3, source: 'segment-only' };
      }
      return null;
    }
    /* keep the authored slot; split it */
    var practice = seg !== null ? seg : (SPLIT_SEGMENT[subject] || 0);
    practice = clamp(practice, 0, slot);
    return {
      base: slot, instruction: slot - practice, practice: practice,
      source: lessonMin !== null && lessonMin < slot ? 'split-lesson' : 'split-slot'
    };
  }

  function lessonIndex(lessons) {
    var map = {};
    if (!lessons) return map;
    if (Array.isArray(lessons)) {
      for (var i = 0; i < lessons.length; i++) {
        var l = lessons[i];
        if (l && l.id) map[l.id] = l;
      }
    } else if (typeof lessons === 'object') {
      for (var k in lessons) {
        if (Object.prototype.hasOwnProperty.call(lessons, k)) map[k] = lessons[k];
      }
    }
    return map;
  }

  /* recalc one block -> fresh object (never mutates the input) */
  function recalcBlock(block, lessonsMap, profile, grade, opts) {
    var d = data();
    var subject = normSubject(block.subject);
    var norm = normsFor(grade, subject);
    var lesson = block.lesson_ref && lessonsMap ? lessonsMap[block.lesson_ref] : null;
    var factor = timeFactor(profile, grade);
    var split = splitFor(block, grade, subject, lesson);
    if (!split) return null;

    var scaledTotal = Math.round(split.base * factor);
    var lo = norm ? norm.lo : 0;
    var hi = norm ? norm.hi : Number.MAX_SAFE_INTEGER;
    var total = clamp(scaledTotal, lo, hi);

    /* keep the instruction/practice ratio inside the clamped total */
    var instruction = clamp(Math.round(split.instruction * factor), 0, total);
    var practice = total - instruction;

    var capHi = chunkCapHi(grade, d);
    var plan = chunkPlan(total, profile, grade);

    var out = {};
    for (var k in block) {
      if (Object.prototype.hasOwnProperty.call(block, k)) out[k] = block[k];
    }
    out.min = total;
    out.subject = block.subject;              /* display subject untouched */
    out.instruction_min = instruction;
    out.practice_min = practice;
    out.chunks = plan.chunks;
    out.chunk_size = plan.chunk_size;
    out.break_after = plan.chunks > 1;
    out.pacing = (block.pacing && typeof block.pacing === 'object') ? copy(block.pacing) : {};
    out.pacing.recalibrated = true;
    out.pacing.norms_version = d ? d.norms_version : null;
    out.pacing.grade_band = grade;
    out.pacing.time_factor = factor;
    out.pacing.formula = split.source;
    out.pacing.norm = norm ? { lo: norm.lo, hi: norm.hi } : null;
    out.pacing.chunk_cap_hi = capHi;
    return out;
  }

  function copy(o) {
    var r = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k];
    return r;
  }

  /* applyProfile(block, profile, opts) — single-block surface (arch §7).
     Returns the input untouched when profile is absent or the grade is unknown. */
  function applyProfile(block, profile, opts) {
    if (!block || typeof block !== 'object') return block;
    if (!profile) return block;
    opts = opts || {};
    var grade = gradeKey(opts.grade) || gradeFrom(profile);
    if (!grade || !data()) return block;
    var out = recalcBlock(block, lessonIndex(opts.lessons), profile, grade, opts);
    return out || block;
  }

  /* recalc_blocks(blocks, lessons, profile[, opts])
     -> blocks untouched (identity) when profile is null/absent, grade unknown, or data missing
     -> fresh array of recalculated block copies otherwise. NEVER mutates the input array.
     Grade resolution: opts.grade -> profile.grade_band/grade -> the block set's own total
     matched against daily_totals (180/210/240 are unambiguous in the shipped templates). */
  function recalc_blocks(blocks, lessons, profile, opts) {
    if (!profile) return blocks;
    if (!Array.isArray(blocks)) return blocks;
    if (!data()) return blocks;
    opts = opts || {};
    var grade = gradeKey(opts.grade) || gradeFrom(profile) || inferGrade(blocks);
    if (!grade) return blocks;                       /* can't calibrate without a band */
    var map = lessonIndex(lessons);
    var out = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var r = (b && typeof b === 'object') ? recalcBlock(b, map, profile, grade, opts) : b;
      out.push(r || b);
    }
    return out;
  }

  /* ------------------------------------------------------------------
   * overload_guard(day[, ctx]) -> { ok, overages }
   * Checks exactly what the §7 contract asks for:
   *   - chunk caps: every block either fits under chunk_caps[grade][1] or is chunked
   *     (chunks > 1 with a chunk length that itself fits the cap)
   *   - max_seatwork: sum of CORE-subject minutes (§9: mathematics, reading, writing,
   *     english_grammar, spelling) against max_seatwork[grade]
   *   - day total against daily_totals (arch §7b day cap; skipped when the grade is unknown)
   * Violation shape is the guardian-card shape from arch §7d:
   *   { code:'overload', reason, day, subject, planned, cap, norms_version }
   * ------------------------------------------------------------------ */
  function overload_guard(day, ctx) {
    var d = data();
    var blocks = Array.isArray(day) ? day : (day && Array.isArray(day.blocks) ? day.blocks : null);
    var overages = [];
    var meta = resolveGrade(day, ctx);
    var grade = meta.grade;

    if (!d) {
      return fail({ code: 'overload', reason: 'pacing_data_missing', day: dayNo(day), subject: null, planned: null, cap: null }, d, grade, meta, null, null);
    }
    if (!blocks) {
      return fail({ code: 'overload', reason: 'no_blocks', day: dayNo(day), subject: null, planned: null, cap: null }, d, grade, meta, null, null);
    }

    var capHi = chunkCapHi(grade, d);
    var dayTotal = 0, seatwork = 0;

    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (!b || !isNum(b.min)) continue;
      dayTotal += b.min;
      var subj = normSubject(b.subject);
      if (subj && SEATWORK_CORE.indexOf(subj) >= 0) seatwork += b.min;

      var chunked = (isNum(b.chunks) && b.chunks > 1) || b.chunked === true || b.break_after === true;
      var planned;
      if (chunked) {
        var size = isNum(b.chunk_size) ? b.chunk_size
          : (isNum(b.chunks) && b.chunks > 1 ? Math.ceil(b.min / b.chunks) : b.min);
        planned = size;
      } else {
        planned = b.min;
      }
      if (isNum(capHi) && planned > capHi) {
        overages.push({
          code: 'overload', reason: 'chunk_cap', day: dayNo(day), subject: subj || b.subject || null,
          planned: planned, cap: capHi, norms_version: d.norms_version
        });
      }
    }

    var swCap = seatworkCap(grade, d);
    if (isNum(swCap) && seatwork > swCap) {
      overages.push({
        code: 'overload', reason: 'max_seatwork', day: dayNo(day), subject: null,
        planned: seatwork, cap: swCap, norms_version: d.norms_version
      });
    }

    var totals = d.daily_totals || {};
    var dayCapKey = grade === 'preschool' ? 'preschool' : (grade ? 'g' + grade : null);
    var dayCap = dayCapKey && isNum(totals[dayCapKey]) ? totals[dayCapKey] : null;
    if (isNum(dayCap) && dayTotal > dayCap) {
      overages.push({
        code: 'overload', reason: 'day_cap', day: dayNo(day), subject: null,
        planned: dayTotal, cap: dayCap, norms_version: d.norms_version
      });
    }

    return {
      ok: overages.length === 0,
      overages: overages,
      grade: grade,
      grade_source: meta.source,
      day_total: dayTotal,
      seatwork_total: seatwork,
      norms_version: d.norms_version
    };
  }

  function dayNo(day) {
    if (Array.isArray(day)) return null;
    if (!day) return null;
    if (day.day !== undefined) return day.day;
    if (day.day_no !== undefined) return day.day_no;
    if (day.index !== undefined) return day.index;
    return null;
  }

  function fail(entry, d, grade, meta, dayTotal, seatwork) {
    return {
      ok: false,
      overages: [entry],
      grade: grade || null,
      grade_source: meta ? meta.source : null,
      day_total: dayTotal,
      seatwork_total: seatwork,
      norms_version: d ? d.norms_version : null
    };
  }

  /* auditDay(grade, profile, day) — the FULL arch §7b gate: overload_guard PLUS every
     block inside its subject norm. Same {ok, overages} shape; violations carry
     reason:'subject_norm' | 'multi_subject_over_norm' alongside the guard's reasons. */
  function auditDay(grade, profile, day) {
    var d = data();
    var res = overload_guard(day, { grade: grade, profile: profile });
    var blocks = Array.isArray(day) ? day : (day && Array.isArray(day.blocks) ? day.blocks : null);
    if (!d || !blocks) return res;

    var g = gradeKey(grade) || gradeFrom(profile) || res.grade;
    var over = res.overages.slice();
    var gk = gradeKey(grade) || gradeFrom(profile);
    if (!gk) return res;                                  /* norms need a band */

    var overHi = 0;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (!b || !isNum(b.min)) continue;
      var n = normsFor(gk, b.subject);
      if (!n) continue;
      if (b.min > n.hi || b.min < n.lo) {
        over.push({
          code: 'overload', reason: 'subject_norm', day: dayNo(day),
          subject: normSubject(b.subject) || b.subject || null,
          planned: b.min, cap: b.min > n.hi ? n.hi : n.lo, norms_version: d.norms_version
        });
      }
      if (b.min > n.hi) overHi++;
    }
    /* TIME_NORMS §9: a day where 3+ subjects exceed their max simultaneously */
    if (overHi >= 3) {
      over.push({
        code: 'overload', reason: 'multi_subject_over_norm', day: dayNo(day), subject: null,
        planned: overHi, cap: 3, norms_version: d.norms_version
      });
    }

    res.overages = over;
    res.ok = over.length === 0;
    res.grade = res.grade || g;
    return res;
  }

  /* violations(x[, ctx]) — pass an overages array to filter to code 'overload',
     or pass a day to get overload_guard(day, ctx).overages. */
  function violations(x, ctx) {
    if (Array.isArray(x)) {
      return x.filter(function (v) { return v && v.code === 'overload'; });
    }
    return overload_guard(x, ctx).overages;
  }

  var api = {
    version: version,
    sourceDoc: sourceDoc,
    timeNorms: timeNorms,
    statePresets: statePresets,
    statePreset: statePreset,
    normsFor: normsFor,
    calibrationFor: calibrationFor,
    timeFactor: timeFactor,
    attentionFor: attentionFor,
    chunkPlan: chunkPlan,
    applyProfile: applyProfile,
    recalc_blocks: recalc_blocks,
    overload_guard: overload_guard,
    auditDay: auditDay,
    violations: violations,
    DEFAULT_ATTENTION: DEFAULT_ATTENTION,
    SEATWORK_CORE: SEATWORK_CORE
  };

  root.SPRUT_PACING = api;
  root.SPROUT_PACING = api;   /* alias — the arch table spells the data key with the O */

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));