# SPROUT demo — architecture

Public demo build: static site on GitHub Pages (`SOETeam/sprout-demo`), localStorage only,
no backend, no analytics, no third-party requests. Everything a browser needs ships in the repo.

- Repo: `github.com/SOETeam/sprout-demo` · live: `https://soeteam.github.io/sprout-demo/`
- Engine (schemas + rules): `/root/sprout` — commits **5874bdd** and **3f96d8b**
- Content sources: `/root/LNM_BRAIN/SAITTASPROUT/` (master docs) and
  `/root/SOETechWebApp-obsidian/apps/sprout/` (SaittaSprout prototype)
- Naming law: the public app is **SPROUT**. "SaittaSprout" appears only in provenance docs.

## Route / view map

| hash route | view | what it renders |
|---|---|---|
| `#/` | landing | hero, positioning pillars, grade roadmap strip, proof strip, privacy footer |
| `#/account` | parent account | local signup (display name + passphrase + optional synthetic family name), sign-in |
| `#/children` | child manager | child cards, Add child, grade select (3 enabled + 12 locked "Coming soon") |
| `#/assess/<childId>` | assessment | child adaptive-lite CAT / preschool show-me checklist, parent questionnaire, A10 conflict card, guardian gate, `placement/v1` card |
| `#/ceremony/<childId>` | curriculum creation | 6-step ceremony with real `year_plan/v0` JSON, Mode A spine, week map, coverage audit, guardian gate #2 |
| `#/portal/<childId>` | student portal | keypad gate (tile-first), This week, Weeks 3–6, Progress (export/import), Parent view |

Lesson view, seeded practice, weekly tests and passages all render inside the portal as modals.

## Module map

| file | role |
|---|---|
| `index.html` | shell: topbar, `#app`, privacy footer, modal root, asset tags |
| `css/app.css` | v0 theme tokens (restored in `6578316`) + all demo components |
| `css/prototype.css` | style-only extract of the prototype's lesson / gate / workspace surfaces |
| `js/workspace.css` | vendored workspace styles (copied with the prototype) |
| `js/app.js` | store, router, accounts, children, assessment, ceremony, portal, tests, export/import |
| `js/generator.js` | **ported** seeded practice engine (`window.SPRUT_GEN`, 14 families, fnv1a32/murmur3/mulberry32) |
| `js/lesson.js` | **ported** open-lesson view (`window.SPRUT_LESSON`) |
| `js/workspace.js` + `js/vendor/*` | **ported** math/spelling/reading/writing workspaces (MathQuill, mathjs, jQuery, Sortable — all local) |
| `data/content.js` | generated content bundle (emitted by `tools/build_content.py`, assigned to `window.SPROUT_CONTENT`) |
| `data/content.json` | same bundle, pretty-printed, for inspection/QA |
| `tools/build_content.py` | content pipeline: source file → demo JSON (scrub, strip local paths, count) |
| `docs/` | `ARCHITECTURE.md`, `DECISIONS_LOG.md`, `DEMO_GUIDE.md` |

## localStorage key table

Namespace: **`sprout_demo_v1`** (never `saittasprout_v1`, never `sprout_v2`). Every blob is
an object carrying `"schema": "sprout_demo_v1"`.

| key | contents |
|---|---|
| `sprout_demo_v1.account` | `{name, family, salt, digest, created_at}` — digest = sha256 stretched 500× over `salt:passphrase`; never plaintext |
| `sprout_demo_v1.session` | `{name, family, at}` |
| `sprout_demo_v1.children` | `{items:[{id, name, grade, start_date, persona, pin_digest, pin_hint, created_at}]}` |
| `sprout_demo_v1.placement.<childId>` | `placement/v1` report (domains, cat, guardian_gate, plan_generation_allowed) |
| `sprout_demo_v1.yearplan.<childId>` | `year_plan/v0` plan (spine, weeks, coverage_audit, guardian_gate, approved) |
| `sprout_demo_v1.progress.<childId>` | `{notes, streams, practice, xp, xp_once, leitner, tests, lessons_done, exported_at}` |

"Clear this demo" deletes exactly the `sprout_demo_v1` prefix (and defensively removes the two
legacy namespaces if a stale browser still carries them). Nothing else on the device is touched.

## Content pipeline (source file → demo JSON)

1. `tools/build_content.py` reads, per enabled grade:
   - week schedule: `apps/sprout/data/week/<student>/week_01.json` (w1) and
     `SAITTASPROUT/year_curriculum/<student>/week_02..04.json` (w2–w4);
   - open-lesson objects: `apps/sprout/data/curriculum/<student>_grade*.json` modules;
   - open-lesson source sheets: `SAITTASPROUT/materials/<student>/w*/**.md`;
   - weekly tests: `apps/sprout/data/tests/*_w1_test.json` + worker-authored `data/_w2_tests/*`;
   - generator configs: `apps/sprout/data/generators/*_w1.json`;
   - passages: `apps/sprout/data/passages/*`; pop quizzes: `apps/sprout/data/quizzes/*`;
   - assessment bank: `/root/sprout/item_bank_seed/{math,ela}.json` (IRT a/b, answer keys);
   - weeks 5–6 topics: `WEEK 5 —` / `WEEK 6 —` headings in `SAITTASPROUT/students/*_YEAR_2026-27.md`.
2. Scrub pass (banned names), local-path strip, schema marker, item counts.
3. Emits `data/content.js` (`window.SPROUT_CONTENT = {...}`) + `data/content.json`.

A script tag is used on purpose: `fetch()` of JSON is blocked on `file://`, so the demo runs
identically from disk and from GitHub Pages, and the data path makes **zero network calls**.

## PORT / ADAPT / SKIP (from the sizing plan)

| # | Feature | Verdict | Where it lives |
|---|---|---|---|
| 1 | Lesson view | PORT | `js/lesson.js` (`window.SPRUT_LESSON`), retargeted to v0 theme classes |
| 2 | Generator engine (14 families, 22 configs) | PORT | `js/generator.js` (`window.SPRUT_GEN`) |
| 3 | Seeded practice contract | PORT | `seed = date+student+skill`; correct → level+1, wrong → hint + easier |
| 4 | Passages | PORT (3rd/5th) / ADAPT (Preschool) | portal passage modal; preschool shows the lesson + "reading pool expanding" |
| 5 | Workspaces | split | math + spelling PORT; reading ADAPT (3rd/5th); writing ADAPT (parent rubric only, never a fake score) |
| 6 | Parent weekly-test slots | PORT | portal test modal, data-driven renderer, results row in the parent store |
| 7 | USB export/import | ADAPT | browser download JSON + file-pick import, validate-then-confirm, session preserved |
| 8 | Gate/keypad | ADAPT | tile-first keypad, digits buffered before a tile, CLR on retry; re-keyed to `sprout_demo_v1` |
| 9 | Records binder / coverage audit / mastery | PORT (read-only) | parent view + progress tab |
| 10 | Backend JSONL+SQLite, OAuth intake (A8), LLM plan generator, cron/Core, kid chat (D9), catsim calibration, print packets | SKIP | violates the static+localStorage law or is out of scope for v1 |

## Schema provenance (traced to `/root/sprout`)

| schema | commit | note |
|---|---|---|
| `placement/v1` | **5874bdd** | guardian-gated placement report: `domains[]`, `cat`, `guardian_gate`, `plan_generation_allowed` |
| `year_plan/v0` | **5874bdd** | Mode A skeleton; **3f96d8b** makes the spine cover all nine D7 statutory subjects |
| `item.v1` | **5874bdd** | item bank v0 (16 grade-3 generators, machine-verified answer keys) |
| `ledger v3` | **5874bdd** | records shape (read-only surfaces here) |
| `compliance_record/v1` | **5874bdd** | compliance copy binding |
| dual assessment (child adaptive-lite CAT + parent questionnaire), guardian gate, A10 conflict rule | **5874bdd** | demo ports the *shape* client-side |
| D7 nine-subject list + D9 kid-model policy, QA battery 47 passed | **3f96d8b** | `config/subjects.yaml` `status: verified-D7` |

Demo baseline: `80d12b4` (synthetic interactive demo) + `6578316` (v0 theme restore).

## Run locally

```bash
python3 -m http.server 8000 --directory /root/sprout-demo   # then open http://localhost:8000/
# or simply open index.html from disk — the demo is fetch-free and runs from file://
python3 tools/build_content.py                              # regenerate data/content.js
```

Deploy: `git push origin main` → GitHub Pages serves the repo root (`https://soeteam.github.io/sprout-demo/`).
Verify after every push: HTTP 200, new title/build marker, and every `<script src>` / `<link href>`
resolves **through the `/sprout-demo/` path**.
