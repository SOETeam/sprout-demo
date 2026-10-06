# SPROUT public demo — investor walkthrough (~6 minutes)

Live: `https://soeteam.github.io/sprout-demo/` · Reset: **Clear this demo** (top-right, or the footer).

> Demo only. Every account, child, name and result in this app is synthetic and is stored in this
> browser's localStorage. Nothing is transmitted to any server. Use "Clear this demo" to erase it.

## The 6-minute script

**0:00 — Landing.** "SPROUT is a homeschool operating system: place the child, build the year,
teach the week, keep the records." Point at the proof strip — *local-first, nothing leaves your
browser* — and the roadmap strip: Preschool, 3rd and 5th are live; K–12 is visible but locked.

**0:40 — Create parent account.** Display name + passphrase + optional synthetic family name.
Say the line out loud: *"This demo account lives only in this browser."* No email field, no
server, digest only.

**1:10 — Add three children.** Use the **Use a synthetic name** helper three times, and show the
grade select doing its job: Preschool / 3rd / 5th selectable, the other twelve render disabled
with a "coming soon" badge — investors see the roadmap breadth, and clicking one does nothing.

**1:50 — Dual assessment (grade 3, the showpiece).** The child check is an adaptive-lite CAT
drawn from the real seed item bank: max Fisher information picks each next item, an EAP estimate
updates θ/SE, and it stops when uncertainty is low. Then the parent questionnaire. Then — if the
two disagree by ≥ 0.75 — the **A10 conflict card**: SPROUT stops and shows both numbers, it never
silently picks a side. Finally the **mandatory guardian gate**: "Placement is locked until a
guardian reviews it." Approve → a `placement/v1` card with strengths and focus areas (never
"deficits", never a red tier).

**3:20 — Curriculum creation ceremony.** A six-step build, not a spinner: `year_plan/v0`
skeleton → Mode A spine covering all nine Michigan statutory subjects → week map (week 1 full,
week 2 full, weeks 3–6 topic cards) → coverage audit against the nine-subject list → second
guardian gate → done. Each step shows the real JSON, so the audience sees the schema.

**4:20 — Student portal.** Tile-first keypad (tap the child tile, then the digits — the demo PIN
is shown to the parent on the card). This week: four days, six blocks, **Open lesson** (the
ported lesson view), **Practice** (seeded generator — same day + same child + same skill always
produces the same set, zero AI, zero network), and the **weekly test**. Then **Weeks 3–6**: topic
cards with "Section coming soon" tags.

**5:30 — Records + reset.** Parent view: placement card, weekly-test results, nine-subject
coverage audit, guardian approvals. Progress tab: export a JSON file, import it back (validate →
confirm → session survives). Then **Clear this demo** and show the page back at a clean landing.

## If asked…

- **"Is there a backend?"** No. Static site + localStorage. That is a deliberate v1 choice, not a
  missing piece — it is why nothing leaves the browser.
- **"Is this real learner data?"** No. Every name, child and result is synthetic; source content is
  ported from local curriculum files and scrubbed before it ships.
- **"What about compliance?"** SPROUT *organizes Michigan-required subject coverage* — the nine
  MCL 380.1561(3)(f) subject areas (verified brief, D7). It is not legal advice and never claims to
  keep a family compliant.
- **"Why does the assessment show a conflict?"** Because the child check and the parent
  questionnaire are independent measurements. A10 says the engine must not silently pick a side —
  the guardian resolves it.
- **"Why is practice not an LLM?"** Owner law: seeded, deterministic, offline practice. Same day +
  same child + same skill = same question set, and it costs nothing to run.
- **"Which grades work today?"** Preschool, 3rd and 5th. The other twelve are visible and locked on
  purpose — that is the roadmap.
- **"How do I reset?"** *Clear this demo* removes exactly the `sprout_demo_v1` keys from this
  browser and nothing else.

## Known, labeled gaps (say these plainly)

- Preschool has no generator practice configs and no passages in the source curriculum — the UI
  says "practice pool expanding" rather than inventing content.
- Weeks 3–6 are topic cards with "Section coming soon" (weeks 5–6 come from the year-plan headings
  only, because no week JSON exists for them yet).
- Workspaces: math (MathQuill) and spelling (drag-sort) are live; reading is limited to 3rd/5th
  passages; writing is free-text with a parent rubric — never an auto-score.
