"""통합 진입점 — PDF 1개 → 자동 분류 → 적절한 파서 → JSON."""

from pathlib import Path

from .classify import classify_pdf, classify_file_type_from_name
from .digital import fitz_extract_text, parse_digital
from .ocr import ocr_pdf, parse_ocr_bl


def extract(pdf_path: str | Path, file_type: str | None = None) -> dict:
    """PDF 1개에서 정형 데이터 추출.

    Args:
        pdf_path: PDF 파일 경로
        file_type: 명시적 file_type ('BL'/'OBL'/'HBL'/'PL'/'CI'/'declaration_kr' 등).
                   None 이면 파일명에서 자동 추정.

    Returns:
        {
          'pdf_path': str,
          'file_type': str,
          'classification': 'DIGITAL'|'SCAN'|...,
          'page_count': int,
          'extractor': str,             # 'fitz-regex' or 'rapidocr+regex' 등
          'parse_status': 'success'|'partial'|'failed',
          'parsed': dict,                # 추출된 정형 필드
          'raw_text': str,               # 원본 텍스트
        }
    """
    pdf_path = Path(pdf_path)
    if file_type is None:
        file_type = classify_file_type_from_name(pdf_path.name)

    cls_info = classify_pdf(pdf_path)
    cls = cls_info['classification']

    if cls in ('DIGITAL', 'THIN'):
        text, page_count = fitz_extract_text(pdf_path)
        parsed, subtype = parse_digital(text, file_type)
        extractor = f'fitz-regex+{subtype}'
    elif cls == 'SCAN':
        text, page_count = ocr_pdf(pdf_path)
        # BL/OBL/HBL 이면 OCR BL 파서, 아니면 일반 정규식 파서
        if file_type in ('BL', 'OBL', 'HBL'):
            parsed = parse_ocr_bl(text)
            extractor = 'rapidocr+bl-regex'
        else:
            parsed, subtype = parse_digital(text, file_type)
            extractor = f'rapidocr+{subtype}'
    else:
        text, page_count = '', 0
        parsed = {}
        extractor = 'failed'

    if parsed:
        status = 'success' if len(parsed) >= 4 else 'partial'
    else:
        status = 'failed'

    return {
        'pdf_path': str(pdf_path),
        'file_type': file_type,
        'classification': cls,
        'page_count': page_count,
        'extractor': extractor,
        'parse_status': status,
        'parsed': parsed,
        'raw_text': text,
    }


def extract_batch(pdf_dir: str | Path, file_types: list[str] | None = None) -> list[dict]:
    """디렉토리 안 모든 PDF 일괄 처리."""
    pdf_dir = Path(pdf_dir)
    results = []
    for pdf in pdf_dir.rglob('*.pdf'):
        try:
            r = extract(pdf)
            if file_types is None or r['file_type'] in file_types:
                results.append(r)
        except Exception as e:
            results.append({
                'pdf_path': str(pdf),
                'parse_status': 'failed',
                'error': str(e),
            })
    return results
