"""Pydantic v2 models for the Swachh Chiplun waste assistant.

Every model here has a hand-written TS mirror in frontend/src/lib/types.ts —
keep the two in sync in the same edit.
"""

import uuid
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

Language = Literal["en", "hi", "mr"]
WasteCategory = Literal["ewaste", "recyclable", "general", "organic", "hazardous", "biomedical"]


class ClassificationRequest(BaseModel):
    image_base64: Optional[str] = None  # JPEG/PNG/WEBP, resized client-side
    mime_type: str = "image/jpeg"
    hint: Optional[str] = None  # text description or decoded barcode value
    language: Language = "en"


class Classification(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_name: str
    category: str
    subcategory: str = ""
    confidence: float
    disposal_steps: List[str] = []
    hazards: List[str] = []
    eco_tip: str = ""
    eco_points: int = 0
    needs_follow_up: bool = False
    follow_up_question: str = ""
    follow_up_options: List[str] = []
    language: Language = "en"
    hint: Optional[str] = None
    created_at: datetime
    category_label: str = ""  # admin-managed display name of the category
    user_id: Optional[str] = None  # owner (None = demo scans made before sign-in existed)


class ScanContext(BaseModel):
    item_name: str
    category: str


class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    language: Language = "en"
    history: List[ChatHistoryMessage] = []
    scan_context: Optional[ScanContext] = None


class Facility(BaseModel):
    id: str
    name: str
    categories: List[str] = []
    lat: float
    lng: float
    address: str = ""
    phone: Optional[str] = None
    hours: Optional[str] = None
    accepts: List[str] = []
    source: str = "seed"  # "seed" (curated Chiplun list) | "osm" (OpenStreetMap live) | "admin"
    distance_m: Optional[float] = None
    active: bool = True


class ChatResponse(BaseModel):
    reply: str
    facilities_used: List[Facility] = []
    fallback: bool = False


class ScanDeleteResponse(BaseModel):
    deleted: int


class StatsResponse(BaseModel):
    total_scans: int
    eco_points: int
    by_category: dict


class GateRequest(BaseModel):
    pin: str


class GateStatus(BaseModel):
    unlocked: bool