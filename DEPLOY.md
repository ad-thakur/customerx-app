# Deploying Consumer X — Vercel (frontend) + Railway (backend)

The repo is a two-package monorepo:

```
/           → React frontend (Vite)  → deploys to Vercel
/server     → Express + Postgres API → deploys to Railway
```

Deploy the **backend first** (the frontend needs its URL).

---

## 0. Push to GitHub

```bash
cd customerx
git add -A
git commit -m "Full-loop app with Railway backend + Vercel frontend"
git push origin main    # create a GitHub repo first if you haven't
```

---

## 1. Railway — backend + Postgres (~5 minutes)

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → pick this repo.
2. When the service is created, open it → **Settings**:
   - **Root Directory** → `server`  ← the one setting that matters; everything
     else (build via `tsc`, start via `node dist/index.js`, healthcheck at
     `/api/health`) is picked up from `server/railway.json`.
3. Back in the project canvas: **+ New** → **Database** → **PostgreSQL**.
   Then on your API service → **Variables** → **Add Variable Reference** →
   select the Postgres `DATABASE_URL`. (The server creates its own table on
   boot — no migrations to run.)
4. Still under **Variables**, add:
   - `ANTHROPIC_API_KEY` = your key from [console.anthropic.com](https://console.anthropic.com)
     (skip it and the assessment ships rules-only — everything else still works)
   - `FRONTEND_ORIGIN` = `*` for now; tighten to your Vercel URL after step 2.
5. **Settings → Networking → Generate Domain**. Copy the URL, e.g.
   `https://customerx-production-xxxx.up.railway.app`.
6. Sanity check: open `<railway-url>/api/health` — you should see
   `{"ok":true,"ai":true}` (`"ai":false` means no Anthropic key set).

## 2. Vercel — frontend (~3 minutes)

1. [vercel.com](https://vercel.com) → **Add New → Project** → import the same repo.
2. Vercel auto-detects Vite. Leave Root Directory as the repo root.
3. **Environment Variables** → add:
   - `VITE_API_URL` = the Railway URL from step 1.5 (no trailing slash)
4. **Deploy**. Your shareable app link is the resulting `*.vercel.app` URL.
5. (Recommended) Go back to Railway → set `FRONTEND_ORIGIN` to that exact
   Vercel URL so CORS is locked to your frontend.

## 3. Verify the loop end to end

On your Vercel URL: **File a complaint** → fill the 4 steps → Result page →
**Get my assessment — ₹499** (simulated checkout) → report (AI narrative +
ranked precedents if the key is set) → **Draft my notice — free** → send →
case tracking → use the **demo fast-forward** to reach the day-12 settlement
offer → accept → resolution screen. The **Share case link** button on the
tracking page produces a URL (with embedded access token) you can send to
anyone — that link is your demo.

---

## Local development

```bash
# Terminal 1 — backend (needs a Postgres; easiest: `railway run` against your
# cloud DB, or any local Postgres with DATABASE_URL + DATABASE_SSL=false)
cd server && npm install
DATABASE_URL=postgres://localhost:5432/customerx DATABASE_SSL=false npm run dev

# Terminal 2 — frontend (Vite proxies /api to :3001)
npm install && npm run dev
```

## Notes & known limits (demo scope)

- **No accounts**: a case belongs to whoever holds its token (stored in the
  browser, embedded in share links). Phase 1.5 replaces this with phone OTP.
- **Simulated**: payment, notice dispatch, and the company's settlement offer.
  The demo clock is per-case and user-advanceable from the tracking page.
- **Evidence files**: only metadata reaches the server (no file storage yet).
- **Precedent search** scrapes Indian Kanoon (prototype-grade); switch to
  their paid API before anything public-facing.
- **AI layer**: writes the narrative and annotates retrieved precedents only;
  the band/range numbers always come from the deterministic rules engine, and
  any AI failure silently degrades to rules-only.
