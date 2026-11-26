"""POST /api/classify — vision-LLM waste identification (image and/or text hint)."""

import base64
import binascii
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from google.genai import types

from lib.ai import LANGUAGE_NAMES
from lib.db import db
from lib.gemini import FRIENDLY, AIError, generate
from lib.guidelines import list_guidelines
from lib.security import rate_limit
from models.waste import Classification, ClassificationRequest

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}


def response_schema(categories: list[str]) -> dict:
    """Same JSON keys the app always used — now enforced by Gemini structured output."""
    return {
        "type": "OBJECT",
        "properties": {
            "item_name": {"type": "STRING"},
            "category": {"type": "STRING", "enum": categories},
            "subcategory": {"type": "STRING"},
            "confidence": {"type": "NUMBER"},
            "disposal_steps": {"type": "ARRAY", "items": {"type": "STRING"}},
            "hazards": {"type": "ARRAY", "items": {"type": "STRING"}},
            "eco_tip": {"type": "STRING"},
            "needs_follow_up": {"type": "BOOLEAN"},
            "follow_up_question": {"type": "STRING"},
            "follow_up_options": {"type": "ARRAY", "items": {"type": "STRING"}},
        },
        "required": ["item_name", "category", "confidence", "disposal_steps", "hazards", "needs_follow_up"],
    }

router = APIRouter()
logger = logging.getLogger(__name__)

CATEGORIES = ["ewaste", "recyclable", "general", "organic", "hazardous", "biomedical"]
ECO_POINTS = {"ewaste": 25, "biomedical": 20, "hazardous": 20, "organic": 15, "recyclable": 10, "general": 5}

SYSTEM_TEMPLATE = """You are the classification engine of "Swachh Chiplun", an AI waste identification and disposal assistant for Chiplun, Ratnagiri district, Maharashtra, India. You identify ONE waste item from the attached photo and/or the user's description, classify it, and explain disposal according to Indian rules.

Reply with ONLY a JSON object — no markdown fences, no commentary — with exactly these keys:
{{"item_name": string, "category": one of {cats}, "subcategory": string, "confidence": number between 0 and 1, "disposal_steps": string array of 3 to 6 steps, "hazards": string array, "eco_tip": string, "needs_follow_up": boolean, "follow_up_question": string, "follow_up_options": string array of at most 3}}

Classification guide (managed by the Chiplun admin — follow it):
<<GUIDE>>

Rules:
1. confidence is your honest certainty (0-1). If confidence < 0.65, or the image is blurry/unclear, or the description is ambiguous, set needs_follow_up=true and ask ONE short question in follow_up_question with up to 3 short answer options in follow_up_options.
2. disposal_steps must follow Indian practice: segregate at source, use authorised channels, never open-burn or open-dump. For hazardous or biomedical items, step 1 must be a safety precaution.
3. hazards lists concrete dangers (e.g. "Mercury vapour if tube glass breaks", "Lithium fire risk if battery is punctured"); empty array when none.
4. If the user's description contains "Barcode:" followed by digits, treat it as the product's barcode and identify the product from it.
5. Write item_name and subcategory in English (item_name may add the local name in brackets). Write disposal_steps, hazards, eco_tip, follow_up_question and follow_up_options in {language}.
6. If you truly cannot tell what the item is, set needs_follow_up=true, item_name to your best short guess, and confidence to your honest low value."""


def extract_json(text: str) -> dict:
    t = text.strip()
    start, end = t.find("{"), t.rfind("}")
    if start == -1 or end <= start:
        raise ValueError(f"no JSON object in model reply: {text[:200]!r}")
    return json.loads(t[start : end + 1])


def guide_text(guidelines: list[dict]) -> str:
    lines = []
    for g in guidelines:
        line = f"- {g['key']} ({g['name']}): {g.get('description', '')}"
        if g.get("examples"):
            line += f" Examples: {', '.join(g['examples'])}."
        if g.get("disposal_steps"):
            line += f" Official local disposal steps: {' | '.join(g['disposal_steps'])}."
        if g.get("hazards"):
            line += f" Known hazards: {' | '.join(g['hazards'])}."
        lines.append(line)
    return "\n".join(lines)


@router.post("/classify", response_model=Classification)
async def classify_item(input: ClassificationRequest, member: dict = Depends(rate_limit("classify", 15))):
    if not input.image_base64 and not (input.hint and input.hint.strip()):
        raise HTTPException(status_code=422, detail="Provide an image or a text hint describing the waste item.")
    if input.image_base64 and len(input.image_base64) > 9_000_000:
        raise HTTPException(status_code=413, detail="Image too large — retake or upload a smaller photo.")

    guidelines = await list_guidelines(active_only=True)
    by_key = {g["key"]: g for g in guidelines}
    categories = list(by_key) or CATEGORIES
    system = SYSTEM_TEMPLATE.format(
        cats=", ".join(categories), language=LANGUAGE_NAMES[input.language]
    ).replace("<<GUIDE>>", guide_text(guidelines))

    desc = []
    if input.hint and input.hint.strip():
        desc.append(f"User's description / hint: {input.hint.strip()}")
    if input.image_base64:
        desc.append("Identify the single waste item shown in the attached photo.")
    text = "\n".join(desc)

    contents: list = [types.Part.from_text(text=text)]
    if input.image_base64:
        if input.mime_type not in ALLOWED_MIME:
            raise HTTPException(status_code=415, detail="Only JPEG, PNG or WEBP photos are accepted.")
        try:
            image_bytes = base64.b64decode(input.image_base64, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(status_code=422, detail="The photo could not be read — please retake it.")
        contents.insert(0, types.Part.from_bytes(data=image_bytes, mime_type=input.mime_type))

    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=0.2,
        response_mime_type="application/json",
        response_schema=response_schema(categories),
    )
    data = None
    try:
        for _attempt in range(2):  # validate every result; retry once if invalid
            reply = await generate(contents, config)
            try:
                candidate = extract_json(reply.text or "")
                if candidate.get("category") in categories and 0 <= float(candidate.get("confidence")) <= 1:
                    data = candidate
                    break
            except (ValueError, TypeError):
                pass
            logger.warning("classify: invalid AI result, retrying once")
    except AIError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from None
    if data is None:
        raise HTTPException(status_code=422, detail=FRIENDLY["invalid"])

    category = data.get("category", "general")
    if category not in categories:
        category = "general"
    guideline = by_key.get(category, {})
    try:
        confidence = max(0.0, min(1.0, float(data.get("confidence", 0.5))))
    except (TypeError, ValueError):
        confidence = 0.5

    result = Classification(
        item_name=str(data.get("item_name", "Unknown item"))[:120],
        category=category,
        subcategory=str(data.get("subcategory", ""))[:120],
        confidence=confidence,
        disposal_steps=[str(s) for s in (data.get("disposal_steps") or [])][:8],
        hazards=[str(s) for s in (data.get("hazards") or [])][:6],
        eco_tip=str(data.get("eco_tip", "")),
        eco_points=int(guideline.get("eco_points", ECO_POINTS.get(category, 5))),
        needs_follow_up=bool(data.get("needs_follow_up", False)) and confidence < 0.8,
        follow_up_question=str(data.get("follow_up_question", "")),
        follow_up_options=[str(s) for s in (data.get("follow_up_options") or [])][:3],
        language=input.language,
        hint=input.hint,
        created_at=datetime.now(timezone.utc),
        category_label=str(guideline.get("name", "")),
        user_id=member["user_id"],
    )

    await db.scans.insert_one({"_id": result.id, **result.model_dump()})
    return result