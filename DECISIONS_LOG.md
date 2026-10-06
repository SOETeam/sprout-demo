# SPROUT demo — decisions log (append-only)

Format: `D-YYYY-MM-DD-<n> | OPEN/RESOLVED | decision | source`
Corrections are new `CORR-` entries. Existing lines are never edited.

## Carried from the engine ledger (`/root/sprout/docs/DECISIONS_PENDING.md`, verbatim summary)

- D-2026-09-29-1 | RESOLVED | D1 — P0 build green-light: family-only Phase 0 authorized (schemas frozen → item bank v0 → dual assessments; nothing deployed). Executed as commit 5874bdd. | Sophia 2026-09-29 20:35
- D-2026-09-30-7 | RESOLVED | D7 — Michigan statutory subject list: bind ALL compliance copy to the verified brief `/root/LNM_BRAIN/AGENT_DISPATCH/SPROUT_D7_MI_LEGAL_2026-09-30.md`; `active_statutory_list` = the nine MCL 380.1561(3)(f) subjects (reading, spelling, mathematics, science, history, civics, literature, writing, English grammar); compliance copy is EXACTLY "organizes Michigan-required subject coverage" — never legal advice, never "keeps your family compliant". | Sophia 2026-09-30
- D-2026-09-30-9 | RESOLVED | D9 — free-model policy (kid prompts): kid-visible prompts ride paid-cheap models only; `:free` endpoints are adult-lane traffic only. | Sophia 2026-09-30
- D-2026-09-30-5 | OPEN | D5 — no ruling logged in the engine lane's sources; nothing defaulted. | /root/sprout/docs/DECISIONS_PENDING.md
- D-2026-09-30-6 | OPEN | D6 — ARTEMIS profile + 6 Phase-0 skills are D6-gated; not created. | /root/sprout/docs/DECISIONS_PENDING.md
- D-2026-09-30-8 | OPEN | A8 — intake portal + OAuth excluded from P0 → P1. | /root/sprout/docs/DECISIONS_PENDING.md
- D-2026-09-30-10 | OPEN | A10 — assessment conflict rule implemented in code (CAT vs parent-questionnaire conflict → guardian resolution, `sprout/assessment/conflict.py`); final policy card remains open. The demo implements the rule and shows the conflict card; no new default is set. | /root/sprout/docs/DECISIONS_PENDING.md
- D-2026-09-30-11 | OPEN | A11 — 2-week micro-plan split approved as schema shape; full micro-plan sequencing is a later lane. | /root/sprout/docs/DECISIONS_PENDING.md
- D-2026-09-30-12 | OPEN | A12 — no ruling logged in the engine lane's sources; nothing defaulted. | /root/sprout/docs/DECISIONS_PENDING.md
- D-2026-09-30-13 | OPEN | A13 — no ruling logged in the engine lane's sources; nothing defaulted. | /root/sprout/docs/DECISIONS_PENDING.md
- D-2026-09-30-14 | OPEN | 5th-grade-learner ledger-row discrepancy (name redacted per plan §4.1) — AWAITING_SOPHIA: 3rd-grade plan vs 5th-grade assessment must be reconciled at ledger v3 import time; do NOT auto-pick a grade. | /root/sprout/docs/DECISIONS_PENDING.md

## Public demo v1 rulings

- D-2026-10-06-1 | RESOLVED | Grade gating: v1 enables `preschool`, `3`, `5`; every other K–12 grade renders disabled + "Coming soon" (visible roadmap, inert click). | SPROUT_DEMO_V1_PLAN_2026-10-06.md §1 F2
- D-2026-10-06-2 | RESOLVED | localStorage namespace is `sprout_demo_v1`; `saittasprout_v1` / `sprout_v2` are never read or written; "Clear this demo" removes only the `sprout_demo_v1` prefix. | plan §4.2
- D-2026-10-06-3 | RESOLVED | Synthetic-only names in every served byte (persona set Juniper / Pixel / Rookie + a synthetic-name helper); banned: the three real learner names used in the source repo plus any synthetic-lookalike personal, contact or money figures (plan §4.1). | plan §4.1
- D-2026-10-06-4 | RESOLVED | `w1_items = 166` is a **cross-grade** figure = 72 scheduled blocks + 72 open-lesson markdowns + 22 generator configs (3rd 61 + 5th 57 + preschool 48). "166 per grade" is wrong and must not be restated; per-grade *full* inventories are 115 / 117 / 70 (plan §0). | plan §0 "The 166 reconciliation"
- D-2026-10-06-5 | RESOLVED | w2 scope: 72 schedule cards (from `year_curriculum`) + 24 new grade-3 open-lesson objects + 3 weekly tests (10/14/6 questions) drafted via the free worker pool from the master docs and manager-verified; generator practice is seeded at runtime (0 authored items); w3–w6 are topic-only cards with a "Section coming soon" badge. | plan §2
- D-2026-10-06-6 | RESOLVED | Preschool assessment uses the show-me checklist format (tap-friendly, no pass score, portfolio entry) instead of a scored CAT; preschool has no generator configs and no passages — both are labeled gaps, never invented content. | plan §1 F3, §2
- D-2026-10-06-7 | RESOLVED | Compliance copy in the UI is exactly "organizes Michigan-required subject coverage", always paired with "not legal advice". | D7 / config/subjects.yaml
- D-2026-10-06-8 | RESOLVED | No red/failing states anywhere: neutral labels only (`Not started`, `In progress`, `Reviewed`, `Coming soon`); placement gaps are "focus areas"; every state carries a text label so meaning never depends on colour. | plan §4.3
- D-2026-10-06-9 | RESOLVED | Content loads via `data/content.js` (script tag), not `fetch()` — the demo runs from `file://` and makes zero network calls on any data path. | QA battery #3, plan §4
- D-2026-10-06-10 | RESOLVED | `year_curriculum`'s `data/cumulative/*` references are dangling by design; the demo never fetches them and reuses the pop-quiz pool for cumulative review instead. | plan §0
- D-2026-10-06-11 | RESOLVED | Export determinism: `exported_at` is stored on the progress record at first export and reused by later exports, so `export → import → export` is byte-identical (schema marker + persona + export date present). | plan QA #2
- D-2026-10-06-12 | RESOLVED | Weekly-test renderer supports both data shapes (`questions` for tap-mcq, `items` for the preschool show-me checklist; `passScore: null` = no pass mark). | apps/sprout/data/tests/*_w1_test.json
