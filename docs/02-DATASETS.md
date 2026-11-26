# Step 2 — Dataset plan

## 2.1 Best public datasets

| Dataset | Size | Classes | License / access | Use here |
|---|---|---|---|---|
| **TrashNet** (Stanford) | 2,527 images | glass, paper, cardboard, plastic, metal, trash | Open (papers-with-code) | Core recyclable classes |
| **TACO** (Poiesz et al.) | 4,684 images, 1,500+ annotations | 28 litter categories (COCO-style) | CC BY 4.0 | Real-in-the-wild litter photos, segmentation |
| **Garbage Classification** (Kaggle "most downloaded") | ~15k images | 12 classes incl. clothes, shoes, biological, batteries | Kaggle | Broad coverage incl. e-waste-ish classes |
| **E-waste dataset** (Kaggle: "Electronic Waste / E-Waste Images" collections) | 3–10k images | phones, keyboards, PCBs, bulbs, cables, batteries | Kaggle | The whole `ewaste` class |
| **Hazardous/household-Waste datasets** (e.g. "Household hazardous waste" collections on Kaggle/GitHub) | 1–3k | paints, chemicals, medicines | varies | `hazardous` class |
| **Organic vs recyclable** (Kaggle "Waste Classification Data") | ~22k | organic / recyclable | Kaggle | `organic` vs recyclable split |
| **Biomedical** (published masks/syringes collections; limited public data) | small | masks, syringes | research | `biomedical` class — augment heavily |

## 2.2 Merging them (pipeline)

1. Download each dataset; keep per-image: path + original label + source tag.
2. Write one `merge.py` (pandas) that maps original labels → your 6 categories
   (table below), drops duplicates (hash the image bytes), resizes to 224×224,
   and writes `manifest.csv` (path, category, source).
3. Split 70/15/15 train/val/test **stratified by category**, and keep the
   source in the test set metadata so you can report per-source accuracy.

## 2.3 Label mapping → the app's 6 categories

| Original label (examples) | → App category |
|---|---|
| phone, battery, charger, circuit board, keyboard, bulb, cable, CFL/LED, e-waste | `ewaste` |
| plastic, bottle, paper, newspaper, glass, metal, can, cardboard | `recyclable` |
| trash, wrapper (soiled), styrofoam, ceramics, used tissue | `general` |
| organic, biodegradable, food, leaves, biological | `organic` |
| paint, chemical, medicine, solvent, aerosol, thermometer | `hazardous` |
| mask, syringe, sanitary, medical waste | `biomedical` |

## 2.4 Collecting local Indian waste images (the differentiator)

Public datasets are Western-centric — Chiplun looks different (kadba packing,
tetra packs, tubelights, gutka pouches, coconut shells, clay kulhads).

1. Phone collection protocol: 20–30 photos per item type, natural light,
   multiple angles/backgrounds (home, street, bin), plus the *dirty/soiled*
   version of each item — that's what decides recyclable vs general.
2. Collect at scale with the app itself: every scan can be saved (with consent)
   as `path, category, confidence` — the vision-LLM labels, humans verify.
3. Consent & privacy: photograph objects only, never faces/plates/house
   numbers; share nothing outside the project without permission.
4. Labelling tool: Roboflow / CVAT / Label Studio free tiers. Aim for
   ≥500 images per class minimum; heavily augment the small classes.
5. Balance the classes: TrashNet-style augmentation (rotation ±30°, flip,
   brightness, JPEG compression, RandomErasing) for `hazardous`/`biomedical`;
   consider class weights in the loss so rare-but-critical classes win.

## 2.5 Milestones

- Week 1: download + `merge.py` + manifest + class histogram.
- Week 2: 500+ local Chiplun images via the app + phone protocol.
- Week 3: baseline CNN (Step 3 of the report) on the merged manifest.
- Week 4: confusion-matrix error analysis → fix the worst confusable pairs
  (paper vs organic soiled; ewaste vs recyclable cables).
