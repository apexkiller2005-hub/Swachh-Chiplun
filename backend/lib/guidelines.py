"""Admin-managed waste categories + disposal guidelines (Mongo `guidelines`).

The six original categories are inserted once (marker doc in `settings`), so an
admin who later deletes or edits one keeps that change. The classifier, the
chat agent and the facility forms all read the ACTIVE guidelines from here.
"""

from datetime import datetime, timezone

from lib.db import db

DEFAULT_GUIDELINES = [
    {
        "key": "ewaste",
        "name": "E-waste",
        "description": "Phones, chargers, batteries, circuit boards, laptops, cables, CFL/LED bulbs and tube-lights. "
        "E-Waste (Management) Rules 2022 — never in a regular bin.",
        "examples": ["Mobile phone", "Charger", "Battery", "Tube light", "Laptop"],
        "disposal_steps": [
            "Keep the item intact and dry; do not break or burn it.",
            "Remove personal data from phones and laptops.",
            "Hand it to an authorised e-waste recycler or producer take-back point.",
        ],
        "hazards": ["Lithium batteries can catch fire if punctured", "Tube-lights contain mercury"],
        "eco_points": 25,
        "color": "#F59E0B",
    },
    {
        "key": "recyclable",
        "name": "Recyclable",
        "description": "Clean plastic bottles/containers, paper, newspaper, glass, metal, cans, cardboard (dry waste).",
        "examples": ["PET bottle", "Newspaper", "Cardboard box", "Glass jar", "Aluminium can"],
        "disposal_steps": [
            "Empty, rinse and dry the item.",
            "Flatten boxes and bottles to save space.",
            "Give it with dry waste to the municipal collector or a scrap dealer.",
        ],
        "hazards": [],
        "eco_points": 10,
        "color": "#3B82F6",
    },
    {
        "key": "general",
        "name": "General",
        "description": "Non-recyclable soiled waste (used tissues, dirty wrappers, broken ceramics).",
        "examples": ["Used tissue", "Dirty wrapper", "Broken ceramic cup"],
        "disposal_steps": [
            "Put it in the general (reject) waste bag.",
            "Hand it to the municipal collection vehicle.",
        ],
        "hazards": [],
        "eco_points": 5,
        "color": "#64748B",
    },
    {
        "key": "organic",
        "name": "Organic",
        "description": "Food scraps, vegetable peels, garden waste — compostable wet waste (SWM Rules 2016).",
        "examples": ["Vegetable peels", "Leftover food", "Leaves", "Coconut shell"],
        "disposal_steps": [
            "Keep it separate from plastic and dry waste.",
            "Compost at home or give it to the wet-waste collection.",
        ],
        "hazards": [],
        "eco_points": 15,
        "color": "#22C55E",
    },
    {
        "key": "hazardous",
        "name": "Hazardous",
        "description": "Paints, solvents, pesticides, expired medicines, chemicals, aerosols (domestic hazardous waste).",
        "examples": ["Paint can", "Pesticide bottle", "Expired medicines", "Aerosol can"],
        "disposal_steps": [
            "Safety first: keep it closed, labelled and away from children.",
            "Never pour it into drains, soil or water.",
            "Take it to the hazardous waste drop-off point.",
        ],
        "hazards": ["Toxic or flammable chemicals"],
        "eco_points": 20,
        "color": "#EF4444",
    },
    {
        "key": "biomedical",
        "name": "Biomedical",
        "description": "Used masks, syringes, sanitary napkins, medical waste (Bio-Medical Waste Management Rules 2016).",
        "examples": ["Used mask", "Syringe", "Sanitary napkin", "Bandage"],
        "disposal_steps": [
            "Safety first: wrap it in paper and seal it in a bag.",
            "Mark it clearly as biomedical waste.",
            "Hand it to the hospital drop or biomedical collection.",
        ],
        "hazards": ["Infection risk from used sharps and fluids"],
        "eco_points": 20,
        "color": "#F43F5E",
    },
]

SEED_MARKER = "guidelines_seeded"


async def ensure_default_guidelines() -> None:
    if await db.settings.find_one({"_id": SEED_MARKER}):
        return
    now = datetime.now(timezone.utc)
    for g in DEFAULT_GUIDELINES:
        await db.guidelines.update_one(
            {"key": g["key"]},
            {"$setOnInsert": {**g, "id": f"cat-{g['key']}", "active": True, "updated_at": now}},
            upsert=True,
        )
    await db.settings.update_one({"_id": SEED_MARKER}, {"$set": {"at": now}}, upsert=True)


async def list_guidelines(active_only: bool = False) -> list[dict]:
    await ensure_default_guidelines()
    query = {"active": True} if active_only else {}
    docs = await db.guidelines.find(query, {"_id": 0}).sort("name", 1).to_list(200)
    for d in docs:
        if d.get("updated_at") is not None and d["updated_at"].tzinfo is None:
            d["updated_at"] = d["updated_at"].replace(tzinfo=timezone.utc)
    return docs
