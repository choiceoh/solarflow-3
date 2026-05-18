"""M159 마이그 생성기 — 24년 raw BL 메타데이터 → 기존 DB BL UPDATE.

raw 24년 BL 62건의 ETD/ETA/통관일자/포워더 정보를, DB BL 178건 중 같은
bl_number 인 행에 UPDATE. **보존 정책**: DB 컬럼이 NULL 이거나 빈 값일 때만
UPDATE. 둘 다 값이 있고 다른 경우는 skip + 로그.

입력:  C:/Users/user/AppData/Local/Temp/sf_raw/raw25_2024.json
       gx10::bl_shipments 의 (bl_number, etd, eta, actual_arrival, forwarder)
출력:  backend/migrations/159_enrich_2024_bl_meta.sql
       /tmp/sf_raw/m159_diff_report.txt — 변경 내역 보고
"""
from __future__ import annotations

import json
import re
import subprocess
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

SRC = Path('C:/Users/user/AppData/Local/Temp/sf_raw')
OUT_SQL = Path('C:/Users/user/Downloads/새 폴더/solarflow/.claude/worktrees/reverent-hypatia-a1a336/backend/migrations/159_enrich_2024_bl_meta.sql')
DIFF_REPORT = SRC / 'm159_diff_report.txt'

# 컬럼 매핑 (M155 와 동일)
COL = dict(
    no=0, batch=1, vendor=2, po_no=3, product=4,
    pcs=5, fm=6, wp=7, unit_price=8, amount=9,
    lc_bank=10, lc_open=11, lc_no=12,
    etd=19, eta=20, qty_fmpkg=21, plt=23,
    container_40=25, lg_issue=26, customs=27,
    bl_issue_date=28, forwarder=29, bl_no=30,
    delivery_date=31, delivery_site=32,
)


def to_date(v):
    if v is None or v == '': return None
    if isinstance(v, date) and not isinstance(v, datetime): return v
    s = str(v)[:10]
    try:
        return datetime.strptime(s, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


def has(v):
    if v is None: return False
    s = str(v).strip()
    return s != '' and s != 'None'


# ─── 1) raw 24년 BL 추출 ─────────────────────────────────────
rows = json.load(open(SRC / 'raw25_2024.json', encoding='utf-8'))

# 같은 BL No 가 분할 배송으로 여러 행에 등장 — 첫 등장 (메타 있는 행) 만 사용
raw_bls = {}  # bl_no -> {etd, eta, customs, forwarder, lg_issue, ...}
current_po = None  # 현재 PO 트래킹
for ri, row in enumerate(rows):
    def g(k):
        i = COL.get(k)
        if i is None or i >= len(row): return None
        return row[i]

    po_no = g('po_no')
    if has(po_no):
        po_clean = str(po_no).split('\n')[0].strip()[:60]
        # PO 헤더 행 인식: 영문 3+ 또는 한글 3+
        if re.search(r'[A-Za-z]{3,}', str(po_no)) or re.search(r'[가-힣]{3,}', str(po_no)):
            current_po = po_clean

    bl_no = g('bl_no')
    if not has(bl_no): continue
    bn = str(bl_no).strip()
    if len(bn) < 8 or bn.startswith('TOP'):
        continue  # 노이즈 거름

    if bn not in raw_bls:
        raw_bls[bn] = {
            'etd': to_date(g('etd')),
            'eta': to_date(g('eta')),
            'customs': to_date(g('customs')),
            'forwarder': re.sub(r'\s+', ' ', str(g('forwarder')).strip()) if has(g('forwarder')) else None,
            'lg_issue': str(g('lg_issue')).strip() if has(g('lg_issue')) else None,
            'bl_issue_date': to_date(g('bl_issue_date')),
            'po_no': current_po,
            'row': ri + 1,
        }
    else:
        # 이미 있는 BL — 비어있는 필드 보강
        existing = raw_bls[bn]
        if not existing['etd']:        existing['etd'] = to_date(g('etd'))
        if not existing['eta']:        existing['eta'] = to_date(g('eta'))
        if not existing['customs']:    existing['customs'] = to_date(g('customs'))
        if not existing['forwarder']:
            f = g('forwarder')
            if has(f): existing['forwarder'] = re.sub(r'\s+', ' ', str(f).strip())

print(f'raw 24년 BL distinct: {len(raw_bls)}')
has_eta = sum(1 for v in raw_bls.values() if v['eta'])
has_etd = sum(1 for v in raw_bls.values() if v['etd'])
has_customs = sum(1 for v in raw_bls.values() if v['customs'])
has_forwarder = sum(1 for v in raw_bls.values() if v['forwarder'])
print(f'  ETD 있음:    {has_etd}')
print(f'  ETA 있음:    {has_eta}')
print(f'  통관 있음:    {has_customs}')
print(f'  포워더 있음:  {has_forwarder}')


# ─── 2) DB 의 현재 BL 메타데이터 조회 (gx10 SSH) ─────────────
print('\nDB 의 24년 raw BL 들 메타데이터 조회 중...')
bl_list_quoted = ','.join(f"'{b}'" for b in raw_bls.keys())
query = f"""
SELECT bl_number, etd, eta, actual_arrival, forwarder, status
FROM bl_shipments
WHERE bl_number IN ({bl_list_quoted})
"""
result = subprocess.run(
    ['ssh', 'choiceoh@100.105.145.6',
     f'''cd ~/공개/solarflow-3 && set -a && . engine/.env && set +a && \
     psql "$SUPABASE_DB_URL" -A -t -F$'\\t' -c "{query}"'''],
    capture_output=True, text=True, encoding='utf-8',
)
if result.returncode != 0:
    print('❌ DB 조회 실패:', result.stderr)
    raise SystemExit(1)

db_bls = {}
for line in result.stdout.strip().split('\n'):
    if not line.strip(): continue
    parts = line.split('\t')
    if len(parts) < 5: continue
    bn, etd, eta, arr, fwd = parts[0], parts[1], parts[2], parts[3], parts[4]
    db_bls[bn.strip()] = {
        'etd': to_date(etd) if etd else None,
        'eta': to_date(eta) if eta else None,
        'actual_arrival': to_date(arr) if arr else None,
        'forwarder': fwd.strip() if fwd else None,
    }
print(f'DB 에 있는 raw 24년 BL: {len(db_bls)} / {len(raw_bls)}')
print(f'DB 에 없는 raw 24년 BL: {len(raw_bls) - len(db_bls)}')


# ─── 3) 비교 → UPDATE 후보 도출 ───────────────────────────────
# 정책: DB 가 NULL 이고 raw 가 값 있으면 UPDATE
#       DB 가 값 있는데 raw 와 다르면 skip + 로그
updates = []
conflicts = []
unchanged = 0

for bn, raw in raw_bls.items():
    if bn not in db_bls:
        continue  # DB 에 없음 (별도 처리)
    db = db_bls[bn]
    changes = {}

    for field, db_key, raw_key in [
        ('etd', 'etd', 'etd'),
        ('eta', 'eta', 'eta'),
        ('actual_arrival', 'actual_arrival', 'customs'),  # raw 의 통관일자 = DB actual_arrival
        ('forwarder', 'forwarder', 'forwarder'),
    ]:
        db_val = db[db_key]
        raw_val = raw[raw_key]
        if raw_val is None: continue
        if db_val is None:
            changes[field] = raw_val
        elif db_val != raw_val:
            conflicts.append((bn, field, db_val, raw_val))

    if changes:
        updates.append((bn, changes, raw['po_no']))
    else:
        unchanged += 1

print(f'\n=== 비교 결과 ===')
print(f'UPDATE 후보:   {len(updates)} BL')
print(f'충돌 (skip):    {len(conflicts)} 필드')
print(f'변경 없음:      {unchanged} BL')


# ─── 4) M159 SQL 생성 ────────────────────────────────────────
lines = [
    '-- M159: 24년 BL 메타데이터 enrichment — raw 수입진행상황 2024 시트 기반',
    '-- @auto-apply: yes',
    '--',
    '-- raw 24년 BL 의 ETD/ETA/통관일자/포워더 정보를, DB 의 같은 bl_number 행에',
    '-- UPDATE. 보존 정책: DB 컬럼이 NULL 일 때만 raw 값으로 채움. 둘 다 값 있고',
    '-- 다른 경우는 skip (충돌 로그는 빌더 출력 + m159_diff_report.txt 참조).',
    '--',
    f'-- 추출: raw 24년 distinct BL {len(raw_bls)}개 / DB 매칭 {len(db_bls)}개',
    f'-- 변경: UPDATE {len(updates)} BL, 충돌 {len(conflicts)} 필드, 변경 없음 {unchanged} BL',
    '',
    'BEGIN;',
    '',
    '-- 멱등성: 같은 마이그 재적용 시 UPDATE 가 noop (이미 값 채워짐)',
    '',
]

for bn, changes, po_no in updates:
    set_clauses = []
    for field, val in changes.items():
        if isinstance(val, date):
            set_clauses.append(f"{field} = '{val.isoformat()}'")
        elif isinstance(val, (int, float)):
            set_clauses.append(f"{field} = {val}")
        else:
            s = str(val).replace("'", "''")
            set_clauses.append(f"{field} = '{s}'")
    # NULL 가드 추가 (멱등성: 이미 값 있으면 덮어쓰지 않음)
    where_guards = []
    for field in changes.keys():
        where_guards.append(f"{field} IS NULL")
    where_clause = '(' + ' OR '.join(where_guards) + ')'
    set_sql = ', '.join(
        f"{field} = COALESCE({field}, {val.split(' = ', 1)[1] if ' = ' in val else val})"
        for field, val in zip(changes.keys(), set_clauses)
    )
    # 메모 보존: M159 표시 (NULL 인 경우만)
    bn_safe = bn.replace("'", "''")
    memo_set = f"memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'"
    lines.append(
        f"UPDATE bl_shipments SET {set_sql}, {memo_set}\n"
        f"  WHERE bl_number = '{bn_safe}' AND {where_clause};"
    )

lines += [
    '',
    "-- 검증: M159 표시된 BL 행",
    "-- SELECT bl_number, etd, eta, actual_arrival, forwarder, memo",
    "--   FROM bl_shipments WHERE memo LIKE '%M159%';",
    '',
    'COMMIT;',
]

OUT_SQL.parent.mkdir(parents=True, exist_ok=True)
OUT_SQL.write_text('\n'.join(lines), encoding='utf-8')
print(f'\n생성: {OUT_SQL}')
print(f'  파일 크기: {OUT_SQL.stat().st_size:,} bytes')
print(f'  UPDATE 문: {len(updates)}개')

# 충돌 보고서
with open(DIFF_REPORT, 'w', encoding='utf-8') as f:
    f.write(f'M159 — 24년 BL enrichment 차이 보고\n')
    f.write(f'생성: {datetime.now().isoformat()}\n')
    f.write('=' * 80 + '\n\n')
    f.write(f'UPDATE 후보:   {len(updates)} BL\n')
    f.write(f'충돌 (skip):    {len(conflicts)} 필드\n')
    f.write(f'변경 없음:      {unchanged} BL\n\n')
    f.write('=== UPDATE 상세 ===\n')
    for bn, changes, po_no in updates:
        f.write(f'\n[{bn}]  (PO: {po_no})\n')
        for k, v in changes.items():
            f.write(f'  + {k}: NULL → {v}\n')
    f.write('\n=== 충돌 (skip, 검토 필요) ===\n')
    for bn, field, db_val, raw_val in conflicts:
        f.write(f'  {bn}.{field}: DB={db_val} ≠ raw={raw_val}\n')

print(f'  보고서: {DIFF_REPORT}')
