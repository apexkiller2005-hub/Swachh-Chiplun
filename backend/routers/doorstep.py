"""Doorstep Garbage Vehicle — DEMO ONLY.

User side (any signed-in member, existing login):
  GET/PUT/DELETE /api/pickup/spot       saved pickup pin
  POST/DELETE    /api/pickup/request    "I have waste today" / cancel
  GET            /api/pickup/live       polled every 4 s: vehicle, ETA, status, last 30 alerts
Admin side (existing require_admin):
  /api/admin/doorstep/routes[...]       route tool + sample route
  /api/admin/doorstep/demo-users[...]   demo residents (no login, never in db.users)
  /api/admin/doorstep/state|trip/*      simulated vehicle control, live map, driver view
  /api/admin/demo-data[/clear]          danger zone (demo users + demo trips only)
Demo data lives in its own collections, so the real dashboards never count it.
"""

import math
import random
import uuid

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import audit, current_member, require_admin
from lib.db import db
from lib import doorstep as sim
from models.doorstep import (
    AdminDoorstepState,
    ClearDemoIn,
    DemoDataCounts,
    DemoUser,
    DemoUserIn,
    GenerateIn,
    LatLng,
    OkResponse,
    Pin,
    PinKeyIn,
    PickupAlert,
    PickupLive,
    PickupRequestIn,
    Route,
    RouteIn,
    RouteView,
    SpeedIn,
    Spot,
    SpotIn,
    TripStartIn,
    TripSummary,
    VehicleView,
    FeedItem,
)

router = APIRouter()

CATEGORY_KEYS = ["ewaste", "recyclable", "general", "organic", "hazardous", "biomedical"]


def _clean_types(types: list[str]) -> list[str]:
    out = [t for t in dict.fromkeys(types) if t in CATEGORY_KEYS]
    if not out:
        raise HTTPException(status_code=422, detail="Choose at least one waste type")
    return out


async def _route_doc(route_id: str) -> dict:
    doc = await db.demo_routes.find_one({"id": route_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Route not found")
    return doc


def _vehicle_view(trip: dict) -> VehicleView:
    pos = sim.vehicle_pos(trip)
    return VehicleView(
        lat=pos["lat"],
        lng=pos["lng"],
        state=trip["state"],
        mode=trip.get("mode", "auto"),
        speed=int(trip.get("speed", 1)),
        path=[LatLng(**p) for p in trip["path"]],
    )


# ================================================================ user side
@router.get("/pickup/spot", response_model=Spot | None)
async def get_spot(member: dict = Depends(current_member)):
    return await db.pickup_spots.find_one({"user_id": member["user_id"]}, {"_id": 0, "user_id": 0, "id": 0})


@router.put("/pickup/spot", response_model=Spot)
async def save_spot(body: SpotIn, member: dict = Depends(current_member)):
    await db.pickup_spots.update_one(
        {"user_id": member["user_id"]},
        {
            "$set": {**body.model_dump(), "label": body.label.strip() or "My pickup spot", "updated_at": sim.now()},
            "$setOnInsert": {"id": str(uuid.uuid4()), "user_id": member["user_id"], "request": None},
        },
        upsert=True,
    )
    return await db.pickup_spots.find_one({"user_id": member["user_id"]}, {"_id": 0, "user_id": 0, "id": 0})


@router.delete("/pickup/spot", response_model=OkResponse)
async def delete_spot(member: dict = Depends(current_member)):
    await db.pickup_spots.delete_one({"user_id": member["user_id"]})
    return OkResponse()


@router.post("/pickup/request", response_model=Spot)
async def request_pickup(body: PickupRequestIn, member: dict = Depends(current_member)):
    req = {
        "waste_types": _clean_types(body.waste_types),
        "note": body.note.strip(),
        "status": "requested",
        "created_at": sim.iso(sim.now()),
    }
    res = await db.pickup_spots.update_one({"user_id": member["user_id"]}, {"$set": {"request": req}})
    if res.matched_count == 0:
        raise HTTPException(status_code=409, detail="Save your pickup spot on the map first")
    # a new request during a running trip may be collected on this trip
    trip = await sim.active_trip()
    if trip and trip.get("state") in ("running", "paused"):
        await db.demo_trips.update_one(
            {"id": trip["id"]}, {"$unset": {f"pins.real_{member['user_id']}.collected_at": ""}}
        )
    return await db.pickup_spots.find_one({"user_id": member["user_id"]}, {"_id": 0, "user_id": 0, "id": 0})


@router.delete("/pickup/request", response_model=OkResponse)
async def cancel_request(member: dict = Depends(current_member)):
    await db.pickup_spots.update_one({"user_id": member["user_id"]}, {"$set": {"request": None}})
    return OkResponse()


@router.get("/pickup/live", response_model=PickupLive)
async def pickup_live(member: dict = Depends(current_member)):
    trip = await sim.advance(await sim.active_trip())
    spot = await db.pickup_spots.find_one({"user_id": member["user_id"]}, {"_id": 0, "user_id": 0, "id": 0})
    route_doc = None
    if trip:
        route_doc = await db.demo_routes.find_one({"id": trip["route_id"]}, {"_id": 0})
    if not route_doc:
        route_doc = await db.demo_routes.find_one({}, {"_id": 0}, sort=[("created_at", -1)])
    live = PickupLive(
        route=RouteView(**route_doc) if route_doc else None,
        spot=Spot(**spot) if spot else None,
        alerts=[
            PickupAlert(**{**a, "at": sim.iso(a["at"])})
            async for a in db.pickup_alerts.find({"user_id": member["user_id"]}, {"_id": 0}).sort("at", -1).limit(30)
        ],
    )
    show_vehicle = trip and trip.get("state") in ("running", "paused")
    if show_vehicle:
        live.vehicle = _vehicle_view(trip)
    if spot:
        req = spot.get("request") or {}
        live.status = req.get("status") or "waiting"
        if show_vehicle:
            d = sim.dist_m(sim.vehicle_pos(trip), spot)
            live.distance_m = int(round(d))
            live.eta_min = sim.eta_minutes(d, trip)
    return live


# ================================================================ admin: routes
async def _route_out(doc: dict) -> Route:
    name = ""
    if doc.get("facility_id"):
        f = await db.facilities.find_one({"id": doc["facility_id"]}, {"_id": 0, "name": 1})
        name = (f or {}).get("name", "")
    return Route(**{**doc, "facility_name": name})


@router.get("/admin/doorstep/routes", response_model=list[Route])
async def list_routes(admin: dict = Depends(require_admin)):
    return [await _route_out(d) async for d in db.demo_routes.find({}, {"_id": 0}).sort("created_at", -1)]


@router.post("/admin/doorstep/routes", response_model=Route)
async def create_route(body: RouteIn, admin: dict = Depends(require_admin)):
    doc = {**body.model_dump(), "id": str(uuid.uuid4()), "is_demo": False, "created_at": sim.now()}
    await db.demo_routes.insert_one(dict(doc))
    await audit(admin, "doorstep.route.create", body.name)
    return await _route_out(doc)


@router.put("/admin/doorstep/routes/{route_id}", response_model=Route)
async def update_route(route_id: str, body: RouteIn, admin: dict = Depends(require_admin)):
    await _route_doc(route_id)
    await db.demo_routes.update_one({"id": route_id}, {"$set": body.model_dump()})
    await audit(admin, "doorstep.route.update", body.name)
    return await _route_out(await _route_doc(route_id))


@router.delete("/admin/doorstep/routes/{route_id}", response_model=OkResponse)
async def delete_route(route_id: str, admin: dict = Depends(require_admin)):
    doc = await _route_doc(route_id)
    await db.demo_routes.delete_one({"id": route_id})
    await audit(admin, "doorstep.route.delete", doc["name"])
    return OkResponse()


SAMPLE_POINTS = [
    (17.5378, 73.5118),  # start: Markandi
    (17.5352, 73.5146),
    (17.5323, 73.5186),  # Chiplun market
    (17.5301, 73.5214),
    (17.5272, 73.5241),
    (17.5241, 73.5262),  # Bahadur Shaikh Naka
    (17.5206, 73.5291),  # end
]


@router.post("/admin/doorstep/routes/sample", response_model=Route)
async def sample_route(admin: dict = Depends(require_admin)):
    pts = [{"lat": a, "lng": b} for a, b in SAMPLE_POINTS]
    end = pts[-1]
    facility_id = None
    best = None
    async for f in db.facilities.find({"active": {"$ne": False}, "source": {"$ne": "osm"}}, {"_id": 0}):
        d = sim.dist_m(end, f)
        if best is None or d < best:
            best, facility_id = d, f["id"]
    doc = {
        "id": str(uuid.uuid4()),
        "name": "Demo — Markandi to Bahadur Shaikh Naka",
        "points": pts,
        "time_window": "07:00 – 09:00",
        "facility_id": facility_id,
        "is_demo": True,
        "created_at": sim.now(),
    }
    await db.demo_routes.insert_one(dict(doc))
    await audit(admin, "doorstep.route.sample", doc["name"])
    return await _route_out(doc)


# ================================================================ admin: demo users
def _demo_out(d: dict) -> DemoUser:
    return DemoUser(**d)


@router.get("/admin/doorstep/demo-users", response_model=list[DemoUser])
async def list_demo_users(admin: dict = Depends(require_admin)):
    return [_demo_out(d) async for d in db.demo_users.find({}, {"_id": 0}).sort("created_at", 1)]


async def _next_demo_number() -> int:
    n = 0
    async for d in db.demo_users.find({}, {"_id": 0, "number": 1}):
        n = max(n, int(d.get("number", 0)))
    return n + 1


@router.post("/admin/doorstep/demo-users", response_model=DemoUser)
async def add_demo_user(body: DemoUserIn, admin: dict = Depends(require_admin)):
    n = await _next_demo_number()
    doc = {
        **body.model_dump(),
        "waste_types": [t for t in body.waste_types if t in CATEGORY_KEYS] or ["general"],
        "name": body.name.strip() or f"Demo User {n}",
        "label": body.label.strip() or f"House {n}",
        "number": n,
        "id": str(uuid.uuid4()),
        "is_demo": True,
        "created_at": sim.now(),
    }
    await db.demo_users.insert_one(dict(doc))
    return _demo_out(doc)


@router.put("/admin/doorstep/demo-users/{demo_id}", response_model=DemoUser)
async def update_demo_user(demo_id: str, body: DemoUserIn, admin: dict = Depends(require_admin)):
    doc = await db.demo_users.find_one({"id": demo_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Demo user not found")
    upd = body.model_dump()
    upd["name"] = body.name.strip() or doc["name"]
    upd["label"] = body.label.strip() or doc.get("label", "")
    upd["waste_types"] = [t for t in body.waste_types if t in CATEGORY_KEYS] or doc.get("waste_types", ["general"])
    await db.demo_users.update_one({"id": demo_id}, {"$set": upd})
    return _demo_out({**doc, **upd})


@router.delete("/admin/doorstep/demo-users/{demo_id}", response_model=OkResponse)
async def delete_demo_user(demo_id: str, admin: dict = Depends(require_admin)):
    await db.demo_users.delete_one({"id": demo_id, "is_demo": True})
    return OkResponse()


@router.post("/admin/doorstep/demo-users/generate", response_model=list[DemoUser])
async def generate_demo_users(body: GenerateIn, admin: dict = Depends(require_admin)):
    route = await _route_doc(body.route_id)
    pts = route["points"]
    cum = sim.cumulative(pts)
    rnd = random.Random()
    n = await _next_demo_number()
    alerts = [300, 500, 1000]
    blocks = ["Sai Apartment", "Ganesh Niwas", "Shivaji Chawl", "Om Residency", "Laxmi Building", "Krishna Society"]
    docs = []
    for i in range(body.count):
        # spread evenly along the route (near the stops), 25–110 m to the side
        d = cum[-1] * (i + 0.5) / body.count
        p = sim.point_at(pts, cum, d)
        off_m = rnd.uniform(25, 110) * rnd.choice([-1, 1])
        ang = rnd.uniform(0, 3.14159 * 2)
        p = {
            "lat": p["lat"] + (off_m * math.sin(ang)) / 111_320,
            "lng": p["lng"] + (off_m * math.cos(ang)) / (111_320 * 0.954),
        }
        num = n + i
        docs.append(
            {
                "id": str(uuid.uuid4()),
                "number": num,
                "name": f"Demo User {num}",
                "label": f"{blocks[i % len(blocks)]}, flat {rnd.randint(1, 12)}",
                "lat": round(p["lat"], 6),
                "lng": round(p["lng"], 6),
                "alert_m": alerts[i % 3],
                "waste_types": rnd.sample(CATEGORY_KEYS, rnd.choice([1, 1, 2, 3])),
                "has_waste": i % 6 != 5,  # a few residents have nothing today
                "is_demo": True,
                "created_at": sim.now(),
            }
        )
    if docs:
        await db.demo_users.insert_many([dict(d) for d in docs])
    await audit(admin, "doorstep.demo_users.generate", f"{len(docs)} along {route['name']}")
    return [_demo_out(d) for d in docs]


# ================================================================ admin: simulation
async def _require_trip(active_only: bool = True) -> dict:
    trip = await sim.active_trip()
    if not trip or (active_only and trip.get("state") not in ("running", "paused")):
        raise HTTPException(status_code=409, detail="No demo trip is running. Press Start first.")
    return trip


def _pin_out(p: dict, trip: dict | None, pos: dict | None) -> Pin:
    d = sim.dist_m(pos, p) if pos else None
    return Pin(
        key=p["key"],
        kind=p["kind"],
        name=p["name"],
        label=p["label"],
        lat=p["lat"],
        lng=p["lng"],
        alert_m=p["alert_m"],
        waste_types=p["waste_types"],
        status=sim.pin_status(p, trip),
        distance_m=int(round(d)) if d is not None else None,
        eta_min=sim.eta_minutes(d, trip) if (d is not None and trip) else None,
    )


@router.get("/admin/doorstep/state", response_model=AdminDoorstepState)
async def admin_state(admin: dict = Depends(require_admin)):
    trip = await sim.advance(await sim.active_trip())
    live = bool(trip and trip.get("state") in ("running", "paused"))
    pos = sim.vehicle_pos(trip) if live else None
    raw = await sim.all_pins()
    pins = [_pin_out(p, trip, pos) for p in raw]  # finished trip keeps its final statuses
    out = AdminDoorstepState(pins=pins)
    if trip:
        out.trip_id = trip["id"]
        out.route_id = trip["route_id"]
        out.feed = [FeedItem(**f) for f in reversed(trip.get("feed", []))]
        if trip.get("summary") and trip["state"] in ("finished", "stopped"):
            out.summary = TripSummary(**trip["summary"])
    if live:
        out.vehicle = _vehicle_view(trip)
        total = trip["cum"][-1] or 1
        done, _ = sim.project(trip["path"], trip["cum"], pos)
        out.progress_pct = int(min(100, done / total * 100))
        ahead = []
        for p, view in zip(raw, pins):
            if view.status in ("requested", "near") and p.get("has_waste"):
                along, off = sim.project(trip["path"], trip["cum"], p)
                if off <= sim.ON_ROUTE_M and along >= done - 30:
                    ahead.append((along, view))
        out.next_stops = [v for _, v in sorted(ahead, key=lambda x: x[0])][:8]
    return out


@router.post("/admin/doorstep/trip/start", response_model=OkResponse)
async def start_trip(body: TripStartIn, admin: dict = Depends(require_admin)):
    route = await _route_doc(body.route_id)
    old = await sim.active_trip()
    if old and old.get("state") in ("running", "paused"):
        await sim.finish_trip(old, "stopped")
    path = route["points"]
    if body.start:
        path = [body.start.model_dump()] + path
    facility_name = (await _route_out(route)).facility_name
    trip = {
        "id": str(uuid.uuid4()),
        "route_id": route["id"],
        "route_name": route["name"],
        "facility_name": facility_name,
        "path": path,
        "cum": sim.cumulative(path),
        "speed": body.speed,
        "state": "running",
        "mode": "auto",
        "elapsed_s": 0.0,
        "resumed_at": sim.now(),
        "manual_pos": None,
        "pins": {},
        "feed": [{"text": f"Trip started on {route['name']} at {body.speed}x speed", "at": sim.iso(sim.now())}],
        "is_demo": True,
        "created_at": sim.now(),
    }
    await db.demo_trips.insert_one(dict(trip))
    # real requests left at "near" from an earlier trip wait again
    await db.pickup_spots.update_many({"request.status": "near"}, {"$set": {"request.status": "requested"}})
    await audit(admin, "doorstep.trip.start", route["name"])
    return OkResponse()


def _freeze(trip: dict) -> float:
    return sim.progress_m(trip) / sim.speed_ms(trip)


@router.post("/admin/doorstep/trip/pause", response_model=OkResponse)
async def pause_trip(admin: dict = Depends(require_admin)):
    trip = await _require_trip()
    if trip["state"] == "running":
        await db.demo_trips.update_one(
            {"id": trip["id"]}, {"$set": {"state": "paused", "elapsed_s": _freeze(trip), "resumed_at": None}}
        )
        await sim.push_feed(trip["id"], "Vehicle paused")
    return OkResponse()


@router.post("/admin/doorstep/trip/resume", response_model=OkResponse)
async def resume_trip(admin: dict = Depends(require_admin)):
    trip = await _require_trip()
    elapsed = _freeze(trip)
    if trip.get("mode") == "manual" and trip.get("manual_pos"):
        along, _ = sim.project(trip["path"], trip["cum"], trip["manual_pos"])
        elapsed = along / sim.speed_ms(trip)
    await db.demo_trips.update_one(
        {"id": trip["id"]},
        {"$set": {"state": "running", "mode": "auto", "manual_pos": None, "elapsed_s": elapsed, "resumed_at": sim.now()}},
    )
    await sim.push_feed(trip["id"], "Vehicle resumed (auto mode)")
    return OkResponse()


@router.post("/admin/doorstep/trip/stop", response_model=OkResponse)
async def stop_trip(admin: dict = Depends(require_admin)):
    trip = await _require_trip()
    await sim.finish_trip(trip, "stopped")
    await audit(admin, "doorstep.trip.stop", trip.get("route_name", ""))
    return OkResponse()


@router.put("/admin/doorstep/trip/speed", response_model=OkResponse)
async def set_speed(body: SpeedIn, admin: dict = Depends(require_admin)):
    trip = await _require_trip()
    travelled = sim.progress_m(trip)
    upd = {"speed": body.speed, "elapsed_s": travelled / (sim.BASE_SPEED_MS * body.speed)}
    if trip["state"] == "running" and trip.get("mode") == "auto":
        upd["resumed_at"] = sim.now()
    await db.demo_trips.update_one({"id": trip["id"]}, {"$set": upd})
    await sim.push_feed(trip["id"], f"Speed changed to {body.speed}x")
    return OkResponse()


@router.put("/admin/doorstep/trip/position", response_model=OkResponse)
async def manual_position(body: LatLng, admin: dict = Depends(require_admin)):
    """Manual mode: the admin drags the vehicle marker."""
    trip = await _require_trip()
    first = trip.get("mode") != "manual"
    await db.demo_trips.update_one(
        {"id": trip["id"]},
        {"$set": {"mode": "manual", "manual_pos": body.model_dump(), "elapsed_s": _freeze(trip), "resumed_at": None}},
    )
    if first:
        await sim.push_feed(trip["id"], "Manual mode: vehicle moved by admin")
    await sim.advance(await sim.active_trip())
    return OkResponse()


@router.post("/admin/doorstep/trip/place-near", response_model=OkResponse)
async def place_near(body: PinKeyIn, admin: dict = Depends(require_admin)):
    trip = await _require_trip()
    pin = next((p for p in await sim.all_pins() if p["key"] == body.pin_key), None)
    if not pin:
        raise HTTPException(status_code=404, detail="User not found")
    along, off = sim.project(trip["path"], trip["cum"], pin)
    if off <= sim.ON_ROUTE_M and along > 0:
        # jump along the route to ~400 m before the user, keep driving automatically
        target = max(0.0, along - 400)
        upd = {"mode": "auto", "manual_pos": None, "elapsed_s": target / sim.speed_ms(trip)}
        if trip["state"] == "running":
            upd["resumed_at"] = sim.now()
    else:
        # user is far from the route: park the vehicle ~400 m north of them (manual mode)
        upd = {
            "mode": "manual",
            "manual_pos": {"lat": pin["lat"] + 400 / 111_320, "lng": pin["lng"]},
            "elapsed_s": _freeze(trip),
            "resumed_at": None,
        }
    await db.demo_trips.update_one({"id": trip["id"]}, {"$set": upd})
    await sim.push_feed(trip["id"], f"Vehicle placed about 400 m from {pin['name']}")
    await sim.advance(await sim.active_trip())
    return OkResponse()


@router.post("/admin/doorstep/trip/collect", response_model=OkResponse)
async def driver_collect(body: PinKeyIn, admin: dict = Depends(require_admin)):
    trip = await _require_trip()
    pin = next((p for p in await sim.all_pins() if p["key"] == body.pin_key), None)
    if not pin:
        raise HTTPException(status_code=404, detail="User not found")
    await sim.mark_collected(trip, pin, by="driver")
    return OkResponse()


# ================================================================ admin: danger zone
@router.get("/admin/demo-data", response_model=DemoDataCounts)
async def demo_data_counts(admin: dict = Depends(require_admin)):
    return DemoDataCounts(
        demo_users=await db.demo_users.count_documents({"is_demo": True}),
        demo_trips=await db.demo_trips.count_documents({"is_demo": True}),
    )


@router.post("/admin/demo-data/clear", response_model=DemoDataCounts)
async def clear_demo_data(body: ClearDemoIn, admin: dict = Depends(require_admin)):
    if body.phrase.strip() != "CLEAR DEMO" or not body.confirm:
        raise HTTPException(status_code=422, detail='Type CLEAR DEMO exactly and tick the confirmation')
    users = await db.demo_users.delete_many({"is_demo": True})
    trips = await db.demo_trips.delete_many({"is_demo": True})
    await audit(admin, "demo_data.clear", f"{users.deleted_count} demo users, {trips.deleted_count} demo trips")
    return DemoDataCounts(demo_users=users.deleted_count, demo_trips=trips.deleted_count)
