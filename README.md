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

## Keep-all-data-local checklist (beta build, 2026-10-17)

The beta patches (role signup, separated newsletter, proven-work panel) hold these
invariants. Re-check them after any change to `js/app.js`:

- [x] Every key the app writes sits under the `sprout_demo_v1.` prefix → wiped by
      "Clear this demo" (`store.clearAll()`). No bare top-level keys outside the
      `NS`/`LEGACY` lists. (`K.account`, `K.session`, `K.children`, `K.placement.*`,
      `K.yearplan.*`, `K.progress.*`, `K.landing.seen`, `.gate.*`.)
- [x] The newsletter path performs **zero** `localStorage.setItem` and **zero**
      `fetch`/XHR — it is a `mailto:` compose button only (`#nl-compose` in
      `viewLanding()`). Breakpoint it in DevTools to confirm.
- [x] The account record stays `{schema,name,family,role,salt,digest,created_at}` —
      no `email` field, ever. The passphrase stays a 500-round stretched sha256
      digest; the newsletter path shares no field, store or request with it.
- [x] Role is validated against the `parent|teacher|student|tutor` whitelist in
      `landingFor()` (unknown → `#/children`). The first-run flag is a schema-marked
      `{schema,v:1}` blob (`sprout_demo_v1.landing.seen`) per the store contract.
- [x] The beta-update list is our own endpoint only — `mailto:` in v0, later a POST
      to our own relay box (see `data/RELAY_OPTIN_SPEC.md`). Never a third-party
      domain. The footer's "Nothing is transmitted to any server" stays literally
      true while v0 is `mailto:`; it must be amended to "…any third-party server"
      in the same change that ships the relay endpoint.
- [x] `noindex` is set in `index.html`; the relay spec uses token-based
      confirm/opt-out only — no public GET endpoint that leaks addresses.
- [x] DevTools → Application → localStorage after a full run: only `sprout_demo_v1.*`
      keys; zero cookies, zero network beacons on the landing/account/gate routes.

Built by the SOETech agent fleet — synthetic demo data, 2026-09-30.
