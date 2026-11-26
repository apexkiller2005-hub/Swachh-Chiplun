"""Regression run for the AI features: 10 waste photos + 3 chat questions.

Run (backend running on :8001, test tokens minted first):
    cd backend && python tests/make_test_tokens.py
    python tests/regression_run.py before     # or: after
Writes docs/regression_<label>.json. Uses the citizen test account token.
"""

import base64
import io
import json
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image

API = "http://localhost:8001/api"
ROOT = Path(__file__).resolve().parents[2]

SAMPLES = [
    ("ewaste", "Broken smartphone", "https://images.unsplash.com/photo-1746006084492-24a8fd02710a?w=800&q=80&fm=jpg"),
    ("ewaste", "Old mobile phones", "https://images.unsplash.com/photo-1587017234728-932c80f3e56f?w=800&q=80&fm=jpg"),
    ("recyclable", "Plastic water bottle", "https://images.unsplash.com/photo-1616118132534-381148898bb4?w=800&q=80&fm=jpg"),
    ("recyclable", "Empty plastic bottles", "https://images.pexels.com/photos/5719820/pexels-photo-5719820.jpeg?auto=compress&w=800"),
    ("organic", "Banana peel", "https://images.unsplash.com/photo-1579523360589-120f265e0988?w=800&q=80&fm=jpg"),
    ("organic", "Peeled banana", "https://images.unsplash.com/photo-1579523360595-bee0f3b9fafb?w=800&q=80&fm=jpg"),
    ("hazardous", "Spray paint cans", "https://images.unsplash.com/photo-1642708831052-2402ef1f8a8b?w=800&q=80&fm=jpg"),
    ("hazardous", "Rusty paint cans", "https://images.pexels.com/photos/15818563/pexels-photo-15818563.jpeg?auto=compress&w=800"),
    ("biomedical", "Used syringe", "https://images.unsplash.com/photo-1643401226147-1b0f88071bbe?w=800&q=80&fm=jpg"),
    ("general", "Mixed dirty garbage", "https://images.unsplash.com/photo-1577369083609-051feb777894?w=800&q=80&fm=jpg"),
]

CHATS = [
    "What do I do with a broken tube light?",
    "Where can I dispose of old batteries in Chiplun?",
    "What is the capital of India?",  # general question — must answer politely
]


def fetch_b64(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    raw = urllib.request.urlopen(req, timeout=30).read()
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    im.thumbnail((1024, 1024))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


def post(path: str, body: dict, token: str) -> tuple[int, dict]:
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + token},
    )
    try:
        res = urllib.request.urlopen(req, timeout=120)
        return res.status, json.load(res)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def main() -> None:
    label = sys.argv[1] if len(sys.argv) > 1 else "run"
    token = json.load(open("/tmp/tokens.json"))["citizen"]["token"]
    rows = []
    for expected, name, url in SAMPLES:
        t0 = time.time()
        try:
            code, d = post("/classify", {"image_base64": fetch_b64(url), "mime_type": "image/jpeg", "language": "en"}, token)
        except Exception as exc:  # download failure etc.
            code, d = 0, {"detail": str(exc)}
        rows.append({
            "sample": name,
            "expected": expected,
            "status": code,
            "category": d.get("category"),
            "item_name": d.get("item_name"),
            "confidence": d.get("confidence"),
            "first_step": (d.get("disposal_steps") or [""])[0],
            "seconds": round(time.time() - t0, 1),
            "detail": d.get("detail"),
        })
        print(f"{name:24s} expected={expected:11s} got={d.get('category')} conf={d.get('confidence')} status={code}")
    chats = []
    for q in CHATS:
        code, d = post("/chat", {"message": q, "language": "en", "history": []}, token)
        chats.append({"question": q, "status": code, "fallback": d.get("fallback"), "reply": (d.get("reply") or "")[:300],
                      "facilities_used": len(d.get("facilities_used") or [])})
        print(f"chat: {q[:40]:40s} status={code} fallback={d.get('fallback')} facilities={len(d.get('facilities_used') or [])}")
    out = ROOT / "docs" / f"regression_{label}.json"
    out.write_text(json.dumps({"scans": rows, "chats": chats}, indent=2, ensure_ascii=False))
    print("saved", out)


if __name__ == "__main__":
    main()
