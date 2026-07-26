# Consumer X — Initial version (full loop, deployable)

Consumer complaint intake and case-management flow for the Consumer Protection
Act, 2019. This build covers the complete product loop from the concept docs —
intake → eligibility → paid assessment → free notice → tracking → settlement —
backed by a real API (`server/`: Express + Postgres, deploys to Railway) with
the frontend deploying to Vercel. **See `DEPLOY.md` for the full deploy guide.**

The ₹499 assessment optionally uses an AI layer (Claude, via `ANTHROPIC_API_KEY`
on the server) to write the report narrative and annotate retrieved precedents —
always on top of the deterministic rules engine, which alone produces the band
and recovery range. Without the key, assessments are rules-only.

## What's included
- Landing page (marketing site)
- 4-step complaint intake flow: ground selection → your/company details → narrative
  & evidence upload → review
- Client-side routing engine:
  - Commission jurisdiction (District / State / National) from claim value, using a
    versioned config table (not hardcoded thresholds)
  - 2-year limitation period check, with a condonable-delay flag
  - Evidence strength scoring (0–100) with specific "what's missing" guidance
  - Indicative court fee estimate
- Result page presenting all of the above, with live CTAs into the paid loop
- **₹499 recovery assessment** (`/pay/:id` → `/report/:id`): simulated checkout,
  then a report with likelihood band, realistic recovery range, evidence drivers,
  and comparable precedents
- **Free pre-litigation notice** (`/notice/:id`): templated notice generated from
  intake data (ground-specific heading, statutory references, 30-day demand),
  simulated dispatch by email + registered post
- **Case dashboard** (`/cases`): all cases with status, recovered total, response
  countdowns
- **Escalation tracking** (`/case/:id`): case timeline, 30-day countdown ring,
  case file, filing-unlock at day 30 — with a demo fast-forward control so the
  company-side milestones (delivery, read receipt, settlement offer at day 12)
  can be walked in minutes
- **Settlement & resolution** (`/case/:id/offer`): offer review measured against
  the assessment range, accept flow, outcome stats, and opt-in to the public
  outcome ledger

## Simulated in this build (real in Phase 1.5+)
- Payments (Razorpay), notice dispatch, and the company's response are simulated;
  no money moves and no notice actually leaves the building. The 30-day clock is
  per-case and fast-forwardable from the tracking page (demo control)
- No user accounts — cases are held by unguessable per-case tokens, which also
  power shareable case links; phone OTP is the Phase 1.5 replacement
- Evidence files: only metadata reaches the server (no file storage yet)
- Assisted filing (day-30 unlock) is stubbed — it's an ops workflow in Phase 2
- Company grievance-email resolver

## Running it

```bash
# Backend (needs Postgres — see DEPLOY.md for local options)
cd server && npm install && npm run dev   # API on :3001

# Frontend (separate terminal; Vite proxies /api to :3001)
npm install
npm run dev       # local dev server
npm run build     # production build -> dist/
npm run preview   # preview the production build
```

## Key files
- `src/lib/grounds.ts` — the seven statutory grounds under Section 2(6)
- `src/lib/rulesEngine.ts` — commission routing, limitation check, evidence scoring
- `src/lib/caseStore.ts` — API client: case operations against the backend, plus
  per-case token registry and display helpers
- `src/lib/types.ts` — core data shapes (mirrored in `server/src/types.ts`)
- `src/pages/File.tsx` — the intake flow
- `src/pages/Result.tsx` — the eligibility/routing output
- `src/pages/{Payment,Report,Notice,Dashboard,CaseTracking,Resolution}.tsx` — the
  paid loop and case-management screens
- `server/src/index.ts` — Express API (case CRUD, pay, notice, advance, accept)
- `server/src/caseLogic.ts` — server-side state machine + assessment/offer generation
- `server/src/ai.ts` — Claude assessment layer (narrative + precedent annotation,
  rules-only fallback)
- `server/src/precedents.ts` — Indian Kanoon search (production route)
