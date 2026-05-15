#!/usr/bin/env python
"""M148: lc_records.target_qty 보강 — xlsx 의 Q'ty 컬럼.

amount 는 운영자 검토 영역이라 변경 안 함. NULL 인 target_qty 만 보강.
"""

import csv
import sys
from collections import defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

OUT = Path(__file__).parent / 'output'
MIG = Path(__file__).parent.parent / 'backend' / 'migrations' / '148_lc_target_qty_backfill.sql'

# xlsx LC → qty
xlsx_qty = {}
with (OUT / 'lc_master_xlsx_rows.csv').open(encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        lc = r['__lc_number']
        v = r.get("Q'ty", '') or r.get('수량 (F/M包)', '')
        try:
            qty = int(float(v))
        except (ValueError, TypeError):
            continue
        if lc in xlsx_qty:
            # 같은 LC 여러 행이면 최대값 (LC 총 수량)
            xlsx_qty[lc] = max(xlsx_qty[lc], qty)
        else:
            xlsx_qty[lc] = qty

# DB lc_records 의 NULL target_qty
db_null = []
with (OUT / 'lc_records_v2.psv').open(encoding='utf-8') as f:
    for line in f:
        parts = line.strip().split('|')
        if len(parts) < 5: continue
        lc_id, lc, od, amt, qty = parts[0], parts[1], parts[2], parts[3], parts[4]
        if (not qty or qty == '0') and lc in xlsx_qty:
            db_null.append({'lc_id': lc_id, 'lc_number': lc, 'open_date': od, 'xlsx_qty': xlsx_qty[lc]})

print(f'NULL target_qty + xlsx 매칭: {len(db_null)}')

lines = []
lines.append("-- M148: lc_records.target_qty NULL 보강 — xlsx 마스터 Q'ty")
lines.append("-- @auto-apply: yes")
lines.append("-- 출처: 수입진행상황(module)-2025/2026년도.xlsx 의 Q'ty 컬럼")
lines.append(f"-- NULL/0 인 target_qty 만 보강: {len(db_null)}건")
lines.append("-- amount 는 분할 인출/합계 혼동 가능성으로 본 마이그 제외 (운영자 검토)")
lines.append("")
lines.append("BEGIN;")
for r in db_null:
    lines.append(
        f"UPDATE lc_records SET target_qty={r['xlsx_qty']}, "
        f"memo=COALESCE(memo,'')||E'\\n'||'M148: xlsx qty 보강 ({r['xlsx_qty']} PCS)', "
        f"updated_at=now() "
        f"WHERE lc_id='{r['lc_id']}'::uuid AND (target_qty IS NULL OR target_qty=0);"
    )
lines.append("COMMIT;")

MIG.write_text('\n'.join(lines), encoding='utf-8')
print(f'작성: {MIG}')
