"""Citizen feedback / complaints + admin replies.

POST /api/feedback               citizen sends feedback
GET  /api/feedback/mine          citizen sees own feedback + admin replies
GET  /api/admin/feedback         admin list (filter by status / kind)
PATCH /api/admin/feedback/{id}   admin sets status + reply
DELETE /api/admin/feedback/{id}  admin removes spam
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import audit, current_member, require_admin
from lib.db import db
from models.admin import DeleteResult, Feedback, FeedbackIn, FeedbackReplyIn

router = APIRouter()


def _out(doc: dict) -> Feedback:
    for k in ("created_at", "replied_at"):
        v = doc.get(k)
        if isinstance(v, datetime) and v.tzinfo is None:
            doc[k] = v.replace(tzinfo=timezone.utc)
    return Feedback(**doc)


@router.post("/feedback", response_model=Feedback)
async def send_feedback(body: FeedbackIn, member: dict = Depends(current_member)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": member["user_id"],  # owner always from the session, never the body
        "user_email": member.get("email", ""),
        "user_name": member.get("name", ""),
        "kind": body.kind,
        "message": body.message.strip(),
        "status": "open",
        "admin_reply": "",
        "replied_at": None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.feedback.insert_one(dict(doc))
    return _out(doc)


@router.get("/feedback/mine", response_model=list[Feedback])
async def my_feedback(member: dict = Depends(current_member)):
    docs = await db.feedback.find({"user_id": member["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [_out(d) for d in docs]


@router.get("/admin/feedback", response_model=list[Feedback])
async def admin_feedback(status: str = "", kind: str = "", admin: dict = Depends(require_admin)):
    query: dict = {}
    if status:
        query["status"] = status
    if kind:
        query["kind"] = kind
    docs = await db.feedback.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_out(d) for d in docs]


@router.patch("/admin/feedback/{fid}", response_model=Feedback)
async def admin_reply_feedback(fid: str, body: FeedbackReplyIn, admin: dict = Depends(require_admin)):
    update: dict = {"status": body.status, "admin_reply": body.admin_reply.strip()}
    if body.admin_reply.strip():
        update["replied_at"] = datetime.now(timezone.utc)
    res = await db.feedback.update_one({"id": fid}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Feedback not found")
    doc = await db.feedback.find_one({"id": fid}, {"_id": 0})
    await audit(admin, "reply_feedback", f"{doc.get('user_email', '')} -> {body.status}")
    return _out(doc)


@router.delete("/admin/feedback/{fid}", response_model=DeleteResult)
async def admin_delete_feedback(fid: str, admin: dict = Depends(require_admin)):
    doc = await db.feedback.find_one({"id": fid}, {"_id": 0, "user_email": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Feedback not found")
    res = await db.feedback.delete_one({"id": fid})
    await audit(admin, "delete_feedback", doc.get("user_email", fid))
    return DeleteResult(deleted=res.deleted_count)
