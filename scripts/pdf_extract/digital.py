"""디지털 PDF (CI/PL/디지털 BL/면장) 정규식 파서.

extract_and_load_pdfs.py 의 파서 로직을 모듈화.
"""

import re
from pathlib import Path

import fitz

# === 정규식 패턴 (CI/PL 공통) ===
RE_INVOICE_NO = re.compile(r'Invoice\s*No\.?[.:：\s]*([A-Z][A-Z0-9]{6,20})', re.IGNORECASE)
RE_LC_NO = re.compile(r'DOCUMENTARY\s*CREDIT\s*NUMBER[.:：\s]+([A-Z0-9]{10,30})', re.IGNORECASE)
RE_PA_NO = re.compile(r'P\.?A\.?\s*No\.?[.:：\s]*([A-Z]{3,5}[A-Z0-9]{6,20})', re.IGNORECASE)
RE_HS_CODE = re.compile(r'(?:Hs|H\.?S\.?)\s*Code[.:：\s]*([\d.]+)', re.IGNORECASE)
RE_TRADE_TERM = re.compile(r'Trade\s*Term\s*[:：]?\s*([A-Z]{3})\b', re.IGNORECASE)
RE_INCOTERMS = re.compile(r'\b(CIF|FOB|DDP|DAP|EXW|CFR)\b\s+[A-Z][A-Z ]+(?:PORT|KOREA)', re.IGNORECASE)
RE_COUNTRY_ORIGIN = re.compile(r'Country\s*of\s*Origin\s*[:：]?\s*([^\r\n]+)', re.IGNORECASE)

RE_MODEL = re.compile(
    r'\b(JKM\d{3}[A-Z]-\d{2,3}[A-Z]{2,5}-?[A-Z0-9-]*'
    r'|JAM\d{2,3}[A-Z]\d{2}\s*[A-Z]{1,3}'
    r'|LR\d-\d{2,3}[A-Z]{2,5}-\d{3}[A-Z]?'
    r'|RSM\d{3}-\d-\d{3}[A-Z]{2,5}'
    r'|TSM-NEG\d{2}[A-Z]\.\d{2}[A-Z]?'
    r')\b'
)

RE_QTY_PC = re.compile(r'([\d,]{4,})\s*PC(?:S)?\b', re.IGNORECASE)
RE_TOTAL_WATT = re.compile(r'([\d,]{6,})\s*(?:WP?T?T?|WATT)\b', re.IGNORECASE)
RE_TOTAL_WATT_MW = re.compile(r'([\d.]+)\s*MW\b', re.IGNORECASE)
RE_USD_PER_WATT = re.compile(r'USD\s*([\d.]+)\s*/\s*WP', re.IGNORECASE)
RE_TOTAL_USD = re.compile(r'(?:TOTAL\s+AMOUNT\s*[:：(]*USD?\)?|USD)\s*([\d,]{4,})\.\d{2}\b', re.IGNORECASE)

RE_NET_WEIGHT = re.compile(r'Net\s*Weight[^\d]{0,30}([\d,]{4,})', re.IGNORECASE)
RE_GROSS_WEIGHT = re.compile(r'Gross\s*Weight[^\d]{0,30}([\d,]{4,})', re.IGNORECASE)
RE_PALLETS = re.compile(r'(?:No\.\s*of\s*)?Pallets?[^\d]{0,20}([\d,]+)', re.IGNORECASE)
RE_PALLETS_ALT = re.compile(r'([\d,]+)\s*PALLETS?\b', re.IGNORECASE)
RE_CBM = re.compile(r'([\d.,]+)\s*CBM\b', re.IGNORECASE)

# 수입신고필증 (한국)
RE_DECL_NO = re.compile(r'신고번호[\s\r\n]*([\d-]+[A-Z]?)')
RE_DECL_DATE = re.compile(r'신고일[\s\r\n]*(\d{4}/\d{2}/\d{2})')
RE_BL_AWB = re.compile(r'B/L\(AWB\)번호[\s\r\n]*([A-Z][A-Z0-9]{6,20})')
RE_MASTER_BL = re.compile(r'MASTER B/L번호[\s\r\n]*([A-Z][A-Z0-9]{6,20})')
RE_TOTAL_WEIGHT_KG = re.compile(r'총중량[\s\r\n]*([\d,]+)\s*KG')
RE_TOTAL_PACKAGES = re.compile(r'총포장갯수[\s\r\n]*([\d,]+)\s*PG')
RE_CIF_USD = re.compile(r'과세가격\(CIF\)[\s\r\n]*\$?\s*([\d,]+)')
RE_EXCHANGE_RATE = re.compile(r'환\s*율[\s\r\n]*([\d,]+\.\d+)')
RE_HS_CODE_KR = re.compile(r'세번부호[\s\r\n]*([\d.-]+)')


def _to_int(s):
    if not s: return None
    try: return int(s.replace(',', '').replace('.', '').strip())
    except ValueError: return None


def _to_float(s):
    if not s: return None
    try: return float(s.replace(',', '').strip())
    except ValueError: return None


def _first(pat, text, group=1):
    m = pat.search(text)
    return m.group(group) if m else None


def parse_commercial_doc(text: str, file_type: str) -> dict:
    """CI/PL 공통 핵심 필드 추출."""
    p = {}
    for key, pat in [
        ('invoice_no', RE_INVOICE_NO),
        ('lc_no', RE_LC_NO),
        ('pa_no', RE_PA_NO),
    ]:
        v = _first(pat, text)
        if v: p[key] = v
    hs = _first(RE_HS_CODE, text)
    if hs: p['hs_code'] = hs.replace('.', '')
    tt = _first(RE_TRADE_TERM, text)
    if tt: p['trade_term'] = tt.upper()
    else:
        m = RE_INCOTERMS.search(text)
        if m: p['trade_term'] = m.group(1).upper()
    co = _first(RE_COUNTRY_ORIGIN, text)
    if co: p['country_of_origin'] = co.strip()
    model = _first(RE_MODEL, text)
    if model: p['model'] = model
    qty = _to_int(_first(RE_QTY_PC, text))
    if qty: p['qty_pc'] = qty
    watt = _to_int(_first(RE_TOTAL_WATT, text))
    if watt and watt > 1000:
        p['total_watt'] = watt
    else:
        mw = _to_float(_first(RE_TOTAL_WATT_MW, text))
        if mw and 0.5 <= mw <= 500:
            p['total_watt'] = int(mw * 1_000_000)

    if file_type in ('CI', 'commercial_invoice'):
        upw = _to_float(_first(RE_USD_PER_WATT, text))
        if upw: p['unit_price_usd_wp'] = upw
        tu = _first(RE_TOTAL_USD, text)
        if tu: p['total_usd'] = _to_float(tu)

    if file_type in ('PL', 'packing_list'):
        nw = _to_int(_first(RE_NET_WEIGHT, text))
        if nw: p['net_weight_kg'] = nw
        gw = _to_int(_first(RE_GROSS_WEIGHT, text))
        if gw: p['gross_weight_kg'] = gw
        pal = _to_int(_first(RE_PALLETS_ALT, text)) or _to_int(_first(RE_PALLETS, text))
        if pal and pal != p.get('qty_pc') and pal <= 5000:
            p['pallets'] = pal
        cbm = _to_float(_first(RE_CBM, text))
        if cbm: p['cbm'] = cbm

    return p


def parse_declaration_kr(text: str) -> dict:
    """수입신고필증 (한국 관세청 PDF)."""
    p = {}
    for k, pat in [
        ('declaration_no', RE_DECL_NO),
        ('declaration_date', RE_DECL_DATE),
        ('bl_awb_no', RE_BL_AWB),
        ('master_bl_no', RE_MASTER_BL),
    ]:
        v = _first(pat, text)
        if v:
            p[k] = v if k != 'declaration_date' else v.replace('/', '-')
    tw = _to_int(_first(RE_TOTAL_WEIGHT_KG, text))
    if tw: p['total_weight_kg'] = tw
    tp = _to_int(_first(RE_TOTAL_PACKAGES, text))
    if tp: p['total_packages_pg'] = tp
    cu = _to_float(_first(RE_CIF_USD, text))
    if cu: p['cif_usd'] = cu
    er = _to_float(_first(RE_EXCHANGE_RATE, text))
    if er: p['exchange_rate'] = er
    hk = _first(RE_HS_CODE_KR, text)
    if hk: p['hs_code'] = hk.replace('.', '').replace('-', '')
    return p


def parse_digital(text: str, file_type: str) -> tuple[dict, str]:
    """디지털 PDF 텍스트 파싱 라우터.

    Returns:
        (parsed_dict, extractor_subtype)
    """
    ft = file_type.lower()
    is_kr_decl = '수 입 신 고 필 증' in text or '수입신고필증' in text or 'B/L(AWB)번호' in text
    if is_kr_decl:
        return parse_declaration_kr(text), 'kr-declaration'
    if ft in ('ci', 'commercial_invoice'):
        return parse_commercial_doc(text, 'CI'), 'commercial-invoice'
    if ft in ('pl', 'packing_list'):
        return parse_commercial_doc(text, 'PL'), 'packing-list'
    if ft in ('bl', 'obl', 'hbl', 'bill_of_lading', 'ocean_bl', 'house_bl', 'declaration_kr'):
        # 디지털 BL — 정규식 파서 (OCR 파서로 fallback 가능)
        from .ocr import parse_ocr_bl
        return parse_ocr_bl(text), 'bill-of-lading-digital'
    return {}, 'unknown'


def fitz_extract_text(pdf_path: str | Path) -> tuple[str, int]:
    """fitz 로 텍스트 + 페이지 수 추출."""
    doc = fitz.open(str(pdf_path))
    text = ''
    for p in doc:
        text += p.get_text('text') + '\n'
    page_count = doc.page_count
    doc.close()
    return text, page_count
