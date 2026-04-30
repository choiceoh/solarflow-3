#!/usr/bin/env bash
# Install and smoke-check the PaddleOCR/RapidOCR sidecar runtime.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
SIDECAR_DIR="${BACKEND_DIR}/internal/ocr/sidecar-src"
VENV_DIR="${OCR_VENV_DIR:-${BACKEND_DIR}/.venv-ocr}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "missing Python: ${PYTHON_BIN}" >&2
  exit 1
fi

echo "SolarFlow OCR sidecar setup"
echo "root: ${ROOT_DIR}"
echo "venv: ${VENV_DIR}"

"${PYTHON_BIN}" -m venv "${VENV_DIR}"

if [[ -x "${VENV_DIR}/bin/python" ]]; then
  OCR_PY="${VENV_DIR}/bin/python"
elif [[ -x "${VENV_DIR}/Scripts/python.exe" ]]; then
  OCR_PY="${VENV_DIR}/Scripts/python.exe"
else
  echo "venv python not found under ${VENV_DIR}" >&2
  exit 1
fi

"${OCR_PY}" -m pip install --upgrade pip
"${OCR_PY}" -m pip install -r "${SIDECAR_DIR}/requirements.txt"

echo ""
echo "Checking OCR sidecar model load..."
if command -v timeout >/dev/null 2>&1; then
  timeout "${OCR_INIT_TIMEOUT:-180}" "${OCR_PY}" "${SIDECAR_DIR}/rapidocr_main.py" --check
else
  "${OCR_PY}" "${SIDECAR_DIR}/rapidocr_main.py" --check
fi

echo ""
echo "OCR sidecar runtime is ready."
echo "Default auto-detected Python:"
echo "  ${OCR_PY}"
echo ""
echo "For launchd/plist environments, set these if the service working directory is unusual:"
echo "  OCR_PYTHON_BIN=${OCR_PY}"
echo "  OCR_SIDECAR_SCRIPT=${SIDECAR_DIR}/rapidocr_main.py"
