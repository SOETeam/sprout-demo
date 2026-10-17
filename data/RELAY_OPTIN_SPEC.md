# RELAY_OPTIN_SPEC — phase 1 (sketch)

Goal: a real beta-update list with NO third-party email service. Ever.

> **Hard law:** NO Mailchimp / ConvertKit / SendGrid / Mailgun / any vendor-managed
> mailing list, ever. This clause lives in the spec header on purpose. Any vendor
> needs an explicit owner GO **and** a rewritten spec — a code change alone is not
> enough.

## Endpoint (phase 1 — when it ships)

- `POST /relay/optin` on **our own relay box** (the SOETech relay we already run).
  - Fields: `email` (validated), `ts` (server-set), `source` (`sprout_landing`),
    `optin_ip_hash` (salted, kept 30 days, never the raw IP).
- Double opt-in, token-based, no address-leaking GETs:
  - `POST /relay/optin` → row created as `pending` + confirm link emailed.
  - `GET /relay/confirm?tok=…` → flips the row to `active` (token only, no address in URL).
  - Every send carries `GET /relay/optout?tok=…` — one click, immediate, no login.
- Data store: the relay's own sqlite table
  `optin(email_hash, email, status, ts, last_sent)` — no SaaS, no CRM, no sync target.
- Sending: phase 1 = manual `sendmail`/SMTP from the relay box, hand-written release
  notes. No marketing automation, no tracking pixels, no open/click metrics, ever.

## v0 (what ships today)

The landing button is a plain `mailto:` compose (subject **"SPROUT beta updates"**).
Nothing is stored by SPROUT: no `localStorage` write, no `fetch`/XHR, no form field.
The account record never gains an email field — the two paths stay independent.

## Landing line (phase 1 copy)

"Your address goes to SPROUT's own relay, nowhere else."

## Rollback

Flip the landing button back to the `mailto:` v0 by deleting one `<a>` block in
`viewLanding()` — the account path never depends on this file.

## Footer truth condition

`index.html`'s footer line ("Nothing is transmitted to any server") stays literally
true while phase 1 is `mailto:`. When the relay endpoint ships, that line must be
amended to "…any third-party server" in the same change — never one without the other.
