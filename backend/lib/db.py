"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")


def _required_env(name: str) -> str:
    """Fail with an actionable message instead of a bare KeyError on the host."""
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(
            f"{name} is not set. Add it to backend/.env locally, or to the environment "
            "variables of your Render (backend) service. See docs/13-DEPLOYMENT-VERCEL-RENDER.md."
        )
    return value


mongo_url = _required_env("MONGO_URL")
# DB_NAME has a sensible default so a missing variable cannot take the API down.
db_name = os.environ.get("DB_NAME", "").strip() or "swachh_chiplun"
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "scans": [
        IndexModel([("created_at", DESCENDING)], name="created_at_desc"),
        IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created"),
    ],
    "users": [IndexModel([("user_id", ASCENDING)], name="user_id", unique=True)],
    "guidelines": [IndexModel([("key", ASCENDING)], name="key", unique=True)],
    "feedback": [
        IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created"),
        IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created"),
    ],
    "admin_audit": [IndexModel([("at", DESCENDING)], name="at_desc")],
    "tips": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    # Doorstep Garbage Vehicle (DEMO) — separate collections, never counted on the real dashboards
    "pickup_spots": [IndexModel([("user_id", ASCENDING)], name="user_id", unique=True)],
    "pickup_alerts": [IndexModel([("user_id", ASCENDING), ("at", DESCENDING)], name="user_at")],
    "demo_routes": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "demo_users": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "demo_trips": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "facilities": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("source", ASCENDING), ("fetched_at", DESCENDING)], name="source_fetched"),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
