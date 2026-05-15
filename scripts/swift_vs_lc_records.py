#!/usr/bin/env python
"""SWIFT 추출 LC 와 운영 DB lc_records 비교."""

import csv
import os
import sys
from collections import defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

OUT_DIR = Path(__file__).parent / 'output'

# 1. SWIFT 추출
swift_lcs = {}
with (OUT_DIR / 'swift_lc_extracted.csv').open(encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        if not r.get('lc_number'):
            continue
        lc = r['lc_number']
        amt = float(r['amount']) if r['amount'] else 0
        # 한 LC 가 여러 파일 (가전문/전신문/조건변경 등) — 가장 큰 amount 또는 첫 번째
        prev = swift_lcs.get(lc)
        if not prev or amt > prev.get('amount', 0):
            swift_lcs[lc] = {
                'lc_number': lc,
                'issue_date': r['issue_date'],
                'expiry_date': r['expiry_date'],
                'amount': amt,
                'drawee_bank': r['drawee_bank'],
                'drawee_bic': r['drawee_bic'],
                'usance_days': r['usance_days'],
                'beneficiary': r['beneficiary'],
                'file': r['filename'],
            }
print(f'SWIFT 고유 LC: {len(swift_lcs)}')

# 2. lc_records 로드 (full)
db_lcs = defaultdict(list)
with (OUT_DIR / 'lc_records_all.psv').open(encoding='utf-8') as f:
    for line in f:
        parts = line.strip().split('|')
        if len(parts) < 4:
            continue
        lc = parts[0]
        db_lcs[lc].append({
            'lc_number': lc,
            'open_date': parts[1],
            'amount_usd': int(parts[2]) if parts[2] else 0,
            'status': parts[3],
        })

print(f'DB 고유 LC: {len(db_lcs)}')

# 3. cross-check
matched_with_diff = []
matched_ok = []
swift_only = []
db_only = []

for lc, sw in swift_lcs.items():
    db_rows = db_lcs.get(lc, [])
    if not db_rows:
        swift_only.append(sw)
        continue
    # 매칭됨 — amount 비교 (DB 는 여러 행이면 sum)
    db_sum = sum(r['amount_usd'] for r in db_rows)
    sw_amt = sw['amount']
    diff = abs(db_sum - sw_amt)
    if diff < 1:  # 1 USD 차이 이내면 일치
        matched_ok.append({**sw, 'db_amount_sum': db_sum, 'db_rows': len(db_rows)})
    else:
        matched_with_diff.append({**sw, 'db_amount_sum': db_sum, 'diff': diff, 'db_rows': len(db_rows)})

# DB 에만 있는 LC
swift_set = set(swift_lcs.keys())
for lc, rows in db_lcs.items():
    if lc not in swift_set:
        db_only.append({'lc_number': lc, 'db_rows': len(rows), 'amount_sum': sum(r['amount_usd'] for r in rows)})

# 출력
print(f'\n=== Cross-check 결과 ===')
print(f'SWIFT ∩ DB amount 일치:   {len(matched_ok)}')
print(f'SWIFT ∩ DB amount 차이:   {len(matched_with_diff)}')
print(f'SWIFT only (DB 미등록):   {len(swift_only)}')
print(f'DB only (SWIFT 자료 없음): {len(db_only)}')

with (OUT_DIR / 'swift_vs_db.csv').open('w', encoding='utf-8-sig', newline='') as f:
    wr = csv.writer(f)
    wr.writerow(['category', 'lc_number', 'swift_amount', 'db_amount_sum', 'diff', 'db_rows',
                 'swift_issue', 'swift_expiry', 'swift_bank', 'beneficiary'])
    for r in matched_ok:
        wr.writerow(['MATCH_OK', r['lc_number'], r['amount'], r['db_amount_sum'], 0, r['db_rows'],
                     r['issue_date'], r['expiry_date'], r['drawee_bank'], r['beneficiary']])
    for r in matched_with_diff:
        wr.writerow(['MATCH_DIFF', r['lc_number'], r['amount'], r['db_amount_sum'], r['diff'], r['db_rows'],
                     r['issue_date'], r['expiry_date'], r['drawee_bank'], r['beneficiary']])
    for r in swift_only:
        wr.writerow(['SWIFT_ONLY', r['lc_number'], r['amount'], 0, '', 0,
                     r['issue_date'], r['expiry_date'], r['drawee_bank'], r['beneficiary']])
    for r in db_only:
        wr.writerow(['DB_ONLY', r['lc_number'], '', r['amount_sum'], '', r['db_rows'],
                     '', '', '', ''])

# 상세
print('\n--- SWIFT only (DB 신규 등록 후보) ---')
for r in sorted(swift_only, key=lambda x: x['issue_date']):
    print(f"  {r['lc_number']:<22} {r['issue_date']}  USD {r['amount']:>14,.2f}  {r['drawee_bank']:<8}  {r['beneficiary'][:30]}")

print(f'\n--- amount 차이 (MATCH_DIFF) ---')
for r in matched_with_diff:
    print(f"  {r['lc_number']:<22} SWIFT={r['amount']:>14,.2f}  DB_sum={r['db_amount_sum']:>14,.2f}  diff={r['diff']:>10,.2f}  rows={r['db_rows']}")
