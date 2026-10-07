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

## 1. Corpus — measure, then scale to 1,000 per category

Goal: 1,000 judgements for each distinct category referenced by `GROUND_CATEGORIES`
in `server/src/categories.ts`. Seven grounds map onto **six distinct categories**,
several shared between grounds:

| Category | id | Grounds using it |
|---|---|---|
| DEFECTIVE GOODS | 19 | defective_goods, spurious_goods, hazardous_goods |
| SERVICE DEFICIENCY | 20 | deficient_service |
| UNFAIR TRADE | 21 | unfair_trade_practice, overcharging, misleading_ad |
| ELECTRICAL & ELECTRONIC GOODS | 27 | defective_goods, hazardous_goods |
| AUTOMOBILES | 29 | defective_goods |
| HOUSE HOLD GOODS | 37 | defective_goods |

So the target is 6,000 rows. Use `--all-mapped` rather than listing names —
it derives from the mapping and cannot drift when the mapping changes.

**Three of the six cannot reach 1,000 at NCDRC.** Measured over 2015–2026,
asking for 50: AUTOMOBILES returned **14**, ELECTRICAL & ELECTRONIC GOODS
returned **4**, HOUSE HOLD GOODS returned **3**. That is the data, not a page
limit. NCDRC is the national appellate commission hearing a few thousand cases a
year across every category; the volume is at State and District level.

### 1.1 The commissions are addressable

Two undocumented GET endpoints, now wired into `ejagriti.ts`:

- `getStateCommissionAndCircuitBench` → 55 State Commissions and benches
- `getDistrictCommissionByCommissionId?commissionId=…` → districts under a state

Ids are structured: `11000000` NCDRC, `11070000` Delhi State, `11070077`–
`11070085` Delhi's ten District Commissions. Roughly 750 commissions in total.

### 1.2 Measure first

`--count` reports how many judgements exist without downloading any. It probes
exponentially for an empty page then binary-searches the boundary, so a category
of any size costs ~9 requests instead of one per page. Verified against
simulated corpora from 0 to 9,999 records: 17/17 exact, 149 requests where
linear paging would have taken 1,769.

```bash
# From server/, via railway ssh. No database needed — --count never writes.

# 1. What does NCDRC actually hold? (~1 min)
#    --all-mapped derives the category list from GROUND_CATEGORIES, so it
#    always matches what retrieval can search. Don't type names by hand here.
node dist/ingest.js --count --all-mapped --from 2010-01-01

# 2. Do State Commissions have the volume? Try the four largest first.
node dist/ingest.js --count --all-mapped --from 2010-01-01 \
  --commission-name MAHARASHTRA --commission-name "UTTAR PRADESH" \
  --commission-name KARNATAKA --commission-name DELHI

# 3. If states are still thin, check one state's districts.
node dist/ingest.js --count --from 2010-01-01 --districts-of KARNATAKA \
  --category "HOUSE HOLD GOODS"

# Browse what's available
node dist/ingest.js --list-commissions
node dist/ingest.js --list-commissions maha
```

Note the wider `--from 2010-01-01`: the 4-and-3 result was measured from 2015,
and the window itself may be part of the ceiling. The count output ends with an
estimate of how long ingesting everything found would take.

### 1.3 Then decide the target

The survey answers a question that can't be answered from a desk: whether
1,000 per category is reachable from State Commissions alone, or needs
District Commissions.

That distinction matters for more than volume. State decisions are appellate and
reasoned, closest in quality to the NCDRC judgements already in the corpus.
District decisions are first-instance, often short, not binding, and variable —
fine as "a comparable case", weaker to lean on in a notice. If districts turn
out to be necessary, consider storing the commission tier and ranking State and
NCDRC judgements above District ones rather than mixing them flat.

### 1.4 What a 6,000-row ingest needs that the script doesn't have yet

Do not start a run this size without these. At ~33s per page of 10, 6,000 rows
is roughly 600 fetches — **5–6 hours of continuous requests** against a
government service.

- **Resumability.** A run that dies at hour four currently restarts from page 0.
  `upsertPrecedent` makes re-ingesting harmless, but re-*fetching* is the
  expensive part. Needs a progress table keyed by (commission, category, page).
- **Request timeouts.** `getJson` has no `AbortController`; one hung request
  stalls the run indefinitely.
- **Throttling and scheduling.** Spread across nights rather than one long
  burst. The `User-Agent` already identifies us — keep it accurate.
- **Storage headroom.** 6,000 judgements of full extracted text plus `raw_meta`
  JSONB is roughly 300–600 MB. Check the Railway volume before starting, and
  consider dropping `raw_meta` — nothing reads it.
- **Retrieval re-tuning.** `PRECEDENT_MIN_RANK` (0.05) was set against 419 rows.
  At 6,000 more weak matches clear a fixed floor, so re-check after loading.

### 1.5 The deeper fix

Retrieval keys off the statutory ground alone, which is why a washing machine and
a car land in the same bucket. Proof: `q=defective goods washing machine` returns
`[]` — there is no washing-machine judgment in the corpus at all. More rows will
help, but the structural answer is selecting or ranking on the goods described at
intake. That needs a product-type field or extraction from the narrative.

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
