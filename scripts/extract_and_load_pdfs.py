#!/usr/bin/env python
"""
DIGITAL 분류 PDF 213개에서 fitz 로 텍스트 추출 → 정규식 파싱 → pdf_extractions INSERT.

입력:
  scripts/output/pdf_text_classification.csv  (DIGITAL/SCAN 분류)
  scripts/output/group_to_bl.csv              (그룹 → bl_id 매핑)
  scripts/output/pl_bl_inventory.csv          (파일 인벤토리)
  scripts/output/bl_shipments.psv             (운영 BL 목록)
  운영 SUPABASE_DB_URL 환경변수

처리:
  1. file_id 조회: document_files 에서 entity_type='bl_shipments' + stored_path
  2. fitz 텍스트 추출
  3. 정규식으로 file_type 별 파싱 (CI/PL/BL/OBL/HBL)
  4. ON CONFLICT (file_id) DO UPDATE (멱등)

옵션:
  --dry-run  파싱만 하고 DB 안 건드림 (CSV 만 출력)
"""

import argparse
import csv
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import fitz
# psycopg 는 --dry-run 이 아닐 때만 import (로컬 dev 박스에 없을 수 있음)

DROPBOX_ROOT = Path(r'C:\Users\user\Dropbox (개인용)\8. 코딩\솔라플로우 참고 자료')
SCRIPT_DIR = Path(__file__).parent
OUT_DIR = SCRIPT_DIR / 'output'

sys.stdout.reconfigure(encoding='utf-8')

# ============================================================
# 정규식 패턴 (벤더 무관 공통 + 일부 특화)
# ============================================================

# 핵심 필드 (CI/PL 공통)
RE_INVOICE_NO = re.compile(r'Invoice\s*No\.?[.:：\s]*([A-Z][A-Z0-9]{6,20})', re.IGNORECASE)
RE_LC_NO = re.compile(r'DOCUMENTARY\s*CREDIT\s*NUMBER[.:：\s]+([A-Z0-9]{10,30})', re.IGNORECASE)
RE_PA_NO = re.compile(r'P\.?A\.?\s*No\.?[.:：\s]*([A-Z]{3,5}[A-Z0-9]{6,20})', re.IGNORECASE)
RE_HS_CODE = re.compile(r'(?:Hs|H\.?S\.?)\s*Code[.:：\s]*([\d.]+)', re.IGNORECASE)
RE_TRADE_TERM = re.compile(r'Trade\s*Term\s*[:：]?\s*([A-Z]{3})\b', re.IGNORECASE)
# 인코텀즈 단독 (CIF BUSAN 등)
RE_INCOTERMS = re.compile(r'\b(CIF|FOB|DDP|DAP|EXW|CFR)\b\s+[A-Z][A-Z ]+(?:PORT|KOREA)', re.IGNORECASE)
RE_COUNTRY_ORIGIN = re.compile(r'Country\s*of\s*Origin\s*[:：]?\s*([^\r\n]+)', re.IGNORECASE)

# 모듈 모델 (제조사별 prefix)
RE_MODEL = re.compile(
    r'\b(JKM\d{3}[A-Z]-\d{2,3}[A-Z]{2,5}-?[A-Z0-9-]*'      # 진코 JKM630N-78HL4-BDV-S
    r'|JAM\d{2,3}[A-Z]\d{2}\s*[A-Z]{1,3}'                  # JA JAM72D42 LB
    r'|LR\d-\d{2,3}[A-Z]{2,5}-\d{3}[A-Z]?'                 # 론지 LR7-72HYD-640
    r'|RSM\d{3}-\d-\d{3}[A-Z]{2,5}'                        # 라이젠 RSM156-9-620
    r'|TSM-NEG\d{2}[A-Z]\.\d{2}[A-Z]?'                     # 트리나 TSM-NEG21C.20
    r')\b'
)

# 수량 / 와트
# 'Quantity 5,580 PC' 또는 'TOTAL: ... 5,580 PC' 패턴
RE_QTY_PC = re.compile(r'([\d,]{4,})\s*PC(?:S)?\b', re.IGNORECASE)
RE_TOTAL_WATT = re.compile(r'([\d,]{6,})\s*(?:WP?T?T?|WATT)\b', re.IGNORECASE)
RE_TOTAL_WATT_MW = re.compile(r'([\d.]+)\s*MW\b', re.IGNORECASE)

# 단가 / 총액 USD
RE_UNIT_PRICE_WP = re.compile(r'(?:USD|US\$)?\s*([\d.]+)\s*/\s*W[Pp]\b')
RE_TOTAL_USD = re.compile(r'(?:TOTAL\s+AMOUNT\s*[:：(]*USD?\)?|USD)\s*([\d,]{4,})\.\d{2}\b', re.IGNORECASE)

# 가격 단위 수치 (예: 0.105 USD/Wp)
RE_USD_PER_WATT = re.compile(r'USD\s*([\d.]+)\s*/\s*WP', re.IGNORECASE)

# 중량
RE_NET_WEIGHT = re.compile(r'Net\s*Weight[^\d]{0,30}([\d,]{4,})', re.IGNORECASE)
RE_GROSS_WEIGHT = re.compile(r'Gross\s*Weight[^\d]{0,30}([\d,]{4,})', re.IGNORECASE)
# fallback - 두 큰 숫자 (PL 의 net + gross 가 차례로 나옴)
RE_WEIGHT_KGS_TOTAL = re.compile(r'([\d,]{6,})\s*KGS?\b', re.IGNORECASE)

RE_PALLETS = re.compile(r'(?:No\.\s*of\s*)?Pallets?[^\d]{0,20}([\d,]+)', re.IGNORECASE)
RE_PALLETS_ALT = re.compile(r'([\d,]+)\s*PALLETS?\b', re.IGNORECASE)
RE_CBM = re.compile(r'([\d.,]+)\s*CBM\b', re.IGNORECASE)

# BL 관련
RE_BL_NO = re.compile(r'B/L\s*NO\.?\s*(?:提单号\s*)?(?:SWB\s*)?([A-Z][A-Z0-9]{8,20})', re.IGNORECASE)
RE_VESSEL = re.compile(r'(?:Vessel(?:\s+Voyage)?|船名航次)\s*[\r\n]+\s*([A-Z][A-Z0-9 .]+V?\.?\d+[A-Z]?)', re.IGNORECASE)
RE_PORT_LOADING = re.compile(r'(?:Port of Loading|起运港)\s*[\r\n]+\s*([A-Z][A-Z ]+(?:PORT|CHINA|KOREA))', re.IGNORECASE)
RE_PORT_DISCHARGE = re.compile(r'(?:Port of Discharge|卸货港)\s*[\r\n]+\s*([A-Z][A-Z ]+PORT[A-Z ]+)', re.IGNORECASE)

# 컨테이너/씰 - 'SKHU6442106/SKNGB015556//45G1 16PALLETS/20576.000KGS/57.600CBM'
RE_CONTAINER = re.compile(r'\b([A-Z]{4}\d{6,7})/([A-Z0-9]+)//(\w+)\s*(\d+)\s*PALLETS/([\d.]+)\s*KGS/([\d.]+)\s*CBM', re.IGNORECASE)

# 수입신고필증 (한국어)
RE_DECL_NO = re.compile(r'신고번호[\s\r\n]*([\d-]+[A-Z]?)')
RE_DECL_DATE = re.compile(r'신고일[\s\r\n]*(\d{4}/\d{2}/\d{2})')
RE_BL_AWB = re.compile(r'B/L\(AWB\)번호[\s\r\n]*([A-Z][A-Z0-9]{6,20})')
RE_MASTER_BL = re.compile(r'MASTER B/L번호[\s\r\n]*([A-Z][A-Z0-9]{6,20})')
RE_TOTAL_WEIGHT_KG = re.compile(r'총중량[\s\r\n]*([\d,]+)\s*KG')
RE_TOTAL_PACKAGES = re.compile(r'총포장갯수[\s\r\n]*([\d,]+)\s*PG')
RE_CIF_USD = re.compile(r'과세가격\(CIF\)[\s\r\n]*\$?\s*([\d,]+)')
RE_CIF_KRW = re.compile(r'￦\s*([\d,]+)\s*수\s*량')  # CIF KRW 다음에 수량 라벨
RE_EXCHANGE_RATE = re.compile(r'환\s*율[\s\r\n]*([\d,]+\.\d+)')
RE_HS_CODE_KR = re.compile(r'세번부호[\s\r\n]*([\d.-]+)')


def to_int(s):
    if not s:
        return None
    try:
        return int(s.replace(',', '').replace('.', '').strip())
    except ValueError:
        return None


def to_float(s):
    if not s:
        return None
    try:
        return float(s.replace(',', '').strip())
    except ValueError:
        return None


def first(pat, text, group=1):
    m = pat.search(text)
    return m.group(group) if m else None


def first_int(pat, text):
    return to_int(first(pat, text))


def first_float(pat, text):
    return to_float(first(pat, text))


def parse_commercial_doc(text, file_type):
    """CI/PL 공통 핵심 필드 추출."""
    p = {}

    inv = first(RE_INVOICE_NO, text)
    if inv:
        p['invoice_no'] = inv

    lc = first(RE_LC_NO, text)
    if lc:
        p['lc_no'] = lc

    pa = first(RE_PA_NO, text)
    if pa:
        p['pa_no'] = pa

    hs = first(RE_HS_CODE, text)
    if hs:
        p['hs_code'] = hs.replace('.', '')

    tt = first(RE_TRADE_TERM, text)
    if tt:
        p['trade_term'] = tt.upper()
    else:
        m = RE_INCOTERMS.search(text)
        if m:
            p['trade_term'] = m.group(1).upper()

    co = first(RE_COUNTRY_ORIGIN, text)
    if co:
        p['country_of_origin'] = co.strip()

    model = first(RE_MODEL, text)
    if model:
        p['model'] = model

    qty = first_int(RE_QTY_PC, text)
    if qty:
        p['qty_pc'] = qty

    watt = first_int(RE_TOTAL_WATT, text)
    if watt and watt > 1000:
        p['total_watt'] = watt
    else:
        # MW → W 변환 (예: 3.515 MW = 3,515,000W)
        mw = first_float(RE_TOTAL_WATT_MW, text)
        if mw and 0.5 <= mw <= 500:
            p['total_watt'] = int(mw * 1_000_000)

    # CI 특화
    if file_type in ('CI', 'commercial_invoice'):
        upw = first_float(RE_USD_PER_WATT, text)
        if upw:
            p['unit_price_usd_wp'] = upw
        tu = first(RE_TOTAL_USD, text)
        if tu:
            p['total_usd'] = to_float(tu)

    # PL 특화
    if file_type in ('PL', 'packing_list'):
        nw = first_int(RE_NET_WEIGHT, text)
        if nw:
            p['net_weight_kg'] = nw
        gw = first_int(RE_GROSS_WEIGHT, text)
        if gw:
            p['gross_weight_kg'] = gw
        # pallets: '320 PALLETS' 형식 (신뢰도 ↑) 우선, 그다음 'Pallets 라벨 뒤' 폴백
        pal = first_int(RE_PALLETS_ALT, text)
        if not pal:
            pal = first_int(RE_PALLETS, text)
        # sanity: pcs 와 같으면 표 셀 잘못 매칭이라 reject. 합리적 상한 5000.
        if pal and pal != p.get('qty_pc') and pal <= 5000:
            p['pallets'] = pal
        cbm = first_float(RE_CBM, text)
        if cbm:
            p['cbm'] = cbm

    return p


def parse_bl(text):
    p = {}
    bl = first(RE_BL_NO, text)
    if bl:
        p['bl_no_in_pdf'] = bl
    v = first(RE_VESSEL, text)
    if v:
        p['vessel'] = v.strip()
    pl = first(RE_PORT_LOADING, text)
    if pl:
        p['port_of_loading'] = pl.strip()
    pd = first(RE_PORT_DISCHARGE, text)
    if pd:
        p['port_of_discharge'] = pd.strip()
    lc = first(RE_LC_NO, text)
    if lc:
        p['lc_no'] = lc
    hs = first(RE_HS_CODE, text)
    if hs:
        p['hs_code'] = hs.replace('.', '')

    # 컨테이너 리스트
    containers = []
    for m in RE_CONTAINER.finditer(text):
        containers.append({
            'container': m.group(1),
            'seal': m.group(2),
            'iso': m.group(3),
            'pallets': to_int(m.group(4)),
            'kgs': to_float(m.group(5)),
            'cbm': to_float(m.group(6)),
        })
    if containers:
        p['containers'] = containers
        p['container_count'] = len(containers)

    # 총 팔레트 / 총 KGS / 총 CBM (BL 의 헤더부)
    pal = first_int(RE_PALLETS_ALT, text)
    if pal:
        p['total_pallets'] = pal
    return p


def parse_declaration_kr(text):
    """수입신고필증 (한국 관세청 PDF)."""
    p = {}
    dn = first(RE_DECL_NO, text)
    if dn:
        p['declaration_no'] = dn
    dd = first(RE_DECL_DATE, text)
    if dd:
        p['declaration_date'] = dd.replace('/', '-')
    bl = first(RE_BL_AWB, text)
    if bl:
        p['bl_awb_no'] = bl
    mb = first(RE_MASTER_BL, text)
    if mb:
        p['master_bl_no'] = mb
    tw = first_int(RE_TOTAL_WEIGHT_KG, text)
    if tw:
        p['total_weight_kg'] = tw
    tp = first_int(RE_TOTAL_PACKAGES, text)
    if tp:
        p['total_packages_pg'] = tp
    cu = first_float(RE_CIF_USD, text)
    if cu:
        p['cif_usd'] = cu
    er = first_float(RE_EXCHANGE_RATE, text)
    if er:
        p['exchange_rate'] = er
    hk = first(RE_HS_CODE_KR, text)
    if hk:
        p['hs_code'] = hk.replace('.', '').replace('-', '')
    return p


def parse_pdf(file_type, text):
    """파일 유형에 맞는 파서 라우팅."""
    ft = file_type.lower()
    is_kr_declaration = '수 입 신 고 필 증' in text or '수입신고필증' in text or 'B/L(AWB)번호' in text
    if is_kr_declaration:
        return parse_declaration_kr(text), 'kr-declaration'
    if ft in ('ci', 'commercial_invoice'):
        return parse_commercial_doc(text, 'CI'), 'commercial-invoice'
    if ft in ('pl', 'packing_list'):
        return parse_commercial_doc(text, 'PL'), 'packing-list'
    if ft in ('bl', 'obl', 'hbl', 'bill_of_lading', 'ocean_bl', 'house_bl'):
        return parse_bl(text), 'bill-of-lading'
    return {}, 'unknown'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='파싱만, DB 안 건드림')
    ap.add_argument('--limit', type=int, default=0, help='처리 건수 제한 (테스트)')
    args = ap.parse_args()

    # 입력 로드
    digital_files = []
    with (OUT_DIR / 'pdf_text_classification.csv').open(encoding='utf-8-sig', newline='') as f:
        rdr = csv.DictReader(f)
        for row in rdr:
            if row['classification'] == 'DIGITAL':
                digital_files.append(row)
    print(f'DIGITAL 대상: {len(digital_files)}')
    if args.limit:
        digital_files = digital_files[: args.limit]

    # group_to_bl 에서 bl_id 매핑
    rel_to_bl = {}
    with (OUT_DIR / 'group_to_bl.csv').open(encoding='utf-8-sig', newline='') as f:
        rdr = csv.DictReader(f)
        for row in rdr:
            # rel_path 단위가 아니라 group 단위라 inventory CSV 를 한 번 더 본다
            pass

    # inventory CSV + group_to_bl → rel_path → bl_id
    group_lookup = {}
    with (OUT_DIR / 'group_to_bl.csv').open(encoding='utf-8-sig', newline='') as f:
        rdr = csv.DictReader(f)
        for row in rdr:
            group_lookup[(row['year'], row['vendor'], row['group_prefix'])] = row['bl_id']
    with (OUT_DIR / 'pl_bl_inventory.csv').open(encoding='utf-8-sig', newline='') as f:
        rdr = csv.DictReader(f)
        for row in rdr:
            key = (row['year'], row['vendor'], row['prefix'])
            bl_id = group_lookup.get(key)
            if bl_id:
                rel_to_bl[row['rel_path']] = bl_id

    # 처리
    results = []
    status_counts = defaultdict(int)
    field_counts = defaultdict(int)
    for i, row in enumerate(digital_files):
        rel = row['rel_path']
        full = DROPBOX_ROOT / rel.replace('/', os.sep)
        # DB stored_path 는 forward slash 로 normalize 됨 (gen_m132_migration.ts 에서)
        rel_normalized = rel.replace('\\', '/')
        bl_id = rel_to_bl.get(rel) or rel_to_bl.get(rel_normalized)
        if not bl_id:
            print(f'  WARN: bl_id 매핑 없음: {rel}')
            continue
        try:
            doc = fitz.open(full)
            text = ''
            for page in doc:
                text += page.get_text('text') + '\n'
            page_count = doc.page_count
            doc.close()
        except Exception as e:
            print(f'  FAIL fitz: {rel} - {e}')
            status_counts['failed_fitz'] += 1
            continue

        parsed, extractor = parse_pdf(row['file_type'], text)
        for k in parsed.keys():
            field_counts[k] += 1
        if parsed:
            status = 'success' if len(parsed) >= 4 else 'partial'
        else:
            status = 'failed'
        status_counts[status] += 1

        results.append({
            'rel_path': rel_normalized,
            'file_type': row['file_type'],
            'bl_id': bl_id,
            'page_count': page_count,
            'extractor': f'fitz-regex-v1+{extractor}',
            'parse_status': status,
            'raw_text': text,
            'parsed': parsed,
        })
        if (i + 1) % 30 == 0:
            print(f'  진행: {i+1}/{len(digital_files)}')

    # 요약
    print('\n=== 파싱 결과 요약 ===')
    print(f'처리: {len(results)}')
    for s, n in sorted(status_counts.items()):
        print(f'  {s}: {n}')
    print('\n=== 필드별 추출률 ===')
    for k, n in sorted(field_counts.items(), key=lambda x: -x[1]):
        print(f'  {k:<25} {n:>3} ({n/len(results)*100:.0f}%)')

    if args.dry_run:
        # CSV 로 저장 (검토용)
        rows_for_csv = []
        for r in results:
            rows_for_csv.append({
                'rel_path': r['rel_path'],
                'file_type': r['file_type'],
                'parse_status': r['parse_status'],
                'page_count': r['page_count'],
                'parsed_json': json.dumps(r['parsed'], ensure_ascii=False),
            })
        with (OUT_DIR / 'pdf_extractions_preview.csv').open('w', encoding='utf-8-sig', newline='') as f:
            wr = csv.DictWriter(f, fieldnames=['rel_path', 'file_type', 'parse_status', 'page_count', 'parsed_json'])
            wr.writeheader()
            wr.writerows(rows_for_csv)
        print(f'\nCSV: {OUT_DIR / "pdf_extractions_preview.csv"}')
        return

    # DB INSERT — psycopg 동적 import (dry-run 에서 import 비용 회피)
    import psycopg
    db_url = os.environ.get('SUPABASE_DB_URL')
    if not db_url:
        print('ERROR: SUPABASE_DB_URL env 누락')
        sys.exit(2)

    # rel_path → file_id 매핑 (document_files 에서 조회)
    print('\nDB 접속 + file_id 조회...')
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT file_id, entity_id, stored_path
                FROM document_files
                WHERE uploaded_by = 'M132-backfill'
            """)
            df_rows = cur.fetchall()
    file_id_lookup = {(str(eid), sp): str(fid) for fid, eid, sp in df_rows}
    print(f'document_files (M132): {len(df_rows)} 행')

    inserted = updated = skipped = 0
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            for r in results:
                key = (r['bl_id'], r['rel_path'])
                file_id = file_id_lookup.get(key)
                if not file_id:
                    skipped += 1
                    continue
                cur.execute("""
                    INSERT INTO pdf_extractions
                        (file_id, bl_id, file_type, extractor, parse_status, page_count, raw_text, parsed)
                    VALUES (%s, %s::uuid, %s, %s, %s, %s, %s, %s::jsonb)
                    ON CONFLICT (file_id) DO UPDATE SET
                        parse_status = EXCLUDED.parse_status,
                        page_count   = EXCLUDED.page_count,
                        raw_text     = EXCLUDED.raw_text,
                        parsed       = EXCLUDED.parsed,
                        extractor    = EXCLUDED.extractor,
                        extracted_at = now()
                    RETURNING (xmax = 0) AS inserted_new
                """, (
                    file_id,
                    r['bl_id'],
                    r['file_type'],
                    r['extractor'],
                    r['parse_status'],
                    r['page_count'],
                    r['raw_text'],
                    json.dumps(r['parsed'], ensure_ascii=False),
                ))
                row = cur.fetchone()
                if row and row[0]:
                    inserted += 1
                else:
                    updated += 1
        conn.commit()

    print(f'\nDB: inserted={inserted}, updated={updated}, skipped(no file_id)={skipped}')


if __name__ == '__main__':
    main()
