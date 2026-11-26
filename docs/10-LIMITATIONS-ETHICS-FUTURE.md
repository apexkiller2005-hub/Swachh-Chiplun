# Step 10 — Limitations, ethical & privacy concerns, future improvements

## 10.1 Limitations (state these honestly in the viva)

1. **One item per photo** — classification, not detection; a photo of a whole
   dustbin needs YOLO-style detection (future work).
2. **Latency & cost** — the vision-LLM takes 2–6 s per scan and consumes tokens;
   the trained CNN (Step 3) is the fast/offline path once enough local data exists.
3. **Connectivity** — classification and chat need internet; the facility map
   degrades gracefully to the curated Chiplun seed when OSM is unreachable.
4. **OSM coverage** — small Chiplun-locality points (kabadiwala shops) are
   under-mapped on OpenStreetMap; the seed list is hand-curated and must be
   verified/expanded locally with the NGO.
5. **Single-user** — a demo PIN gate, no accounts/roles; multi-user with an NGO
   dashboard needs proper auth (managed email/Google sign-in) and roles.
6. **UI language** — chat speaks EN/HI/MR; the page chrome is English today.
7. **Data scarcity** — biomedical/hazardous training classes are thin in public
   datasets; expect lower accuracy there until local images are collected.

## 10.2 Ethical & privacy concerns (and how this build addresses them)

| Concern | Position taken in this project |
|---|---|
| **User images** | Photos are classified and **never stored** — only the text result (item, category, confidence) is saved. No face/house-number capture is needed; collection guidelines (Step 2) say "objects only". |
| **Consent for training data** | Local collection uses consented photos; dataset cards note source and license; no personal data in `manifest.csv` beyond file paths. |
| **Safety of advice** | Hazardous/biomedical answers always lead with a warning and point to authorised channels (hospital drop-off, CPCB-registered recyclers). No medical dosage advice — redirected to doctors/PHC. The agent is guard-railed against open-burning/dumping advice, and falls back to a canned safe answer if the AI fails. |
| **Bias** | Public datasets are Western-centric; the plan explicitly collects local Chiplun/Khed images (tetra packs, gutka sachets, coconut shells) so the model reflects the region it serves. |
| **Informal e-waste sector** | India's kabadiwala network is a livelihood, not a nuisance — the app's guidance routes to *authorised* channels per E-Waste Rules 2022 while future versions can partner with and register local dealers instead of bypassing them. |
| **Gamification honesty** | Eco points motivate segregation but are not verified recycling; the report frames them as behavioural nudges, not impact certificates. |
| **Accessibility** | Multi-language answers, large touch targets, mobile-first nav; voice input is future work for low-literacy users. |

## 10.3 Future improvements

1. **On-device offline scanning** — `ml/train.py`'s ONNX → TFLite (~5 MB) model
   embedded in an Android app for NGO field use without connectivity.
2. **RAG over the rulebooks** — index the actual SWM Rules 2016 / E-Waste Rules
   2022 PDFs so assistant answers cite exact clauses.
3. **Multi-item detection** — YOLOv8 to classify a whole bin photo at once.
4. **WhatsApp bot** — most Indian households already have WhatsApp; send a
   photo, get disposal steps (no app install barrier).
5. **NGO operations dashboard** — multi-user accounts for Sahyadri Nisarg
   Mitra: pickup requests, facility verification, regional impact stats.
6. **Facility data partnership** — verify/expand the Chiplun facility list with
   the municipal council; add live "open now" filters.
7. **Voice + vernacular UI** — Hindi/Marathi speech input/output for wider reach.
8. **Impact measurement** — aggregated (anonymised) scans to estimate kg of
   correctly segregated waste per ward, shared with the municipality.
