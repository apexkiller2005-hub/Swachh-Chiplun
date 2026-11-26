# Run Swachh Chiplun on your own laptop (Windows + VS Code) — beginner guide

Everything here is **free**: Python, Node.js, MongoDB, Google Gemini (free tier),
Clerk (free plan) and OpenStreetMap.

## 1. Install (one time)
| App | Download | Note |
|---|---|---|
| VS Code | code.visualstudio.com | editor + terminal |
| Python 3.11 | python.org | tick **"Add python.exe to PATH"** |
| Node.js LTS | nodejs.org | gives `npm` |
| MongoDB Community Server | mongodb.com/try/download/community | keep "Install as a Service" ticked. Or use a free **MongoDB Atlas** cluster |
| Git (optional) | git-scm.com | to clone from GitHub |

Restart the laptop after installing.

## 2. Get the code
On GitHub, open your repo → branch **gemini-version** → green **Code** button → *Download ZIP* → extract it (or `git clone` it).
Open the folder in VS Code (*File → Open Folder*).

## 3. Free keys you need
**Gemini API key (AI):** go to https://aistudio.google.com/apikey → *Create API key* → copy it.

**Clerk keys (login):**
1. Go to https://dashboard.clerk.com → sign up (free) → **Create application** named "Swachh Chiplun".
2. Under sign-in options, turn on **Email** (with password + email verification code) and **Google**.
3. Open **Configure → API Keys** and copy the **Publishable key** (`pk_test_…`) and **Secret key** (`sk_test_…`).
4. Sign up in your app once with **apexkiller2005@gmail.com** and verify it. That account is the only admin.

## 4. Create the .env files
- Copy `backend/.env.example` to `backend/.env` and fill in: `MONGO_URL`, `GEMINI_API_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ADMIN_EMAIL=apexkiller2005@gmail.com`, `ADMIN_PASSCODE=<your passcode>`, `CORS_ORIGINS=http://localhost:3000`.
- Copy `frontend/.env.example` to `frontend/.env`. Leave `VITE_BACKEND_URL` empty, and put your `pk_test_…` in `VITE_CLERK_PUBLISHABLE_KEY`.
- `.env` files are in `.gitignore`, so **never upload them**.

## 5. Run it (two terminals in VS Code: *Terminal → New Terminal*)
**Terminal 1 — backend**
```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python seed.py                      # 6 categories + sample Chiplun facilities (first run)
uvicorn server:app --port 8001 --reload
```
Check http://localhost:8001/api/health. It should show `"status":"ok"`.

**Terminal 2 — frontend**
```powershell
cd frontend
npm install --global yarn
yarn install
yarn dev
```
Open **http://localhost:3000**. On a phone on the same Wi-Fi, open `http://<laptop-IP>:3000`. The camera needs HTTPS on phones, so use the deployed HTTPS link for the phone camera. To install it as an app, use the browser menu → *Add to Home screen*.

## 6. The 10 most common errors
| # | Error | Fix |
|---|---|---|
| 1 | `'python' is not recognized` | Reinstall Python with "Add to PATH" ticked, then restart VS Code |
| 2 | `venv\Scripts\activate` blocked (PowerShell) | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once |
| 3 | `ServerSelectionTimeoutError` (MongoDB) | Start the MongoDB service (Services app → MongoDB → Start) or check the Atlas `MONGO_URL` and IP allow-list |
| 4 | Scan says "AI service is not set up correctly" | `GEMINI_API_KEY` is missing or wrong in `backend/.env`. Restart the backend |
| 5 | "AI is busy, please try again in a minute" | Free-tier limit. Wait 1 minute. The daily limit resets at midnight Pacific time. `GEMINI_FALLBACK_MODEL` switches models automatically |
| 6 | Model "no longer available" (404) | Google retired the model. Set `GEMINI_MODEL` to a current one from aistudio.google.com |
| 7 | Sign-in page blank / "Sign-in is unavailable" | Clerk keys missing. Fill both in `backend/.env` and restart the backend |
| 8 | CORS error in browser console | Add your frontend address to `CORS_ORIGINS` in `backend/.env` |
| 9 | `yarn: command not found` | `npm install --global yarn`, then reopen the terminal |
| 10 | Admin page says "Admin access only" | Sign in with the exact `ADMIN_EMAIL`, make sure the email is verified in Clerk, then enter `ADMIN_PASSCODE` |
