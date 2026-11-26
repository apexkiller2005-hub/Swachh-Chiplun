"""Test the exported ONNX model on any photo from the terminal:

    python ml/inference_onnx.py path/to/photo.jpg
"""

import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

CLASSES = ["ewaste", "recyclable", "general", "organic", "hazardous", "biomedical"]
IMG = 224
MEAN, STD = np.array([0.485, 0.456, 0.406]), np.array([0.229, 0.224, 0.225])


def preprocess(path: str) -> np.ndarray:
    im = Image.open(path).convert("RGB").resize((IMG, IMG))
    x = np.asarray(im, dtype=np.float32) / 255.0
    x = (x - MEAN) / STD
    return x.transpose(2, 0, 1)[None]  # HWC -> CHW, add batch dim


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: python ml/inference_onnx.py <photo.jpg>")
    onnx_path = Path(__file__).resolve().parent / "outputs" / "best.onnx"
    if not onnx_path.exists():
        raise SystemExit("No ml/outputs/best.onnx — run ml/train.py first.")
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    logits = session.run(None, {"image": preprocess(sys.argv[1])})[0][0]
    probs = np.exp(logits - logits.max())
    probs /= probs.sum()
    print(f"{Path(sys.argv[1]).name}:")
    for i in probs.argsort()[::-1][:3]:
        print(f"  {CLASSES[i]:12s} {probs[i]:.1%}")


if __name__ == "__main__":
    main()
