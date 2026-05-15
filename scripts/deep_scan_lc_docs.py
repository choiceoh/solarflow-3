#!/usr/bin/env python
"""LC 관련 130 unmatched 파일 deep scan — 모든 페이지 + 확장 정규식.

기존 inventory_lc_documents.py 가 첫 2 페이지만 scan + 단일 정규식.
이번엔 모든 페이지 + 다양한 LC no 패턴 시도.

목적:
  1. lc_records 추가 LC no 발견
  2. '없음' 1건 (2025-12-13 / $1.98M / 신한 default) 의 실제 LC no 추적
  3. 130 unmatched 파일의 LC 관련 정보 회수
"""

import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

import fitz

sys.stdout.reconfigure(encoding='utf-8')

DROPBOX_ROOT = Path(r'C:\Users\user\Dropbox (개인용)\8. 코딩\솔라플로우 참고 자료')
OUT_DIR = Path(__file__).parent / 'output'

# 확장 LC no 정규식 (운영 DB + SWIFT 에서 본 모든 패턴)
LC_PATTERNS = [
    re.compile(r'\b(M[A-Z0-9]{2,8}\d{2}NU\d{5,6})\b'),       # M12MK2502NU00018 등
    re.compile(r'\b(M\d{4,8}NU\d{5,6})\b'),                   # M0215402NU00071
    re.compile(r'\b(M[A-Z0-9]{2,15})\b'),                     # broader catch-all
]
# 정확한 매칭 우선
LC_STRICT = re.compile(r'\b(M[A-Z0-9]{2,8}\d{2}NU\d{5,6})\b')

# 운영 DB 의 모든 LC no (M144 후 58건)
with (OUT_DIR / 'lc_records_all.psv').open(encoding='utf-8') as f:
    DB_LCS_OLD = set()
    for line in f:
        parts = line.strip().split('|')
        if parts and parts[0]:
            DB_LCS_OLD.add(parts[0])
print(f'DB old LCs: {len(DB_LCS_OLD)}')


def main():
    # unmatched 130 파일 로드
    unmatched_paths = []
    with (OUT_DIR / 'lc_doc_unmatched.csv').open(encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            full = DROPBOX_ROOT / r['rel_path'].replace('/', '\\')
            unmatched_paths.append((full, r['rel_path'], r['category']))
    print(f'Unmatched files: {len(unmatched_paths)}')

    rows = []
    found_lcs = defaultdict(list)  # lc_no → [file paths]

    for i, (full, rel, category) in enumerate(unmatched_paths):
        if not full.suffix.lower() == '.pdf':
            continue
        try:
            doc = fitz.open(full)
            text = ''
            for p in doc:
                text += p.get_text('text') + '\n'
            doc.close()
        except Exception as e:
            continue

        lcs = set(LC_STRICT.findall(text))
        # 파일명에서도 추출
        lcs |= set(LC_STRICT.findall(full.name))
        new_lcs = lcs - DB_LCS_OLD

        if lcs:
            for lc in lcs:
                found_lcs[lc].append((rel, category))

        # SWIFT-like 정보도 추출 (가전문, 한국어 전문)
        # :20: 또는 'DOCUMENTARY CREDIT NUMBER' 또는 LC 번호 키워드 주변
        amount_m = re.search(r'(USD[\s:]*\d[\d,.]+|\(USD:\s*[\d,.]+\))', text)
        date_m = re.search(r'(\d{4}[./]\d{2}[./]\d{2}|\d{4}-\d{2}-\d{2})', text)

        rows.append({
            'rel_path': rel,
            'category': category,
            'lc_nos_extracted': '|'.join(sorted(lcs)),
            'new_lc_nos': '|'.join(sorted(new_lcs)),
            'has_swift_marker': ':20:' in text or 'DOCUMENTARY CREDIT NUMBER' in text,
            'amount_hint': amount_m.group(0)[:30] if amount_m else '',
            'date_hint': date_m.group(0) if date_m else '',
        })

        if (i + 1) % 30 == 0:
            print(f'  진행: {i+1}/{len(unmatched_paths)}')

    # 저장
    with (OUT_DIR / 'lc_doc_unmatched_rescan.csv').open('w', encoding='utf-8-sig', newline='') as f:
        wr = csv.DictWriter(f, fieldnames=['rel_path', 'category', 'lc_nos_extracted',
                                            'new_lc_nos', 'has_swift_marker', 'amount_hint', 'date_hint'])
        wr.writeheader()
        wr.writerows(rows)

    # 신규 LC 별 파일 리스트
    all_extracted = set()
    for row in rows:
        if row['lc_nos_extracted']:
            for lc in row['lc_nos_extracted'].split('|'):
                if lc:
                    all_extracted.add(lc)
    new_lcs = all_extracted - DB_LCS_OLD

    print('\n=== Deep scan 결과 ===')
    print(f'스캔된 PDF:           {sum(1 for r in rows)}')
    print(f'LC no 추출된 파일:    {sum(1 for r in rows if r["lc_nos_extracted"])}')
    print(f'고유 LC no 추출:      {len(all_extracted)}')
    print(f'  그 중 DB 미등록:    {len(new_lcs)}')
    print()
    print(f'--- 신규 LC no 후보 (DB 미등록) ---')
    for lc in sorted(new_lcs):
        files = found_lcs.get(lc, [])
        print(f'  {lc}: {len(files)} 파일')
        for f, c in files[:2]:
            print(f'    [{c}] {f}')


if __name__ == '__main__':
    main()
