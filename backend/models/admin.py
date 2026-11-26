"""Pydantic models for sign-in roles, feedback and the admin panel.

Hand-written TS mirrors live in frontend/src/lib/adminTypes.ts — keep in sync.
"""

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from models.waste import Classification

FeedbackKind = Literal["complaint", "suggestion", "facility_issue", "other"]
FeedbackStatus = Literal["open", "in_progress", "resolved"]


class Me(BaseModel):
    user_id: str
    email: str = ""
    name: str = ""
    role: str


class UserRow(BaseModel):
    user_id: str
    email: str = ""
    name: str = ""
    role: str
    created_at: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    scan_count: int = 0
    feedback_count: int = 0


class UsersResponse(BaseModel):
    roles: List[str]
    users: List[UserRow]


class AdminGate(BaseModel):
    admin_email: str
    passcode_required: bool
    unlocked: bool
    locked_until: Optional[datetime] = None


class PasscodeIn(BaseModel):
    passcode: str = Field(min_length=1, max_length=200)


class TipIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    body: str = Field(min_length=2, max_length=2000)
    category: str = ""  # optional category key the tip belongs to
    active: bool = True


class Tip(TipIn):
    id: str
    updated_at: Optional[datetime] = None


class GuidelineIn(BaseModel):
    key: str = Field(min_length=2, max_length=30, pattern=r"^[a-z][a-z0-9_]*$")
    name: str = Field(min_length=2, max_length=60)
    description: str = Field(default="", max_length=600)
    examples: List[str] = []
    disposal_steps: List[str] = []
    hazards: List[str] = []
    eco_points: int = Field(default=10, ge=0, le=100)
    color: str = Field(default="#64748B", pattern=r"^#[0-9A-Fa-f]{6}$")
    active: bool = True


class Guideline(GuidelineIn):
    id: str
    updated_at: Optional[datetime] = None
    facility_count: int = 0
    scan_count: int = 0


class FacilityIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    categories: List[str] = Field(min_length=1)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    address: str = ""
    phone: Optional[str] = None
    hours: Optional[str] = None
    accepts: List[str] = []
    active: bool = True
    type: str = Field(default="", max_length=60)  # e.g. E-waste centre, Scrap dealer


class AdminFacility(FacilityIn):
    id: str
    source: str = "admin"


class ActiveIn(BaseModel):
    active: bool


class FeedbackIn(BaseModel):
    kind: FeedbackKind = "complaint"
    message: str = Field(min_length=3, max_length=2000)


class Feedback(BaseModel):
    id: str
    user_id: str
    user_email: str = ""
    user_name: str = ""
    kind: FeedbackKind
    message: str
    status: FeedbackStatus = "open"
    admin_reply: str = ""
    replied_at: Optional[datetime] = None
    created_at: datetime


class FeedbackReplyIn(BaseModel):
    status: FeedbackStatus
    admin_reply: str = Field(default="", max_length=2000)


class AdminScan(Classification):
    user_email: str = ""


class ScanPage(BaseModel):
    items: List[AdminScan]
    total: int
    page: int
    page_size: int


class DayCount(BaseModel):
    date: str
    count: int


class ItemCount(BaseModel):
    item_name: str
    count: int


class ActivityItem(BaseModel):
    kind: str  # scan | feedback | signup
    text: str
    at: datetime


class AdminStats(BaseModel):
    total_users: int
    total_scans: int
    total_eco_points: int
    total_feedback: int
    open_feedback: int
    active_facilities: int
    total_facilities: int
    low_confidence_scans: int
    by_category: dict
    daily: List[DayCount]
    top_items: List[ItemCount]
    recent: List[ActivityItem]


class AuditEntry(BaseModel):
    id: str
    admin_email: str
    action: str
    target: str
    at: datetime


class DeleteResult(BaseModel):
    deleted: int
