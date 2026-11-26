"""Roles + admin authorization on top of Emergent-managed Clerk sign-in.

Clerk owns identity (passwords, Google, sessions, signed JWTs). The app owns roles:
each person has a `users` doc keyed by the Clerk user id, holding `role`. The role
is read from the database on EVERY request — never from the token or the body.
"""

import hashlib
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

import requests
from fastapi import Depends, HTTPException
from pymongo import ReturnDocument
from starlette.concurrency import run_in_threadpool

from clerk_auth import require_user
from lib.db import db

logger = logging.getLogger(__name__)

# The role list is code (ships on every publish). Highest first; keep `admin`.
ROLES = ["admin", "citizen"]
DEFAULT_ROLE = "citizen"
RETIRED_ROLES: dict[str, str] = {}  # removed role -> replacement; keep entries
RANK = {r: len(ROLES) - i for i, r in enumerate(ROLES)}

# Which Clerk instance signed the person in (first publish copies preview users to Live).
ENV = "live" if os.environ.get("CLERK_PUBLISHABLE_KEY", "").startswith("pk_live_") else "preview"
IN_ENV = {"env": {"$in": [ENV, None]}}

LAST_SEEN_EVERY = timedelta(minutes=5)


def effective_role(role) -> str:
    role = RETIRED_ROLES.get(role, role)
    return role if role in ROLES else DEFAULT_ROLE


async def move_retired_roles() -> None:
    for old, new in RETIRED_ROLES.items():
        await db.users.update_many({"role": old}, {"$set": {"role": new}})


def _fetch_clerk_user(user_id: str) -> dict:
    r = requests.get(
        f"https://api.clerk.com/v1/users/{user_id}",
        timeout=10,
        headers={"Authorization": f"Bearer {os.environ['CLERK_SECRET_KEY']}", "User-Agent": "emergent-app"},
    )
    r.raise_for_status()
    return r.json()


def _profile(clerk_user: dict) -> tuple[str, str, bool]:
    """(primary email, display name, is-admin-by-verified-ADMIN_EMAIL)."""
    admins = {e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()}
    emails = clerk_user.get("email_addresses") or []
    primary_id = clerk_user.get("primary_email_address_id")
    primary = next((e for e in emails if e.get("id") == primary_id), emails[0] if emails else {})
    email = (primary.get("email_address") or "").lower()
    name = " ".join(p for p in (clerk_user.get("first_name"), clerk_user.get("last_name")) if p) or email
    is_admin = any(
        e["email_address"].lower() in admins and (e.get("verification") or {}).get("status") == "verified"
        for e in emails
    )
    return email, name, is_admin


async def current_member(user: dict = Depends(require_user)) -> dict:
    """The signed-in person with their role, created on first sign-in."""
    uid = user["user_id"]
    now = datetime.now(timezone.utc)
    member = await db.users.find_one({"user_id": uid}, {"_id": 0})
    if member is None or not member.get("role") or not member.get("email"):
        # One Clerk lookup on first sign-in (never per request). Errors propagate so
        # the next request retries instead of saving a wrong role.
        clerk_user = await run_in_threadpool(_fetch_clerk_user, uid)
        email, name, _ = _profile(clerk_user)
        role = DEFAULT_ROLE  # admin rights are NOT stored roles: see require_admin
        await db.users.update_one(
            {"user_id": uid, "role": {"$in": [None, ""]}}, {"$set": {"role": role}}
        )
        member = await db.users.find_one_and_update(
            {"user_id": uid},
            {
                "$setOnInsert": {"user_id": uid, "role": role, "created_at": now},
                "$set": {"email": email, "name": name},
            },
            upsert=True,
            projection={"_id": 0},
            return_document=ReturnDocument.AFTER,
        )
    updates: dict = {}
    if member.get("env") != ENV:
        updates["env"] = ENV
    last_seen = member.get("last_seen")
    if last_seen is not None and last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    if last_seen is None or now - last_seen > LAST_SEEN_EVERY:
        updates["last_seen"] = now
    if updates:
        await db.users.update_one({"user_id": uid}, {"$set": updates})
    return {**member, **updates, "env": ENV, "role": DEFAULT_ROLE, "session_id": user.get("session_id")}


def require_role(*roles: str):
    async def check(member: dict = Depends(current_member)) -> dict:
        if member["role"] not in roles:
            raise HTTPException(status_code=403, detail="Not allowed")
        return member

    return check


# ---------------------------------------------------------------- single admin
# Exactly ONE admin: the Clerk user whose PRIMARY email equals ADMIN_EMAIL and is
# VERIFIED. Decided from Clerk on every admin call; no stored role can grant it.
PASSCODE_MAX_FAILS = 5
PASSCODE_LOCK = timedelta(minutes=15)


def admin_email() -> str:
    return os.environ.get("ADMIN_EMAIL", "").split(",")[0].strip().lower()


def is_verified_primary_admin(clerk_user: dict) -> bool:
    target = admin_email()
    if not target:
        return False
    pid = clerk_user.get("primary_email_address_id")
    primary = next((e for e in clerk_user.get("email_addresses") or [] if e.get("id") == pid), None)
    return bool(
        primary
        and (primary.get("email_address") or "").strip().lower() == target
        and (primary.get("verification") or {}).get("status") == "verified"
    )


async def is_admin(member: dict) -> bool:
    try:
        clerk_user = await run_in_threadpool(_fetch_clerk_user, member["user_id"])
    except Exception:
        logger.warning("admin check: Clerk lookup failed")
        return False
    return is_verified_primary_admin(clerk_user)


def passcode_hash(value: str | None = None) -> str | None:
    raw = os.environ.get("ADMIN_PASSCODE", "") if value is None else value
    return hashlib.sha256(raw.encode()).hexdigest() if raw else None


async def admin_identity(member: dict = Depends(current_member)) -> dict:
    if not await is_admin(member):
        raise HTTPException(status_code=403, detail="Not allowed")
    return member


async def require_admin(member: dict = Depends(admin_identity)) -> dict:
    """Every admin API: verified ADMIN_EMAIL + (if ADMIN_PASSCODE set) unlocked session."""
    if passcode_hash():
        sid = member.get("session_id") or ""
        if not await db.admin_unlocks.find_one({"_id": sid, "user_id": member["user_id"]}):
            raise HTTPException(status_code=423, detail="Admin passcode required")
    return {**member, "role": "admin"}


async def audit(admin: dict, action: str, target: str) -> None:
    """Append-only log of every admin write — shown on the admin Audit log page."""
    await db.admin_audit.insert_one(
        {
            "id": str(uuid.uuid4()),
            "admin_email": admin.get("email", ""),
            "action": action,
            "target": target,
            "at": datetime.now(timezone.utc),
        }
    )
