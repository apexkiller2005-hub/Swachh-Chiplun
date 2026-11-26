"""Merge Kaggle waste datasets into one 6-class training set (Step 2 + 3 of the report).

1. Download datasets (links in docs/03-MODEL-PLAN-AND-TRAINING.md) and put each
   extracted dataset folder inside ml/raw_datasets/<name>/
2. Edit SOURCE_MAPS below if your folder names differ
3. Run:  python ml/prepare_dataset.py

Produces:
  ml/data/{train,val,test}/<category>/*.jpg   (ImageFolder-ready for train.py)
  ml/manifest.csv                             (path, category, source, split)
"""

import csv
import hashlib
import shutil
from collections import Counter
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw_datasets"
OUT = ROOT / "data"
TARGET = (224, 224)
SPLIT = (0.70, 0.15, 0.15)  # train / val / test
CLASSES = ["ewaste", "recyclable", "general", "organic", "hazardous", "biomedical"]
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

# Map each raw dataset's folder names -> app category. "*" = every subfolder maps.
SOURCE_MAPS = {
    # Kaggle "Garbage Classification" (TrashNet-style)
    "garbage-classification": {
        "cardboard": "recyclable",
        "glass": "recyclable",
        "metal": "recyclable",
        "paper": "recyclable",
        "plastic": "recyclable",
        "trash": "general",
    },
    # Kaggle "Organic and Recyclable" split
    "organic-vs-recyclable": {"organic": "organic", "recyclable": "recyclable"},
    # Kaggle e-waste collections — all folders are e-waste
    "ewaste-images": {"*": "ewaste"},
    # Kaggle household-hazardous collections
    "hazardous-household": {"*": "hazardous"},
    # Kaggle biomedical collections
    "biomedical-waste": {"*": "biomedical"},
}


def find_category(dataset: str, rel_path: Path) -> str | None:
    """Map an image to a category using its folder names (nearest folder wins)."""
    mapping = SOURCE_MAPS.get(dataset)
    if mapping is None:
        return None
    for part in reversed(rel_path.parent.parts):
        hit = mapping.get(part.lower())
        if hit:
            return hit
    return mapping.get("*")


def iter_images(root: Path):
    for p in sorted(root.rglob("*")):
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS:
            yield p


def main() -> None:
    if not RAW.exists() or not any(RAW.iterdir()):
        raise SystemExit(
            f"Put downloaded Kaggle datasets inside {RAW} first "
            "(see docs/03-MODEL-PLAN-AND-TRAINING.md for links)."
        )
    if OUT.exists():
        shutil.rmtree(OUT)  # rebuild the prepared set from scratch

    manifest: list[tuple[str, str, str, str]] = []
    seen: set[str] = set()

    for dataset_dir in sorted(p for p in RAW.iterdir() if p.is_dir()):
        dataset = dataset_dir.name
        if dataset not in SOURCE_MAPS:
            print(f"  skipping {dataset}: no entry in SOURCE_MAPS")
            continue
        count = 0
        for img in iter_images(dataset_dir):
            rel = img.relative_to(dataset_dir)
            category = find_category(dataset, rel)
            if category is None:
                continue
            digest = hashlib.md5(img.read_bytes()).hexdigest()
            if digest in seen:  # same file shipped in two datasets — keep one
                continue
            seen.add(digest)
            roll = int(digest[:8], 16) / 0xFFFFFFFF  # deterministic split by content
            split = (
                "train" if roll < SPLIT[0]
                else "val" if roll < SPLIT[0] + SPLIT[1]
                else "test"
            )
            dest_dir = OUT / split / category
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / f"{dataset}_{digest[:12]}.jpg"
            with Image.open(img) as im:
                im.convert("RGB").resize(TARGET, Image.Resampling.LANCZOS).save(
                    dest, "JPEG", quality=88
                )
            manifest.append((str(dest.relative_to(ROOT)), category, dataset, split))
            count += 1
        print(f"  {dataset}: {count} images")

    if not manifest:
        raise SystemExit("No images matched SOURCE_MAPS — check the folder names.")

    with open(ROOT / "manifest.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["path", "category", "source", "split"])
        w.writerows(manifest)

    counts = Counter(row[1] for row in manifest)
    print("class counts:", dict(counts))
    print("splits:", dict(Counter(row[3] for row in manifest)))
    print("done -> ml/data/ + ml/manifest.csv")


if __name__ == "__main__":
    main()
