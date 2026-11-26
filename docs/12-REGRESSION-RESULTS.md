# Regression test — old Emergent AI (gpt-5.4) vs new Google Gemini (free tier)

Same 10 photos, same prompts, same response format. Run with `python backend/tests/regression_run.py before|after`.
After = `gemini-3.5-flash`, with automatic switch to `gemini-3.5-flash-lite` when the free daily quota (20 requests/day for 3.5-flash) is used up.

| # | Photo | Expected | BEFORE category | BEFORE conf. | AFTER category | AFTER conf. | AFTER first disposal step |
|---|---|---|---|---|---|---|---|
| 1 | Broken smartphone | ewaste | ewaste | 0.99 | ewaste | 0.98 | Keep the item intact and dry; do not break or burn it. |
| 2 | Old mobile phones | ewaste | ewaste | 0.96 | ewaste | 0.98 | Keep the items intact and dry; do not break or burn them. |
| 3 | Plastic water bottle | recyclable | recyclable | 0.98 | recyclable | 0.98 | Empty, rinse and dry the item. |
| 4 | Empty plastic bottles | recyclable | recyclable | 0.96 | recyclable | 0.98 | Empty, rinse and dry the item. |
| 5 | Banana peel | organic | organic | 0.99 | organic | 0.99 | Keep it separate from plastic and dry waste. |
| 6 | Peeled banana | organic | organic | 0.99 | organic | 0.98 | Keep it separate from plastic and dry waste. |
| 7 | Spray paint cans | hazardous | hazardous | 0.97 | hazardous | 0.98 | Safety first: keep it closed, labelled and away from children. |
| 8 | Rusty paint cans | hazardous | hazardous | 0.96 | hazardous | 0.98 | Safety first: keep it closed, labelled and away from children. |
| 9 | Used syringe | biomedical | biomedical | 0.98 | biomedical | 0.98 | Safety first: wrap it in paper and seal it in a bag. |
| 10 | Mixed dirty garbage | general | recyclable | 0.74 | general | 0.5 | Sort the mixed pile into individual items like plastic, paper, and metal scrubber. |

**Correct: before 9/10, after 10/10.** Photo 10 (mixed garbage) is a borderline case; Gemini gives General with 0.5 confidence, so the app asks the user a follow-up question.

## Chat questions

| Question | BEFORE | AFTER |
|---|---|---|
| What do I do with a broken tube light? | answered, 0 facilities | answered, 3 facilities |
| Where can I dispose of old batteries in Chiplun? | answered, 3 facilities | answered, 3 facilities |
| What is the capital of India? | answered, 0 facilities | fallback (AI busy) |

Note: "fallback (AI busy)" = the free-tier per-minute limit was reached; the app showed the friendly message *AI is busy, please try again in a minute* and did not crash. Asking again a minute later works.

Also verified: conversation memory (history is sent with every question), admin tips used in answers, Marathi replies, wrong key / no internet / bad image → friendly messages.
