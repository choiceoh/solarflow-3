"""스캔 PDF OCR (RapidOCR) + BL/OBL/HBL 정규식 파서.

parse_ocr_bl.py 의 정규식 + ocr_scan_pdfs.py 의 OCR 흐름 통합.
"""

import re
from collections import Counter
from pathlib import Path

import fitz

# === OCR 노이즈 대응 정규식 (parse_ocr_bl.py 의 v4 최종) ===
RE_BL_NO_LABEL = re.compile(
    r'B\s*/\s*L\s*[Nn][o0O]?\.?[\s:]{0,5}(?:[\s\S]{0,200}?)\b([A-Z]{3,8}\d{6,14})\b',
    re.IGNORECASE,
)
RE_BL_NO_BARE = re.compile(
    r'\b((?:SNKO|SNKO03[A-Z]?|JWSH|EASEK|SHKWA|DJSCNGB|DFS\d|NPSELHT|ESZX|SELYIT|'
    r'SHAD[A-Z]{1,3}|SHAC[A-Z]{1,3}|HGHDC|HDMUSHAA|COHESY|PCSLJBL|PCCLBL|'
    r'HASLC|JBKR|WXAE|JAHF|SHACYV|SELHTZ|TMNBKPTR|EASLINE|RSPN|TED|LS\d|'
    r'KD\d|SNK[0O]03)[0O]*\d{6,14})\b'
)

CN_CITIES = r'(?:NINGBO|SHANGHAI|SHAHGHAI|SHENZHEN|GUANGZHOU|QINGDAO|TIANJIN|XIAMEN|YANTIAN|YANTAI|DALIAN|FUZHOU|HONGKONG)'
KR_CITIES = r'(?:KWANGYANG|GWANGYANG|KWAHGYANG|BUSAN|PUSAN|INCHEON|INCHON|PYEONGTAEK|PYUNGTAEK|PYONGTAEK|ULSAN|GUNSAN|MOKPO|YEOSU|POHANG)'
RE_POL = re.compile(rf'({CN_CITIES})', re.IGNORECASE)
RE_POD = re.compile(rf'({KR_CITIES})', re.IGNORECASE)

RE_CONTAINER_45 = re.compile(r'\b([A-Z]{3,4}\d{6,7})\s*/\s*([A-Z0-9]+)\s*//?\s*(4[0-5]G?\d|40\'?H[CQ]?)')
RE_CONTAINER_OBL = re.compile(r'\b([A-Z]{3,4}\d{6,7})\s*/\s*([A-Z0-9]+)\s*/\s*(\d{2}\'?H[CQ]?)\b')
RE_CONTAINER_BL = re.compile(r'(\d{2}H[CQ]?)\s*([A-Z]{3,4}\d{6,7})\s*([A-Z0-9]{4,18})')
RE_CONTAINER_BARE = re.compile(
    r'\b((?:'
    r'SKHU|TEMU|TCNU|SEGU|CAIU|TCLU|MSDU|MSCU|MAEU|HLBU|TGHU|EAXU|FSU|TRHU|UACU|FCIU|GLDU|BMOU|TLLU|ZIMU|MRKU|HCIU|'
    r'HMMU|KOCU|CAAU|TXGU|TTNU|GAOU|QNNU|EISU|FANU|TGBU|CSNU|EITU|BSIU|DRYU|UESU|CRSU|HLXU|OOLU|OOCU|CMAU|APHU|APLU|APRU|'
    r'SUDU|YMLU|YMMU|YMUU|HJCU|HJSU|ZCSU|EVRU|FCXU|UASU|UAFU|UESL|MGLU|MAGU|NSLU|GESU|GVCU|GCNU|WHLU|WHSU'
    r')\d{6,7})\b'
)

RE_WEIGHT = re.compile(r'([\d,]{4,})\s*\.?\s*\d*\s*KG[Ss]?\b')
RE_WEIGHT_LOOSE = re.compile(r'([\d,]{4,})\.\d{3}KG[Ss]?')
RE_CBM = re.compile(r'([\d.,]+)\s*CBM\b')
RE_PALLETS_ALT = re.compile(r'(\d{2,4})\s*PALLETS?\b', re.IGNORECASE)
RE_TOTAL_PALLETS = re.compile(
    r'TOTAL[\s:]+(?:TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|TWENTY|THIRTY|FORTY|FIFTY|HUNDRED|AND|\s)+\((\d+)\)\s*PALLETS?',
    re.IGNORECASE,
)
RE_LC_IN_BL = re.compile(r'DOCUMENTARY\s*CREDIT\s*NUMBER\s*[:\s]*([A-Z][A-Z0-9]{8,25})', re.IGNORECASE)
RE_LC_BARE = re.compile(r'\b(M[A-Z0-9]{2,8}\d{2}NU\d{5,6})\b')
RE_HS = re.compile(r'HS\s*N[O0o]\.?\s*[:.\s]*([\d.]{8,12})', re.IGNORECASE)
RE_HS_BARE = re.compile(r'\b(85\d{2}[.\s]?\d{2}[.\s]?\d{4})\b')

RE_MODEL = re.compile(
    r'(?:TIGER\s*NE[O0]?\s*)?(JKM\d{3}[A-Z]?)\s*[-~]?\s*'
    r'(\d{2,3}[A-Z]+)(?:\s*[-~]\s*([A-Z]+))?(?:\s*[-~]\s*([A-Z]))?'
)
RE_MODEL_OTHER = re.compile(
    r'\b(JAM\d{2,3}[A-Z]\d{2}\s*[A-Z]{1,3}'
    r'|LR\d-\d{2,3}[A-Z]{2,5}-\d{3}[A-Z]?'
    r'|RSM\d{3}-\d-\d{3}[A-Z]{2,5}'
    r'|TSM[-\s]?NEG\d{2}[A-Z]\.\d{2}[A-Z]?'
    r'|VERTEX\s*NEG\d{2}[A-Z]?'
    r')\b'
)

RE_DATE_PATTERNS = [
    re.compile(r'\b([A-Z]{3}\.?\s*\d{1,2}\.?\s*,?\s*20[2-3]\d)\b'),
    re.compile(r'\b(\d{1,2}\s+[A-Z]{3}\s+20[2-3]\d)\b'),
    re.compile(r'\b(20[2-3]\d[./-]\d{1,2}[./-]\d{1,2})\b'),
    re.compile(r'(?:ATD|ETD|ETA)[\s.:]*([A-Z]{3,5}\.?\s*\d{1,2}\.?\s*\d{2,4})', re.IGNORECASE),
    re.compile(r'(?:LC\s*)?DATE\s*[O0]F?\s*ISSUE[\s.:]*((?:24|25|26)\d{4})', re.IGNORECASE),
    re.compile(r'(?<!\d)((?:24|25|26)(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))(?!\d)'),
]


def parse_ocr_bl(text: str) -> dict:
    """OCR 처리된 BL/OBL/HBL 텍스트에서 정형 데이터 추출.

    13 필드 평균 92% 추출률 (운영 데이터 97 PDF 기준).
    """
    p = {}

    # BL no — bare 시리얼 우선
    m = RE_BL_NO_BARE.search(text) or RE_BL_NO_LABEL.search(text)
    if m:
        p['bl_no_in_pdf'] = m.group(1)

    # LC — bare 화이트리스트 (M...NU...) 우선, 라벨 fallback
    m = RE_LC_BARE.search(text) or RE_LC_IN_BL.search(text)
    if m: p['lc_no'] = m.group(1)

    # HS code
    m = RE_HS.search(text) or RE_HS_BARE.search(text)
    if m: p['hs_code'] = m.group(1).replace('.', '').replace(' ', '')

    # Model
    m = RE_MODEL.search(text)
    if m:
        parts = [g for g in m.groups() if g]
        if len(parts) >= 2:
            p['model'] = '-'.join(parts)
    if 'model' not in p:
        m = RE_MODEL_OTHER.search(text)
        if m: p['model'] = m.group(1)

    # Ports
    m = RE_POL.search(text)
    if m: p['port_of_loading'] = m.group(1).upper().strip()
    pod_matches = list(RE_POD.finditer(text))
    if pod_matches:
        cities = [mm.group(1).upper().strip() for mm in pod_matches]
        most_common = Counter(cities).most_common(1)[0][0]
        p['port_of_discharge'] = most_common
        p['place_of_delivery'] = most_common

    # Containers (4단계 fallback)
    containers = []
    for cre in (RE_CONTAINER_45, RE_CONTAINER_OBL):
        if containers: break
        for m in cre.finditer(text):
            containers.append({'container': m.group(1), 'seal': m.group(2), 'iso': m.group(3)})
    if not containers:
        for m in RE_CONTAINER_BL.finditer(text):
            containers.append({'iso': m.group(1), 'container': m.group(2), 'seal': m.group(3)})
    if not containers:
        bare = set(RE_CONTAINER_BARE.findall(text))
        if bare:
            containers = [{'container': c} for c in sorted(bare)]
    if containers:
        seen = set()
        unique = []
        for c in containers:
            if c['container'] not in seen:
                seen.add(c['container'])
                unique.append(c)
        p['containers'] = unique
        p['container_count'] = len(unique)

    # Pallets / weight / cbm
    m = RE_TOTAL_PALLETS.search(text)
    if m:
        p['total_pallets'] = int(m.group(1))
    else:
        m = RE_PALLETS_ALT.search(text)
        if m:
            n = int(m.group(1))
            if 1 <= n <= 5000:
                p['total_pallets'] = n

    for pat in (RE_WEIGHT, RE_WEIGHT_LOOSE):
        m = pat.search(text)
        if m:
            try:
                w = int(m.group(1).replace(',', '').replace('.', ''))
                if 1000 <= w <= 5_000_000:
                    p['total_weight_kg'] = w
                    break
            except ValueError:
                pass

    m = RE_CBM.search(text)
    if m:
        try: p['total_cbm'] = float(m.group(1).replace(',', ''))
        except ValueError: pass

    # Date
    for pat in RE_DATE_PATTERNS:
        m = pat.search(text)
        if m:
            p['date_hint'] = re.sub(r'\s+', ' ', m.group(1).strip())
            break

    return p


def ocr_pdf(pdf_path: str | Path, dpi: int = 180) -> tuple[str, int]:
    """PDF 모든 페이지를 OCR 해서 raw_text + page_count 반환.

    RapidOCR ONNX runtime (CPU). 페이지당 ~3초 (운영 데이터 기준).
    """
    from rapidocr_onnxruntime import RapidOCR
    ocr = RapidOCR()
    doc = fitz.open(str(pdf_path))
    parts = []
    for i, page in enumerate(doc):
        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        png = pix.tobytes('png')
        result, _ = ocr(png)
        if result:
            lines = [r[1] for r in result if r and len(r) >= 2]
            parts.append(f'--- page {i+1} ---\n' + '\n'.join(lines))
    page_count = doc.page_count
    doc.close()
    return '\n'.join(parts), page_count
