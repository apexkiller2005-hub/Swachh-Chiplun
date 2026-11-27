"""POST /api/chat — the AI help agent: waste expert with a facility-search tool."""

import json
import logging

from fastapi import APIRouter, Depends
from google.genai import types

from lib.ai import FALLBACK_REPLIES, LANGUAGE_NAMES
from lib.db import db
from lib.gemini import AIError, generate
from lib.guidelines import list_guidelines
from lib.security import rate_limit
from models.waste import ChatRequest, ChatResponse, Facility
from routers.facilities import find_facilities

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 3

FACILITY_TOOL = {
    "type": "function",
    "function": {
        "name": "search_facilities",
        "description": "Find waste disposal / recycling facilities near Chiplun, Maharashtra (e-waste centres, "
        "recycling units, scrap dealers, municipal collection points, composting units, hazardous drop-off). "
        "Call this whenever the user asks WHERE to dispose of something or asks for nearby centres or dealers.",
        "parameters": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "Waste category of the item to dispose of.",
                },
                "query": {
                    "type": "string",
                    "description": "Optional free text such as 'e-waste collection' or 'scrap dealer'.",
                },
            },
            "required": ["category"],
        },
    },
}

SYSTEM_TEMPLATE = """You are "Nisarg Sahyak", the AI waste-help assistant of Swachh Chiplun — a student-built waste identification and disposal assistant for Chiplun, Ratnagiri district, Maharashtra, India. You answer questions on waste segregation, recycling methods, e-waste laws, composting, reuse ideas and environmental impact.

Knowledge to ground answers in:
- Solid Waste Management Rules 2016: segregate at source into wet/biodegradable, dry/recyclable, and domestic hazardous waste.
- E-Waste (Management) Rules 2022: electronics and batteries go ONLY to authorised recyclers, producers' collection points or registered scrap dealers — never into regular bins or to informal burning.
- Bio-Medical Waste Management Rules 2016: masks, syringes, sanitary waste follow the yellow/red stream via authorised handlers.
- Local context: Chiplun town, Khed, Lote Parshuram MIDC and Ratnagiri district; the partner organisation is Sahyadri Nisarg Mitra, an environmental NGO.

SAFETY GUARDRAILS (must follow):
1. For hazardous or biomedical items, START the answer with a clear safety warning.
2. NEVER advise open burning, open dumping, burying chemicals, or draining liquids into soil or water bodies.
3. NEVER give medical diagnosis or medicine dosage — redirect to a doctor or the Sub-District Hospital, Chiplun.
4. Broken glass, tube-lights or batteries: give careful handling steps (seal in a container, keep away from children).

Style: warm, practical, concise (max ~180 words), short bullets where helpful. If you used search_facilities, name the best facility from the results and tell the user to open the Facilities page for distance and directions. If the question has nothing to do with waste or environment, answer briefly and steer back to waste topics.

IMPORTANT: write your reply in {language}."""


@router.post("/chat", response_model=ChatResponse)
async def chat_with_agent(input: ChatRequest, member: dict = Depends(rate_limit("chat", 20))):
    guidelines = await list_guidelines(active_only=True)
    local_rules = "\n".join(
        f"- {g['key']} ({g['name']}): {g.get('description', '')} Steps: {' | '.join(g.get('disposal_steps', []))}"
        for g in guidelines
    )
    system = SYSTEM_TEMPLATE.format(language=LANGUAGE_NAMES[input.language]) + (
        "\n\nOfficial Chiplun waste categories and disposal guidelines (set by the town admin — prefer these):\n"
        + local_rules
    )
    tips = await db.tips.find({"active": {"$ne": False}}, {"_id": 0, "title": 1, "body": 1}).sort("updated_at", -1).to_list(20)
    if tips:
        system += "\n\nKnowledge tips written by the Chiplun admin (use when relevant):\n" + "\n".join(
            f"- {t['title']}: {t['body']}" for t in tips
        )

    tool = types.Tool(function_declarations=[types.FunctionDeclaration(
        name=FACILITY_TOOL["function"]["name"],
        description=FACILITY_TOOL["function"]["description"],
        parameters_json_schema={
            **FACILITY_TOOL["function"]["parameters"],
            "properties": {
                **FACILITY_TOOL["function"]["parameters"]["properties"],
                "category": {
                    "type": "string",
                    "enum": [g["key"] for g in guidelines] or ["general"],  # the admin's category list
                    "description": "Waste category key of the item to dispose of.",
                },
            },
        },
    )])
    _cfg = dict(
        system_instruction=system,
        temperature=0.4,
        tools=[tool],
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    if hasattr(types, "ThinkingConfig"):
        try:
            types.GenerateContentConfig(thinking_config=types.ThinkingConfig(thinking_budget=0))
            _cfg["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
        except Exception:
            pass
    config = types.GenerateContentConfig(**_cfg)

    parts = []
    history_lines = [
        f"{'User' if m.role == 'user' else 'Assistant'}: {m.content}" for m in input.history[-8:]
    ]
    if history_lines:
        parts.append("Conversation so far:\n" + "\n".join(history_lines))
    if input.scan_context:
        parts.append(
            f"Context: the user recently scanned an item '{input.scan_context.item_name}' "
            f"(category: {input.scan_context.category}). Use this as context if relevant."
        )
    parts.append(f"User's new question: {input.message}")

    contents: list = [types.Content(role="user", parts=[types.Part.from_text(text="\n\n".join(parts))])]
    facilities_used: list[Facility] = []
    try:
        response = await generate(contents, config)
        rounds = 0
        while response.function_calls and rounds < MAX_TOOL_ROUNDS:
            contents.append(response.candidates[0].content)
            replies = []
            for call in response.function_calls:
                if call.name == "search_facilities":
                    args = call.args or {}
                    results = await find_facilities(category=args.get("category"), live=False)
                    facilities_used.extend(Facility(**doc) for doc in results[:5])
                    payload = {"result": json.loads(json.dumps(results[:5], default=str))}
                else:
                    payload = {"error": f"unknown tool {call.name}"}
                replies.append(types.Part.from_function_response(name=call.name, response=payload))
            contents.append(types.Content(role="user", parts=replies))  # Gemini: function responses go in a user turn
            response = await generate(contents, config)
            rounds += 1
        reply = (response.text or "").strip()
        if not reply:
            raise AIError("error")
        return ChatResponse(reply=reply, facilities_used=facilities_used[:5], fallback=False)
    except AIError as exc:
        prefix = "" if exc.kind == "error" else exc.message + "\n\n"
        return ChatResponse(reply=prefix + FALLBACK_REPLIES[input.language], facilities_used=[], fallback=True)
    except Exception:
        logger.exception("chat failed")
        return ChatResponse(reply=FALLBACK_REPLIES[input.language], facilities_used=[], fallback=True)