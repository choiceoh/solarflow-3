#!/usr/bin/env python
"""M146: lc_records.bank_id 정정 — xlsx 마스터 기준."""

import csv
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

OUT = Path(__file__).parent / 'output'
MIG = Path(__file__).parent.parent / 'backend' / 'migrations' / '146_lc_bank_fix_from_xlsx.sql'

BANKS = {
    '산업은행': 'e13be7f2-d835-4893-9a87-3e0581a96eab',
    '신한은행': '00950132-de5d-482d-9c3f-b89b09a70585',
    '광주은행': '38c0f484-e145-4ed0-bba0-0a0a1b44a907',
    '국민은행': 'eab8d757-524e-427f-87bb-7c749cbfaf3a',
    '하나은행': 'ef4f9d00-6622-4070-ada3-c878aa02522b',
    # 기업은행 — bank_name 으로 SELECT
}

with (OUT / 'lc_bank_mismatch.csv').open(encoding='utf-8-sig') as f:
    rows = list(csv.DictReader(f))

lines = []
lines.append("-- M146: lc_records.bank_id 정정 — 수입진행상황 xlsx 마스터 기준")
lines.append("-- @auto-apply: yes")
lines.append("-- 출처: 수입진행상황(module)-2025/2026년도.xlsx (운영자 관리 LC 마스터)")
lines.append(f"-- 정정 대상: {len(rows)}행 (M119/M124/M134 백필 시 prefix 추정 매핑 오류)")
lines.append("-- 정정 패턴 (DB → xlsx):")
lines.append("--   M12MK ×18: 신한 → 하나")
lines.append("--   M100R ×5:  광주/하나 → 국민")
lines.append("--   M04NG ×1:  신한 → 기업")
lines.append("--   M34PD ×1:  신한 → 광주")
lines.append("")
lines.append("BEGIN;")
for r in rows:
    lc_id = r['lc_id']
    lc = r['lc_number']
    od = r['open_date']
    db_b = r['db_bank']
    xlsx_b = r['xlsx_banks'].split('|')[0]  # primary
    if xlsx_b in BANKS:
        bank_sql = f"'{BANKS[xlsx_b]}'::uuid"
    else:
        bank_sql = f"(SELECT bank_id FROM banks WHERE bank_name='{xlsx_b}' LIMIT 1)"
    lines.append(f"-- {lc} {od} {db_b} → {xlsx_b}")
    lines.append(
        f"UPDATE lc_records SET bank_id={bank_sql}, "
        f"memo=COALESCE(memo,'')||E'\\n'||'M146: bank 정정 (xlsx 마스터 기준 {db_b}→{xlsx_b})', "
        f"updated_at=now() "
        f"WHERE lc_id='{lc_id}'::uuid;"
    )
lines.append("COMMIT;")

MIG.write_text('\n'.join(lines), encoding='utf-8')
print(f'작성: {MIG}')
print(f'UPDATE 문: {len(rows)}')
