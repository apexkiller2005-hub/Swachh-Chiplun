# ML training kit (Step 3) — offline MobileNetV3 classifier

Standalone — the web app does NOT depend on this folder. Train on CPU, a GPU
laptop, or Google Colab (free T4): upload `ml/`, enable GPU in the runtime menu.

## 3 commands

```bash
pip install -r ml/requirements.txt
python ml/prepare_dataset.py      # after downloading Kaggle datasets into ml/raw_datasets/
python ml/train.py                # → ml/outputs/best.onnx + confusion_matrix.png + metrics.json
python ml/inference_onnx.py any_photo.jpg   # prove it works
```

Dataset links and the folder-name → category mapping are documented in
`docs/03-MODEL-PLAN-AND-TRAINING.md` (§3.3). Edit `SOURCE_MAPS` in
`prepare_dataset.py` if your Kaggle dataset uses different folder names.

## Outputs

| File | What it is |
|---|---|
| `outputs/best.pt` | best validation weights |
| `outputs/best.onnx` | exported model (ONNX, dynamic batch) |
| `outputs/confusion_matrix.png` | report chart |
| `outputs/metrics.json` | per-epoch history + best accuracy |

## Mobile (TFLite)

Convert ONNX → TFLite with [onnx2tf](https://github.com/PINTO0309/onnx2tf), or
port `train.py` to TensorFlow/Keras (`MobileNetV3Small` in `tf.keras.applications`)
and call `tf.lite.TFLiteConverter` directly. Target: ~4–8 MB INT8 model.
