"""M155 마이그레이션 생성기 — 24년 PO/LC/BL 백필.

raw 자료 (수입진행상황 2024 시트) 에서 24년 PO 11건 + 그 안 LC/BL 메타데이터 추출 →
backend/migrations/155_backfill_2024_po_lc_bl.sql 로 출력.

핵심:
- 24년 PO 11건 (DB에 0건) → purchase_orders INSERT (po_number 멱등)
- 24년 LC 23건 (raw only) → lc_records INSERT (lc_number+po_id 멱등)
- 24년 BL 10건 (raw only, 노이즈 제외) → bl_shipments INSERT (bl_number 멱등)

운영자 텍스트 메타데이터 (PO No / LC No / 은행 / 일자 / 금액) 만 사용.
회사/제조사 UUID 는 PO No 패턴 + LC No prefix 로 추론.
"""
from __future__ import annotations

import json
import re
import uuid
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

SRC = Path('C:/Users/user/AppData/Local/Temp/sf_raw')
OUT_SQL = Path('C:/Users/user/Downloads/새 폴더/solarflow/.claude/worktrees/reverent-hypatia-a1a336/backend/migrations/155_backfill_2024_po_lc_bl.sql')

# db-connectivity-report.md § 1 참조
COMPANY = {
    'TS': '99f0fc15-0555-4a41-a025-8bf3630a7947',  # 탑솔라(주)
    'DW': '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c',  # 디원
    'HS': 'a9c3c675-8ed5-4a33-80e7-190d25888e80',  # 화신이엔지
    'BR': 'e41f100b-c63d-4c87-b02d-e305af610018',  # 바로
}

# 제조사 UUID — backend/migrations 의 M134 등 참조에서 추출
MANUFACTURER = {
    '징코': '016ba1ef-cf58-4164-8adf-a048f2c54f3e',
    '론지': '30f5aae6-000e-4f6e-93af-076a246005a7',
    '트리나': 'fe7728ec-2cf5-4c95-89f4-733934fb7fcb',
    '라이젠': 'ccc9937e-6214-45f8-8b48-26487bf1d0d7',
    'JA': '23171f0e-52d4-4475-bea3-5045778f4ed3',
    'KNK': 'fd8c3fa6-128a-4118-bda4-fe7554321302',
    'CSI': 'c0c0eb4d-3556-434f-8bbf-32c2c65651bc',  # 캐나디안솔라
}

# 은행 UUID — M134 인용
BANK = {
    '하나은행': 'ef4f9d00-6622-4070-ada3-c878aa02522b',
    '하나': 'ef4f9d00-6622-4070-ada3-c878aa02522b',
    '산업은행': 'e13be7f2-d835-4893-9a87-3e0581a96eab',
    '산업': 'e13be7f2-d835-4893-9a87-3e0581a96eab',
    '신한은행': '38c0f484-e145-4ed0-bba0-0a0a1b44a907',  # M134 의 신한
    '신한': '38c0f484-e145-4ed0-bba0-0a0a1b44a907',
    '국민': None,
    '기업': None,
}


def infer_company_from_po(po_no, vendor):
    """PO No 패턴 + 업체명에서 발주처 회사 추론."""
    s = (po_no or '') + ' ' + (vendor or '')
    if 'TOP' in s or 'TO240' in s:
        return 'TS'
    if '디원' in s or 'CSI-TO' in po_no:
        return 'DW'
    if '화신' in s:
        return 'HS'
    if '바로' in s:
        return 'BR'
    return 'TS'  # 24년 기본은 탑솔라


def infer_manufacturer(po_no, vendor):
    if not vendor: vendor = ''
    if not po_no: po_no = ''
    s = vendor + ' ' + po_no
    if '징코' in s or 'JKS' in s or 'JKM' in s or 'MCKR' in s:
        return '징코'
    if '론지' in s or 'LGi' in s or 'LR' in s.upper() or 'RSM' in s.upper():
        return '론지'
    if '트리나' in s or 'TED' in s:
        return '트리나'
    if '라이젠' in s or 'RS/' in s:
        return '라이젠'
    if 'KNK' in s or 'JA' in s:
        return 'JA'
    if 'CSI' in s:
        return 'CSI'
    return None


def infer_bank_from_lc(lc_no):
    """LC No prefix 로 은행 추론."""
    if not lc_no: return None
    if lc_no.startswith('M12MK'):
        return '하나은행'
    if lc_no.startswith('M0215'):
        return '산업은행'
    if lc_no.startswith('M04NG'):
        return '신한은행'
    if lc_no.startswith('M100R'):
        return '하나은행'  # 추정
    if lc_no.startswith('M34PD'):
        return '신한은행'  # 추정
    return None


def to_date(v):
    if v is None or v == '': return None
    if isinstance(v, date): return v
    s = str(v)[:10]
    try:
        return datetime.strptime(s, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


def parse_amount(v):
    """LC 개설금액 텍스트 → float."""
    if v is None: return None
    if isinstance(v, (int, float)): return float(v)
    s = str(v).replace(',', '').strip()
    m = re.search(r'(\d+(?:\.\d+)?)', s)
    return float(m.group(1)) if m else None


# 24년 raw 컬럼 매핑 (PO 라이프사이클 빌더와 동일)
COL = dict(
    no=0, batch=1, vendor=2, po_no=3, product=4,
    pcs=5, fm=6, wp=7, unit_price=8, amount=9,
    lc_bank=10, lc_open=11, lc_no=12, lc_qty=13, lc_fm=14, lc_wp=15,
    lc_open_amount=16, lc_maturity=17, usance_amount=18,
    etd=19, eta=20, qty_fmpkg=21, plt=23,
    container_40=25, lg_issue=26, customs=27,
    bl_issue_date=28, forwarder=29, bl_no=30,
    delivery_date=31, delivery_site=32, delivery_wp=33, delivery_qty=34,
)

LC_PAT = re.compile(r'^M\d{2,4}[A-Z]{2,3}\d{4}[A-Za-z]{2}\d{4,6}$')


def clean_po_no(po_no):
    """multi-line PO No 에서 영문 패턴 우선으로 정리."""
    lines = [l.strip() for l in str(po_no).split('\n') if l.strip()]
    for l in lines:
        if re.search(r'[A-Za-z]{3,}', l) and len(l) >= 6:
            return l[:60]
    return (lines[0] if lines else '')[:60]


def extract_24_pos():
    """24년 PO 11건 + 그 안 LC/BL 메타데이터 추출."""
    rows = json.load(open(SRC / 'raw25_2024.json', encoding='utf-8'))
    pos = []
    current = None
    for ri, row in enumerate(rows):
        def g(k):
            i = COL.get(k)
            if i is None or i >= len(row): return None
            return row[i]

        no = g('no')
        po_raw = g('po_no')
        po_no = str(po_raw).strip() if po_raw is not None and po_raw != '' else ''
        has_letter_or_hangul = bool(re.search(r'[A-Za-z]{3,}', po_no)) or bool(re.search(r'[가-힣]{3,}', po_no))
        is_header = (
            po_no and len(po_no) >= 4 and has_letter_or_hangul
            and po_no not in ('P/O No.', 'P/O No', 'pcs', '품명', 'No.', 'No')
            and not po_no.startswith('=')
            and not re.match(r'^[=\d\s,.\-+()*/]+$', po_no)
            and po_no.strip() not in ('컨', '수량', '보험', '매매기준율')
            and not po_no.endswith('pcs')
            and '*' not in po_no
        )
        if is_header:
            if current: pos.append(current)
            current = {
                'po_no': po_no, 'row': ri + 1,
                'vendor': g('vendor'), 'batch': g('batch'),
                'pcs': g('pcs'), 'wp': g('wp'), 'fm': g('fm'),
                'unit_price': g('unit_price'), 'amount': g('amount'),
                'lcs': [], 'bls': [],
            }
            lc_no = g('lc_no')
            if lc_no and isinstance(lc_no, str) and LC_PAT.match(lc_no.strip()):
                current['lcs'].append({
                    'lc_no': lc_no.strip(),
                    'lc_bank': g('lc_bank'), 'lc_open': g('lc_open'),
                    'lc_maturity': g('lc_maturity'),
                    'lc_open_amount': g('lc_open_amount'),
                    'lc_qty': g('lc_qty'), 'lc_wp': g('lc_wp'),
                    'usance_amount': g('usance_amount'),
                })
            bl_no = g('bl_no')
            if bl_no and isinstance(bl_no, str):
                bn = bl_no.strip()
                if not bn.startswith('TOP') and len(bn) >= 8:
                    current['bls'].append({
                        'bl_no': bn, 'etd': g('etd'), 'eta': g('eta'),
                        'customs': g('customs'), 'forwarder': g('forwarder'),
                        'bl_issue_date': g('bl_issue_date'),
                    })
        elif current:
            lc_no = g('lc_no')
            if lc_no and isinstance(lc_no, str) and LC_PAT.match(lc_no.strip()):
                # 중복 LC 체크
                if not any(l['lc_no'] == lc_no.strip() for l in current['lcs']):
                    current['lcs'].append({
                        'lc_no': lc_no.strip(),
                        'lc_bank': g('lc_bank'), 'lc_open': g('lc_open'),
                        'lc_maturity': g('lc_maturity'),
                        'lc_open_amount': g('lc_open_amount'),
                        'lc_qty': g('lc_qty'), 'lc_wp': g('lc_wp'),
                        'usance_amount': g('usance_amount'),
                    })
            bl_no = g('bl_no')
            if bl_no and isinstance(bl_no, str):
                bn = bl_no.strip()
                if not bn.startswith('TOP') and len(bn) >= 8:
                    if not any(b['bl_no'] == bn for b in current['bls']):
                        current['bls'].append({
                            'bl_no': bn, 'etd': g('etd'), 'eta': g('eta'),
                            'customs': g('customs'), 'forwarder': g('forwarder'),
                            'bl_issue_date': g('bl_issue_date'),
                        })
    if current: pos.append(current)
    return pos


pos = extract_24_pos()
print(f'24년 raw PO: {len(pos)}개')
total_lcs = sum(len(p['lcs']) for p in pos)
total_bls = sum(len(p['bls']) for p in pos)
print(f'  LC 합: {total_lcs}, BL 합: {total_bls}')

# DB 이미 있는 LC/BL 거르기
db_codes = json.load(open(SRC / 'db_codes.json', encoding='utf-8'))
db_lcs = {x.strip() for x in (db_codes.get('lcs') or []) if x}
db_bls = {x.strip() for x in (db_codes.get('bls') or []) if x}
db_pos = {x.strip() for x in (db_codes.get('pos') or []) if x}

# UUID 결정적 생성 (PO No / LC No / BL No 기반) — 멱등성 보장
def gen_uuid(prefix, key):
    return str(uuid.uuid5(uuid.UUID('00000000-0000-0000-0000-000000000155'), f'{prefix}:{key}'))


def sql_str(v):
    if v is None: return 'NULL'
    if isinstance(v, (int, float)): return str(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"


def sql_date(v):
    d = to_date(v)
    return f"'{d.isoformat()}'" if d else 'NULL'


lines = [
    '-- M155: 24년 PO/LC/BL 백필 — raw 수입진행상황 2024 시트 기준',
    '-- @auto-apply: yes',
    '--',
    '-- raw 자료 (수입진행상황(module)-2025년도.xlsx::2024 시트) 에서 추출.',
    f'-- 추출: 24년 PO {len(pos)}건, LC {total_lcs}건, BL {total_bls}건.',
    '-- DB 와의 차이 분석 후 누락분만 INSERT (멱등성: po_number / lc_number+po_id / bl_number).',
    '--',
    '-- 비교 결과:',
    f'--   기존 DB: PO {len(db_pos)}, LC {len(db_lcs)}, BL {len(db_bls)}',
    f'--   raw 24년 PO No 중 DB 신규: {sum(1 for p in pos if p["po_no"][:30].strip() not in db_pos)}건',
    '',
    'BEGIN;',
    '',
    '-- ─── 1) PO 11건 INSERT ──────────────────────────────────────',
]

po_uuids = {}
new_po_count = 0
skipped = []
for p in pos:
    po_no = p['po_no']
    po_clean = clean_po_no(po_no)
    if po_clean in db_pos:
        continue
    company = COMPANY[infer_company_from_po(po_no, p.get('vendor'))]
    manuf_kr = infer_manufacturer(po_no, p.get('vendor'))
    manuf = MANUFACTURER.get(manuf_kr) if manuf_kr else None
    if not manuf:
        skipped.append((po_clean, '제조사 미상'))
        continue
    new_po_count += 1
    po_uuid = gen_uuid('po', po_clean)
    po_uuids[p['po_no']] = (po_uuid, po_clean)
    pcs = p['pcs'] if isinstance(p['pcs'], (int, float)) else None
    wp = p['wp'] if isinstance(p['wp'], (int, float)) else None
    mw = wp / 1_000_000 if wp else None
    # contract_date: 첫 LC 의 open_date 사용
    cd = None
    if p['lcs']:
        cd = to_date(p['lcs'][0]['lc_open'])
    memo = f'M155: 24년 raw 2024시트 행{p["row"]} 백필'
    lines.append(
        f"INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, "
        f"contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)\n"
        f"SELECT {sql_str(po_uuid)}, {sql_str(po_clean)}, {sql_str(company)}, "
        f"{sql_str(manuf)}, 'spot', "
        f"{sql_str(cd.isoformat()) if cd else 'NULL'}, 'CIF', "
        f"{pcs if pcs else 'NULL'}, {round(mw, 4) if mw else 'NULL'}, "
        f"'completed', {sql_str(memo)}\n"
        f"WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = {sql_str(po_clean)});"
    )

lines += ['', '-- ─── 2) LC 23건 INSERT ──────────────────────────────────────']
new_lc_count = 0
for p in pos:
    if p['po_no'] not in po_uuids:
        # PO 가 DB에 이미 있는 경우 — 그 PO의 po_id 가져오는 lookup 으로
        po_clean = p['po_no'].split('\n')[0].strip()[:60]
    else:
        po_uuid, po_clean = po_uuids[p['po_no']]

    for lc in p['lcs']:
        if lc['lc_no'] in db_lcs:
            continue
        amount = parse_amount(lc.get('lc_open_amount'))
        if amount is None or amount <= 0:
            skipped.append((lc['lc_no'], 'amount_usd 없음'))
            continue
        new_lc_count += 1
        bank_kr = lc.get('lc_bank') or infer_bank_from_lc(lc['lc_no'])
        bank_uuid = BANK.get((bank_kr or '').replace('\n', '').strip())
        if not bank_uuid:
            bank_uuid = BANK['하나은행']  # fallback
        company = COMPANY[infer_company_from_po(p['po_no'], p.get('vendor'))]
        lc_uuid = gen_uuid('lc', lc['lc_no'])
        memo = f'M155: 24년 raw 2024시트 백필 (LC {lc["lc_no"]})'
        lines.append(
            f"INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, "
            f"amount_usd, open_date, maturity_date, status, memo)\n"
            f"SELECT {sql_str(lc_uuid)}, po.po_id, {sql_str(lc['lc_no'])}, "
            f"{sql_str(bank_uuid)}, {sql_str(company)}, "
            f"{amount if amount else 'NULL'}, {sql_date(lc.get('lc_open'))}, "
            f"{sql_date(lc.get('lc_maturity'))}, 'settled', {sql_str(memo)}\n"
            f"FROM purchase_orders po WHERE po.po_number = {sql_str(po_clean)}\n"
            f"  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = {sql_str(lc['lc_no'])});"
        )

lines += ['', '-- ─── 3) BL INSERT (raw only, 노이즈 제외) ─────────────────']
new_bl_count = 0
for p in pos:
    po_clean = p['po_no'].split('\n')[0].strip()[:60]
    manuf_kr = infer_manufacturer(p['po_no'], p.get('vendor'))
    manuf = MANUFACTURER.get(manuf_kr) if manuf_kr else None
    company = COMPANY[infer_company_from_po(p['po_no'], p.get('vendor'))]

    for bl in p['bls']:
        if bl['bl_no'] in db_bls:
            continue
        new_bl_count += 1
        bl_uuid = gen_uuid('bl', bl['bl_no'])
        memo = f'M155: 24년 raw 2024시트 백필 (PO {po_clean[:40]})'
        lines.append(
            f"INSERT INTO bl_shipments (bl_id, bl_number, po_id, company_id, "
            f"manufacturer_id, inbound_type, currency, etd, eta, actual_arrival, "
            f"forwarder, status, memo)\n"
            f"SELECT {sql_str(bl_uuid)}, {sql_str(bl['bl_no'])}, po.po_id, "
            f"{sql_str(company)}, {sql_str(manuf) if manuf else 'NULL'}, "
            f"'import', 'USD', {sql_date(bl.get('etd'))}, {sql_date(bl.get('eta'))}, "
            f"{sql_date(bl.get('customs'))}, "
            f"{sql_str(bl.get('forwarder'))}, 'completed', {sql_str(memo)}\n"
            f"FROM purchase_orders po WHERE po.po_number = {sql_str(po_clean)}\n"
            f"  AND NOT EXISTS(SELECT 1 FROM bl_shipments b WHERE b.bl_number = {sql_str(bl['bl_no'])});"
        )

lines += [
    '',
    '-- ─── 4) 검증 SQL (수동) ─────────────────────────────────────',
    '-- 다음 쿼리로 백필 결과 확인:',
    "-- SELECT 'PO' kind, COUNT(*) FROM purchase_orders WHERE memo LIKE 'M155%'",
    "--  UNION ALL SELECT 'LC', COUNT(*) FROM lc_records WHERE memo LIKE 'M155%'",
    "--  UNION ALL SELECT 'BL', COUNT(*) FROM bl_shipments WHERE memo LIKE 'M155%';",
    '',
    'COMMIT;',
    '',
    '-- PostgREST 스키마 캐시 reload',
    "-- NOTIFY pgrst, 'reload schema';",
]

# 통계 헤더 갱신
lines[10] = f'--   M155 신규 INSERT: PO {new_po_count}건 + LC {new_lc_count}건 + BL {new_bl_count}건'

OUT_SQL.parent.mkdir(parents=True, exist_ok=True)
OUT_SQL.write_text('\n'.join(lines), encoding='utf-8')
print(f'\n생성: {OUT_SQL}')
print(f'  PO INSERT: {new_po_count}건')
print(f'  LC INSERT: {new_lc_count}건')
print(f'  BL INSERT: {new_bl_count}건')
if skipped:
    print(f'  SKIPPED PO: {len(skipped)}건 ({", ".join(s[0] for s in skipped)})')
print(f'  파일 크기: {OUT_SQL.stat().st_size:,} bytes')
