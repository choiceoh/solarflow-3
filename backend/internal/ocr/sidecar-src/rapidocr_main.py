"""PaddleOCR/RapidOCR sidecar for SolarFlow.

Protocol:
  stdin:  <image-or-pdf-path>\n
  stdout: {"ready": true}\n
          {"raw": [{"text": "...", "score": 0.99, "x0": 1, "y0": 2, "x1": 3, "y1": 4}]}\n
          {"error": "..."}\n
"""

import argparse
import json
import os
import sys


def _model_path(env_name: str, bundled_name: str) -> str:
    path = os.environ.get(env_name, "").strip()
    if path:
        return path

    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    candidate = os.path.join(base, "models", bundled_name)
    if os.path.isfile(candidate):
        return candidate
    return ""


def _build_reader():
    try:
        from rapidocr_onnxruntime import RapidOCR
    except Exception as exc:
        raise RuntimeError(
            "rapidocr_onnxruntime is not installed. Run scripts/setup_ocr_sidecar.sh "
            "or set OCR_PYTHON_BIN to a Python environment that has rapidocr-onnxruntime."
        ) from exc

    det = _model_path("OCR_DET_MODEL_PATH", "det.onnx")
    rec = _model_path("OCR_REC_MODEL_PATH", "rec.onnx")
    cls = _model_path("OCR_CLS_MODEL_PATH", "cls.onnx")
    keys = _model_path("OCR_REC_KEYS_PATH", "keys.txt")

    model_paths = (det, rec, cls, keys)
    present = [path for path in model_paths if path and os.path.isfile(path)]
    if len(present) == len(model_paths):
        return RapidOCR(
            det_model_path=det,
            rec_model_path=rec,
            cls_model_path=cls,
            rec_keys_path=keys,
        )
    if present or os.environ.get("OCR_REQUIRE_MODELS", "").strip() == "1":
        missing = [
            label
            for label, path in (("det.onnx", det), ("rec.onnx", rec), ("cls.onnx", cls), ("keys.txt", keys))
            if not path or not os.path.isfile(path)
        ]
        raise FileNotFoundError("missing OCR model files: " + ", ".join(missing))

    return RapidOCR()


def ocr_image(reader, image, y_offset: int = 0) -> list[dict]:
    # image: str(파일 경로) 또는 bytes(PNG/JPG 등). RapidOCR이 두 형식을 모두 받음
    result, _ = reader(image)
    rows = []
    if result:
        for box, text, score in result:
            xs = [point[0] for point in box]
            ys = [point[1] for point in box]
            rows.append(
                {
                    "text": text,
                    "score": float(score),
                    "x0": int(min(xs)),
                    "y0": int(min(ys)) + y_offset,
                    "x1": int(max(xs)),
                    "y1": int(max(ys)) + y_offset,
                }
            )
    return rows


def _pdf_dpi() -> int:
    # OCR_PDF_DPI=144~150으로 낮추면 OCR이 더 빨라짐. 200은 인식률 기준 기본값
    raw = os.environ.get("OCR_PDF_DPI", "").strip()
    if raw.isdigit():
        value = int(raw)
        if 72 <= value <= 600:
            return value
    return 200


def ocr_pdf(reader, path: str) -> list[dict]:
    try:
        import fitz
    except Exception as exc:
        raise RuntimeError(
            "PyMuPDF is not installed. Run scripts/setup_ocr_sidecar.sh "
            "or install PyMuPDF in OCR_PYTHON_BIN."
        ) from exc

    doc = fitz.open(path)
    rows = []
    y_offset = 0
    dpi = _pdf_dpi()
    try:
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            pix = page.get_pixmap(dpi=dpi)
            # PNG bytes를 메모리에서 직접 OCR로 — 디스크 임시 파일 IO 제거
            rows.extend(ocr_image(reader, pix.tobytes("png"), y_offset))
            y_offset += pix.height + 50
    finally:
        doc.close()
    return rows


def write_response(payload: dict) -> None:
    sys.stdout.buffer.write((json.dumps(payload, ensure_ascii=True) + "\n").encode("utf-8"))
    sys.stdout.flush()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="load OCR models once and exit")
    args = parser.parse_args()

    reader = _build_reader()
    write_response({"ready": True})
    if args.check:
        return

    for raw_line in sys.stdin.buffer:
        path = raw_line.decode("utf-8", errors="replace").strip()
        if not path:
            continue
        try:
            ext = os.path.splitext(path)[1].lower()
            if ext == ".pdf":
                rows = ocr_pdf(reader, path)
            else:
                rows = ocr_image(reader, path)
            write_response({"raw": rows})
        except Exception as exc:
            write_response({"error": str(exc)})


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        write_response({"error": str(exc)})
        raise
