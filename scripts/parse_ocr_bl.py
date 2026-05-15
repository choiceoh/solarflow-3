#!/usr/bin/env python
"""OCR 처리된 BL/OBL/HBL PDF 의 raw_text 에서 정형 데이터 추출 + pdf_extractions UPDATE.

OCR 노이즈 대응 정규식:
- O/0 혼동, 공백 누락, 줄바꿈 위치 이상 등 허용
"""

import csv
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

OUT = Path(__file__).parent / 'output'


# B/L NO — 라벨 다음 200자 내 영문3+숫자6+ 시리얼 (회사명 등 skip)
# 시리얼 화이트리스트: 운영에서 본 prefix (SNKO/JWSH/EASEK/SHKWA/DJSCNGB/DFS/NPSELHT/ESZX/SELYIT/SHADHG/SHADGV/SHADCF/SHACZA/HGHDC/HDMUSHAA/COHESY/PCSLJBL/PCCLBL/HASLC/JBKR/WXAE/JAHF/SHACYV/SELHTZ/TMNBKPTR/EASLINE/EASEK)
RE_BL_NO_LABEL = re.compile(
    r'B\s*/\s*L\s*[Nn][o0O]?\.?[\s:]{0,5}'   # 라벨
    r'(?:[\s\S]{0,200}?)'                     # 사이 공백/회사명 skip
    r'\b([A-Z]{3,8}\d{6,14})\b',
    re.IGNORECASE,
)
# bare 시리얼 (BL no whitelist prefix)
RE_BL_NO_BARE = re.compile(
    r'\b((?:SNKO|SNKO03[A-Z]?|JWSH|EASEK|SHKWA|DJSCNGB|DFS\d|NPSELHT|ESZX|SELYIT|'
    r'SHAD[A-Z]{1,3}|SHAC[A-Z]{1,3}|HGHDC|HDMUSHAA|COHESY|PCSLJBL|PCCLBL|'
    r'HASLC|JBKR|WXAE|JAHF|SHACYV|SELHTZ|TMNBKPTR|EASLINE|RSPN|TED|LS\d|'
    r'KD\d|SNK[0O]03)[0O]*\d{6,14})\b'
)

# Vessel / Voyage (한 줄에 'OceanVessel VoyNo' 라벨 다음 데이터 줄)
# 예: 'NINGBO TRADER' '2509E' 식 (라벨 다음 줄)
RE_VESSEL_BLOCK = re.compile(
    r'Ocean\s*Vessel.{0,40}?(?:Voy.?No|VoyNo)[\s\S]{1,80}?'
    r'(?:Port\s*of\s*[Ll]oading)?[\s\S]{0,40}'
    r'([A-Z][A-Z .\-]{3,30}?)\s+(\d{3,5}[A-Z]?)',
    re.IGNORECASE,
)

# Port of Loading / Discharge (라벨 + 다음 줄)
RE_POL = re.compile(
    r'(?:Port\s*of\s*[Ll]oading|起运港)[\s\S]{0,80}?'
    r'([A-Z][A-Z]+\s*PORT[A-Z\s]{0,30}(?:CHINA|KOREA))',
    re.IGNORECASE,
)
RE_POD = re.compile(
    r'(?:Port\s*of\s*[Dd]ischarge|卸货港)[\s\S]{0,80}?'
    r'([A-Z][A-Z]+\s*PORT[A-Z\s]+(?:KOREA|CHINA))',
    re.IGNORECASE,
)

# Place of delivery
RE_DELIVERY = re.compile(
    r'Place\s*of\s*[Dd]elivery[\s\S]{0,40}?'
    r'([A-Z]+\s*PORT[A-Z\s]+KOREA)',
    re.IGNORECASE,
)

# Container/seal — 여러 OCR 양식
# OBL 슬래시 형식: EAXU6107795/02162644/40'HC
RE_CONTAINER_OBL = re.compile(
    r'\b([A-Z]{3,4}\d{6,7})\s*/\s*([A-Z0-9]+)\s*/\s*(\d{2}\'?H[CQ]?)\b'
)
# BL 붙은 형식: 40HSKHU6441250SKNGB015558 또는 40HCSKHU...
RE_CONTAINER_BL = re.compile(
    r'(\d{2}H[CQ]?)\s*([A-Z]{3,4}\d{6,7})\s*([A-Z0-9]{4,18})'
)
# 컨테이너 단독 (씰/ISO 없을 수도) — bare 시리얼
RE_CONTAINER_BARE = re.compile(
    r'\b((?:SKHU|TEMU|TCNU|SEGU|CAIU|TCLU|MSDU|MSCU|MAEU|HLBU|TGHU|EAXU|FSU|TRHU|UACU|FCIU|GLDU|BMOU|TLLU|ZIMU|MRKU|HCIU)\d{6,7})\b'
)
# 슬래시-기반 다양체 ISO: 45G1, 4500, 40HC, 40'HC
RE_CONTAINER_45 = re.compile(
    r'\b([A-Z]{3,4}\d{6,7})\s*/\s*([A-Z0-9]+)\s*//?\s*(4[0-5]G?\d|40\'?H[CQ]?)'
)

# Weight / CBM / Pallets
RE_WEIGHT = re.compile(r'([\d,]{4,})\s*\.?\s*\d*\s*KG[Ss]?\b')
RE_CBM = re.compile(r'([\d.,]+)\s*CBM\b')
RE_PALLETS = re.compile(r'(\d{2,4})\s*PALLETS?\b', re.IGNORECASE)
RE_TOTAL_PALLETS = re.compile(r'TOTAL[\s:]+(?:TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|TWENTY|THIRTY|FORTY|FIFTY|HUNDRED|AND|\s)+\((\d+)\)\s*PALLETS?', re.IGNORECASE)

# LC no (in document text — 'DOCUMENTARY CREDIT NUMBER M12MK...')
RE_LC_IN_BL = re.compile(
    r'DOCUMENTARY\s*CREDIT\s*NUMBER\s*[:\s]*([A-Z][A-Z0-9]{8,25})',
    re.IGNORECASE,
)
# 보조: 'M' 으로 시작하는 LC no 패턴
RE_LC_BARE = re.compile(r'\b(M[A-Z0-9]{2,8}\d{2}NU\d{5,6})\b')

# HS Code
RE_HS = re.compile(r'HS\s*N[O0o]\.?\s*([\d.]{8,12})', re.IGNORECASE)

# Model — OCR 노이즈 대응 (공백 누락 + O/0 혼동 + dash/tilde 혼동)
# JKM630N-78HL4-BDV-S, JKM625N-78HL4-BDV (BDV 없는 케이스), JKM63ON (O/0)
RE_MODEL = re.compile(
    r'(?:TIGER\s*NE[O0]?\s*)?'           # 'TIGER NEO' 옵션 + 공백 없을 수도
    r'(JKM\d{3}[A-Z]?)'                   # JKM630N (필수)
    r'\s*[-~]?\s*'                        # dash 또는 tilde, 공백 없을 수도
    r'(\d{2,3}[A-Z]+)'                    # 78HL4
    r'(?:\s*[-~]\s*([A-Z]+))?'            # -BDV
    r'(?:\s*[-~]\s*([A-Z]))?',            # -S
)
# 다른 제조사
RE_MODEL_OTHER = re.compile(
    r'\b(JAM\d{2,3}[A-Z]\d{2}\s*[A-Z]{1,3}'
    r'|LR\d-\d{2,3}[A-Z]{2,5}-\d{3}[A-Z]?'
    r'|RSM\d{3}-\d-\d{3}[A-Z]{2,5}'
    r'|TSM[-\s]?NEG\d{2}[A-Z]\.\d{2}[A-Z]?'
    r'|VERTEX\s*NEG\d{2}[A-Z]?'
    r')\b'
)

# Date of issue / Laden on board
RE_DATE = re.compile(
    r'(?:Laden\s*on\s*board|place\s*and\s*date|date\s*of\s*issue)[\s\S]{0,50}?'
    r'(\d{1,2}\s*[A-Z]{3}\s*\d{4}|[A-Z]{3}\.?\s*\d{1,2}\.?\s*,?\s*\d{4})',
    re.IGNORECASE,
)


def parse_ocr_bl(text):
    p = {}

    # BL no — 1) bare 시리얼 화이트리스트 우선, 2) 라벨 다음
    m = RE_BL_NO_BARE.search(text)
    if m:
        p['bl_no_in_pdf'] = m.group(1)
    else:
        m = RE_BL_NO_LABEL.search(text)
        if m:
            p['bl_no_in_pdf'] = m.group(1)

    # LC
    m = RE_LC_IN_BL.search(text) or RE_LC_BARE.search(text)
    if m:
        p['lc_no'] = m.group(1)

    # HS code
    m = RE_HS.search(text)
    if m:
        p['hs_code'] = m.group(1).replace('.', '')

    # Model — OCR 노이즈 대응 그룹 조합
    m = RE_MODEL.search(text)
    if m:
        parts = [g for g in m.groups() if g]
        # JKM630N + 78HL4 + BDV + S → JKM630N-78HL4-BDV-S
        if len(parts) >= 2:
            p['model'] = '-'.join(parts).replace('0', 'O') if False else '-'.join(parts)
    if 'model' not in p:
        m = RE_MODEL_OTHER.search(text)
        if m:
            p['model'] = m.group(1)

    # Ports
    m = RE_POL.search(text)
    if m:
        p['port_of_loading'] = re.sub(r'\s+', ' ', m.group(1).strip())
    m = RE_POD.search(text)
    if m:
        p['port_of_discharge'] = re.sub(r'\s+', ' ', m.group(1).strip())
    m = RE_DELIVERY.search(text)
    if m:
        p['place_of_delivery'] = re.sub(r'\s+', ' ', m.group(1).strip())

    # Vessel/voyage (block)
    m = RE_VESSEL_BLOCK.search(text)
    if m:
        vessel = re.sub(r'\s+', ' ', m.group(1).strip())
        voy = m.group(2)
        # vessel 이 'NINGBO PORT CHINA' 같은 항구를 잘못 잡을 수도 있음
        if 'PORT' not in vessel.upper() and 'KOREA' not in vessel.upper() and 'CHINA' not in vessel.upper():
            p['vessel'] = vessel
            p['voyage'] = voy

    # Containers — 다단계 시도
    containers = []
    # 1. 슬래시 형식 (45G1 ISO 포함)
    for m in RE_CONTAINER_45.finditer(text):
        containers.append({'container': m.group(1), 'seal': m.group(2), 'iso': m.group(3)})
    # 2. OBL 슬래시
    if not containers:
        for m in RE_CONTAINER_OBL.finditer(text):
            containers.append({'container': m.group(1), 'seal': m.group(2), 'iso': m.group(3)})
    # 3. BL 붙은 형식
    if not containers:
        for m in RE_CONTAINER_BL.finditer(text):
            containers.append({'iso': m.group(1), 'container': m.group(2), 'seal': m.group(3)})
    # 4. bare 컨테이너 시리얼 (씰/ISO 없음)
    if not containers:
        bare = set(RE_CONTAINER_BARE.findall(text))
        if bare:
            containers = [{'container': c} for c in sorted(bare)]
    if containers:
        # 중복 제거 (같은 container 번호)
        seen = set()
        unique = []
        for c in containers:
            if c['container'] not in seen:
                seen.add(c['container'])
                unique.append(c)
        p['containers'] = unique
        p['container_count'] = len(unique)

    # Total pallets / weight / cbm
    m = RE_TOTAL_PALLETS.search(text)
    if m:
        p['total_pallets'] = int(m.group(1))
    else:
        # 직접 숫자
        m = re.search(r'(\d{2,4})\s*PALLETS?\b', text, re.IGNORECASE)
        if m:
            n = int(m.group(1))
            if 1 <= n <= 5000:
                p['total_pallets'] = n

    m = RE_WEIGHT.search(text)
    if m:
        try:
            w = int(m.group(1).replace(',', '').replace('.', ''))
            if 1000 <= w <= 5_000_000:  # 합리적 BL weight 범위
                p['total_weight_kg'] = w
        except ValueError:
            pass

    m = RE_CBM.search(text)
    if m:
        try:
            p['total_cbm'] = float(m.group(1).replace(',', ''))
        except ValueError:
            pass

    # Date of issue
    m = RE_DATE.search(text)
    if m:
        p['date_hint'] = m.group(1).strip()

    return p


def main():
    # OCR 결과 로드
    rows = []
    with (OUT / 'ocr_scan_results.jsonl').open(encoding='utf-8') as f:
        for line in f:
            r = json.loads(line)
            if r['file_type'] in ('BL', 'OBL', 'HBL'):
                rows.append(r)
    print(f'OCR BL/OBL/HBL: {len(rows)}')

    # 파싱
    parsed_all = []
    field_count = defaultdict(int)
    for r in rows:
        p = parse_ocr_bl(r['text'])
        for k in p:
            field_count[k] += 1
        status = 'success' if len(p) >= 4 else 'partial' if p else 'failed'
        parsed_all.append({
            'rel_path': r['rel_path'],
            'file_type': r['file_type'],
            'parsed': p,
            'parse_status': status,
        })

    # 통계
    print(f'\n=== 파싱 결과 ({len(parsed_all)}건) ===')
    status_count = defaultdict(int)
    for r in parsed_all:
        status_count[r['parse_status']] += 1
    for s, n in sorted(status_count.items()):
        print(f'  {s}: {n}')
    print('\n=== 필드별 추출률 ===')
    for k, n in sorted(field_count.items(), key=lambda x: -x[1]):
        pct = n / len(parsed_all) * 100
        print(f'  {k:<25} {n:>3} ({pct:.0f}%)')

    # DB UPDATE
    import psycopg
    db_url = os.environ.get('SUPABASE_DB_URL')
    if not db_url:
        print('SUPABASE_DB_URL 누락')
        return

    # rel_path → file_id
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT df.file_id, df.stored_path
                FROM document_files df
                WHERE df.uploaded_by='M132-backfill'
            """)
            idx = {sp: fid for fid, sp in cur.fetchall()}

    updated = skipped = 0
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            for r in parsed_all:
                fid = idx.get(r['rel_path'])
                if not fid:
                    skipped += 1
                    continue
                cur.execute("""
                    UPDATE pdf_extractions
                       SET parsed = %s::jsonb,
                           parse_status = %s,
                           extractor = 'rapidocr-v1+bl-regex',
                           extracted_at = now()
                     WHERE file_id = %s
                """, (json.dumps(r['parsed'], ensure_ascii=False), r['parse_status'], fid))
                if cur.rowcount > 0:
                    updated += 1
                else:
                    skipped += 1
        conn.commit()

    print(f'\nDB: updated={updated}, skipped={skipped}')


if __name__ == '__main__':
    main()
