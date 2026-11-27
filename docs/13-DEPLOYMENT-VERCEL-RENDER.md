# Deploying: Vercel (frontend) + Render (backend) + Atlas + Clerk

This app was built to run **behind one origin**: the browser calls relative
`/api/...`, and the same server answers both the UI and the API. Vercel and Render
are two different origins, so you must bridge them with a **rewrite** (the
`frontend/vercel.json` file in this repo). Doing that also keeps Clerk's session
cookie first-party, which live Clerk keys require.

```
Browser ──https://swachh-chiplun.vercel.app──► Vercel (static React app)
                │
                └── /api/*  ──rewrite──► https://api.onrender.com/api/*  ──► MongoDB Atlas
                                                   │
                                                   └── /api/__clerk ──► Clerk Frontend API
```

## Why it was "not working"

| # | Problem | Symptom |
|---|---|---|
| 1 | No `frontend/vercel.json`. `/api/*` hit Vercel (404 / HTML), and `/sign-in`, `/admin` returned 404 on refresh. | Blank screen, "Cannot reach the server", JSON parse errors |
| 2 | `VITE_BACKEND_URL` was baked into the Vercel build pointing at Render, but Render's `CORS_ORIGINS` did not include the Vercel origin (preflight → **400**, no `access-control-allow-origin`). | Every API call blocked by CORS; sign-in falls back only after 30s |
| 3 | Live Clerk keys (`pk_live_`) enable the backend proxy automatically, but the proxy URL was not configured in the Clerk dashboard. | Sign-in spins forever or "invalid proxy" errors |
| 4 | Render free tier sleeps; the app gave up after 30s and showed "Sign-in is unavailable". | First visit of the day fails |
| 5 | `CORS_ORIGINS` values pasted with quotes/spaces/trailing slash never matched. | CORS errors when calling Render directly |
| 6 | `requirements.txt` pinned `jq==1.6.0` (no wheel for Python 3.13) plus unused `pandas`/`numpy`/`boto3`, which can fail or slow the Render build. | Render build errors / long deploys |
| 7 | `refresh_osm()` referenced an undefined variable, so live OpenStreetMap facilities were silently never stored. | Facilities page only showed the seed data |

All seven are fixed in the code. You still need to set the dashboard values below.

### Measured on the live deployment (27 Nov 2026)

| Check | Result |
|---|---|
| `GET https://swachh-chiplun.onrender.com/api/health` | **200**, `database:true`, AI configured |
| `GET https://swachh-chiplun.vercel.app/api/clerk/config` | **404** (no rewrite) |
| `GET https://swachh-chiplun.vercel.app/sign-in` and `/admin` | **404** (no SPA fallback) |
| Vercel JS bundle | contains `VITE_BACKEND_URL=https://swachh-chiplun.onrender.com` |
| Preflight from the Vercel origin to Render | **400**, no `access-control-allow-origin` |
| Backend Clerk instance | `pk_test_...` → **no Clerk proxy needed** |

So the backend and database were healthy the whole time — the browser simply could
not reach them. The rewrite below fixes that, and `src/lib/api.ts` now ignores
`VITE_BACKEND_URL` in production builds so it cannot regress.

---

## 1. MongoDB Atlas

1. Create a free M0 cluster, a database user, and allow access from
   `0.0.0.0/0` (Render's IPs are not fixed on the free plan).
2. Copy the `mongodb+srv://...` string. URL-encode special characters in the
   password (`@` → `%40`, `#` → `%23`, etc.).
3. Database name: `swachh_chiplun` (or set `DB_NAME` to anything).

## 2. Render (backend)

Create a **Web Service** from the repo:

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Runtime | Python 3.12 (`PYTHON_VERSION=3.12.10`) |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn server:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/api/health` |

Environment variables:

| Key | Value |
|---|---|
| `MONGO_URL` | your Atlas connection string |
| `DB_NAME` | `swachh_chiplun` |
| `CORS_ORIGINS` | `https://swachh-chiplun.vercel.app` (no quotes, no trailing slash) |
| `GEMINI_API_KEY` | from https://aistudio.google.com/apikey |
| `CLERK_PUBLISHABLE_KEY` | `pk_test_...` **or** `pk_live_...` |
| `CLERK_SECRET_KEY` | the matching `sk_test_...` / `sk_live_...` |
| `CLERK_PROXY_URL` | live keys only: `https://swachh-chiplun.vercel.app/api/__clerk` |
| `ADMIN_EMAIL` | the verified primary email of the one admin |
| `ADMIN_PASSCODE` | optional second lock for `/admin` |

> `render.yaml` in the repo root encodes the same settings if you create the
> service as a Blueprint.

Verify the deploy:

```bash
curl https://swachh-chiplun.onrender.com/api/health
```

Expected: `"status":"ok"`, `"database":true`, `"clerk_configured":true`,
`"clerk_keys_match":true`. If `clerk_keys_match` is `false`, the two Clerk keys
belong to different instances (test vs live) — that alone makes every API call
return 401.

## 3. Vercel (frontend)

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Build Command | `npm run build` (or `yarn build`) |
| Output Directory | `dist` |

Environment variables:

- **Remove `VITE_BACKEND_URL`** (or leave it empty). The rewrite handles `/api`,
  and `src/lib/api.ts` now ignores this variable in production builds anyway — it
  is only honoured by the dev server. A stale value baked into an old bundle is
  exactly what caused the CORS failures here.
- `VITE_CLERK_PUBLISHABLE_KEY` is optional. Put a `pk_test_...` key there if you
  want the app to boot before the backend wakes. Do **not** put a `pk_live_` key
  there — live keys need the backend-provided proxy URL.

Edit `frontend/vercel.json` and replace the placeholder:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://swachh-chiplun.onrender.com/api/:path*"
    },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The second rule is the SPA fallback — without it, refreshing `/sign-in` or
`/admin` returns 404.

Redeploy after changing **any** `VITE_*` variable: Vite inlines them at build
time, so dashboard edits alone do nothing until the next build.

## 4. Clerk

### Option A — test instance (easiest, fine for a college demo)

Use `pk_test_...` + `sk_test_...` in **both** Render and Vercel. Dev instances
work on any origin and need no proxy. The backend then returns an empty
`proxy_url`, and Clerk talks to `frontend-api.clerk.dev` directly.

### Option B — production instance (custom domain / no dev badge)

Live keys (`pk_live_` / `sk_live_`) **require** a proxy:

1. Clerk Dashboard → **Configure → Domains → Proxy**.
2. Set the proxy URL to `https://swachh-chiplun.vercel.app/api/__clerk`.
3. Set the same value as `CLERK_PROXY_URL` on Render.
4. Keep `frontend/vercel.json`'s `/api/:path*` rewrite — it forwards
   `/api/__clerk/*` to Render, which relays it to Clerk.

Both Clerk keys must come from the same instance. A `pk_live_` key with an
`sk_test_` secret verifies no tokens.

## 5. Seed the database once

After the backend is live, run locally against Atlas (set `MONGO_URL` in
`backend/.env` to the Atlas string):

```bash
cd backend
python seed.py
```

This inserts the curated Chiplun facilities and default guidelines. It is
idempotent.

## 6. Troubleshooting

| Symptom | Check |
|---|---|
| Blank page, then "Cannot reach the server" | `vercel.json` destination is your real Render URL; Render `/api/health` responds |
| Sign-in page never loads | `/api/clerk/config` returns `enabled:true`; both Clerk keys set; same instance |
| Signed in, but every API call is 401 | `clerk_keys_match:false` in `/api/health`, or the frontend is calling Render directly (set `VITE_BACKEND_URL` empty) |
| "Not allowed" on `/admin` | `ADMIN_EMAIL` equals the **verified primary** email in Clerk; enter `ADMIN_PASSCODE` if set |
| 404 on refresh at `/sign-in` or `/admin` | SPA fallback rewrite missing from `vercel.json` |
| CORS error | Add the exact origin to `CORS_ORIGINS`, no quotes/slash; or switch to the rewrite |
| `database:false` | Atlas IP allow-list, URL-encoded password, or `MONGO_URL` not set |
| AI says "not set up correctly" | `GEMINI_API_KEY` missing (not `EMERGENT_LLM_KEY` — old docs used that name) |
| First request takes ~50s | Normal on Render free tier; the app now retries for ~90s |

## 7. Security

- `.env` files are git-ignored (keep it that way — never force-add them). If one
  was ever committed anyway, **rotate** the Clerk secret, Gemini key, Mongo
  password, and admin passcode, then purge the file from git history.
- `/api/gate/*` is legacy (default PIN `2026`) and is not enforced anywhere;
  don't rely on it for protection.
- CORS defaults to `*` when `CORS_ORIGINS` is unset. Set it explicitly.
