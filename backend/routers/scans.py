"""Citizen scan history + eco-dashboard stats: /api/scans, /api/scans/{id}, /api/stats.

Every query is scoped to the signed-in citizen (user_id from the session).
The admin sees everyone's records through /api/admin/scans.
"""

from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import current_member
from lib.db import db
from models.waste import Classification, ScanDeleteResponse, StatsResponse

router = APIRouter()


@router.get("/scans", response_model=list[Classification])
async def list_scans(limit: int = Query(default=50, ge=1, le=200), member: dict = Depends(current_member)):
    docs = (
        await db.scans.find({"user_id": member["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    )
    for doc in docs:  # motor hands back naive datetimes — normalise to aware UTC
        created = doc.get("created_at")
        if created is not None and created.tzinfo is None:
            doc["created_at"] = created.replace(tzinfo=timezone.utc)
    return [Classification(**doc) for doc in docs]


@router.delete("/scans/{scan_id}", response_model=ScanDeleteResponse)
async def delete_scan(scan_id: str, member: dict = Depends(current_member)):
    # owner-scoped: another citizen's record answers 404, same as "not found"
    result = await db.scans.delete_one({"id": scan_id, "user_id": member["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Scan not found")
    return ScanDeleteResponse(deleted=result.deleted_count)


@router.get("/stats", response_model=StatsResponse)
async def get_stats(member: dict = Depends(current_member)):
    docs = await db.scans.find(
        {"user_id": member["user_id"]}, {"_id": 0, "category": 1, "eco_points": 1}
    ).to_list(2000)
    by_category: dict[str, int] = {}
    eco_points = 0
    for doc in docs:
        cat = doc.get("category", "general")
        by_category[cat] = by_category.get(cat, 0) + 1
        eco_points += doc.get("eco_points", 0)
    return StatsResponse(total_scans=len(docs), eco_points=eco_points, by_category=by_category)
