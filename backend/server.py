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
    # Idempotent seed: ensures the curated Chiplun facilities + default guidelines exist
    # (insert-if-missing, so admin edits are never overwritten). Runs on every boot so a
    # fresh Render/Mongo database is never empty.
    try:
        import seed as _seed
        await _seed.main()
        logger.info("seed: completed successfully")
    except Exception as exc:
        logger.exception("seed: FAILED - %s", exc)
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
    """Public health check: database, AI and Clerk configuration (never returns secrets)."""
    from lib.db import db as _db
    from lib.gemini import is_configured, model_name

    try:
        await _db.command("ping")
        db_ok = True
    except Exception:
        db_ok = False

    pk = os.environ.get("CLERK_PUBLISHABLE_KEY", "").strip()
    sk = os.environ.get("CLERK_SECRET_KEY", "").strip()
    keys_match = (pk.startswith("pk_live_") and sk.startswith("sk_live_")) or (
        pk.startswith("pk_test_") and sk.startswith("sk_test_")
    )
    if pk.startswith("pk_live_"):
        clerk_mode = "live"
    elif pk.startswith("pk_test_"):
        clerk_mode = "test"
    else:
        clerk_mode = "missing"

    return {
        "status": "ok" if db_ok else "degraded",
        "database": db_ok,
        "ai_configured": is_configured(),
        "ai_model": model_name(),
        "ai_fallback_model": os.environ.get("GEMINI_FALLBACK_MODEL", ""),
        "clerk_configured": bool(pk and sk),
        "clerk_mode": clerk_mode,
        "clerk_keys_match": keys_match,
        "cors_origins": cors_origins,
        "code_marker": "f332911-seed-v1",
    }


# Cached AI self-test (public, so we can diagnose Render's Gemini key without auth).
_AI_CHECK_CACHE: dict = {"at": 0.0, "result": None}
_AI_CHECK_TTL = 300.0


@api_router.get("/health/ai")
async def health_ai():
    import time

    from lib.gemini import AIError, generate, is_configured, model_name
    from google.genai import types

    now = time.time()
    if _AI_CHECK_CACHE["result"] is not None and now - _AI_CHECK_CACHE["at"] < _AI_CHECK_TTL:
        return _AI_CHECK_CACHE["result"]
    if not is_configured():
        result = {"ok": False, "kind": "key", "message": "GEMINI_API_KEY is empty on the server.", "model": model_name()}
        _AI_CHECK_CACHE["at"] = now
        _AI_CHECK_CACHE["result"] = result
        return result
    try:
        reply = await generate(
            [types.Part.from_text(text="Reply with the single word OK.")],
            types.GenerateContentConfig(temperature=0),
        )
        result = {"ok": True, "model": model_name(), "reply": (reply.text or "").strip()[:40]}
    except AIError as exc:
        result = {"ok": False, "kind": exc.kind, "status": exc.status, "message": exc.message, "model": model_name()}
    except Exception as exc:  # never leak secrets; report the class only
        result = {"ok": False, "kind": "error", "message": f"{type(exc).__name__}: {str(exc)[:200]}", "model": model_name()}
    _AI_CHECK_CACHE["at"] = now
    _AI_CHECK_CACHE["result"] = result
    return result


@api_router.get("/debug/seed")
async def debug_seed():
    try:
        import seed as _seed
        await _seed.main()
        count = await db.facilities.count_documents({})
        return {"ok": True, "facility_count": count}
    except Exception as exc:
        import traceback
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}", "trace": traceback.format_exc()[-1500:]}


app.include_router(clerk_router)  # /api/clerk/config and /api/__clerk/*

# Include the router in the main app
app.include_router(api_router)

def _env_list(name: str, default: str = "") -> list[str]:
    """Comma-separated env value -> clean list (quotes, spaces and trailing slashes removed).

    Render/Vercel dashboards often store values as `"https://app.vercel.app"`; the
    literal quotes would otherwise make every CORS origin check fail.
    """
    raw = os.environ.get(name, default)
    return [item.strip().strip('"').strip("'").rstrip("/") for item in raw.split(",") if item.strip()]


cors_origins = _env_list("CORS_ORIGINS", "*") or ["*"]
cors_origin_regex = os.environ.get("CORS_ORIGIN_REGEX", "").strip() or None

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_origin_regex=cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
