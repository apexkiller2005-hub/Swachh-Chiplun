"""Basic API security: per-user rate limits for the AI endpoints + secure headers."""

import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException

from lib.auth import current_member

_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(bucket: str, limit: int, per_seconds: int = 60):
    """FastAPI dependency: at most `limit` calls per user per window (in-memory)."""

    async def check(member: dict = Depends(current_member)) -> dict:
        key = f"{bucket}:{member['user_id']}"
        now = time.monotonic()
        q = _hits[key]
        while q and now - q[0] > per_seconds:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(status_code=429, detail="Too many requests — please wait a minute and try again.")
        q.append(now)
        return member

    return check


SECURE_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), geolocation=(self), microphone=()",
}


async def secure_headers_middleware(request, call_next):
    response = await call_next(request)
    for k, v in SECURE_HEADERS.items():
        response.headers.setdefault(k, v)
    return response
