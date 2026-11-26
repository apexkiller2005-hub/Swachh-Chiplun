# Swachh Chiplun — Examiner Guide (simple words)

## 1. ADMIN SIDE
**Log in:** open the app → **Sign in** → *Continue with Google* (or email + password) with **apexkiller2005@gmail.com** → click the dark **Admin** button in the header (only you see it) → type the **admin passcode** once → the admin panel opens at `/admin`. After 5 wrong passcodes it locks for 15 minutes.

| Page (left menu) | What you can do, step by step |
|---|---|
| **Dashboard** | Shows the "Admin account" note, totals (users, scans, open feedback, active facilities, eco points), a 14-day scan chart, category counts, top items and recent activity. Read-only |
| **Waste records** | All scans by all users. Type in **Search** → magnifier. Use the **category**, **period** or **low-confidence** filters. Click the **eye** for details. Click the **bin** → **Yes, delete** to remove a record. **Export CSV** downloads every record that matches the filters |
| **Categories & rules** | **Add category** → fill name, key, description, examples, disposal steps (one per line), hazards, eco points and colour → **Save**. The **pencil** edits a category. Untick **Active** to disable it. The **bin** → confirm deletes it ("General" can't be deleted). The AI scan and assistant use this list immediately |
| **Facilities** | **Add facility** → name, **type of place**, categories accepted, then **click on the map** to set latitude/longitude, plus address, phone, hours → **Save**. The **Active/Inactive** pill hides or shows it on the users' map. The **pencil** edits, the **bin** → confirm deletes |
| **Users** | Search by name or email. **Details** shows email, scans, feedback, join date and **View scan history**. **Open in Clerk** opens the user's account in Clerk, where you click *Ban* (block), *Unban* or *Delete*. There is no "make admin" button |
| **Tips & knowledge** | **Add tip** → title, text, optional category → **Save**. The pencil edits, the bin deletes. The AI assistant uses active tips when answering |
| **Feedback** | Filter by Open / In progress / Resolved. **Reply / update** → choose a status, write a reply → **Save reply**, and the user sees it. The bin deletes spam |
| **Audit log** | Read-only list of every admin action: who, what and when |

## 2. USER SIDE
**Sign in:** *Continue with Google*, **or** *Sign up* with email + password. Clerk emails a **6-digit verification code**, which you type in to finish.
- **Home:** what the app does, plus the 6 categories.
- **Scan:** *Start camera* → *Capture* (or *Upload* a photo, type a hint, or tap a sample chip) → *Identify waste item*. You get the item name, category, **confidence %**, hazards, disposal steps, an eco tip and eco points. If the AI is unsure, it asks one follow-up question with answer buttons.
- **Assistant:** ask anything in English, हिंदी or मराठी. It remembers the conversation, knows your last scan, and can look up nearby facilities.
- **Facilities:** a free OpenStreetMap map of Chiplun. Filter by waste type to see distance, hours and phone, and tap **Directions**.
- **Dashboard:** your scan history, a category chart and your eco points.
- **Feedback** button (header): send a complaint or suggestion and read the admin's reply.

| Category | Examples | Disposal advice |
|---|---|---|
| E-waste | phone, charger, battery, tube light | Keep intact and dry, never burn it, give it to an authorised e-waste recycler (E-Waste Rules 2022) |
| Recyclable | PET bottle, newspaper, cardboard, can | Empty, rinse, dry and flatten, then dry-waste collector or scrap dealer |
| General | used tissue, dirty wrapper, broken ceramic | General (reject) waste bag, then municipal vehicle |
| Organic | vegetable peels, leftover food, leaves | Keep separate, compost at home or put in wet-waste collection |
| Hazardous | paint, pesticide, expired medicine, aerosol | Keep closed and away from children, never in drains, hazardous drop-off |
| Biomedical | used mask, syringe, sanitary pad | Wrap and seal, label it, hospital / biomedical collection (BMW Rules 2016) |

## 3. How the two sides connect (one shared database)
- Admin adds or activates a **facility** → it appears on the users' **Facilities map** and in the assistant's answers at once. A deactivated one disappears.
- Admin edits a **category or its disposal steps** → the next **scan** uses the new rules and eco points.
- Admin adds a **tip** → the **assistant** uses it in its answers.
- User **scans** → appear in admin **Waste records** and the **Dashboard**. User **feedback** → admin **Feedback** page, and the admin's reply → the user's Feedback window.

## 4. Single-admin security
- Hiding a button only changes what you *see*. Anyone can still type `/admin` or call the API with a tool. So the **backend checks every admin request**: it asks Clerk for the user's **primary email** and allows access only if it is exactly `ADMIN_EMAIL` **and verified**. Everyone else gets **403 Forbidden**.
- **Verified email** means Clerk proved that the person owns that inbox, either with a 6-digit code or because Google confirmed it. Without verification, someone could type your email into a sign-up form, so an **unverified admin email never gets admin rights**.
- There is no role field and no "make admin" button, so a second admin can't be created.
- Second lock: **ADMIN_PASSCODE**. The server compares SHA-256 hashes, the passcode is never stored in code or logs, and 5 wrong tries lock it for 15 minutes.

## 5. Architecture
```
Phone / laptop browser (React + Vite + Tailwind, PWA)
   │  sign-in ─────────────► Clerk (Google + email/password + OTP)
   │  /api/* with JWT token
   ▼
FastAPI backend (Python) ── verifies JWT, checks admin email, rate-limits AI
   ├─► Google Gemini API (free tier: gemini-3.5-flash → fallback 3.5-flash-lite)
   ├─► MongoDB (users, scans, guidelines, facilities, tips, feedback, admin_audit)
   └─► OpenStreetMap (map tiles in the browser, live recycling points via Overpass)
```
| Folder / file | Job |
|---|---|
| `frontend/src/pages/` | user pages (Home, Scan, Chat, Facilities, Dashboard) and `admin/` pages |
| `frontend/src/lib/api.ts` | every call to the backend, adds the login token and shows friendly errors |
| `backend/server.py` | starts the API, health check, security headers, CORS |
| `backend/routers/` | `classify` (scan), `chat` (assistant), `facilities`, `scans`, `feedback`, `admin`, `tips` |
| `backend/lib/gemini.py` | the only file that talks to Gemini, with friendly error handling |
| `backend/lib/auth.py` | Clerk login, single-admin check, passcode |
| `backend/seed.py` | first-run data: 6 categories + Chiplun facilities |
| `ml/` | optional offline CNN training kit (future work) |

**A scan from photo to result:**
1. The browser shrinks the photo to 1024 px JPEG.
2. It sends `POST /api/classify` with the login token.
3. The backend checks the token, rate limit, file type and size.
4. It loads the admin's active categories and rules.
5. It sends the photo + the same system prompt to Gemini with a **JSON schema** and low temperature.
6. It checks the answer: is the category one of the list, and is confidence between 0 and 1? If not, it retries once, then shows a friendly message.
7. It saves the scan in MongoDB.
8. The result appears on screen, in history and on the dashboards.

## 6. 40 examiner questions — short answers
1. **What does the project do?** It identifies waste from a photo, gives safe disposal steps and shows the nearest facility in Chiplun.
2. **Why Gemini?** It has a free tier, accepts images and text, gives structured JSON output and handles Hindi/Marathi.
3. **Why not train your own model?** That needs thousands of labelled local images and a GPU. A vision AI works on day one, and `ml/` holds the plan for an offline CNN.
4. **What is confidence?** The AI's own certainty from 0 to 1, shown as a %. Below 65% the app asks a follow-up question.
5. **How do you stop wrong categories?** A JSON schema with an enum of the allowed categories, plus server validation, plus one retry.
6. **What is temperature?** Randomness of the AI. 0.2 gives consistent answers.
7. **Why Clerk?** Free, secure login with Google + email OTP, and no passwords stored by us.
8. **What is a JWT?** A signed token that proves who is logged in. The backend checks its signature on every call.
9. **How is the admin decided?** By the verified primary email = ADMIN_EMAIL, checked on the server on every admin call.
10. **Why not hide the admin button only?** Users could still call the API directly. The server check blocks them (403).
11. **What is a verified email?** Clerk proved ownership with a code or through Google.
12. **What is the passcode for?** A second lock in case someone gets into the admin's account session.
13. **How is the passcode stored?** Only as an environment variable. It is compared as a SHA-256 hash and never logged.
14. **Why the lockout?** It stops guessing (brute force).
15. **Which database and why?** MongoDB: flexible documents, free locally or on Atlas.
16. **Which collections?** users, scans, guidelines, facilities, tips, feedback, admin_audit.
17. **Why OpenStreetMap?** It is free, needs no paid key, and the community maps Indian towns.
18. **How is distance calculated?** With the haversine formula from your location (or Chiplun centre).
19. **How does the assistant find facilities?** Gemini "function calling" runs our `search_facilities` tool.
20. **Does the chat remember?** Yes, recent messages are sent with each question.
21. **Languages?** English, Hindi and Marathi.
22. **Which Indian rules?** SWM Rules 2016, E-Waste Rules 2022 and BMW Rules 2016.
23. **What if the AI is down or busy?** You get a friendly "AI is busy" message, an automatic backup model and safe fallback advice. The app never crashes.
24. **What is rate limiting?** Each user can make 15 scans and 20 chats a minute, which protects the free quota.
25. **Free-tier limits?** For example, 20 requests/day on 3.5-flash, so the app falls back to 3.5-flash-lite.
26. **Are photos stored?** No, only the text result is saved. That protects privacy.
27. **How do you keep secrets safe?** In `.env` files that are git-ignored, never in code or logs.
28. **What is CORS?** A browser rule. Only the frontend address in `CORS_ORIGINS` can call the API.
29. **What is a PWA?** A website you can install on a phone home screen (manifest + service worker).
30. **How does the camera work?** The browser `getUserMedia` API. Phones need HTTPS.
31. **What are eco points?** Points per category to motivate correct segregation.
32. **How do admin changes reach users?** Both sides read the same database, so changes show at once.
33. **What is the audit log?** A permanent record of every admin action, for accountability.
34. **How did you test?** API tests, browser tests (desktop + mobile), security tests (403s) and a before/after regression on 10 photos.
35. **Regression result?** 10/10 correct with Gemini, compared with 9/10 before.
36. **What is the health check?** `/api/health` shows database and AI status without revealing secrets.
37. **Limitations?** One item per photo, needs internet, free-tier quotas, and the facility list needs local checking.
38. **Ethics?** Privacy (no photos stored), safety-first advice, and respecting informal recyclers.
39. **Future scope?** Offline TFLite model, WhatsApp bot, multi-item detection, and an NGO dashboard for Sahyadri Nisarg Mitra.
40. **Who can use it?** Any citizen of Chiplun with a phone, and one town admin manages it.
