"""GET /api/facilities — category-based facility finder (curated Chiplun seed + live OpenStreetMap)."""

import logging
import math
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends

from lib.auth import current_member
from lib.db import db
from models.waste import Facility

router = APIRouter()
logger = logging.getLogger(__name__)

CHIPLUN_LAT = 17.5323
CHIPLUN_LNG = 73.5186
SEARCH_RADIUS_M = 25_000
CACHE_TTL = timedelta(hours=24)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_QUERY = """[out:json][timeout:15];
(
  node["amenity"="recycling"](around:{radius},{lat},{lng});
  way["amenity"="recycling"](around:{radius},{lat},{lng});
  node["shop"="second_hand"](around:{radius},{lat},{lng});
  node["name"~"scrap|kabadi|kabaadi|recycl|e-?waste",i](around:{radius},{lat},{lng});
);
out center tags 40;"""


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def osm_categories(tags: dict, name: str) -> list[str]:
    cats: list[str] = []
    blob = " ".join(str(v) for v in tags.values()).lower() + " " + name.lower()
    if (
        tags.get("recycling:e_waste") == "yes"
        or tags.get("recycling:electronics") == "yes"
        or tags.get("recycling:batteries") == "yes"
        or "e-waste" in blob
        or "ewaste" in blob
    ):
        cats.append("ewaste")
    if tags.get("shop") == "second_hand" or "scrap" in blob or "kabadi" in blob:
        cats.extend(["recyclable", "ewaste"])
    if any(tags.get(f"recycling:{m}") == "yes" for m in ("glass", "paper", "cardboard", "metal", "plastic", "cans")):
        cats.append("recyclable")
    if not cats:
        cats.append("general")
    seen: set[str] = set()
    return [c for c in cats if not (c in seen or seen.add(c))]


def map_osm_element(el: dict) -> dict | None:
    tags = el.get("tags", {})
    name = tags.get("name") or "Recycling / collection point"
    loc = el.get("center") or el
    lat, lng = loc.get("lat"), loc.get("lon")
    if lat is None or lng is None:
        return None
    address_parts = [
        tags.get(f"addr:{k}") for k in ("house_number", "street", "suburb", "city", "town", "village", "postcode")
    ]
    address = ", ".join(p for p in address_parts if p) or "Mapped on OpenStreetMap"
    return {
        "id": f"osm-{el.get('type', 'n')}-{el.get('id', 0)}",
        "name": name,
        "categories": osm_categories(tags, name),
        "lat": float(lat),
        "lng": float(lng),
        "address": address,
        "phone": tags.get("phone") or tags.get("contact:phone"),
        "hours": tags.get("opening_hours"),
        "accepts": [v.replace("recycling:", "") for k, v in tags.items() if k.startswith("recycling:") and v == "yes"],
        "source": "osm",
    }


async def refresh_osm(lat: float, lng: float) -> None:
    """Pull live OSM points around (lat, lng); no-op if the cache is fresh or OSM is unreachable."""
    latest = await db.facilities.find_one({"source": "osm"}, sort=[("fetched_at", -1)])
    if latest and latest.get("fetched_at"):
        fetched = latest["fetched_at"]
        if fetched.tzinfo is None:
            fetched = fetched.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - fetched < CACHE_TTL:
            return
    try:
        query = OVERPASS_QUERY.format(radius=SEARCH_RADIUS_M, lat=lat, lng=lng)
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(OVERPASS_URL, content=f"data={query}", headers={"Content-Type": "text/plain"})
            res.raise_for_status()
            elements = res.json().get("elements", [])
        if docs:
            now = datetime.now(timezone.utc)
            for el in elements:
                doc = map_osm_element(el)
                if doc:
                    doc["fetched_at"] = now
                    # upsert by id — never a bulk wipe of the collection in app code
                    # $set keeps an admin's activate/deactivate choice on refreshed points
                    await db.facilities.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
            # evict only stale OSM cache entries older than a week (narrow, age-filtered)
            stale_cutoff = now - timedelta(days=7)
            await db.facilities.delete_many({"source": "osm", "fetched_at": {"$lt": stale_cutoff}})
            logger.info("refresh_osm: stored %d OSM facilities", len(docs))
    except Exception as exc:
        logger.warning("refresh_osm failed (serving seed data only): %s", exc)


async def find_facilities(
    category: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    live: bool = True,
) -> list[dict]:
    lat = CHIPLUN_LAT if lat is None else lat
    lng = CHIPLUN_LNG if lng is None else lng
    if live:
        await refresh_osm(lat, lng)

    # deactivated facilities (admin panel) are hidden from citizens and the chat agent
    docs = await db.facilities.find({"active": {"$ne": False}}, {"_id": 0}).to_list(500)
    out = []
    for doc in docs:
        if category and category not in doc.get("categories", []):
            continue
        doc["distance_m"] = round(haversine_m(lat, lng, doc["lat"], doc["lng"]))
        out.append(doc)
    out.sort(key=lambda d: d["distance_m"])
    return out[:40]


@router.get("/facilities", response_model=list[Facility])
async def get_facilities(
    lat: float | None = None,
    lng: float | None = None,
    category: str | None = None,
    live: bool = True,
    member: dict = Depends(current_member),
):
    return [Facility(**doc) for doc in await find_facilities(category=category, lat=lat, lng=lng, live=live)]