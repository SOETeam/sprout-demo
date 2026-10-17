/* SPROUT pacing data — script-tag ship (no fetch, no third-party request).
 *
 * Contract: PROPOSALS/SPROUT_ENGINE_ARCH_2026-10-17.md §1H + §7
 * Data source: PROPOSALS/SPROUT_TIME_NORMS_2026-10-17.md (compiled 2026-10-17)
 *   - per-subject norms .... §1 (published minute recommendations), §2 (engaged-time rule),
 *                            §5 (writing minutes), §9 (overload thresholds)
 *   - shipped baselines ..... SaittaSprout lane recalibration, owner GO 2026-10-17 09:26
 *                            (LNM_BRAIN/SAITTASPROUT/build_recalibrate_week.py RULE 1:
 *                            block.min = lesson.minutes + practice segment). That script
 *                            is the source of the per-subject base_min values below;
 *                            per-subject range = [0.8x, 1.2x] of the shipped slot,
 *                            floored at the MI map §4 core minimum, widened only where the
 *                            shipped data itself runs shorter/longer (values noted per row).
 *   - day caps ............. SPROUT_ENGINE_ARCH §7(b) provisional age caps
 *                            (g3 210 / g5 240 / preschool 180) = daily_totals
 *   - chunk_caps ............ §7 work-block caps (ADHD row: G3 10-15 min, G5 15-20 min)
 *   - nd_modifiers .......... §7 "Default SPROUT factor [EST]: ND load multiplier x1.3"
 *   - max_seatwork .......... §9 "Max scheduled seatwork/day (core subjects only)"
 *                            G3 >3.5 h = 210 min, G5 >4 h = 240 min
 *   - state_presets ......... §10 (~13 representative states) + national picture line
 *   - daily_totals .......... SPROUT_ENGINE_ARCH §7(b) provisional age caps
 *
 * LAWS this file obeys (arch §7a/§7 rules, D7):
 *   - hour/day fields stay null until a PRIMARY source is cited. 0 = verified "none".
 *   - only status:"verified" rows may appear in parent-facing copy, and even then only as a
 *     "planning target" — never "you must". A null-mandate state never gets an "hours met" badge.
 *   - everything here is planning data; minutes logged for a child are an internal planning
 *     number, never a compliance claim.
 *
 * Consumed by js/pacing.js (window.SPRUT_PACING). Never hard-code these numbers in the engine.
 */
window.SPROUT_PACING_DATA = {

  schema: 'sprout.pacing_data/v1',
  time_norms_schema: 'time_norms/v1',
  state_presets_schema: 'state_time_presets/v1',
  norms_version: '2026-10-17',
  source_doc: 'PROPOSALS/SPROUT_TIME_NORMS_2026-10-17.md',
  status: 'verified-partial',           // MI + norm math verified; non-MI presets pending primary source
  generated_by: 'hand-converted from the §1/§2/§5/§7/§9/§10 tables (tools/build_pacing.py = P7)',

  /* School-day budget the plan is allowed to spend (arch §7: week_target_minutes = day_cap x school_days).
     A planning budget ONLY — no state gets an "hours met" badge from it. */
  school_days: 4,
  week_target_minutes: { g3: 840, g5: 960, preschool: 720 },

  /* ------------------------------------------------------------------
   * time_norms/v1 — per-subject norms, keyed by grade band then by the
   * NORMALIZED subject name (block "math" -> "mathematics"; "coding" stays
   * "coding" because it is enrichment, never statutory coverage).
   *
   *   base_min  reference slot = the shipped, recalibrated block value
   *             (SaittaSprout lane RULE 1: lesson.minutes + practice segment)
   *   lo_min    [0.8 x base] floored at the MI map §4 core minimum where one
   *             exists, widened only where the shipped data itself runs shorter
   *             (light / consolidation-day slots) — widening keeps recalc identity
   *             at factor 1.0, so a calibrated day never drifts inside its band.
   *   hi_min    [1.2 x base], widened where the shipped data itself runs longer.
   *   hours_*   planning totals only (base x school_days / 60). Rotating subjects
   *             land below hours_per_week_upper — that is expected.
   * ------------------------------------------------------------------ */
  per_subject_norm_hours_totals: {

    '3': {
      mathematics:    { base_min: 45, lo_min: 36, hi_min: 54, floor_min: 30, hours_per_day: 0.75, hours_per_week_upper: 3.0,
                        source: 'SaittaSprout lane recalibration (build_recalibrate_week.py RULE 1: lesson.minutes + 30) — shipped g3 math slot 45 (36 on the consolidation week, 50 on long days); §1 math >=60 min/day is a school-day figure, §10 homeschool practice 3.0-3.5 h/day',
                        note: 'MI §4 daily core. RANGE [0.8x,1.2x] of the shipped slot, floored at the §4 core minimum (30).' },
      reading:        { base_min: 35, lo_min: 28, hi_min: 42, floor_min: 20, hours_per_day: 0.58, hours_per_week_upper: 2.33,
                        source: 'lane recalibration (lesson.minutes + 15 silent reading) — shipped g3 reading slot 35 (28 light days); §4 core 20-30 min',
                        note: 'MI §4 daily core. Fluency norms §3 — never push WCPM past the grade band.' },
      writing:        { base_min: 65, lo_min: 52, hi_min: 78, floor_min: 15, hours_per_day: 1.08, hours_per_week_upper: 4.33,
                        source: 'lane recalibration (lesson.minutes + 5 buffer) — shipped g3 writing slot 65 (52 light days); §5 IES grade 1+ 60 min/day',
                        note: 'MI §4 daily core. Composing runs ~4x slower than copying (§5) — do not stack.' },
      literature:     { base_min: 35, lo_min: 28, hi_min: 42, floor_min: null, hours_per_day: 0.58, hours_per_week_upper: 2.33,
                        source: 'lane recalibration (lesson.minutes + 15 silent reading) — shipped g3 literature slot 35 (28 light days)',
                        note: 'Statutory subject; reading-family block (carries passage_ref + reading lesson).' },
      spelling:       { base_min: 20, lo_min: 16, hi_min: 24, floor_min: 15, hours_per_day: 0.33, hours_per_week_upper: 1.33,
                        source: 'lane recalibration (lesson.minutes + 5 wrap) — shipped g3 spelling slot 20 (16 light days); §4 core 15-20; §5 spelling sweet spot 20-30',
                        note: 'MI §4 daily core (spelling sits inside the §4 writing/grammar/spelling band).' },
      english_grammar:{ base_min: 20, lo_min: 16, hi_min: 24, floor_min: 15, hours_per_day: 0.33, hours_per_week_upper: 1.33,
                        source: 'lane recalibration (lesson.minutes + 5 wrap) — shipped g3 english_grammar slot 20 (16 light days); §4 core 15-20',
                        note: 'MI §4 daily core.' },
      science:        { base_min: 30, lo_min: 16, hi_min: 36, floor_min: null, hours_per_day: 0.5, hours_per_week_upper: 2.0,
                        source: 'lane recalibration (lesson.minutes + 5 wrap) — shipped g3 science slot 30 (24 light, 16 consolidation); §1 science 30 min/day or 150 min/wk',
                        note: 'Rotates >=3 touches/week (arch §2 step 2). hi held at the §1 30 min/day figure x1.2.' },
      history:        { base_min: 30, lo_min: 24, hi_min: 36, floor_min: null, hours_per_day: 0.5, hours_per_week_upper: 2.0,
                        source: 'lane recalibration (lesson.minutes + 5 wrap) — shipped g3 history slot 30 (24 light days); §1 social studies 30 min/day',
                        note: 'Rotates >=3 touches/week (arch §2 step 2).' },
      civics:         { base_min: 30, lo_min: 24, hi_min: 36, floor_min: null, hours_per_day: 0.5, hours_per_week_upper: 2.0,
                        source: 'lane recalibration (lesson.minutes + 5 wrap) — shipped g3 civics slot 30 (24 light days)',
                        note: 'Statutory subject (MCL 380.1561(3)(f)).' },
      coding:         { base_min: 25, lo_min: 20, hi_min: 30, floor_min: null, hours_per_day: 0.42, hours_per_week_upper: 1.67,
                        source: 'lane recalibration (lesson.minutes + 5 default wrap) — shipped g3 coding slot 25 (20 light days)',
                        note: 'ENRICHMENT — coding is never counted toward the 9/9 coverage audit (arch §1A).' }
    },

    '5': {
      mathematics:    { base_min: 55, lo_min: 40, hi_min: 66, floor_min: 30, hours_per_day: 0.92, hours_per_week_upper: 3.67,
                        source: 'SaittaSprout lane recalibration (build_recalibrate_week.py RULE 1: lesson.minutes + 35) — shipped g5 math slot 55 (44/40 light days, 50 long days); §1 math >=60 min/day is a school-day figure',
                        note: 'MI §4 daily core. RANGE [0.8x,1.2x] of the shipped slot, floored at the §4 core minimum (30), widened to the shipped 40-min consolidation slot.' },
      reading:        { base_min: 75, lo_min: 60, hi_min: 90, floor_min: 20, hours_per_day: 1.25, hours_per_week_upper: 5.0,
                        source: 'lane recalibration (lesson.minutes 60 + 15 silent reading) — shipped g5 reading slot 75 (60 light days); §1 literacy >=120 min/day',
                        note: 'MI §4 daily core. Long block — chunk it (chunk_caps 5:[15,20]) and keep the passage read-aloud mode in mind (arch §6).' },
      writing:        { base_min: 65, lo_min: 52, hi_min: 78, floor_min: 15, hours_per_day: 1.08, hours_per_week_upper: 4.33,
                        source: 'lane recalibration (lesson.minutes + 5 buffer) — shipped g5 writing slot 65 (52 light days); §5 IES grade 1+ 60 min/day',
                        note: 'MI §4 daily core — the generator must place it (arch §2 step 3).' },
      literature:     { base_min: 75, lo_min: 60, hi_min: 90, floor_min: null, hours_per_day: 1.25, hours_per_week_upper: 5.0,
                        source: 'lane recalibration (lesson.minutes + 15 silent reading) — shipped g5 literature slot 75 (60 light days)',
                        note: 'Statutory subject; reading-family block, required by the 9/9 weekly coverage gate.' },
      spelling:       { base_min: 25, lo_min: 16, hi_min: 30, floor_min: 15, hours_per_day: 0.42, hours_per_week_upper: 1.67,
                        source: 'lane recalibration (lesson.minutes + 5 wrap) — shipped g5 spelling slot 25 (20/16 light days); §4 core 15-20; §5 spelling sweet spot 20-30',
                        note: 'MI §4 daily core.' },
      english_grammar:{ base_min: 20, lo_min: 16, hi_min: 24, floor_min: 15, hours_per_day: 0.33, hours_per_week_upper: 1.33,
                        source: 'lane recalibration (lesson.minutes + 5 wrap) — shipped g5 english_grammar slot 20 (16 light days); §4 core 15-20',
                        note: 'MI §4 daily core.' },
      science:        { base_min: 35, lo_min: 28, hi_min: 42, floor_min: null, hours_per_day: 0.58, hours_per_week_upper: 2.33,
                        source: 'lane recalibration (lesson.minutes + 5 wrap) — shipped g5 science slot 35 (28 light days); §1 science 30 min/day or 150 min/wk',
                        note: 'Rotates >=3 touches/week (arch §2 step 2).' },
      history:        { base_min: 35, lo_min: 20, hi_min: 42, floor_min: null, hours_per_day: 0.58, hours_per_week_upper: 2.33,
                        source: 'lane recalibration (lesson.minutes + 5 wrap) — shipped g5 history slot 35 (28 light, 20 short-lesson days); §1 social studies 30 min/day',
                        note: 'Rotates >=3 touches/week (arch §2 step 2).' },
      civics:         { base_min: 35, lo_min: 28, hi_min: 42, floor_min: null, hours_per_day: 0.58, hours_per_week_upper: 2.33,
                        source: 'lane recalibration (lesson.minutes + 5 wrap) — shipped g5 civics slot 35 (28 light days)',
                        note: 'Statutory subject (MCL 380.1561(3)(f)).' },
      coding:         { base_min: 35, lo_min: 20, hi_min: 42, floor_min: null, hours_per_day: 0.58, hours_per_week_upper: 2.33,
                        source: 'lane recalibration (lesson.minutes + 5 default wrap) — shipped g5 coding slot 35 (28/25/20 light days)',
                        note: 'ENRICHMENT — never counted toward coverage.' }
    },

    preschool: {
      reading:        { base_min: 30, lo_min: 24, hi_min: 50, floor_min: null, hours_per_day: 0.5,  hours_per_week_upper: 2.0,
                        source: 'arch §7b shipped preschool template (30; 50-min swap on w1 d4)',
                        note: 'Show-me / portfolio path — no pass mark, no seatwork mandate (arch §2).' },
      mathematics:    { base_min: 25, lo_min: 20, hi_min: 50, floor_min: null, hours_per_day: 0.42, hours_per_week_upper: 1.67,
                        source: 'arch §7b shipped preschool template (25 + 20; 50-min swap on w2 d4)',
                        note: 'Two short blocks beats one long one at this age (§6 attention row).' },
      writing:        { base_min: 25, lo_min: 20, hi_min: 50, floor_min: null, hours_per_day: 0.42, hours_per_week_upper: 1.67,
                        source: 'arch §7b shipped preschool template (25; 50-min swap in weeks 3-4)',
                        note: 'Handwriting speed norms §4 — copying, not composing, at this band.' },
      literature:     { base_min: 30, lo_min: 24, hi_min: 36, floor_min: null, hours_per_day: 0.5,  hours_per_week_upper: 2.0,
                        source: 'arch §7b shipped preschool template (30)',
                        note: 'Read-aloud block; TTS/read-aloud mode accrues to practiced minutes only (arch §7c).' },
      science:        { base_min: 50, lo_min: 40, hi_min: 60, floor_min: null, hours_per_day: 0.83, hours_per_week_upper: 3.33,
                        source: 'arch §7b shipped preschool template (50, 12 of 16 days)',
                        note: 'Play-based block; day total stays at 180.' }
    }
  },

  /* §7 work-block caps [lo, hi] in minutes. The hi value is what overload_guard
     uses as the "must be chunked by here" ceiling for that grade band. */
  chunk_caps: { '3': [10, 15], '5': [15, 20] },

  /* §7 ND load multiplier — applied only when the child's profile explicitly asks
     for ND pacing (arch §6 profile.v1 is presentation-only; it never touches scoring). */
  nd_modifiers: { default_time: 1.3 },

  /* arch §7(b) provisional day caps (shipped template totals). */
  daily_totals: { g3: 210, g5: 240, preschool: 180 },

  /* TIME_NORMS §9 "Max scheduled seatwork/day (core subjects only)": G3 >3.5 h, G5 >4 h.
     No §9 threshold is published for preschool — the engine skips the seatwork check there. */
  max_seatwork: { '3': 210, '5': 240 },

  /* ------------------------------------------------------------------
   * state_time_presets/v1 — 13 representative states, TIME_NORMS §10.
   *   hour_mandate / day_mandate : 0 = verified "none"; a number = primary-sourced
   *       threshold; null = NOT established from a primary source (engine then plans
   *       from the default pacing budget and prints NO hour requirement — arch §7a).
   *   doc_reported : exactly what §10 reports, kept unaltered for traceability.
   *   parent_facing : true only when status === "verified" (arch §7a / §9 time-claims law).
   * National picture (§10): 29 states + DC set NO homeschool hours/days number; 8 days-only;
   *   8 days AND hours; 4 hours-only; 2 either/or.
   * ------------------------------------------------------------------ */
  state_presets: [
    { state: 'MI', name: 'Michigan', preset: 'zero-mandate', structure: 'none',
      hour_mandate: 0, day_mandate: 0, status: 'verified', parent_facing: true,
      mandate_text: 'NONE — MCL 380.1561(3)(f) exempts home instruction in 8 subjects with no hours/days requirement; Clonlara v. SBE (1993) confirmed nonpublic schools need not hit 180 days. Public schools: 180 days / 1,098 hrs (MCL 388.1701(3)).',
      doc_reported: { hour_mandate: 0, day_mandate: 0 },
      source: 'SPROUT_TIME_NORMS_2026-10-17.md §10 (Michigan row)',
      source_url: 'https://legislature.mi.gov/Laws/MCL?objectName=MCL-380-1561',
      source_kind: 'primary-statute',
      copy_rule: 'Ship as "no hour/day mandate"; the 25 h/wk figure is an internal planning benchmark, never law (arch §9; MI map §2 row 5).' },

    { state: 'TX', name: 'Texas', preset: 'zero-mandate', structure: 'none',
      hour_mandate: null, day_mandate: null, status: 'secondary-source', parent_facing: false,
      mandate_text: 'NONE (no notice, no hours) — per §10 secondary source.',
      doc_reported: { hour_mandate: 0, day_mandate: 0 },
      source: 'SPROUT_TIME_NORMS_2026-10-17.md §10 (Texas row)',
      source_url: 'https://worldpopulationreview.com/state-rankings/homeschool-laws-by-state',
      source_kind: 'secondary',
      copy_rule: 'Null until a primary statute is cited — print no requirement (arch §7a).' },

    { state: 'IL', name: 'Illinois', preset: 'zero-mandate', structure: 'none',
      hour_mandate: null, day_mandate: null, status: 'secondary-source', parent_facing: false,
      mandate_text: 'NONE (treated as private school) — per §10 secondary source.',
      doc_reported: { hour_mandate: 0, day_mandate: 0 },
      source: 'SPROUT_TIME_NORMS_2026-10-17.md §10 (Illinois row)',
      source_url: 'https://worldpopulationreview.com/state-rankings/homeschool-laws-by-state',
      source_kind: 'secondary',
      copy_rule: 'Null until a primary statute is cited — print no requirement (arch §7a).' },

    { state: 'AK', name: 'Alaska', preset: 'zero-mandate', structure: 'option-dependent',
      hour_mandate: null, day_mandate: null, status: 'secondary-source', parent_facing: false,
      mandate_text: 'No notice for home education; public-school equivalents: 740 hrs (K-3), 900 hrs (G4-12) — per §10.',
      doc_reported: { hour_mandate: null, day_mandate: null, public_equivalent_hours: '740 (K-3) / 900 (G4-12)' },
      source: 'SPROUT_TIME_NORMS_2026-10-17.md §10 (Alaska row)',
      source_url: 'https://nces.ed.gov/programs/statereform/tab5_14.asp',
      source_kind: 'secondary',
      copy_rule: 'Preset label says zero-mandate (no notice) but the hour figures are public-school equivalents from a compiled table — print no requirement.' },

    { state: 'CA', name: 'California', preset: 'hour-based', structure: 'option-dependent',
      hour_mandate: null, day_mandate: null, status: 'secondary-source', parent_facing: false,
      mandate_text: 'Depends on the option chosen; public-school minimums: G1-3 840 hrs/yr (230 min/day), G4-8 900 hrs/yr (240 min/day) — per §10.',
      doc_reported: { hour_mandate: '840 (G1-3) / 900 (G4-8) per year', day_mandate: null, minutes_per_day: '230 (G1-3) / 240 (G4-8)' },
      source: 'SPROUT_TIME_NORMS_2026-10-17.md §10 (California row)',
      source_url: 'https://nces.ed.gov/programs/statereform/tab5_14.asp',
      source_kind: 'secondary',
      copy_rule: 'Compiled federal table, not primary — null fields, print no requirement.' },

    { state: 'NY', name: 'New York', preset: 'days+hours', structure: 'days+hours',
      hour_mandate: null, day_mandate: null, status: 'secondary-source', parent_facing: false,
      mandate_text: '180 days AND 900 hrs/yr (G1-6); 990 (G7-12) — per §10 secondary source.',
      doc_reported: { hour_mandate: '900 (G1-6) / 990 (G7-12)', day_mandate: 180 },
      source: 'SPROUT_TIME_NORMS_2026-10-17.md §10 (New York row)',
      source_url: 'https://worldpopulationreview.com/state-rankings/homeschool-laws-by-state',
      source_kind: 'secondary',
      copy_rule: 'Null until a primary statute is cited — print no requirement (arch §7a).' },

    { state: 'PA', name: 'Pennsylvania', preset: 'either/or', structure: 'either-or',
      hour_mandate: null, day_mandate: null, status: 'secondary-source', parent_facing: false,
      mandate_text: '180 days OR 900 hrs (K-6); 990 (7-12) — per §10; cited to 22 Pa. Code §51.61 alongside a secondary source.',
      doc_reported: { hour_mandate: '900 (K-6) / 990 (7-12)', day_mandate: 180 },
      source: 'SPROUT_TIME_NORMS_2026-10-17.md §10 (Pennsylvania row)',
      source_url: 'https://www.law.cornell.edu/regulations/pennsylvania/22-Pa-Code-SS-51-61',
      source_kind: 'mixed-primary-secondary',
      copy_rule: 'Numbers in §10 trace to a secondary source with the Code cited alongside — hold at null until the Code text is read against the figure (P7 ingest).' },

    { state: 'GA', name: 'Georgia', preset: 'days+hours', structure: 'days+hours',
      hour_mandate: null, day_mandate: null, status: 'secondary-source', parent_facing: false,
      mandate_text: '180 days, each >=4.5 hrs (K-3), >=5.0 (G4-5) -> ~810/900 hrs — per §10.',
      doc_reported: { hour_mandate: '~810 (K-3) / ~900 (G4-5)', day_mandate: 180, hours_per_day: '>=4.5 (K-3) / >=5.0 (G4-5)' },
      source: 'SPROUT_TIME_NORMS_2026-10-17.md §10 (Georgia row)',
      source_url: 'https://www.ecs.org/wp-content/uploads/Number-of-Instructional-Days-Hours-in-a-School-Year_Revised.pdf',
      source_kind: 'secondary',
      copy_rule: 'Compiled ECS table, not primary — null fields, print no requirement.' },

    { state: 'KS', name: 'Kansas', preset: 'days+hours', structure: 'days+hours',
      hour_mandate: null, day_mandate: null, status: 'secondary-source', parent_facing: false,
      mandate_text: '186 days x 6 hrs (homeschool) — per §10 secondary source.',
      doc_reported: { hour_mandate: '6 hrs/day', day_mandate: 186 },
      source: 'SPROUT_TIME_NORMS_2026-10-17.md §10 (Kansas row)',
      source_url: 'https://worldpopulationreview.com/state-rankings/homeschool-laws-by-state',
      source_kind: 'secondary',
      copy_rule: 'Null until a primary statute is cited — print no requirement (arch §7a).' },

    { state: 'MO', name: 'Missouri', preset: 'hours-based', structure: 'either-or',
      hour_mandate: null, day_mandate: null, status: 'secondary-source', parent_facing: false,
      mandate_text: '1,000 hrs (600 in core) OR 180 days — per §10 secondary source.',
      doc_reported: { hour_mandate: '1,000 (600 in core)', day_mandate: 180 },
      source: 'SPROUT_TIME_NORMS_2026-10-17.md §10 (Missouri row)',
      source_url: 'https://homeschoolfacts.com/a-general-summary-of-u-s-homeschool-regulations',
      source_kind: 'secondary',
      copy_rule: 'Null until the statute (RSMo 167.012) is read directly — print no requirement (arch §7a).' },

    { state: 'WA', name: 'Washington', preset: 'either/or', structure: 'either-or',
      hour_mandate: null, day_mandate: null, status: 'secondary-source', parent_facing: false,
      mandate_text: '180 days OR 1,000 hrs — per §10 secondary source.',
      doc_reported: { hour_mandate: 1000, day_mandate: 180 },
      source: 'SPROUT_TIME_NORMS_2026-10-17.md §10 (Washington row)',
      source_url: 'https://homeschoolreports.com/blog/attendance/homeschool-attendance-requirements-by-state',
      source_kind: 'secondary',
      copy_rule: 'Null until a primary statute is cited — print no requirement (arch §7a).' },

    { state: 'CO', name: 'Colorado', preset: 'hour-based', structure: 'hour-based',
      hour_mandate: null, day_mandate: null, status: 'secondary-source', parent_facing: false,
      mandate_text: 'Public min 160 days; G1-5 968 hrs/yr — per §10.',
      doc_reported: { hour_mandate: '968 (G1-5)', day_mandate: 160, day_note: 'public minimum' },
      source: 'SPROUT_TIME_NORMS_2026-10-17.md §10 (Colorado row)',
      source_url: 'https://nces.ed.gov/programs/statereform/tab5_14.asp',
      source_kind: 'secondary',
      copy_rule: 'Compiled federal table, not primary — null fields, print no requirement.' },

    { state: 'MN', name: 'Minnesota', preset: 'hour-based', structure: 'hour-based',
      hour_mandate: null, day_mandate: null, status: 'secondary-source', parent_facing: false,
      mandate_text: 'Public min 165 days; G1-6 935 hrs — per §10.',
      doc_reported: { hour_mandate: '935 (G1-6)', day_mandate: 165, day_note: 'public minimum' },
      source: 'SPROUT_TIME_NORMS_2026-10-17.md §10 (Minnesota row)',
      source_url: 'https://nces.ed.gov/programs/statereform/tab5_14.asp',
      source_kind: 'secondary',
      copy_rule: 'Compiled federal table, not primary — null fields, print no requirement.' }
  ],

  notes: [
    'Per-subject norms are provisional planning bands (arch §7b) — not published statutory minutes.',
    'Only MI has a primary citation in §10, so only MI ships parent-facing; every other row is held at null.',
    'chunk_caps are the §7 work-block caps; a block longer than cap hi must be split with break chips before a plan can go active.',
    'max_seatwork thresholds are §9 red flags for core subjects only (mathematics, reading, writing, english_grammar, spelling).',
    'Homeschool practice baseline (§10): ~3.0-3.5 h/day (G3) and 3.5-4.0 h/day (G5) of formal study — planning target, never a mandate.'
  ]
};