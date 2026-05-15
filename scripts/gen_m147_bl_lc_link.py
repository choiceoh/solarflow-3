#!/usr/bin/env python
"""M147: bl_shipments.lc_id 보강 — xlsx 의 BL↔LC 매핑 기준."""

import csv
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

OUT = Path(__file__).parent / 'output'
MIG = Path(__file__).parent.parent / 'backend' / 'migrations' / '147_bl_lc_link_from_xlsx.sql'

with (OUT / 'null_bl_to_lc_mapping.csv').open(encoding='utf-8-sig') as f:
    rows = list(csv.DictReader(f))

# 다중 LC 매핑 행은 운영자 결정 필요라 skip
rows_single = [r for r in rows if '|' not in r['lcs']]
rows_multi = [r for r in rows if '|' in r['lcs']]

lines = []
lines.append("-- M147: bl_shipments.lc_id 보강 — xlsx 마스터 BL↔LC 매핑")
lines.append("-- @auto-apply: yes")
lines.append("-- 출처: 수입진행상황(module)-2025/2026년도.xlsx 의 'B/L No' + 'LC' 컬럼")
lines.append(f"-- 단일 LC 매칭: {len(rows_single)}건 (자동 UPDATE)")
lines.append(f"-- 다중 LC 매칭: {len(rows_multi)}건 (운영자 결정 필요 — 본 마이그 제외)")
lines.append("-- 멱등성: lc_id IS NULL 일 때만 UPDATE (이미 채워진 행 보존)")
lines.append("")
lines.append("BEGIN;")
for r in rows_single:
    bl_id = r['bl_id']
    lc = r['lcs']
    lines.append(
        f"UPDATE bl_shipments SET "
        f"lc_id=(SELECT lc_id FROM lc_records WHERE lc_number='{lc}' ORDER BY open_date LIMIT 1), "
        f"memo=COALESCE(memo,'')||E'\\n'||'M147: xlsx 마스터 LC 연결 ({lc})', "
        f"updated_at=now() "
        f"WHERE bl_id='{bl_id}'::uuid AND lc_id IS NULL "
        f"  AND EXISTS (SELECT 1 FROM lc_records WHERE lc_number='{lc}');"
    )
lines.append("COMMIT;")

if rows_multi:
    lines.append("")
    lines.append("-- 다중 LC 매칭 (운영자 결정 필요):")
    for r in rows_multi:
        lines.append(f"--   BL {r['bl_number']:<22} → LCs: {r['lcs']}")

MIG.write_text('\n'.join(lines), encoding='utf-8')
print(f'작성: {MIG}')
print(f'  단일 UPDATE: {len(rows_single)}')
print(f'  다중 (보류):  {len(rows_multi)}')
