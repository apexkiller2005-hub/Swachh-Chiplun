# Step 9 — Testing plan, deployment steps (free tier), 4-week timeline

## 9.1 Testing plan

### Layer 1 — Backend API tests (pytest, already wired)

The repo has `backend/tests/conftest.py` (httpx client rooted at `/api`, hitting
the live uvicorn server). Add specs like:

| Test | Asserts |
|---|---|
| `test_gate_wrong_pin_401` | POST /api/gate/unlock {"pin":"0000"} → 401 |
| `test_gate_roundtrip` | wrong→401, right→200 + cookie, status unlocked |
| `test_facilities_seed_and_filter` | GET /api/facilities?live=0 → ≥7 rows; `category=ewaste` → all rows contain ewaste |
| `test_classify_requires_input` | empty body → 422 (validation before the LLM) |
| `test_classify_saves_scan` | hint classify → 200; then GET /api/scans newest matches |
| `test_stats_counts` | /api/stats totals == scans table |
| `test_chat_fallback` | unreachable-LLM path returns HTTP 200 + `fallback:true` (canned safe answer) |

Run: `cd backend && pytest` (xdist-parallel, asyncio auto).

### Layer 2 — Frontend e2e (Playwright workspace `tests/e2e/`)

Happy paths, one spec per page: PIN unlock → scan preset → result card visible;
facilities map + ≥1 facility card; assistant reply bubble appears; dashboard
stat cards + history row. Mobile pass with `PW_MOBILE=1` (bottom nav).

### Layer 3 — Manual acceptance matrix (used for the demo)

| Flow | Expected |
|---|---|
| Wrong PIN | Red "Wrong PIN", retry |
| Scan preset "Old mobile phone" | E-waste pill, confidence, hazards, steps, +25 pts |
| Unclear photo | Follow-up question + answer chips (no blind guess) |
| Facilities filter E-waste | Only e-waste-capable centres, distances sorted |
| Assistant "क्या PET बोतल रिसाइकल होती है?" | Hindi answer citing rules |
| Dashboard delete row | Row disappears, stats update |
| Kill internet during classify | Friendly error toast, app still navigable |

### Layer 4 — Failure-injection (already proven in this build)

Overpass API unreachable → `/api/facilities` still returns 200 with the curated
seed; LLM error → chat returns the safe canned reply. These are the two
external dependencies — both degrade gracefully by design.

## 9.2 Deployment on free tiers (₹0/month)

1. **Database — MongoDB Atlas M0 (free forever)**
   Create cluster → DB user → Network Access `0.0.0.0/0` → copy the
   `mongodb+srv://…` connection string.
2. **Backend — Render free web service**
   New Web Service → connect your GitHub repo → Root directory `backend` →
   Build: `pip install -r requirements.txt` →
   Start: `uvicorn server:app --host 0.0.0.0 --port $PORT` →
   Environment: `MONGO_URL`, `DB_NAME=app`, `EMERGENT_LLM_KEY`, `GATE_PIN`,
   `CORS_ORIGINS=https://<your-frontend>.vercel.app`.
   (Free tier sleeps after 15 min idle — first request wakes it in ~30 s.)
3. **Frontend — Vercel/Netlify free**
   Import repo → root `frontend` → build `yarn build` → output `dist`.
   The frontend calls relative `/api/...`, so production needs a rewrite.
   `frontend/vercel.json` already ships one — replace the placeholder with your
   Render URL (and keep the SPA fallback so `/sign-in` and `/admin` survive a
   refresh). Full walkthrough: `docs/13-DEPLOYMENT-VERCEL-RENDER.md`.
   ```json
   { "rewrites": [
     { "source": "/api/:path*", "destination": "https://<your-backend>.onrender.com/api/:path*" },
     { "source": "/(.*)", "destination": "/index.html" }
   ] }
   ```
4. **Post-deploy checklist**: unlock with PIN → classify a preset → facilities
   load → chat replies → run `python backend/seed.py` once against Atlas
   (change `MONGO_URL` locally or use a one-off Render shell) to seed facilities.
5. **Secrets**: never commit `backend/.env` — every key is set in the platform
   environment-variables UI (Render/Vercel).

## 9.3 4-week timeline

| Week | Deliverable |
|---|---|
| 1 | Datasets downloaded + `ml/prepare_dataset.py` merged manifest + class histogram; app skeleton (this build) demoable |
| 2 | Collect 500+ local Chiplun/Khed images with consent (phone protocol §Step 2); polish UX; backend pytest suite green |
| 3 | Train MobileNetV3 (`ml/train.py`), confusion-matrix error analysis, fix worst class confusions with extra local data |
| 4 | ONNX→TFLite export + on-device test; deploy full stack on free tiers; final report (docs 00–10) + presentation rehearsal |
