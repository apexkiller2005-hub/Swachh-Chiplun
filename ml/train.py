"""Step 3 — Train MobileNetV3-Small (transfer learning) on the merged dataset
and export to ONNX. From the project root:

    pip install -r ml/requirements.txt
    python ml/prepare_dataset.py     # first: build ml/data/ from your Kaggle downloads
    python ml/train.py               # CPU works; GPU/Colab-T4 is ~10x faster

Outputs in ml/outputs/:
  best.pt                 trained weights
  best.onnx               exported model (dynamic batch) — ready for onnxruntime/TFLite conversion
  confusion_matrix.png    the evaluation chart for your report
  metrics.json            per-epoch history + best accuracy
"""

import json
import time
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import classification_report, confusion_matrix
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms

ROOT = Path(__file__).resolve().parent
DATA, OUT = ROOT / "data", ROOT / "outputs"
CLASSES = ["ewaste", "recyclable", "general", "organic", "hazardous", "biomedical"]
EPOCHS, BATCH, LR, IMG = 15, 32, 3e-4, 224
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

IMAGENET_MEAN, IMAGENET_STD = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]

train_tf = transforms.Compose(
    [
        transforms.RandomResizedCrop(IMG, scale=(0.7, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(25),
        transforms.ColorJitter(0.3, 0.3, 0.3),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ]
)
val_tf = transforms.Compose(
    [
        transforms.Resize(int(IMG * 1.15)),
        transforms.CenterCrop(IMG),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ]
)


@torch.no_grad()
def evaluate(model, loader) -> float:
    model.eval()
    correct = 0
    for x, y in loader:
        pred = model(x.to(DEVICE)).argmax(1).cpu()
        correct += (pred == y).sum().item()
    return correct / len(loader.dataset)


@torch.no_grad()
def collect_predictions(model, loader) -> tuple[list[int], list[int]]:
    model.eval()
    ys, ps = [], []
    for x, y in loader:
        ps += model(x.to(DEVICE)).argmax(1).cpu().tolist()
        ys += y.tolist()
    return ys, ps


def save_confusion_matrix(cm: np.ndarray, path: Path, acc: float) -> None:
    fig, ax = plt.subplots(figsize=(6.5, 5.5))
    im = ax.imshow(cm, cmap="Greens")
    fig.colorbar(im)
    ax.set_xticks(range(len(CLASSES)))
    ax.set_xticklabels(CLASSES, rotation=30, ha="right")
    ax.set_yticks(range(len(CLASSES)))
    ax.set_yticklabels(CLASSES)
    for i in range(len(CLASSES)):
        for j in range(len(CLASSES)):
            ax.text(j, i, str(cm[i][j]), ha="center", va="center")
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    ax.set_title(f"MobileNetV3-Small — validation accuracy {acc:.1%}")
    fig.tight_layout()
    fig.savefig(path, dpi=140)
    plt.close(fig)


def main() -> None:
    if not (DATA / "train").exists():
        raise SystemExit("Run  python ml/prepare_dataset.py  first (ml/data/ missing).")

    tr = datasets.ImageFolder(DATA / "train", train_tf)
    va = datasets.ImageFolder(DATA / "val", val_tf)
    print(f"device={DEVICE}  train={len(tr)}  val={len(va)}  classes={tr.classes}")

    trl = DataLoader(tr, batch_size=BATCH, shuffle=True, num_workers=2, pin_memory=True)
    val = DataLoader(va, batch_size=BATCH, num_workers=2)

    # Transfer learning: ImageNet-pretrained backbone, new 6-class head
    model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
    model.classifier[3] = nn.Linear(model.classifier[3].in_features, len(CLASSES))
    model = model.to(DEVICE)

    # Inverse-frequency class weights — rare classes (biomedical!) still get learned
    counts = np.bincount(tr.targets, minlength=len(CLASSES))
    weights = torch.tensor(len(tr.targets) / (np.maximum(counts, 1) * len(CLASSES)), dtype=torch.float32).to(DEVICE)
    criterion = nn.CrossEntropyLoss(weight=weights, label_smoothing=0.1)
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)

    OUT.mkdir(exist_ok=True)
    best, history = 0.0, []
    for epoch in range(1, EPOCHS + 1):
        model.train()
        t0, running = time.time(), 0.0
        for x, y in trl:
            x, y = x.to(DEVICE), y.to(DEVICE)
            optimizer.zero_grad()
            loss = criterion(model(x), y)
            loss.backward()
            optimizer.step()
            running += loss.item() * len(y)
        scheduler.step()
        acc = evaluate(model, val)
        history.append({"epoch": epoch, "train_loss": running / len(tr), "val_acc": acc})
        print(f"epoch {epoch:2d}: train_loss={running / len(tr):.3f}  val_acc={acc:.3f}  ({time.time() - t0:.0f}s)")
        if acc > best:
            best = acc
            torch.save(model.state_dict(), OUT / "best.pt")

    # Final evaluation with the best weights
    model.load_state_dict(torch.load(OUT / "best.pt", map_location=DEVICE))
    ys, ps = collect_predictions(model, val)
    print(classification_report(ys, ps, target_names=CLASSES, zero_division=0))
    cm = confusion_matrix(ys, ps)
    save_confusion_matrix(cm, OUT / "confusion_matrix.png", best)

    # Export to ONNX (dynamic batch) — the format TFLite converters accept
    model = model.cpu().eval()
    dummy = torch.randn(1, 3, IMG, IMG)
    torch.onnx.export(
        model,
        dummy,
        OUT / "best.onnx",
        input_names=["image"],
        output_names=["logits"],
        dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}},
    )

    with open(OUT / "metrics.json", "w") as f:
        json.dump({"best_val_acc": best, "classes": CLASSES, "history": history}, f, indent=2)
    print(f"done — best val accuracy {best:.1%} -> ml/outputs/best.onnx, confusion_matrix.png")


if __name__ == "__main__":
    main()
