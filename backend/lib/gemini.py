"""Google Gemini (free tier) — the single place the app talks to the AI.

Key:   GEMINI_API_KEY  (backend .env only, never in code / logs / git)
Model: GEMINI_MODEL    (default gemini-3.5-flash — free tier, accepts images)
Every failure becomes an AIError with a friendly, user-facing message.
"""

import asyncio
import logging
import os

import httpx
from google import genai
from google.genai import errors, types

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-3.5-flash"

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


async def generate(contents, config: types.GenerateContentConfig):
    """Gemini call with one automatic retry when the free tier is busy (429/503)."""
    try:
        return await _generate_once(contents, config, model_name())
    except AIError as exc:
        if exc.kind != "busy":
            raise
        backup = fallback_model()
        if backup and backup != model_name():
            # free-tier quota of the main model used up -> switch to the backup model
            return await _generate_once(contents, config, backup)
        await asyncio.sleep(3)
        return await _generate_once(contents, config, model_name())


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
