"""Doorstep Garbage Vehicle — DEMO ONLY simulation engine.

No background job: the vehicle position is computed from the trip's clock (start time,
speed, pauses) every time a page polls, and pin statuses/alerts are advanced then.
Each pin is alerted/collected at most once per trip (atomic conditional updates).
"""

import math
import uuid
from datetime import datetime, timezone

from lib.db import db

BASE_SPEED_MS = 20_000 / 3600  # simulated truck: 20 km/h, multiplied by the 1x/5x/10x demo speed
COLLECT_M = 60  # vehicle this close to a pin with waste -> collected
ON_ROUTE_M = 150  # pins further than this from the path are never auto-collected
FEED_MAX = 60


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str:
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def dist_m(a: dict, b: dict) -> float:
    r = 6371000.0
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dp, dl = p2 - p1, math.radians(b["lng"] - a["lng"])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def cumulative(path: list[dict]) -> list[float]:
    out = [0.0]
    for a, b in zip(path, path[1:]):
        out.append(out[-1] + dist_m(a, b))
    return out


def point_at(path: list[dict], cum: list[float], d: float) -> dict:
    if d <= 0:
        return dict(path[0])
    if d >= cum[-1]:
        return dict(path[-1])
    for i in range(1, len(cum)):
        if cum[i] >= d:
            seg = cum[i] - cum[i - 1] or 1
            t = (d - cum[i - 1]) / seg
            a, b = path[i - 1], path[i]
            return {"lat": a["lat"] + (b["lat"] - a["lat"]) * t, "lng": a["lng"] + (b["lng"] - a["lng"]) * t}
    return dict(path[-1])


def project(path: list[dict], cum: list[float], p: dict) -> tuple[float, float]:
    """(distance along path of the closest point, distance from p to the path) in metres."""
    best = (0.0, float("inf"))
    k = math.cos(math.radians(p["lat"]))
    for i in range(1, len(path)):
        a, b = path[i - 1], path[i]
        ax, ay = a["lng"] * k, a["lat"]
        bx, by = b["lng"] * k, b["lat"]
        px, py = p["lng"] * k, p["lat"]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
        q = {"lat": a["lat"] + (b["lat"] - a["lat"]) * t, "lng": a["lng"] + (b["lng"] - a["lng"]) * t}
        off = dist_m(p, q)
        if off < best[1]:
            best = (cum[i - 1] + (cum[i] - cum[i - 1]) * t, off)
    return best


def speed_ms(trip: dict) -> float:
    return BASE_SPEED_MS * int(trip.get("speed", 1))


def eta_minutes(distance: float, trip: dict) -> int:
    return max(1, math.ceil(distance / speed_ms(trip) / 60))


def progress_m(trip: dict, at: datetime | None = None) -> float:
    """Distance travelled along the path (auto mode) from the trip clock."""
    elapsed = float(trip.get("elapsed_s", 0.0))
    if trip.get("state") == "running" and trip.get("mode") == "auto" and trip.get("resumed_at"):
        resumed = trip["resumed_at"]
        if resumed.tzinfo is None:
            resumed = resumed.replace(tzinfo=timezone.utc)
        elapsed += ((at or now()) - resumed).total_seconds()
    return elapsed * speed_ms(trip)


def vehicle_pos(trip: dict) -> dict:
    if trip.get("mode") == "manual" and trip.get("manual_pos"):
        return trip["manual_pos"]
    return point_at(trip["path"], trip["cum"], progress_m(trip))


def minutes_text(minutes: int) -> str:
    return f"{minutes} minute" if minutes == 1 else f"{minutes} minutes"


def alert_texts(minutes: int) -> tuple[str, str]:
    return (
        f"The garbage vehicle is about {minutes_text(minutes)} away. Please bring your waste down.",
        f"कचरा गाडी सुमारे {minutes} मिनिटांत पोहोचेल. कृपया तुमचा कचरा खाली आणा.",
    )


async def active_trip() -> dict | None:
    """The latest demo trip (running, paused, or just finished/stopped)."""
    return await db.demo_trips.find_one({}, {"_id": 0}, sort=[("created_at", -1)])


async def all_pins() -> list[dict]:
    """Demo users + real users who saved a spot, as raw pin dicts."""
    pins: list[dict] = []
    async for u in db.demo_users.find({}, {"_id": 0}).sort("created_at", 1):
        pins.append(
            {
                "key": f"demo_{u['id']}",
                "kind": "demo",
                "name": u["name"],
                "label": u.get("label", ""),
                "lat": u["lat"],
                "lng": u["lng"],
                "alert_m": u.get("alert_m", 500),
                "alerts_on": True,
                "waste_types": u.get("waste_types", []),
                "has_waste": u.get("has_waste", True),
            }
        )
    spots = await db.pickup_spots.find({}, {"_id": 0}).to_list(2000)
    names = {
        u["user_id"]: (u.get("name") or u.get("email") or "Real user")
        async for u in db.users.find({"user_id": {"$in": [s["user_id"] for s in spots]}}, {"_id": 0})
    }
    for s in spots:
        req = s.get("request") or {}
        pins.append(
            {
                "key": f"real_{s['user_id']}",
                "kind": "real",
                "user_id": s["user_id"],
                "name": names.get(s["user_id"], "Real user"),
                "label": s.get("label", ""),
                "lat": s["lat"],
                "lng": s["lng"],
                "alert_m": s.get("alert_m", 500),
                "alerts_on": s.get("alerts_on", True),
                "waste_types": req.get("waste_types", []),
                "has_waste": bool(req) and req.get("status") != "collected",
                "req_status": req.get("status"),
            }
        )
    return pins


def pin_status(pin: dict, trip: dict | None) -> str:
    st = ((trip or {}).get("pins") or {}).get(pin["key"], {})
    if st.get("collected_at"):
        return "collected"
    if pin["kind"] == "real":
        rs = pin.get("req_status")
        if rs == "collected":
            return "collected"
        if st.get("alerted_at") or rs == "near":
            return "near"
        return "requested" if rs else "waiting"
    if not pin.get("has_waste"):
        return "waiting"  # nothing to collect today
    return "near" if st.get("alerted_at") else "requested"


async def push_feed(trip_id: str, text: str) -> None:
    await db.demo_trips.update_one(
        {"id": trip_id},
        {"$push": {"feed": {"$each": [{"text": text, "at": iso(now())}], "$slice": -FEED_MAX}}},
    )


async def mark_collected(trip: dict, pin: dict, by: str = "auto") -> bool:
    res = await db.demo_trips.update_one(
        {"id": trip["id"], f"pins.{pin['key']}.collected_at": {"$exists": False}},
        {"$set": {f"pins.{pin['key']}.collected_at": iso(now())}},
    )
    if res.modified_count != 1:
        return False
    if pin["kind"] == "real":
        await db.pickup_spots.update_one(
            {"user_id": pin["user_id"], "request": {"$ne": None}}, {"$set": {"request.status": "collected"}}
        )
    how = "by the driver" if by == "driver" else "automatically"
    await push_feed(trip["id"], f"{pin['name']} — waste collected ({how})")
    return True


async def advance(trip: dict | None) -> dict | None:
    """Move the simulation forward to 'now': alerts, collections, end of trip."""
    if not trip or trip.get("state") not in ("running", "paused"):
        return trip
    pos = vehicle_pos(trip)
    pins = await all_pins()
    state = trip.get("pins") or {}
    auto = trip.get("mode") != "manual"
    travelled = progress_m(trip)
    for pin in pins:
        d = dist_m(pos, pin)
        along, off = project(trip["path"], trip["cum"], pin)
        # the vehicle moves up to ~170 m between polls at 10x: anything on the route it has
        # already passed counts as reached (alert first, then collect)
        passed = auto and off <= ON_ROUTE_M and along <= travelled
        st = state.get(pin["key"], {})
        if pin["alerts_on"] and (d <= pin["alert_m"] or passed) and not st.get("alerted_at") and not st.get("collected_at"):
            res = await db.demo_trips.update_one(
                {"id": trip["id"], f"pins.{pin['key']}.alerted_at": {"$exists": False}},
                {"$set": {f"pins.{pin['key']}.alerted_at": iso(now())}},
            )
            if res.modified_count == 1:
                minutes = eta_minutes(d, trip)
                label = "Real user " + pin["name"] if pin["kind"] == "real" else pin["name"]
                await push_feed(trip["id"], f"{label} alerted at {int(round(d))} m, about {minutes_text(minutes)} away")
                if pin["kind"] == "real":
                    en, mr = alert_texts(minutes)
                    await db.pickup_alerts.insert_one(
                        {
                            "id": str(uuid.uuid4()),
                            "user_id": pin["user_id"],
                            "trip_id": trip["id"],
                            "text_en": en,
                            "text_mr": mr,
                            "distance_m": int(round(d)),
                            "eta_min": minutes,
                            "at": now(),
                        }
                    )
                    await db.pickup_spots.update_one(
                        {"user_id": pin["user_id"], "request.status": "requested"},
                        {"$set": {"request.status": "near"}},
                    )
        if pin["has_waste"] and (d <= COLLECT_M or passed) and not st.get("collected_at"):
            await mark_collected(trip, pin)
    if trip.get("mode") == "auto" and progress_m(trip) >= trip["cum"][-1]:
        await finish_trip(trip, "finished")
    return await db.demo_trips.find_one({"id": trip["id"]}, {"_id": 0})


async def finish_trip(trip: dict, state: str) -> None:
    fresh = await db.demo_trips.find_one({"id": trip["id"]}, {"_id": 0}) or trip
    if fresh.get("state") in ("finished", "stopped"):
        return
    pins_state = fresh.get("pins") or {}
    collected = sum(1 for v in pins_state.values() if v.get("collected_at"))
    alerts = sum(1 for v in pins_state.values() if v.get("alerted_at"))
    started = fresh.get("created_at")
    if started is not None and started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    travelled = min(progress_m(fresh), fresh["cum"][-1]) if state == "finished" else progress_m(fresh)
    summary = {
        "facility_name": fresh.get("facility_name") or "the drop facility",
        "distance_km": round(min(travelled, fresh["cum"][-1]) / 1000, 2),
        "minutes": max(1, int(((now() - started).total_seconds() if started else 0) // 60)),
        "collected": collected,
        "alerts": alerts,
        "stops": max(0, len(fresh.get("path", [])) - 2),
    }
    res = await db.demo_trips.update_one(
        {"id": fresh["id"], "state": {"$in": ["running", "paused"]}},
        {
            "$set": {
                "state": state,
                "elapsed_s": progress_m(fresh) / speed_ms(fresh),
                "resumed_at": None,
                "summary": summary,
                "ended_at": now(),
            }
        },
    )
    if res.modified_count == 1:
        if state == "finished":
            await push_feed(fresh["id"], f"Trip complete. Dropped at facility {summary['facility_name']}.")
        else:
            await push_feed(fresh["id"], "Trip stopped by admin.")
