"""Google Gemini (free tier) — the single place the app talks to the AI.

Key:   GEMINI_API_KEY  (backend .env only, never in code / logs / git)
Model: GEMINI_MODEL    (default gemini-3.5-flash — free tier, accepts images)
Every failure becomes an AIError with a friendly, user-facing message.
"""

import asyncio
import logging
import os
import time

import httpx
from google import genai
from google.genai import errors, types

logger = logging.getLogger(__name__)

# gemini-3.5-flash's free tier is only ~20 requests/day, which is too small for an
# app. gemini-3.1-flash-lite is multimodal (images + text), supports structured
# output and function calling, and has a much larger free quota.
DEFAULT_MODEL = "gemini-3.1-flash-lite"

FRIENDLY = {
    "busy": "AI is busy, please try again in a minute.",
    "key": "The AI service is not set up correctly (check GEMINI_API_KEY in backend/.env).",
    "offline": "Cannot reach the AI service. Check your internet connection and try again.",
    "invalid": "The AI could not read this clearly. Please retake a sharper, well-lit photo or add a short description.",
    "error": "The AI service had a problem. Please try again.",
}
HTTP_STATUS = {"busy": 429, "key": 503, "offline": 503, "invalid": 422, "error": 502}


class AIError(Exception):
    def __init__(self, kind: str):
        self.kind = kind
        self.message = FRIENDLY[kind]
        self.status = HTTP_STATUS[kind]
        super().__init__(self.message)


_client: genai.Client | None = None
_client_key: str | None = None


def model_name() -> str:
    return os.environ.get("GEMINI_MODEL", "").strip() or DEFAULT_MODEL


def fallback_model() -> str:
    return os.environ.get("GEMINI_FALLBACK_MODEL", "").strip()


def is_configured() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY", "").strip())


def client() -> genai.Client:
    global _client, _client_key
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise AIError("key")
    if _client is None or key != _client_key:
        _client, _client_key = genai.Client(api_key=key), key
    return _client


# Free-tier quotas are per model and per day. When the configured model is
# exhausted (429) or unavailable (404/503), walk this list until one answers.
# Each entry must support the features we use: images, structured output, tools.
MODEL_FALLBACKS = ["gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-3.6-flash"]

# Cooldown for models that recently returned a capacity/quota error, so we don't
# waste a round-trip (and the user's time) re-probing an exhausted model.
_MODEL_COOLDOWN: dict[str, float] = {}
_COOLDOWN_SECONDS = 300.0


def _on_cooldown(model: str) -> bool:
    return time.time() < _MODEL_COOLDOWN.get(model, 0.0)


def _cooldown(model: str) -> None:
    _MODEL_COOLDOWN[model] = time.time() + _COOLDOWN_SECONDS


async def generate(contents, config: types.GenerateContentConfig):
    """Gemini call with automatic model fallback + retry on free-tier quota (429/503).

    Models that recently returned a capacity/quota error are skipped for a few
    minutes, which keeps scans fast instead of re-probing an exhausted model.
    """
    primary = model_name()
    candidates: list[str] = [primary]
    backup = fallback_model()
    if backup and backup not in candidates:
        candidates.append(backup)
    for m in MODEL_FALLBACKS:
        if m not in candidates:
            candidates.append(m)

    # Prefer models that are not currently on cooldown.
    ordered = [m for m in candidates if not _on_cooldown(m)] + [m for m in candidates if _on_cooldown(m)]

    last_exc: AIError | None = None
    for m in ordered:
        try:
            result = await _generate_once(contents, config, m)
            return result
        except AIError as exc:
            last_exc = exc
            if exc.kind in ("busy", "key", "error"):
                if exc.kind == "busy":
                    _cooldown(m)
                logger.info("model %s unavailable (%s); trying next model", m, exc.kind)
                continue
            raise
    # Every model was busy — wait briefly and retry the primary once.
    await asyncio.sleep(3)
    try:
        return await _generate_once(contents, config, primary)
    except AIError:
        if last_exc is not None:
            raise last_exc
        raise


async def _generate_once(contents, config: types.GenerateContentConfig, model: str):
    """One Gemini call; maps SDK/network errors to AIError (never leaks the key)."""
    try:
        return await client().aio.models.generate_content(model=model, contents=contents, config=config)
    except AIError:
        raise
    except errors.ClientError as exc:
        text = str(exc).upper()
        if exc.code in (401, 403) or "API_KEY" in text or "API KEY" in text:
            logger.warning("Gemini rejected the API key (code %s)", exc.code)
            raise AIError("key") from None
        if exc.code == 429 or "RESOURCE_EXHAUSTED" in text:
            logger.warning("Gemini free-tier rate limit reached")
            raise AIError("busy") from None
        if exc.code == 400 and ("IMAGE" in text or "INLINE" in text or "MIME" in text):
            raise AIError("invalid") from None
        if exc.code == 404:
            logger.warning("Gemini model %s not found — check GEMINI_MODEL", model_name())
            raise AIError("key") from None
        logger.warning("Gemini client error %s", exc.code)
        raise AIError("error") from None
    except errors.ServerError as exc:
        logger.warning("Gemini server error %s", exc.code)
        raise AIError("busy") from None
    except (httpx.HTTPError, TimeoutError, OSError):
        logger.warning("Gemini unreachable (network)")
        raise AIError("offline") from None
    except errors.APIError as exc:
        logger.warning("Gemini API error %s", getattr(exc, "code", "?"))
        raise AIError("error") from None
