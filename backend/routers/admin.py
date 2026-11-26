"""Admin panel API — every route here is guarded by require_admin (role read from DB).

/api/me                          any signed-in person (role for the UI)
/api/admin/stats                 dashboard numbers + charts + recent activity
/api/admin/scans[/{id}]          all identification records, search/filter, delete
/api/admin/users[/{id}/role]     people + role changes
/api/admin/guidelines[/{id}]     waste categories + disposal guidelines CRUD
/api/admin/facilities[/{id}]     facilities CRUD + activate/deactivate
/api/admin/audit                 admin action log
"""

import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import (
    IN_ENV, PASSCODE_LOCK, PASSCODE_MAX_FAILS, admin_email, admin_identity, audit, current_member,
    is_admin, passcode_hash, require_admin,
)
from lib.db import db
from lib.guidelines import list_guidelines
from models.admin import (
    ActiveIn,
    ActivityItem,
    AdminFacility,
    AdminScan,
    AdminStats,
    AuditEntry,
    DayCount,
    DeleteResult,
    FacilityIn,
    Guideline,
    GuidelineIn,
    ItemCount,
    AdminGate,
    Me,
    PasscodeIn,
    ScanPage,
    UserRow,
    UsersResponse,
)

router = APIRouter()


def _aware(dt):
    if isinstance(dt, datetime) and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ---------------------------------------------------------------- me
@router.get("/me", response_model=Me)
async def get_me(member: dict = Depends(current_member)):
    role = "admin" if await is_admin(member) else "citizen"
    return Me(user_id=member["user_id"], email=member.get("email", ""), name=member.get("name", ""), role=role)


# ---------------------------------------------------------------- admin passcode (second lock)
@router.get("/admin/gate", response_model=AdminGate)
async def admin_gate(member: dict = Depends(admin_identity)):
    attempts = await db.admin_passcode_attempts.find_one({"_id": member["user_id"]}) or {}
    locked = _aware(attempts.get("locked_until"))
    unlocked = bool(await db.admin_unlocks.find_one({"_id": member.get("session_id") or "", "user_id": member["user_id"]}))
    return AdminGate(
        admin_email=admin_email(),
        passcode_required=bool(passcode_hash()),
        unlocked=unlocked or not passcode_hash(),
        locked_until=locked if locked and locked > datetime.now(timezone.utc) else None,
    )


@router.post("/admin/unlock", response_model=AdminGate)
async def admin_unlock(body: PasscodeIn, member: dict = Depends(admin_identity)):
    import hmac

    now = datetime.now(timezone.utc)
    attempts = await db.admin_passcode_attempts.find_one({"_id": member["user_id"]}) or {}
    locked = _aware(attempts.get("locked_until"))
    if locked and locked > now:
        raise HTTPException(status_code=429, detail="Too many wrong attempts. Try again in 15 minutes.")
    expected = passcode_hash()
    if expected and not hmac.compare_digest(passcode_hash(body.passcode) or "", expected):
        fails = attempts.get("fails", 0) + 1
        update = {"fails": fails}
        if fails >= PASSCODE_MAX_FAILS:
            update = {"fails": 0, "locked_until": now + PASSCODE_LOCK}
        await db.admin_passcode_attempts.update_one({"_id": member["user_id"]}, {"$set": update}, upsert=True)
        left = PASSCODE_MAX_FAILS - fails
        raise HTTPException(status_code=401, detail="Wrong passcode." + (f" {left} attempt(s) left." if left > 0 else " Locked for 15 minutes."))
    await db.admin_passcode_attempts.delete_one({"_id": member["user_id"]})
    await db.admin_unlocks.update_one(
        {"_id": member.get("session_id") or ""}, {"$set": {"user_id": member["user_id"], "at": now}}, upsert=True
    )
    await audit(member, "admin_unlock", "admin panel unlocked")
    return AdminGate(admin_email=admin_email(), passcode_required=bool(expected), unlocked=True, locked_until=None)


# ---------------------------------------------------------------- dashboard
@router.get("/admin/stats", response_model=AdminStats)
async def admin_stats(admin: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=13)).replace(hour=0, minute=0, second=0, microsecond=0)

    by_category: dict[str, int] = {}
    async for row in db.scans.aggregate([{"$group": {"_id": "$category", "n": {"$sum": 1}}}]):
        by_category[row["_id"] or "general"] = row["n"]

    points = 0
    async for row in db.scans.aggregate([{"$group": {"_id": None, "p": {"$sum": "$eco_points"}}}]):
        points = row["p"]

    daily_map: dict[str, int] = {}
    async for row in db.scans.aggregate(
        [
            {"$match": {"created_at": {"$gte": since}}},
            {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}}, "n": {"$sum": 1}}},
        ]
    ):
        daily_map[row["_id"]] = row["n"]
    daily = [
        DayCount(date=(since + timedelta(days=i)).strftime("%Y-%m-%d"), count=daily_map.get((since + timedelta(days=i)).strftime("%Y-%m-%d"), 0))
        for i in range(14)
    ]

    top_items = [
        ItemCount(item_name=row["_id"], count=row["n"])
        async for row in db.scans.aggregate(
            [{"$group": {"_id": "$item_name", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 6}]
        )
    ]

    recent: list[ActivityItem] = []
    emails = {u["user_id"]: u.get("email", "") async for u in db.users.find({}, {"_id": 0, "user_id": 1, "email": 1})}
    async for s in db.scans.find({}, {"_id": 0, "item_name": 1, "category": 1, "user_id": 1, "created_at": 1}).sort("created_at", -1).limit(8):
        who = emails.get(s.get("user_id") or "", "") or "demo (before sign-in)"
        recent.append(ActivityItem(kind="scan", text=f"{who} scanned {s['item_name']} ({s['category']})", at=_aware(s["created_at"])))
    async for f in db.feedback.find({}, {"_id": 0}).sort("created_at", -1).limit(5):
        recent.append(ActivityItem(kind="feedback", text=f"{f.get('user_email', '')} sent {f['kind'].replace('_', ' ')}: {f['message'][:60]}", at=_aware(f["created_at"])))
    async for u in db.users.find({**IN_ENV, "created_at": {"$ne": None}}, {"_id": 0}).sort("created_at", -1).limit(5):
        recent.append(ActivityItem(kind="signup", text=f"{u.get('email', '')} joined", at=_aware(u["created_at"])))
    recent.sort(key=lambda a: a.at, reverse=True)

    return AdminStats(
        total_users=await db.users.count_documents(IN_ENV),
        total_scans=await db.scans.count_documents({}),
        total_eco_points=points,
        total_feedback=await db.feedback.count_documents({}),
        open_feedback=await db.feedback.count_documents({"status": {"$ne": "resolved"}}),
        active_facilities=await db.facilities.count_documents({"active": {"$ne": False}}),
        total_facilities=await db.facilities.count_documents({}),
        low_confidence_scans=await db.scans.count_documents({"confidence": {"$lt": 0.65}}),
        by_category=by_category,
        daily=daily,
        top_items=top_items,
        recent=recent[:12],
    )


# ---------------------------------------------------------------- scan records
@router.get("/admin/scans", response_model=ScanPage)
async def admin_scans(
    q: str = "",
    category: str = "",
    user_id: str = "",
    low_confidence: bool = False,
    days: int = Query(default=0, ge=0, le=3650),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    admin: dict = Depends(require_admin),
):
    query: dict = {}
    if q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"item_name": rx}, {"subcategory": rx}, {"hint": rx}]
    if category:
        query["category"] = category
    if user_id:
        query["user_id"] = user_id
    if low_confidence:
        query["confidence"] = {"$lt": 0.65}
    if days:
        query["created_at"] = {"$gte": datetime.now(timezone.utc) - timedelta(days=days)}

    total = await db.scans.count_documents(query)
    docs = (
        await db.scans.find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list(page_size)
    )
    ids = list({d.get("user_id") for d in docs if d.get("user_id")})
    emails = {u["user_id"]: u.get("email", "") async for u in db.users.find({"user_id": {"$in": ids}}, {"_id": 0})}
    items = []
    for d in docs:
        d["created_at"] = _aware(d["created_at"])
        items.append(AdminScan(**d, user_email=emails.get(d.get("user_id") or "", "")))
    return ScanPage(items=items, total=total, page=page, page_size=page_size)


@router.delete("/admin/scans/{scan_id}", response_model=DeleteResult)
async def admin_delete_scan(scan_id: str, admin: dict = Depends(require_admin)):
    doc = await db.scans.find_one({"id": scan_id}, {"_id": 0, "item_name": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    res = await db.scans.delete_one({"id": scan_id})
    await audit(admin, "delete_record", f"{doc.get('item_name', '')} ({scan_id[:8]})")
    return DeleteResult(deleted=res.deleted_count)


# ---------------------------------------------------------------- users
@router.get("/admin/users", response_model=UsersResponse)
async def admin_users(admin: dict = Depends(require_admin)):
    people = await db.users.find(IN_ENV, {"_id": 0}).sort("created_at", -1).to_list(2000)
    counts = {
        row["_id"]: row["n"]
        async for row in db.scans.aggregate([{"$match": {"user_id": {"$ne": None}}}, {"$group": {"_id": "$user_id", "n": {"$sum": 1}}}])
    }
    fb_counts = {
        row["_id"]: row["n"]
        async for row in db.feedback.aggregate([{"$group": {"_id": "$user_id", "n": {"$sum": 1}}}])
    }
    rows = [
        UserRow(
            user_id=p["user_id"],
            email=p.get("email", ""),
            name=p.get("name", ""),
            role="admin" if (p.get("email") or "").lower() == admin_email() else "citizen",
            created_at=_aware(p.get("created_at")),
            last_seen=_aware(p.get("last_seen")),
            scan_count=counts.get(p["user_id"], 0),
            feedback_count=fb_counts.get(p["user_id"], 0),
        )
        for p in people
    ]
    return UsersResponse(roles=[], users=rows)  # single admin: roles are not editable


# ---------------------------------------------------------------- guidelines
async def _guideline_out(doc: dict) -> Guideline:
    return Guideline(
        **doc,
        facility_count=await db.facilities.count_documents({"categories": doc["key"]}),
        scan_count=await db.scans.count_documents({"category": doc["key"]}),
    )


def _clean_list(items: list[str]) -> list[str]:
    return [s.strip() for s in items if s and s.strip()]


@router.get("/admin/guidelines", response_model=list[Guideline])
async def admin_guidelines(admin: dict = Depends(require_admin)):
    return [await _guideline_out(d) for d in await list_guidelines()]


@router.post("/admin/guidelines", response_model=Guideline)
async def admin_create_guideline(body: GuidelineIn, admin: dict = Depends(require_admin)):
    await list_guidelines()  # make sure defaults exist first
    if await db.guidelines.find_one({"key": body.key}):
        raise HTTPException(status_code=409, detail="A category with this key already exists")
    doc = {
        **body.model_dump(),
        "examples": _clean_list(body.examples),
        "disposal_steps": _clean_list(body.disposal_steps),
        "hazards": _clean_list(body.hazards),
        "id": f"cat-{uuid.uuid4().hex[:10]}",
        "updated_at": datetime.now(timezone.utc),
    }
    await db.guidelines.insert_one(dict(doc))
    await audit(admin, "create_category", body.name)
    return await _guideline_out(doc)


@router.put("/admin/guidelines/{gid}", response_model=Guideline)
async def admin_update_guideline(gid: str, body: GuidelineIn, admin: dict = Depends(require_admin)):
    existing = await db.guidelines.find_one({"id": gid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    if existing["key"] == "general" and not body.active:
        raise HTTPException(status_code=409, detail="'general' is the fallback category and must stay active")
    update = {
        **body.model_dump(exclude={"key"}),  # the key is the stable id used by scans/facilities
        "examples": _clean_list(body.examples),
        "disposal_steps": _clean_list(body.disposal_steps),
        "hazards": _clean_list(body.hazards),
        "updated_at": datetime.now(timezone.utc),
    }
    await db.guidelines.update_one({"id": gid}, {"$set": update})
    await audit(admin, "update_category", body.name)
    doc = await db.guidelines.find_one({"id": gid}, {"_id": 0})
    return await _guideline_out(doc)


@router.delete("/admin/guidelines/{gid}", response_model=DeleteResult)
async def admin_delete_guideline(gid: str, admin: dict = Depends(require_admin)):
    existing = await db.guidelines.find_one({"id": gid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    if existing["key"] == "general":
        raise HTTPException(status_code=409, detail="'general' is the fallback category and cannot be deleted")
    res = await db.guidelines.delete_one({"id": gid})
    await audit(admin, "delete_category", existing["name"])
    return DeleteResult(deleted=res.deleted_count)


# ---------------------------------------------------------------- facilities
def _facility_out(doc: dict) -> AdminFacility:
    return AdminFacility(
        id=doc["id"],
        name=doc["name"],
        categories=doc.get("categories") or ["general"],
        lat=doc["lat"],
        lng=doc["lng"],
        address=doc.get("address", ""),
        phone=doc.get("phone"),
        hours=doc.get("hours"),
        accepts=doc.get("accepts", []),
        active=doc.get("active", True) is not False,
        source=doc.get("source", "seed"),
        type=doc.get("type", ""),
    )


@router.get("/admin/facilities", response_model=list[AdminFacility])
async def admin_facilities(q: str = "", category: str = "", status: str = "", admin: dict = Depends(require_admin)):
    query: dict = {}
    if q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"name": rx}, {"address": rx}]
    if category:
        query["categories"] = category
    if status == "active":
        query["active"] = {"$ne": False}
    elif status == "inactive":
        query["active"] = False
    docs = await db.facilities.find(query, {"_id": 0}).sort("name", 1).to_list(1000)
    return [_facility_out(d) for d in docs]


def _facility_fields(body: FacilityIn) -> dict:
    return {
        **body.model_dump(),
        "accepts": _clean_list(body.accepts),
        "phone": (body.phone or "").strip() or None,
        "hours": (body.hours or "").strip() or None,
    }


@router.post("/admin/facilities", response_model=AdminFacility)
async def admin_create_facility(body: FacilityIn, admin: dict = Depends(require_admin)):
    doc = {
        **_facility_fields(body),
        "id": f"fac-{uuid.uuid4().hex[:10]}",
        "source": "admin",
        "fetched_at": datetime.now(timezone.utc),
    }
    await db.facilities.insert_one(dict(doc))
    await audit(admin, "create_facility", body.name)
    return _facility_out(doc)


@router.put("/admin/facilities/{fid}", response_model=AdminFacility)
async def admin_update_facility(fid: str, body: FacilityIn, admin: dict = Depends(require_admin)):
    res = await db.facilities.update_one({"id": fid}, {"$set": _facility_fields(body)})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Facility not found")
    await audit(admin, "update_facility", body.name)
    return _facility_out(await db.facilities.find_one({"id": fid}, {"_id": 0}))


@router.patch("/admin/facilities/{fid}/active", response_model=AdminFacility)
async def admin_toggle_facility(fid: str, body: ActiveIn, admin: dict = Depends(require_admin)):
    res = await db.facilities.update_one({"id": fid}, {"$set": {"active": body.active}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Facility not found")
    doc = await db.facilities.find_one({"id": fid}, {"_id": 0})
    await audit(admin, "activate_facility" if body.active else "deactivate_facility", doc["name"])
    return _facility_out(doc)


@router.delete("/admin/facilities/{fid}", response_model=DeleteResult)
async def admin_delete_facility(fid: str, admin: dict = Depends(require_admin)):
    doc = await db.facilities.find_one({"id": fid}, {"_id": 0, "name": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Facility not found")
    res = await db.facilities.delete_one({"id": fid})
    await audit(admin, "delete_facility", doc["name"])
    return DeleteResult(deleted=res.deleted_count)


# ---------------------------------------------------------------- audit log
@router.get("/admin/audit", response_model=list[AuditEntry])
async def admin_audit_log(limit: int = Query(default=100, ge=1, le=500), admin: dict = Depends(require_admin)):
    docs = await db.admin_audit.find({}, {"_id": 0}).sort("at", -1).to_list(limit)
    return [AuditEntry(**{**d, "at": _aware(d["at"])}) for d in docs]
