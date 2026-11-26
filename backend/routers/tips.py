"""Admin-managed disposal tips / knowledge content (Mongo `tips`).

Active tips are fed to the AI assistant as extra knowledge (see routers/chat.py).
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import audit, require_admin
from lib.db import db
from models.admin import DeleteResult, Tip, TipIn

router = APIRouter()


def _out(doc: dict) -> Tip:
    if isinstance(doc.get("updated_at"), datetime) and doc["updated_at"].tzinfo is None:
        doc["updated_at"] = doc["updated_at"].replace(tzinfo=timezone.utc)
    return Tip(**doc)


@router.get("/admin/tips", response_model=list[Tip])
async def list_tips(admin: dict = Depends(require_admin)):
    return [_out(d) for d in await db.tips.find({}, {"_id": 0}).sort("updated_at", -1).to_list(500)]


@router.post("/admin/tips", response_model=Tip)
async def create_tip(body: TipIn, admin: dict = Depends(require_admin)):
    doc = {**body.model_dump(), "id": f"tip-{uuid.uuid4().hex[:10]}", "updated_at": datetime.now(timezone.utc)}
    await db.tips.insert_one(dict(doc))
    await audit(admin, "create_tip", body.title)
    return _out(doc)


@router.put("/admin/tips/{tid}", response_model=Tip)
async def update_tip(tid: str, body: TipIn, admin: dict = Depends(require_admin)):
    res = await db.tips.update_one({"id": tid}, {"$set": {**body.model_dump(), "updated_at": datetime.now(timezone.utc)}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tip not found")
    await audit(admin, "update_tip", body.title)
    return _out(await db.tips.find_one({"id": tid}, {"_id": 0}))


@router.delete("/admin/tips/{tid}", response_model=DeleteResult)
async def delete_tip(tid: str, admin: dict = Depends(require_admin)):
    doc = await db.tips.find_one({"id": tid}, {"_id": 0, "title": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Tip not found")
    res = await db.tips.delete_one({"id": tid})
    await audit(admin, "delete_tip", doc["title"])
    return DeleteResult(deleted=res.deleted_count)
