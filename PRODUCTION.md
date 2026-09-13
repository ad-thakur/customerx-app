# Consumer X — path to public launch with ₹499 payments

Written 9 August 2026, against the deployed build (custom domain live, 419
precedents, magic-link auth working, notice generation verified end to end).

Target: public launch, real money for the ₹499 assessment.

Read the blockers first. Three of them are not engineering tasks and will take
longer than the code.

---

## 0. Blockers — do not launch without these

### 0.1 Remove the fabricated company response

`server/src/caseLogic.ts` → `buildOffer()` invents a settlement offer from the
opposite party, and `/api/cases/:id/advance` lets the user fast-forward the
clock until it appears. `src/pages/Resolution.tsx` then presents it as an offer
received, with a slug email address from the company's own name.

This was fine as a demo. It is not fine once someone has paid, because the user
may act on it: accept a fabricated offer, refuse a real one, or quote it back to
the company. A "simulated" label does not remove that risk — the harm is that a
real person believes a real company made them an offer.

**Do:** remove `buildOffer`, the `offer_received` status, the `/advance` route,
`Resolution.tsx`, and the demo fast-forward control. Case tracking keeps the
30-day countdown and the filing unlock at day 30, both of which are real.

**Effort:** half a day, mostly deletion.

### 0.2 Remove or gate claim aggregation

`src/lib/groups.ts` is entirely invented — "126 people already have an active
claim against Vayu Appliances", "₹34.2L combined". The Result page shows this as
a callout with a **₹5,000 join fee** CTA. The companies are fictional, so nobody
is defamed, but you would be presenting fabricated numbers next to a payment
button on a page where the user is deciding whether to spend money.

**Do:** remove the aggregation routes and the Result page callout for launch.
Bring it back when clusters come from real filed cases — the backend already has
the data to compute them (`cases` grouped by company + ground).

**Effort:** half a day to remove. Weeks to build for real.

### 0.3 Get the notice reviewed by an advocate

The notice template in `src/lib/noticeDraft.ts` is structurally sound and follows
conventional Indian drafting, but no lawyer has read it. You are about to charge
money to people who will send it to companies under their own name, and who may
later file on the strength of it.

Separately, and more importantly: **take advice on whether what you are doing
requires anything under the Advocates Act, 1961.** Drafting legal notices for
others for a fee sits close to lines the Act draws, and the answer shapes how
you describe the service, whether an advocate must be involved, and what the
footer can claim. I am not able to answer this and you should not guess at it.

**Effort:** external. Start now — it gates launch and has the longest lead time.

---

## 1. Corpus — 419 → 1,000 cases

Precedent quality is currently limited by corpus size, not by matching. Measured:
`q=defective goods washing machine` returns `[]`, meaning **no washing-machine
judgment exists in the corpus at all**. That is why an appliance complaint draws
car judgments.

Current distribution:

| Category | Rows |
|---|---|
| DEFECTIVE GOODS | 62 |
| SERVICE DEFICIENCY | 50 |
| UNFAIR TRADE | 50 |
| MEDICAL / BANKING / AIRLINES / ELECTRICITY | 50 each |
| TELECOM | 36 |
| AUTOMOBILES | 14 |
| ELECTRICAL & ELECTRONIC GOODS | 4 |
| HOUSE HOLD GOODS | 3 |

The three statutory categories carry all seven grounds, so depth there is worth
more than breadth elsewhere.

```bash
# From server/, via railway ssh (the public proxy is off).
# ~20 pages x 30s per category, so run each separately.
node dist/ingest.js --category "DEFECTIVE GOODS"   --pages 20 --from 2015-01-01
node dist/ingest.js --category "SERVICE DEFICIENCY" --pages 20 --from 2015-01-01
node dist/ingest.js --category "UNFAIR TRADE"       --pages 20 --from 2015-01-01
```

That targets ~200 each (+440), landing near 900. Top up with
`ELECTRICAL & ELECTRONIC GOODS`, `HOUSE HOLD GOODS`, `AUTOMOBILES` and
`CONSUMER DURABLES` — all small, but they are the categories closest to what your
users actually buy.

Before running, check two things:

- **Volume headroom.** Each judgment stores full extracted text. 1,000 rows is
  roughly 50–100 MB. Railway → Postgres → Metrics. The database is currently
  tiny, so this is a check, not a worry.
- **Re-running is safe.** `upsertPrecedent` is `ON CONFLICT DO UPDATE`, so
  overlapping pages update rather than duplicate.

**Effort:** ~2 hours mostly waiting.

### 1.1 Then re-tune relevance

Once the corpus is deeper, `PRECEDENT_MIN_RANK` (default 0.05) should be
re-checked — a bigger corpus means more weak matches clear a fixed floor. Test
with the API directly rather than through the UI:

```
/api/precedents?grounds=defective_goods&q=Defective+goods
```

### 1.2 The real relevance fix (post-launch)

Retrieval currently keys off the statutory ground alone, which is why a washing
machine and a car land in the same bucket. The better design selects categories —
or ranks — using the goods described in the intake. That needs a product-type
field at intake, or extraction from the narrative. Meaningful work; not a
launch blocker.

---

## 2. Payments

### 2.1 Razorpay onboarding — start before the code

Activation is KYC-gated and not instant. You need a business entity, PAN,
address proof, bank proof, and website details; GST certificate where
applicable. As of January 2026 companies additionally need MOA, AOA, a board
resolution for the authorised signatory, and a UBO declaration for shareholders
over 10%. A proprietorship is much lighter — proprietor's PAN plus a
government ID.

Razorpay will also review the site itself. Have terms, refund policy, privacy
policy and contact details live before applying, or activation stalls.

### 2.2 Implementation

Replace the simulated checkout in `POST /api/cases/:id/pay`:

- Create a Razorpay order server-side; never trust an amount from the client
- Verify the payment signature server-side before generating the assessment
- Handle the webhook as the source of truth — users close tabs mid-payment
- Make assessment generation idempotent per payment id
- Store payment id, order id, amount and status on the case
- Decide the refund rule and publish it. An assessment is delivered instantly
  and cannot be un-delivered, so you need a clear stated position.

**Effort:** 3–5 days including webhook testing.

### 2.3 Invoicing and GST

Consult an accountant on whether the ₹499 attracts GST for your entity and
turnover, and on invoice numbering. Cheaper to get right before the first
transaction than to reconstruct later.

---

## 3. Compliance and content

### 3.1 DPDP Act, 2023

The DPDP Rules were notified on 13 November 2025, with the compliance deadline
for core Data Fiduciary obligations on **13 May 2027**. You have time, but you
are collecting names, phone numbers, emails and complaint narratives, so design
for it now rather than retrofitting:

- Consent notice at intake stating what is collected and why
- Named Grievance Officer — the footer already claims one; make it real
- A deletion path: users must be able to erase a case and their account
- Retention policy: how long do resolved cases persist?
- Breach notification procedure

### 3.2 Pages you don't have

Terms of service, privacy policy, refund policy, contact page. Razorpay requires
these for activation, and DPDP requires substance behind the privacy one.

### 3.3 Claims the site makes

Audit the marketing copy against what the product does. One example already
fixed: the landing page claimed notices were "SENT ON YOUR BEHALF" while the
notice page said the opposite. Re-read everything with the settlement simulation
and aggregation removed.

---

## 4. Reliability

None of this exists today.

| Gap | Why it matters | Effort |
|---|---|---|
| **No tests** | Zero test files. The rules engine (jurisdiction, limitation, evidence scoring) produces numbers users rely on and is pure functions — cheapest possible thing to test. | 2 days for the engine, notice draftsman and category mapping |
| **No rate limiting** | `/api/auth/request-link` will send an email to any address, any number of times. That is a spam cannon attached to your sending reputation, which Resend will suspend you for. Also applies to case creation. | Half a day — `express-rate-limit` |
| **No error monitoring** | You find out something is broken when a user tells you. The CORS outage lasted until someone tried it. | Half a day — Sentry |
| **No uptime check** | `/api/health` deliberately doesn't touch the database, so it stayed green through a total outage. Add a `/api/ready` that runs `select 1`, and point an external monitor at it. | 1 hour |
| **No backups verified** | Railway volume backups exist; confirm they're on and restore one to prove it works. An untested backup is not a backup. | 2 hours |
| **Evidence not stored** | `stripEvidenceData` discards uploads; only metadata is kept. The evidence score counts files the user believes are saved, and annexures reference documents you don't hold. Either store them (S3/R2) or say plainly that they aren't kept. | 2 days to store, 1 hour to be honest about it |
| **AI cost uncapped** | `ANTHROPIC_API_KEY` has no per-case or daily ceiling. One loop or one abusive user is an unbounded bill. | Half a day |

---

## 5. Sequencing

**Now, in parallel**
- Start the advocate review and the Advocates Act question (§0.3) — longest lead
- Start Razorpay onboarding (§2.1) — KYC takes days
- Run the corpus expansion (§1) — mostly waiting

**Week 1** — remove the fabricated offer (§0.1) and aggregation (§0.2). Deleting
code, and everything after gets simpler.

**Week 2** — rate limiting, Sentry, real readiness check, backup restore test.

**Week 3** — write terms, privacy, refund policy. Tests for the rules engine.

**Week 4** — Razorpay implementation once KYC clears.

**Week 5** — re-tune relevance on the bigger corpus, full pass through the flow,
fix what the advocate flagged.

Realistically 5–6 weeks, gated by the legal review and KYC rather than by code.

---

## 6. Smaller things

- Put `https://www.consumerx.co.in` first in `FRONTEND_ORIGIN` — it's the
  canonical host after the redirect, and sign-in links are built from the first
  entry
- Raise DNS TTLs back to 3600 now the domain is stable
- Move DMARC from `p=none` to `p=quarantine` once you've seen `dmarc=pass`
- Check the sign-in email renders with line breaks; switch to an HTML body if not
- Delete the duplicate, unversioned copy of the app in the parent directory
- `server/src/precedents.ts` still scrapes Indian Kanoon and is unused — remove
- Case tokens travel in shareable URLs; fine for now, worth revisiting when
  cases contain more personal data

---

## What is already solid

Worth stating, because the list above is all gaps: the rules engine, the notice
draftsman, category-filtered retrieval, magic-link auth, anonymous filing with
case claiming, and the honest manual dispatch flow are all working and verified
against the live deployment. The architecture is sound. What's missing is the
commercial and legal scaffolding around it, not the product.
