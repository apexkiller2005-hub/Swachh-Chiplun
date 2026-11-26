"""Doorstep Garbage Vehicle — DEMO ONLY. Mirrors: frontend/src/lib/doorstepTypes.ts"""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

AlertM = Literal[300, 500, 1000]
PinStatus = Literal["waiting", "requested", "near", "collected"]


class LatLng(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


# ---------------------------------------------------------------- user side
class SpotIn(BaseModel):
    label: str = Field(default="My pickup spot", max_length=80)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    alert_m: AlertM = 500
    alerts_on: bool = True


class PickupRequestIn(BaseModel):
    waste_types: List[str] = Field(min_length=1, max_length=6)
    note: str = Field(default="", max_length=200)


class PickupRequest(BaseModel):
    waste_types: List[str]
    note: str = ""
    status: Literal["requested", "near", "collected"]
    created_at: str


class Spot(BaseModel):
    label: str
    lat: float
    lng: float
    alert_m: int
    alerts_on: bool
    request: Optional[PickupRequest] = None


class PickupAlert(BaseModel):
    id: str
    text_en: str
    text_mr: str
    distance_m: int
    eta_min: int
    at: str


class RouteView(BaseModel):
    id: str
    name: str
    points: List[LatLng]
    is_demo: bool = False


class VehicleView(BaseModel):
    lat: float
    lng: float
    state: Literal["running", "paused", "stopped", "finished"]
    mode: Literal["auto", "manual"]
    speed: int
    path: List[LatLng]


class PickupLive(BaseModel):
    route: Optional[RouteView] = None
    vehicle: Optional[VehicleView] = None
    spot: Optional[Spot] = None
    status: PinStatus = "waiting"
    distance_m: Optional[int] = None
    eta_min: Optional[int] = None
    alerts: List[PickupAlert] = []


class OkResponse(BaseModel):
    ok: bool = True


# ---------------------------------------------------------------- admin side
class RouteIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    points: List[LatLng] = Field(min_length=2, max_length=60)  # start, stops in order, end
    time_window: str = Field(default="", max_length=40)
    facility_id: Optional[str] = None


class Route(BaseModel):
    id: str
    name: str
    points: List[LatLng]
    time_window: str = ""
    facility_id: Optional[str] = None
    facility_name: str = ""
    is_demo: bool = False


class DemoUserIn(BaseModel):
    name: str = Field(default="", max_length=60)
    label: str = Field(default="", max_length=80)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    alert_m: AlertM = 500
    waste_types: List[str] = []
    has_waste: bool = True


class DemoUser(BaseModel):
    id: str
    name: str
    label: str
    lat: float
    lng: float
    alert_m: int
    waste_types: List[str]
    has_waste: bool
    is_demo: bool = True


class GenerateIn(BaseModel):
    route_id: str
    count: int = Field(default=12, ge=1, le=15)


class TripStartIn(BaseModel):
    route_id: str
    speed: Literal[1, 5, 10] = 5
    start: Optional[LatLng] = None


class SpeedIn(BaseModel):
    speed: Literal[1, 5, 10]


class PinKeyIn(BaseModel):
    pin_key: str


class Pin(BaseModel):
    key: str
    kind: Literal["demo", "real"]
    name: str
    label: str
    lat: float
    lng: float
    alert_m: int
    waste_types: List[str]
    status: PinStatus
    distance_m: Optional[int] = None
    eta_min: Optional[int] = None


class FeedItem(BaseModel):
    text: str
    at: str


class TripSummary(BaseModel):
    facility_name: str
    distance_km: float
    minutes: int
    collected: int
    alerts: int
    stops: int


class AdminDoorstepState(BaseModel):
    trip_id: Optional[str] = None
    route_id: Optional[str] = None
    vehicle: Optional[VehicleView] = None
    progress_pct: int = 0
    pins: List[Pin] = []
    feed: List[FeedItem] = []
    next_stops: List[Pin] = []
    summary: Optional[TripSummary] = None


class DemoDataCounts(BaseModel):
    demo_users: int
    demo_trips: int


class ClearDemoIn(BaseModel):
    phrase: str
    confirm: bool
