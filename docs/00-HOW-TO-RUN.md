# Swachh Chiplun — How the app works & how to run it

**AI-Based Smart Waste Identification & Disposal Assistant** — focused on
Chiplun, Ratnagiri district, Maharashtra. Built for your college presentation,
with a deployment path to **Sahyadri Nisarg Mitra**.

---

## 1. What the app does (the 60-second version)

1. You open the app → **Sign-in page** (email + password or Google). New users create an account; the admin (`ADMIN_EMAIL`) also gets the **/admin** panel — see `docs/11-ADMIN-PANEL.md`.
2. **Scan page** — start the camera, capture a waste item (or upload a photo,
   type a hint, scan a barcode, or tap a sample chip). The AI vision model
   returns: item name, category, confidence %, hazards, step-by-step disposal
   instructions under Indian rules, and eco points. If it is unsure, it asks
   you a follow-up question with answer chips instead of guessing.
3. **Facilities page** — a live map of Chiplun with e-waste centres, recycling
   units, scrap dealers, composting and hazardous drop-off points, filtered by
   waste category, with distance, hours, phone and directions.
4. **Assistant page** — a multilingual (English / हिंदी / मराठी) AI agent that
   answers segregation, recycling, e-waste-law and composting questions, knows
   what you just scanned, and can search the facility database itself.
5. **Dashboard page** — scan history, category breakdown chart, and eco points.

## 2. How it works end-to-end

```
Camera / Upload / Hint / Barcode
        │  (JPEG ≤1024px, base64)
        ▼
React frontend ──/api/classify──► FastAPI ──► Vision LLM (gpt-5.4)
        │                             │            │ JSON: name, category,
        │                             │            ▼ confidence, steps…
        │                             └──► MongoDB (scans + eco points)
        │
        ├──/api/chat──► FastAPI ──► LLM agent ──tool call──► facility search
        │                                             └──► MongoDB facilities
        ├──/api/facilities──► FastAPI ──► MongoDB (curated Chiplun seed)
        │                             └──► OpenStreetMap Overpass (live, cached)
        └──/api/scans /api/stats──► FastAPI ──► MongoDB
```

## 3. Folder structure

```
farm-ts/
├── backend/
│   ├── server.py               # FastAPI app + /api router (all routers mounted here)
│   ├── models/waste.py         # Pydantic models (classification, chat, facility, stats, gate)
│   ├── routers/
│   │   ├── classify.py         # POST /api/classify   — vision-LLM identification
│   │   ├── chat.py             # POST /api/chat       — AI agent + facility tool
│   │   ├── facilities.py       # GET  /api/facilities — seed + OSM live finder
│   │   ├── scans.py            # GET/DELETE /api/scans, GET /api/stats
│   │   └── gate.py             # PIN gate (unlock / status / lock)
│   ├── lib/
│   │   ├── db.py               # shared Mongo handle + indexes
│   │   ├── ai.py               # LLM chat factory (model, key, fallback texts)
│   │   └── dates.py            # server-side "today"
│   ├── seed.py                 # idempotent seed of 7 Chiplun-region facilities
│   └── .env                    # MONGO_URL, DB_NAME, EMERGENT_LLM_KEY, GATE_PIN
├── frontend/
│   └── src/
│       ├── App.tsx             # routes: / /scan /assistant /facilities /dashboard
│       ├── components/         # AppShell (nav + gate), PinGate, ui/ (shadcn)
│       ├── pages/              # Home, Scan, Chat, Facilities, Dashboard
│       └── lib/
│           ├── api.ts          # typed fetch layer over /api
│           ├── types.ts        # TS mirrors of the Pydantic models
│           └── queryClient.ts
├── ml/                         # Step-3 training kit: prepare_dataset.py, train.py,
│                               #   inference_onnx.py (MobileNetV3 → ONNX, standalone)
└── docs/                       # this guide, architecture, dataset plan, model plan,
                                 # testing/deployment/timeline, limitations & ethics
```

## 4. Running it yourself (two terminals)

Prerequisites: Python 3.11+, Node 18+, and a local MongoDB (`mongod` running).

```bash
# 1) Backend
cd backend
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
# put your key in backend/.env:  EMERGENT_LLM_KEY=<your key>   GATE_PIN=2026
python seed.py                                       # seed the Chiplun facilities
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# 2) Frontend (second terminal)
cd frontend
yarn install
yarn dev            # open http://localhost:3000
```

Environment variables live in `backend/.env` (never in code):
`MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`, `EMERGENT_LLM_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ADMIN_EMAIL` (`GATE_PIN` is legacy, unused).

## 5. 2-minute presentation demo script

1. Open the preview URL → sign in with your account (admin: your ADMIN_EMAIL account → Admin button → /admin).
2. Home → "Start scanning".
3. Tap the sample chip **"Old mobile phone"** → result: e-waste, disposal steps,
   hazards, +25 eco points. (Or aim the camera at a real bottle / box.)
4. Low-confidence demo: photograph a crumpled unclear item → the app asks a
   follow-up question — tap an answer chip and it refines.
5. Facilities → filter **E-waste** → see SNM E-Waste Hub with distance →
   "Directions".
6. Assistant → switch to **मराठी** → tap "जुन्या बॅटरी कुठे द्याव्यात?" → the
   agent answers in Marathi and shows facility chips.
7. Dashboard → scan history, composition chart, eco points.

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| Classification fails (502) | LLM key/balance — check `EMERGENT_LLM_KEY` and the backend log |
| Map empty | Use a category filter "All types"; live OSM needs internet (seed data always shows) |
| Camera blank | Browsers require HTTPS (the preview URL is HTTPS) or localhost permission |
| Can't sign in locally | Sign-in needs `CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` in `backend/.env` (copy them from Manage → Secrets) |
| Barcode button missing | Your browser lacks the BarcodeDetector API — use Chrome/Edge |
