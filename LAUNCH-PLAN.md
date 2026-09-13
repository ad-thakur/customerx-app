# Consumer X — the launch plan you can run yourself

For running the work with Claude without writing code. `PRODUCTION.md` is the
engineering detail behind every step; this file is the running order and the
instructions.

**How each step is written**

- **Who** — you alone, Claude, or both
- **Say this** — text you can paste to Claude, as-is
- **You decide** — the judgement calls Claude must not make for you
- **Check it worked** — something you can see yourself, in a browser
- **Time** — rough, honest

**Three rules that keep you safe**

1. After any step where Claude changes the site, ask: *"Show me what you
   changed, in plain English, and what could break."* Read the answer before
   the change goes live.
2. Never let a step end with Claude saying it works. End it with **you** opening
   the site and seeing it work. Every step below has a check for this reason.
3. If Claude says a step is done but your check fails, say exactly that: *"I did
   X and saw Y instead of Z."* That is the most useful sentence you can send.

---

## Step 0 — Set up your workbench

**Who:** you. **Time:** 30 minutes, once.

You need four things open, and none of them require code:

| Thing | What it's for | How you get in |
|---|---|---|
| **Claude** (this app, or Claude Code on your Mac) | Reads and changes the app's code | Already have it |
| **Railway dashboard** | The backend and database. Restarts, logs, environment settings, the ingest runs | railway.app, your login |
| **Vercel dashboard** | The website itself. Deploys, domain, environment settings | vercel.com, your login |
| **GitHub Desktop** | Publishes code changes so Railway and Vercel pick them up — a button, not a command | desktop.github.com, free |

**One network caveat, read this once.** A Cowork session may be restricted so
Claude cannot reach the internet — it can read and edit the project files on
your Mac, but it cannot publish changes, reach Railway, or reach the government
case database. When that is true, Claude edits the files and **you press Push in
GitHub Desktop** to publish. If you want Claude to do the whole loop itself,
run it as Claude Code on your Mac instead, where it can reach the network.

**Say this** to have Claude confirm which situation you are in:

> Check whether you can reach github.com, railway.app and e-jagriti.gov.in from
> this session. Tell me plainly which of the two workflows in Step 0 of
> LAUNCH-PLAN.md applies, and what that means for the steps that follow.

---

## Step 1 — Give every ground enough comparable cases

**This is the first real step, and it takes the longest in calendar time,
so start it before anything else.**

### What this means

On the site, `/file` asks *"What kind of problem are you dealing with?"* and
offers seven grounds. These are the seven statutory heads under Section 2(6) of
the Consumer Protection Act:

| # | Ground on the site | Section |
|---|---|---|
| 1 | Defective goods | 2(6)(a) |
| 2 | Deficient service | 2(6)(b) |
| 3 | Unfair trade practice | 2(6)(c) |
| 4 | Overcharging / excess pricing | 2(6)(d) |
| 5 | Spurious goods sold as genuine | 2(6)(e) |
| 6 | Hazardous goods sold knowingly | 2(6)(f) |
| 7 | Misleading advertisement | 2(6)(g) |

When someone pays ₹499, the report shows **comparable cases** — real judgements
from consumer commissions that resemble theirs. Those come from a corpus the app
has downloaded in advance. Each ground draws from one or more categories in the
government's e-Jagriti system, and seven grounds collapse to six categories:

| Category | Grounds that use it | Judgements held today |
|---|---|---|
| DEFECTIVE GOODS | defective goods, spurious goods, hazardous goods | the bulk of the 419 |
| SERVICE DEFICIENCY | deficient service | a large share |
| UNFAIR TRADE | unfair trade practice, overcharging, misleading ad | a share |
| ELECTRICAL & ELECTRONIC GOODS | defective goods, hazardous goods | **4** |
| AUTOMOBILES | defective goods | **14** |
| HOUSE HOLD GOODS | defective goods | **3** |

419 judgements in total, and three of the six categories are effectively empty.
That is why a washing-machine complaint comes back with car cases. **"Setting up
the cases for each ground" means fixing this**: enough real judgements behind
every one of the seven grounds that the report is worth ₹499.

### 1.1 — Survey what exists, before downloading anything

**Who:** Claude runs it, you read the result. **Time:** about an hour of
waiting. **Risk:** none — this only counts, it never writes or changes anything.

The national commission (NCDRC) hears a few thousand cases a year across every
category, so it alone cannot fill six categories. The volume sits at State and
District level, and the app can now reach all ~750 commissions. Nobody knows
what is actually there until it is counted.

**Say this:**

> Run the corpus survey described in section 1.2 of PRODUCTION.md. Count only —
> do not ingest anything. Cover NCDRC first, then the four largest State
> Commissions, from 2010-01-01. Give me the results as a table: category,
> where it was counted, how many judgements exist. Then tell me, for each of my
> seven grounds, how many judgements that ground would have and whether it is
> enough to show a complainant something genuinely comparable.

**You decide** once you see the numbers:

- If State Commissions can fill the six categories → ingest from States, and
  stop there. These are appellate, reasoned judgements, the same quality as
  what you already hold.
- If they cannot → you must go down to District Commissions. Those are
  first-instance, often brief, not binding, and variable in quality. Ask Claude
  to store which tier each judgement came from and rank National and State
  above District, so the weakest material never leads the report.
- If some category is genuinely thin everywhere → say so on the report rather
  than padding it with loosely related cases. Thin and honest beats full and
  misleading.

### 1.2 — Make the long download safe before starting it

**Who:** Claude. **Time:** half a day. **Do not skip this.**

A full run means hours of continuous requests against a government service. Run
as it stands today, it restarts from zero if it dies, has no timeout, and can
hang forever on a single stuck request.

**Say this:**

> Before we start a multi-hour ingest, do the four things in section 1.4 of
> PRODUCTION.md: resumability so a run that dies can continue where it stopped,
> request timeouts, throttling so we can spread it across nights, and check the
> Railway disk has room. Then explain to me in plain English how I start a run,
> how I stop one, and how I tell whether it is still going.

**Check it worked:** Claude shows you where in the Railway dashboard to watch
the progress, you start a short run, stop it, start it again, and see it
continue rather than begin again.

### 1.3 — Run the ingest

**Who:** Claude sets it going; you watch. **Time:** several nights of waiting.

Run it overnight, in pieces, not as one long burst. It is someone else's public
service and the app identifies itself in every request.

**Check it worked:** ask Claude for a count per category after each night. The
number goes up; nothing else on the site changes.

### 1.4 — Judge the result yourself. This is the real test.

**Who:** you, and only you. **Time:** two hours. **This is the acceptance test
for the whole step.**

Claude can tell you the corpus grew. It cannot tell you whether the cases are
any good — you have to read them as a complainant would.

File a test complaint for **each of the seven grounds** on the live site, pay
through the (still simulated) checkout, and read the comparable cases on the
report. Use a realistic, ordinary complaint each time — a washing machine that
died in four months, a holiday package that was not as sold, a phone charged
above MRP.

For each ground, write down:

| Ground | My test complaint | Are the comparable cases actually comparable? | Would I pay ₹499 for this? |
|---|---|---|---|

**You decide:** any ground where the honest answer to the last column is *no*
is not ready. Send Claude that row and say what you saw. Do not accept "the
threshold is tuned correctly" as an answer to "these cases are about cars and
mine is about a washing machine".

### 1.5 — Retune, then re-test

**Who:** Claude, then you again.

The relevance cut-off was set when there were 419 judgements. With many more,
weaker matches start clearing it.

**Say this:**

> The corpus is much bigger now. Re-tune PRECEDENT_MIN_RANK against it, and
> explain what changed in terms of what a user sees. Then I will re-run my
> seven test complaints.

Then repeat 1.4. Do not move on until every ground passes.

---

## Step 2 — Delete the two things that cannot ship

**Who:** Claude. **Time:** one day for both. **Mostly deletion, so it makes
everything after it simpler.** Do this as soon as Step 1 is downloading.

### 2.1 — The invented settlement offer

Right now the app invents a settlement offer from the company and shows it to
the user as though it were received, complete with an email address made up
from the company's name. There is a demo control that fast-forwards the clock
to make it appear.

This is the single most serious thing on the site. Once someone has paid, they
may act on it — accept a settlement that does not exist, refuse a real one, or
quote it back to the company. Labelling it "simulated" does not fix it: the harm
is a real person believing a real company made them an offer.

**Say this:**

> Do section 0.1 of PRODUCTION.md: remove the fabricated settlement offer
> completely — buildOffer, the offer_received status, the /advance route, the
> Resolution page, and the demo fast-forward control. Keep the real 30-day
> countdown and the filing unlock at day 30. Then tell me exactly what I will
> see change on the site.

**Check it worked:** file a test complaint, send the notice, open case tracking.
You should see a 30-day countdown and no way to skip it, and no settlement offer
anywhere.

### 2.2 — The claim aggregation numbers

The Result page tells users things like *"126 people already have an active
claim against this company, ₹34.2L combined"*, next to a ₹5,000 button. Those
numbers are invented. No real company is named, so nobody is defamed — but you
are showing made-up figures next to a payment button, at the exact moment
someone is deciding whether to spend money.

**Say this:**

> Do section 0.2 of PRODUCTION.md: remove the claim aggregation callout from the
> Result page and the aggregation pages and routes. Leave a note in the code
> about bringing it back once clusters can be computed from real filed cases.

**Check it worked:** go through intake to the Result page. No group claim
callout, no ₹5,000 join fee, and every remaining number traces to something the
user typed or to the law.

---

## Step 3 — The legal review (start now, it has the longest lead time)

**Who:** you and an advocate. Claude cannot do this and neither can you.
**Time:** external — weeks.

Two separate questions. Take both to a practising advocate with consumer law
experience:

1. **Is the notice sound?** It follows conventional Indian drafting and pleads
   the grounds properly, but no lawyer has read it. You are about to charge
   people who will send it under their own name and may later file on it.
2. **Does what you are doing require anything under the Advocates Act, 1961?**
   Drafting legal notices for others, for a fee, sits close to lines that Act
   draws. The answer changes how you describe the service, whether an advocate
   must be in the loop, and what the footer may claim. Do not guess at this and
   do not let Claude guess at it either.

**Say this** to prepare for the meeting:

> Generate three sample notices from three different realistic complaints,
> covering different grounds, as .docx files I can email to an advocate. Also
> write me a one-page plain-English summary of exactly what the service does
> and does not do, for the Advocates Act question.

**You decide:** what the advocate says is binding on the plan. Bring their
comments back here and work through them one at a time.

---

## Step 4 — Razorpay onboarding (start now, in parallel)

**Who:** you. **Time:** days to weeks, not under your control.

Activation is KYC-gated. You will need the business entity details, PAN,
address proof, bank proof and website details; GST certificate if applicable.
A company also needs MOA, AOA, a board resolution for the authorised signatory,
and a UBO declaration for shareholders over 10%. A proprietorship is much
lighter — proprietor's PAN and a government ID.

**Razorpay also reviews the website itself**, which means Step 5 blocks this
one. Terms, refund policy, privacy policy and contact details must be live
before you apply, or activation stalls.

**You alone** handle every part of this. Never give account numbers, PAN, card
details or passwords to Claude — it does not need them and should not have them.

Separately: **ask an accountant** whether the ₹499 attracts GST for your entity
and turnover, and how invoices should be numbered. Much cheaper to settle before
the first transaction than to reconstruct afterwards.

---

## Step 5 — The four pages you don't have

**Who:** Claude drafts, you and the advocate approve. **Time:** two days plus
review. **Blocks Step 4.**

Terms of service, privacy policy, refund policy, contact page. Razorpay requires
them; the DPDP Act requires substance behind the privacy one.

**Say this:**

> Draft terms of service, a privacy policy, a refund policy and a contact page
> for Consumer X, as real pages on the site. Base every sentence on what the
> product actually does — read the code, do not assume. Flag anything you are
> unsure about rather than writing something plausible. For the refund policy,
> give me two or three options with the trade-offs, because I have to choose.

**You decide:**

- **The refund rule.** The assessment is delivered instantly and cannot be
  un-delivered. You need a clear, stated position and you must be able to live
  with it. Claude can lay out the options; the choice is yours.
- **Who the Grievance Officer is.** The footer already claims one. Make it a
  real person with a real email that someone reads.

**Check it worked:** every page reachable from the footer, no placeholder text,
no bracketed blanks, and a real address that reaches a real inbox.

---

## Step 6 — Real payments

**Who:** Claude, once KYC has cleared. **Time:** 3–5 days.

Today the ₹499 checkout is simulated; no money moves.

**Say this:**

> Implement Razorpay properly, following section 2.2 of PRODUCTION.md: create
> the order on the server, never trust an amount sent from the browser, verify
> the signature on the server before generating the assessment, treat the
> webhook as the source of truth because people close tabs mid-payment, make
> assessment generation idempotent per payment, and store the payment id, order
> id, amount and status on the case. Then walk me through testing it in
> Razorpay's test mode.

**Check it worked, in test mode, yourself:**

1. Pay normally → report appears.
2. Pay, then **close the tab before it finishes** → the case still ends up paid
   and the report is there when you come back. This is the one that catches bad
   implementations.
3. Pay twice for the same case → charged once, one report.
4. Fail a payment deliberately → no report, no charge, a clear message.

Only switch to live keys after all four behave.

---

## Step 7 — Safety nets

**Who:** Claude. **Time:** two days total. None of this exists today.

| What | Why it matters | Time |
|---|---|---|
| **Rate limiting** | Anyone can make the site email any address, unlimited times. That is a spam cannon attached to your sending reputation, and Resend will suspend you for it | Half a day |
| **Error monitoring** (Sentry) | Right now you find out the site is broken when a user tells you. The last outage lasted until someone happened to try it | Half a day |
| **A real health check** | The current one deliberately avoids touching the database, so it stayed green through a total outage. Needs one that checks the database, and an external monitor watching it | 1 hour |
| **Backups you have actually restored** | Railway has backups. An untested backup is not a backup — restore one and prove it | 2 hours |
| **A cap on AI spending** | The assessment calls a paid AI service with no daily or per-case ceiling. One loop, or one abusive user, is an unbounded bill | Half a day |

**Say this:**

> Do section 4 of PRODUCTION.md — all five items. For each one, tell me what I
> should see or receive when it triggers, so I can test it myself.

**Check it worked:** request a sign-in link six times in a row and get blocked.
Ask Claude to break something deliberately on purpose and confirm an alert
reaches you. Watch Claude restore a backup.

---

## Step 8 — Be honest about evidence

**Who:** you decide, Claude implements. **Time:** one hour, or two days.

Users upload evidence. The app keeps only the file names — **the files
themselves are thrown away**. Meanwhile the evidence score counts those files,
and the notice lists them as annexures you do not hold.

**You decide** between two honest options:

- **Cheap and honest (1 hour):** say plainly at upload that files are not
  stored, that only the description is used to score the case, and that the
  complainant must attach their own documents to the notice.
- **Proper (2 days):** actually store the files, and keep the annexure list
  truthful.

Either is fine. The current state — implying storage that does not happen — is
not.

---

## Step 9 — Tests for the numbers users rely on

**Who:** Claude. **Time:** two days.

There are no tests at all. The part that most needs them is the rules engine:
which commission the case goes to, whether it is within the two-year limitation
period, the evidence score, the court fee estimate. Those are numbers people
act on, and they are the easiest kind of code to test.

**Say this:**

> Write tests for the rules engine, the notice draftsman and the ground-to-
> category mapping. Then show me a list, in plain English, of what each test
> proves — I want to read it as a list of promises the site makes.

**Check it worked:** you can read that list and agree every line is a promise
you want to make.

---

## Step 10 — The last pass before you take money

**Who:** you.

- Go through the whole flow as a stranger would, on a phone, for three
  different grounds. Pay real money in live mode, once, yourself.
- Re-read every marketing claim on the site against what it now does — the
  simulated offer and aggregation are gone, so some copy will be stale. One
  mismatch was already caught this way: the landing page claimed notices were
  "sent on your behalf" while the notice page correctly said the opposite.
- Confirm everything the advocate raised is closed.
- Confirm the Grievance Officer address reaches someone.

---

## Running order

Calendar time is set by the lawyer and by Razorpay, not by the code.

| When | You | Claude |
|---|---|---|
| **Now** | Brief the advocate (Step 3). Start Razorpay KYC (Step 4). Talk to an accountant | Corpus survey (1.1), then make the ingest safe (1.2) |
| **Week 1** | Read the survey and decide how deep to go | Delete the fabricated offer and aggregation (Step 2). Start ingesting |
| **Week 2** | Choose the refund rule and the Grievance Officer | Policy pages (Step 5). Safety nets (Step 7) |
| **Week 3** | Test all seven grounds yourself (1.4). Advocate's comments come back | Retune relevance (1.5). Evidence decision (Step 8). Tests (Step 9) |
| **Week 4** | KYC clears | Razorpay implementation (Step 6) |
| **Week 5** | Payment testing, final pass (Step 10) | Fix what the advocate and your testing flagged |

Five to six weeks is realistic, and the gate is legal review and KYC rather
than code.

---

## Housekeeping Claude can do any time

Say *"do the smaller things in section 6 of PRODUCTION.md"* — none of it is
urgent, none of it is visible to users, and all of it is quick:

- Put the `www` address first in the backend's allowed-origins setting, since
  sign-in links are built from the first entry
- Raise DNS TTLs back to 3600 now the domain is stable
- Move the email DMARC policy from `p=none` to `p=quarantine`
- Check the sign-in email renders with line breaks
- **Delete the duplicate, unversioned copy of the whole app sitting in the
  parent folder** — it is a real trap: editing the wrong copy looks like Claude
  changing nothing
- Remove the unused Indian Kanoon scraper

---

## What is already good

The list above is all gaps, so this is worth stating plainly. The rules engine,
the notice draftsman, category-filtered retrieval, magic-link sign-in, anonymous
filing with case claiming, and the honest manual notice dispatch all work and
are verified against the live site. The architecture is sound. What is missing
is the commercial and legal scaffolding around it, not the product.
