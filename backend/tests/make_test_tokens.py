"""Dev-only helper: create/reuse Clerk test users (admin + citizen) and mint
short-lived session tokens -> /tmp/tokens.json. Never prints the secret key.

Run: cd /app/backend && python tests/make_test_tokens.py
"""

import asyncio
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
SK = os.environ["CLERK_SECRET_KEY"]

USERS = {
    "admin": "swachh-admin+clerk_test@example.com",
    "citizen": "swachh-citizen+clerk_test@example.com",
    "citizen2": "swachh-citizen2+clerk_test@example.com",
}
PASSWORD = "Test-pass-12345!"


def bapi(method: str, path: str, body: dict | None = None):
    req = urllib.request.Request(
        "https://api.clerk.com/v1" + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Authorization": "Bearer " + SK, "Content-Type": "application/json", "User-Agent": "emergent-test"},
    )
    return json.load(urllib.request.urlopen(req))


def get_or_create(email: str) -> dict:
    found = bapi("GET", "/users?" + urllib.parse.urlencode({"email_address": email}))
    if found:
        return found[0]
    return bapi("POST", "/users", {"email_address": [email], "password": PASSWORD, "skip_password_checks": True})


async def set_roles(ids: dict) -> None:
    from lib.db import db

    for role_name, uid in ids.items():
        role = "admin" if role_name == "admin" else "citizen"
        await db.users.update_one(
            {"user_id": uid},
            {"$set": {"role": role, "env": "preview", "email": USERS[role_name], "name": role_name.title() + " Tester"}},
            upsert=True,
        )


def main() -> None:
    out = {}
    ids = {}
    for role_name, email in USERS.items():
        user = get_or_create(email)
        ids[role_name] = user["id"]
        session = bapi("POST", "/sessions", {"user_id": user["id"]})
        token = bapi("POST", f"/sessions/{session['id']}/tokens", {"expires_in_seconds": 3600})["jwt"]
        ticket = bapi("POST", "/sign_in_tokens", {"user_id": user["id"], "expires_in_seconds": 3600})["token"]
        out[role_name] = {"user_id": user["id"], "email": email, "token": token, "ticket": ticket}
    import sys

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    asyncio.run(set_roles(ids))
    with open("/tmp/tokens.json", "w") as f:
        json.dump(out, f)
    print("tokens written for:", ", ".join(f"{k}={v['email']}" for k, v in out.items()))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as e:
        print("Clerk API error", e.code, e.read()[:300])
        raise
