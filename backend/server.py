import asyncio
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List
import uuid
from datetime import datetime


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db, ensure_indexes


# Startup runs before the yield, shutdown after it. Add your own setup/teardown here.
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    from lib.auth import move_retired_roles
    with suppress(Exception):
        await move_retired_roles()
    yield
    app.state.index_task.cancel()  # stop a build still running before its client closes
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()


# Create the main app without a prefix
app = FastAPI(lifespan=lifespan)

from lib.security import secure_headers_middleware  # noqa: E402

app.middleware("http")(secure_headers_middleware)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.model_dump())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Feature routers — each module exposes an APIRouter mounted on the /api router
from routers import admin, chat, classify, doorstep, facilities, feedback, gate, scans, tips

try:  # launched as `backend.server` (the default)
    from backend.clerk_auth import clerk_router, require_user  # noqa: F401
except ModuleNotFoundError:  # launched from inside backend/ as `server`
    from clerk_auth import clerk_router, require_user  # noqa: F401

api_router.include_router(classify.router)
api_router.include_router(chat.router)
api_router.include_router(facilities.router)
api_router.include_router(scans.router)
api_router.include_router(gate.router)
api_router.include_router(feedback.router)
api_router.include_router(admin.router)
api_router.include_router(tips.router)
api_router.include_router(doorstep.router)  # Doorstep Garbage Vehicle (DEMO)


@api_router.get("/health")
async def health():
    """Public health check: database + AI configuration (never returns secrets)."""
    from lib.db import db as _db
    from lib.gemini import is_configured, model_name

    try:
        await _db.command("ping")
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "database": db_ok, "ai_configured": is_configured(), "ai_model": model_name(), "ai_fallback_model": os.environ.get("GEMINI_FALLBACK_MODEL", "")}


app.include_router(clerk_router)  # /api/clerk/config and /api/__clerk/*

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
