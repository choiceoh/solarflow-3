#!/usr/bin/env python
"""M144: SWIFT 자료 기반 신규 9 LC INSERT 마이그 생성."""

import csv
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

OUT_DIR = Path(__file__).parent / 'output'
MIG_PATH = Path(__file__).parent.parent / 'backend' / 'migrations' / '144_lc_swift_backfill.sql'

BANKS = {
    '산업은행': 'e13be7f2-d835-4893-9a87-3e0581a96eab',
    '신한은행': '00950132-de5d-482d-9c3f-b89b09a70585',
    '광주은행': '38c0f484-e145-4ed0-bba0-0a0a1b44a907',
    '국민은행': 'eab8d757-524e-427f-87bb-7c749cbfaf3a',
    '하나은행': 'ef4f9d00-6622-4070-ada3-c878aa02522b',
}
MFGS = {
    'JINKO': '016ba1ef-cf58-4164-8adf-a048f2c54f3e',
    'LONGI': '30f5aae6-000e-4f6e-93af-076a246005a7',
    'TRINA': 'fe7728ec-2cf5-4c95-89f4-733934fb7fcb',
    'RISEN': 'ccc9937e-6214-45f8-8b48-26487bf1d0d7',
    'JA SOLAR': '23171f0e-52d4-4475-bea3-5045778f4ed3',
}
TOPSOLAR = '99f0fc15-0555-4a41-a025-8bf3630a7947'


def infer_mfg(beneficiary: str) -> str | None:
    up = beneficiary.upper()
    if 'JINKO' in up: return MFGS['JINKO']
    if 'LONGI' in up: return MFGS['LONGI']
    if 'TRINA' in up: return MFGS['TRINA']
    if 'RISEN' in up: return MFGS['RISEN']
    if 'JA SOLAR' in up or 'JA TECH' in up: return MFGS['JA SOLAR']
    return None


def main():
    rows = []
    with (OUT_DIR / 'swift_vs_db.csv').open(encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            if r['category'] == 'SWIFT_ONLY':
                rows.append(r)
    rows.sort(key=lambda x: x['swift_issue'])

    lines = []
    lines.append("-- M144: SWIFT MT700 자료 기반 신규 LC 백필 + po_id NULL 허용")
    lines.append("-- @auto-apply: yes")
    lines.append("-- 출처: KDB_SWIFT_발신 PDF 본문 파싱 (산업은행 발신 MT700 표준 메시지)")
    lines.append("-- 자사 LC 무조건 90일 usance (운영자 확인 2026-05-15, SWIFT :42C: 100% 매치)")
    lines.append(f"-- 등록 후보: {len(rows)}건 (산업은행, 진코/론지 LC)")
    lines.append("--")
    lines.append("-- 스키마 변경: lc_records.po_id NULL 허용")
    lines.append("--   사유: 9 신규 LC 중 7건이 2024년인데 운영 DB 의 PO 데이터는 2025-03 이후만 보유.")
    lines.append("--         system 도입 이전 LC 라도 SWIFT 자료로 보관 가치 있음.")
    lines.append("--         운영자가 추후 PO 입력 시 po_id 채워질 수 있도록 nullable 로 변경.")
    lines.append("-- 멱등성: (lc_number, open_date, amount_usd) 동일 행이 이미 있으면 skip")
    lines.append("")
    lines.append("-- 1. po_id NOT NULL 제약 완화")
    lines.append("ALTER TABLE lc_records ALTER COLUMN po_id DROP NOT NULL;")
    lines.append("COMMENT ON COLUMN lc_records.po_id IS 'PO 참조 (NULL 허용 — system 도입 이전 SWIFT-only LC 자료 등 PO 미입력 케이스 보관).';")
    lines.append("")
    lines.append("-- 2. 9 LC 신규 INSERT")
    lines.append("BEGIN;")
    for r in rows:
        lc = r['lc_number']
        issue = r['swift_issue']
        amt = float(r['swift_amount'])
        bank = r['swift_bank']
        bank_id = BANKS.get(bank, '')
        if not bank_id:
            lines.append(f"-- SKIP {lc}: 알 수 없는 은행 '{bank}'")
            continue
        bnf = r['beneficiary']
        mfg_id = infer_mfg(bnf)
        mfg_part = f"'{mfg_id}'::uuid" if mfg_id else 'NULL'
        lines.append(f"-- {lc} | {issue} | USD {amt:>14,.2f} | {bank} | {bnf[:50]}")
        lines.append(
            "INSERT INTO lc_records (lc_number, bank_id, company_id, open_date, amount_usd, "
            "usance_days, status, memo)"
        )
        lines.append(
            f"SELECT '{lc}', '{bank_id}'::uuid, '{TOPSOLAR}'::uuid, '{issue}'::date, "
            f"{amt}, 90, 'settled',"
        )
        lines.append(
            f"  'M144: SWIFT MT700 자료 백필 (산업은행 KDB_SWIFT 발신 PDF). beneficiary={bnf[:60]}'"
        )
        lines.append(
            f"WHERE NOT EXISTS (SELECT 1 FROM lc_records WHERE lc_number='{lc}' "
            f"AND open_date='{issue}'::date AND amount_usd={amt});"
        )
        lines.append("")
    lines.append("COMMIT;")
    lines.append("")

    MIG_PATH.write_text('\n'.join(lines), encoding='utf-8')
    print(f'작성: {MIG_PATH}')
    print(f'  INSERT: {len(rows)}건')
    print(f'  라인 수: {len(lines)}')


if __name__ == '__main__':
    main()
