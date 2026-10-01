# SPROUT — Homeschool OS · Interactive Demo

**Live:** https://soeteam.github.io/sprout-demo/

> **Demo data only — no accounts, no real learner data.** Every learner, totem, XP
> total and plan in this demo is synthetic/fictional. Totems (🦊 Nova / 🐺 Orion / 🐨 Comet)
> stand in for real kid portals. The assessment items are the only "real" content: they
> come from the SPROUT public seed bank (deterministic generator, answer-key machine-verified).

## What this demo shows

This demo shows adaptive homeschool placement + mastery tooling built by the SOETech agent fleet:

1. **Family dashboard** — week-at-a-glance panel, three totem kid portals, and a coverage-audit
   tile listing the 9 statutory subjects from **MCL 380.1561(3)(f)** (verified-D7 framing).
   SPROUT *organizes Michigan-required subject coverage* — it does **not** provide legal advice.
2. **Kid portal** — pick a totem → XP, streak, review-due cards and per-skill mastery.
3. **Playable placement flow** — 8 real seed items served one at a time → difficulty-weighted
   ability estimate → placement result → **mandatory Guardian Gate** ("Parent approves this
   placement") → 2-week dated micro-plan skeleton across all 9 subjects.
4. **Mastery lab** — BKT p_known slider + update, XP-once behavior, Leitner box with
   client-side next-review dates.
5. **Records binder** — client-side JSON export + print view generated from demo data.

## Stack

Single static `index.html`. All logic is client-side JavaScript — no backend, no external
fetches, no accounts, no tracking, no cookies. Items are embedded as JSON.

## Privacy

- Zero real names, grades, or learner PII — all portal data is fabricated-for-demo.
- No keys, passcodes, relay URLs, or internal hostnames anywhere in the code.
- Footer provenance: *Built by the SOETech agent fleet · synthetic demo data · 2026-09-30*.

Built by the SOETech agent fleet — synthetic demo data, 2026-09-30.
