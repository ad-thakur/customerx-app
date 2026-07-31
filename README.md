# Consumer X — Phase 1 (Intake & Eligibility)

Consumer complaint intake flow for the Consumer Protection Act, 2019 — built per the
Phase 1 scope in the architecture document (intake, evidence upload, commission
routing, free eligibility check).

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
- Result page presenting all of the above, plus stubbed CTAs for the Phase 2
  paid assessment and free pre-litigation notice (intentionally disabled — not
  built yet)

## Not yet built (by design — later phases)
- Payments (₹499 assessment fee)
- Company grievance-email resolver
- Notice generation + escalation tracking
- Filing packet builder
- Backend/database (this prototype persists intake data to the browser's
  localStorage only, so it will not survive a cleared browser or a different
  device)

## Running it

```bash
npm install
npm run dev       # local dev server
npm run build     # production build -> dist/
npm run preview   # preview the production build
```

## Key files
- `src/lib/grounds.ts` — the seven statutory grounds under Section 2(6)
- `src/lib/rulesEngine.ts` — commission routing, limitation check, evidence scoring
- `src/lib/types.ts` — core data shapes (mirrors the architecture doc's data model)
- `src/pages/File.tsx` — the intake flow
- `src/pages/Result.tsx` — the eligibility/routing output
