"""Presentation PIN gate — keeps the demo app private to the student.

PIN comes from GATE_PIN in backend/.env (default 2026 for the demo).
The unlock cookie is httpOnly, so the browser cannot fake it from JS.
"""

import os

from fastapi import APIRouter, HTTPException, Request, Response

from models.waste import GateRequest, GateStatus

router = APIRouter()

COOKIE_NAME = "sw_gate"
COOKIE_VALUE = "unlocked"
DEFAULT_PIN = "2026"


@router.post("/gate/unlock", response_model=GateStatus)
async def unlock_gate(body: GateRequest, response: Response):
    expected = os.environ.get("GATE_PIN", DEFAULT_PIN)
    if body.pin.strip() != expected:
        raise HTTPException(status_code=401, detail="Wrong PIN")
    response.set_cookie(
        COOKIE_NAME,
        COOKIE_VALUE,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 12,  # 12 hours — long enough for a demo day
    )
    return GateStatus(unlocked=True)


@router.get("/gate/status", response_model=GateStatus)
async def gate_status(request: Request):
    return GateStatus(unlocked=request.cookies.get(COOKIE_NAME) == COOKIE_VALUE)


@router.post("/gate/lock", response_model=GateStatus)
async def lock_gate(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return GateStatus(unlocked=False)