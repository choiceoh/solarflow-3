"""PDF DIGITAL vs SCAN 분류 + file_type 추정 (파일명 기반)."""

import re
from pathlib import Path

import fitz


def classify_pdf(pdf_path: str | Path) -> dict:
    """PDF 를 DIGITAL/THIN/SCAN 분류 + page_count + 텍스트 미리보기.

    Returns:
        {'classification': 'DIGITAL'|'THIN'|'SCAN'|'FAIL',
         'page_count': int, 'total_chars': int, 'avg_chars_per_page': float,
         'text_preview': str}
    """
    try:
        doc = fitz.open(str(pdf_path))
    except Exception as e:
        return {'classification': 'FAIL', 'error': str(e), 'page_count': 0,
                'total_chars': 0, 'avg_chars_per_page': 0, 'text_preview': ''}
    page_count = doc.page_count
    text = ''
    for p in doc:
        text += p.get_text('text')
    doc.close()
    avg = len(text) / max(page_count, 1)
    if avg >= 100:
        cls = 'DIGITAL'
    elif avg >= 30:
        cls = 'THIN'
    else:
        cls = 'SCAN'
    return {
        'classification': cls,
        'page_count': page_count,
        'total_chars': len(text),
        'avg_chars_per_page': round(avg, 1),
        'text_preview': text[:500],
    }


def classify_file_type_from_name(filename: str) -> str:
    """파일명 기반 file_type 추정 (BL/OBL/HBL/PL/CI/other).

    분류기 규칙은 inventory_pl_bl_pdfs.ts 와 동일 — 운영 표준.
    """
    up = filename.upper().replace('.PDF', '')
    if re.search(r'(?<![A-Z])(HBL|HWB|HAWB|MAWB|AWB)(?![A-Z])|HOUSE.?BL', up):
        return 'HBL'
    if re.search(r'(?<![A-Z])OBL(?![A-Z])|OCEAN.?BL', up):
        return 'OBL'
    if re.search(r'CI ?& ?PL|CI[_ -]?PL|PACKING.?LIST', up):
        return 'PL'
    if re.search(r'(?<![A-Z])PL(?![A-Z])', up):
        return 'PL'
    if (re.search(r'(?<![A-Z])BL(?![A-Z])|BL[ _-]DRAFT|BL[ _-]UPDATE|BL[ _-]COPY|COPY[ _-]BL|BL NO', up)
        or re.search(r'(?<![A-Z])[A-Z]{2,10}BL\d{4,}(?!\d)', up)
        or '提单' in filename):
        return 'BL'
    if re.search(r'(?<![A-Z])CI(?![A-Z])|COMMERCIAL.?INVOICE', up):
        return 'CI'
    if '수입신고필증' in filename or '수입필증' in filename or '면장' in filename:
        return 'declaration_kr'
    return 'other'
