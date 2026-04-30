# SolarFlow OCR sidecar

SolarFlow OCR uses the same architecture as `../module`: Go keeps a
PaddleOCR/RapidOCR Python sidecar alive and communicates through one
JSON line per request.

## Runtime setup

From the repository root:

```bash
./scripts/setup_ocr_sidecar.sh
```

The script creates `backend/.venv-ocr`, installs:

- `rapidocr-onnxruntime`
- `PyMuPDF`

Then it runs `rapidocr_main.py --check` so missing packages or model
load failures surface before operators upload documents.

`ocr.NewFromEnv()` automatically prefers this venv:

```text
backend/.venv-ocr/bin/python
```

If you use a different Python environment, set:

```bash
OCR_PYTHON_BIN=/absolute/path/to/python
OCR_SIDECAR_SCRIPT=/absolute/path/to/backend/internal/ocr/sidecar-src/rapidocr_main.py
```

## Optional explicit ONNX models

The sidecar can run with RapidOCR's packaged defaults, but production
accuracy should use explicit model files. Place these files in
`backend/internal/ocr/sidecar-src/models/`:

| Local filename | Meaning |
| --- | --- |
| `det.onnx` | Detection model |
| `rec.onnx` | Recognition model |
| `cls.onnx` | Angle classifier |
| `keys.txt` | Recognition dictionary paired with `rec.onnx` |

If any one of these files exists, all four are required. To force
explicit models, set:

```bash
OCR_REQUIRE_MODELS=1
```

You may also point to files outside the repository:

```bash
OCR_DET_MODEL_PATH=/models/det.onnx
OCR_REC_MODEL_PATH=/models/rec.onnx
OCR_CLS_MODEL_PATH=/models/cls.onnx
OCR_REC_KEYS_PATH=/models/keys.txt
```

## API health check

After the Go server is running, warm the sidecar:

```bash
curl -H "Authorization: Bearer <token>" \
  "http://127.0.0.1:8080/api/v1/ocr/health?warm=1"
```

Expected ready response:

```json
{"status":"ready","configured":true,"running":true,"ready":true}
```

## Protocol

The sidecar writes `{"ready": true}` once the OCR models are loaded.
After that Go sends one image/PDF path per stdin line and receives one
JSON result per stdout line:

```text
> /tmp/scan.pdf
< {"raw":[{"text":"...", "score":0.99, "x0":1, "y0":2, "x1":3, "y1":4}]}
```
