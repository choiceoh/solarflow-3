"""PDF 본문 추출 통합 모듈.

지원하는 PDF 유형:
- BL / OBL / HBL (선하증권, 항공운송장 — 보통 스캔본)
- PL (Packing List — 보통 디지털)
- CI (Commercial Invoice — 디지털)
- 면장 (수입신고필증 — 디지털)

사용:
  from pdf_extract import extract
  result = extract('path/to/file.pdf', file_type='BL')
  # → {'classification': 'SCAN'|'DIGITAL', 'parsed': {...}, 'raw_text': '...'}

CLI:
  python -m scripts.pdf_extract path/to/file.pdf [--file-type BL]
  python -m scripts.pdf_extract path/to/file.pdf --json
  python -m scripts.pdf_extract path/to/directory/  --batch  # 디렉토리 일괄
"""

from .classify import classify_pdf
from .digital import parse_digital
from .ocr import ocr_pdf, parse_ocr_bl
from .extract import extract, extract_batch

__all__ = ['extract', 'extract_batch', 'classify_pdf', 'parse_digital', 'ocr_pdf', 'parse_ocr_bl']
