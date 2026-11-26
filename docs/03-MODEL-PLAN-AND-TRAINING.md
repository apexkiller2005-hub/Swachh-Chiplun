# Step 3 — Model plan: CNN vs YOLO vs Vision-LLM (+ full training code)

## 3.1 The three candidate approaches

| | A. CNN + transfer learning (MobileNetV3 / EfficientNet-B0) | B. YOLO (v8/v11) object detection | C. Vision-LLM (gpt-5.4-class model) |
|---|---|---|---|
| What it does | One label per photo (classification) | Finds EVERY item + bounding boxes (detection) | One label + explains itself, reads barcodes, speaks Hindi/Marathi |
| Training data needed | 500–2,000 labelled images per class (folder labels) | Thousands of **bounding-box** annotations (expensive to make) | **Zero** — zero-shot |
| Speed | 5–20 ms on phone (TFLite ~4–10 MB) | 30–100 ms | 2–6 s per call, needs internet |
| Cost to run | Free on-device | Free on-device | Tokens per scan |
| Multilingual explanation | No | No | **Yes, built-in** |
| Handles low confidence | Returns a probability — you design the "ask user" flow yourself | Same | Can ask a clarifying question naturally |
| Weakness | Needs your own dataset; single-item only | Annotation cost; overkill for one-item photos | Latency, cost, offline = no |

## 3.2 Recommendation (what this project implements)

**Hybrid architecture — vision-LLM today, CNN as the offline upgrade:**

- **Now (built and live):** the app uses the **vision-LLM** for classification
  (`backend/routers/classify.py`). Zero training infrastructure, natural
  low-confidence follow-up questions, disposal steps grounded in Indian rules,
  and EN/HI/MR output — exactly what a working product needs on day one.
- **Later (complete kit included in `ml/`):** a fine-tuned **MobileNetV3-Small**
  exported to **ONNX** (→ TFLite for Android) becomes the on-device classifier,
  with the vision-LLM kept as a server fallback for low-confidence photos.
  This hybrid is the answer to "which model is best": *CNN at the edge for
  speed/offline, LLM in the cloud for reasoning — switch by confidence.*
- **YOLO** is deliberately not used: the product scans **one item at a time**
  held by the user, so detection's bounding boxes add cost without value. It
  becomes useful for a future "photograph the whole bin" NGO use-case.

## 3.3 The training kit in this repo (complete, runnable code)

```
ml/
├── prepare_dataset.py    # merges Kaggle datasets → 6-class ImageFolder + manifest.csv
├── train.py              # MobileNetV3-Small transfer learning + confusion matrix + ONNX export
├── inference_onnx.py     # test the exported model on any photo from the terminal
├── requirements.txt      # torch, torchvision, onnx, onnxruntime, scikit-learn, matplotlib
└── README.md             # 4-command quickstart
```

Run order (CPU is fine, GPU just faster — Google Colab free T4 also works):

```bash
pip install -r ml/requirements.txt
python ml/prepare_dataset.py      # after downloading datasets into ml/raw_datasets/
python ml/train.py                # → ml/outputs/best.onnx + confusion_matrix.png
python ml/inference_onnx.py some_photo.jpg
```

### Datasets to download (Kaggle) → put each folder inside `ml/raw_datasets/`

| Kaggle search / dataset | Gives you |
|---|---|
| "Garbage Classification" (TrashNet-style, ~7k images) | cardboard, glass, metal, paper, plastic, trash |
| "Organic and Recyclable waste" (~22k) | organic vs recyclable |
| "E-waste / Electronic waste images" collections | phones, PCBs, batteries, cables |
| "Household hazardous waste" collections | paints, chemicals, medicines |
| "Biomedical / medical waste" collections | masks, syringes |

`prepare_dataset.py` maps every source folder name → your 6 app categories
(edit `SOURCE_MAPS` at the top if your folder names differ), **de-duplicates by
file hash**, resizes to 224×224, and splits 70/15/15 by hash (same split every
re-run — your test set never leaks into training).

### What `train.py` implements (viva answers)

- **Transfer learning**: MobileNetV3-Small pre-trained on ImageNet; only the
  final linear layer is replaced for 6 classes; all conv features start from
  ImageNet knowledge (why: you have thousands of images, not millions).
- **Augmentation**: RandomResizedCrop(70–100%), horizontal flip, rotation ±25°,
  color jitter — simulates the messy real photos of Chiplun.
- **Class imbalance**: cross-entropy loss weighted inversely by class count +
  label smoothing 0.1 (biomedical photos are scarce — weights stop the model
  from ignoring rare-but-critical classes).
- **Metrics**: per-class precision/recall/F1 (`classification_report`) and a
  saved **confusion matrix PNG** — the chart your teacher will ask for.
- **Export**: `torch.onnx.export` with dynamic batch → `best.onnx`, then
  sanity-checked with onnxruntime. ONNX→TFLite: convert with `onnx2tf`, or
  re-run the same pipeline in TensorFlow/Keras for a native `.tflite`.
- **Expected result**: 80–92% validation accuracy on the merged set;
  typical confusions are paper-vs-organic (soiled items) — exactly what the
  app's low-confidence follow-up question is designed to rescue.

## 3.4 How the trained model plugs into the app later

1. Add an `/api/classify/onnx` endpoint that runs `onnxruntime` on the uploaded
   image (same JSON response as the LLM route).
2. Route logic in the frontend: try on-device/ONNX first → if confidence < 0.65
   → send to the vision-LLM route → LLM's follow-up question UX.
3. For mobile: convert `best.onnx` → `best.tflite`, bundle with the app — fully
   offline scanning for NGO field workers without connectivity.
