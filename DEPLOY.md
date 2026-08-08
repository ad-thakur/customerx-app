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
cd consumerx
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
     **This is also the base URL used to build sign-in links**, so it must be
     your real frontend URL before anyone tries to sign in.
   - `RESEND_API_KEY` = a [Resend](https://resend.com) key, so magic-link
     sign-in emails actually get delivered. Without it, links are only logged
     to the Railway console and nobody can sign in on their own.
   - `AUTH_FROM_EMAIL` = the verified sender, e.g. `Consumer X <login@consumerx.in>`.
   - Do **not** set `AUTH_DEV_ECHO` in production — it returns the sign-in link
     in the HTTP response, which would let anyone sign in as any address.
5. **Settings → Networking → Generate Domain**. Copy the URL, e.g.
   `https://consumerx-production-xxxx.up.railway.app`.
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
DATABASE_URL=postgres://localhost:5432/consumerx DATABASE_SSL=false npm run dev

# Terminal 2 — frontend (Vite proxies /api to :3001)
npm install && npm run dev
```

## Notes & known limits (demo scope)

- **Accounts are optional**: filing stays anonymous, and a case belongs to
  whoever holds its token (stored in the browser, embedded in share links).
  Signing in with an emailed magic link attaches this browser's cases to an
  account so they follow the user between devices.
- **Simulated**: payment and the company's settlement offer. The demo clock is
  per-case and user-advanceable from the tracking page.
- **Notice dispatch is real, and manual**: the app generates the notice as an
  editable .docx plus a prefilled email draft. The complainant sends it
  themselves and then confirms dispatch, which is what starts the 30-day clock.
  Nothing is sent on their behalf.
- **Evidence files**: only metadata reaches the server (no file storage yet).
- **Precedent search** scrapes Indian Kanoon (prototype-grade); switch to
  their paid API before anything public-facing.
- **AI layer**: writes the narrative and annotates retrieved precedents only;
  the band/range numbers always come from the deterministic rules engine, and
  any AI failure silently degrades to rules-only.
