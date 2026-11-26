"""Idempotent seed for the Chiplun facility finder.

Run: cd /app/backend && python seed.py
Curated demo data for the Chiplun / Khed / Lote MIDC region. Addresses, hours and
phones are realistic placeholders for the student demo — verify locally before
any real visit. Live OpenStreetMap data is fetched on top of this at runtime.
"""

import asyncio
from datetime import datetime, timezone

from lib.db import db, ensure_indexes
from lib.guidelines import ensure_default_guidelines

NOW = datetime.now(timezone.utc)

FACILITIES = [
    {
        "id": "fac-snm-ewaste-hub",
        "name": "Sahyadri Nisarg Mitra E-Waste & Conservation Hub",
        "categories": ["ewaste"],
        "lat": 17.5365,
        "lng": 73.5221,
        "address": "Near Shivaji Nagar, Chiplun 415605",
        "phone": "+91 2355 252 505",
        "hours": "9:30 AM - 6:00 PM (Mon-Sat)",
        "accepts": ["Old laptops", "Smartphones", "PCBs", "Lithium batteries", "Cables"],
    },
    {
        "id": "fac-chiplun-municipal-depot",
        "name": "Chiplun Municipal Council Scrap & Solid Waste Depot",
        "categories": ["recyclable", "general"],
        "lat": 17.5280,
        "lng": 73.5142,
        "address": "Bahadur Shaikh Naka, Mumbai-Goa Highway, Chiplun",
        "phone": "+91 2355 252 022",
        "hours": "8:00 AM - 5:00 PM (Daily)",
        "accepts": ["Cardboard", "PET bottles", "Aluminium cans", "Glass bottles"],
    },
    {
        "id": "fac-konkan-scrap-recyclers",
        "name": "Konkan Scrap Recyclers & Kabadiwala",
        "categories": ["recyclable", "ewaste"],
        "lat": 17.5412,
        "lng": 73.5298,
        "address": "MIDC Kherdi Road, Chiplun",
        "phone": "+91 94220 98112",
        "hours": "9:00 AM - 7:30 PM (Mon-Sat)",
        "accepts": ["Metal scrap", "Copper wiring", "Newspapers", "Hard plastics"],
    },
    {
        "id": "fac-vashishti-composting",
        "name": "Vashishti River Basin Community Composting Unit",
        "categories": ["organic"],
        "lat": 17.5234,
        "lng": 73.5091,
        "address": "Govalkot Road, near Vashishti Riverfront, Chiplun",
        "phone": "+91 98231 44550",
        "hours": "7:00 AM - 12:00 PM (Daily)",
        "accepts": ["Wet kitchen waste", "Garden pruning", "Fruit peels"],
    },
    {
        "id": "fac-hospital-hazardous-drop",
        "name": "Sub-District Hospital Hazardous & Medical Waste Drop",
        "categories": ["hazardous", "biomedical"],
        "lat": 17.5348,
        "lng": 73.5167,
        "address": "Station Road, Chiplun",
        "phone": "+91 2355 253 100",
        "hours": "24x7 dedicated safe-drop counter",
        "accepts": ["Expired medicines", "Syringes", "Sanitary waste", "Chemical containers"],
    },
    {
        "id": "fac-lote-midc-collection",
        "name": "Lote Parshuram MIDC Industrial Waste Collection Point",
        "categories": ["recyclable", "ewaste", "hazardous"],
        "lat": 17.4521,
        "lng": 73.4721,
        "address": "Lote Parshuram MIDC, Tal. Chiplun",
        "phone": "+91 2355 264 110",
        "hours": "10:00 AM - 5:00 PM (Mon-Fri)",
        "accepts": ["Industrial scrap", "Used oils (authorized only)", "E-waste bulk lots"],
    },
    {
        "id": "fac-khed-dry-waste-center",
        "name": "Khed Municipal Council Dry Waste Collection Centre",
        "categories": ["recyclable", "general"],
        "lat": 17.7215,
        "lng": 73.6853,
        "address": "Khed, Ratnagiri District",
        "phone": "+91 2356 252 300",
        "hours": "9:00 AM - 5:00 PM (Mon-Sat)",
        "accepts": ["Dry waste", "Paper", "Plastics", "Glass"],
    },
]


async def main() -> None:
    docs = [{**f, "source": "seed", "fetched_at": NOW} for f in FACILITIES]
    for doc in docs:  # insert-if-missing by id — never overwrites an admin's edits
        await db.facilities.update_one({"id": doc["id"]}, {"$setOnInsert": doc}, upsert=True)
    await ensure_default_guidelines()  # the 6 default categories (first run only)
    await ensure_indexes()
    print(f"Seeded {len(docs)} facilities for the Chiplun region.")


if __name__ == "__main__":
    asyncio.run(main())