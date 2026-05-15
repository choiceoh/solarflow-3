#!/usr/bin/env python
"""2025/2026 모듈 발주 폴더의 모든 PDF 에서 LC no 추출 — 키워드 제약 없이 전수 scan."""

import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

import fitz

sys.stdout.reconfigure(encoding='utf-8')

DROPBOX_ROOT = Path(r'C:\Users\user\Dropbox (개인용)\8. 코딩\솔라플로우 참고 자료')
SCAN_DIRS = [
    DROPBOX_ROOT / '2024년 모듈발주',
    DROPBOX_ROOT / '2025년 모듈 발주',
    DROPBOX_ROOT / '2026년 모듈 발주',
]
OUT_DIR = Path(__file__).parent / 'output'

# 운영 DB 의 모든 LC no
DB_LCS = set()
with (OUT_DIR / 'lc_records_all.psv').open(encoding='utf-8') as f:
    for line in f:
        parts = line.strip().split('|')
        if parts and parts[0]:
            DB_LCS.add(parts[0])
print(f'DB LCs: {len(DB_LCS)}')

# 정규식: M + 영숫자 + NU + 숫자 패턴 (모든 LC 변형 포함)
LC_PATTERNS = [
    re.compile(r'\b(M[A-Z0-9]{2,8}\d{2}NU\d{5,6})\b'),
    re.compile(r'\b(M\d{6,8}NU\d{5,6})\b'),
]

# Amount + Beneficiary 힌트
RE_AMOUNT = re.compile(r'USD\s*([\d,.]+)', re.IGNORECASE)
RE_USD_AMT = re.compile(r'\(USD\s*[:=]?\s*([\d,.]+)\)', re.IGNORECASE)
RE_ISSUE_DATE = re.compile(r':31C:\s*DATE OF ISSUE\s*[\r\n]+\s*(\d{6})')
RE_KOREAN_DATE = re.compile(r'(\d{4})[년./-](\d{1,2})[월./-](\d{1,2})')


def extract_lcs(text: str) -> set:
    out = set()
    for pat in LC_PATTERNS:
        for m in pat.finditer(text):
            out.add(m.group(1))
    return out


def main():
    all_files = []
    for d in SCAN_DIRS:
        if d.exists():
            all_files += list(d.rglob('*.pdf'))
            all_files += list(d.rglob('*.PDF'))
    print(f'스캔 대상 PDF: {len(all_files)}')

    lc_to_files = defaultdict(list)  # lc_no -> [(rel, hint)]
    rows = []

    for i, path in enumerate(all_files):
        rel = path.relative_to(DROPBOX_ROOT).as_posix()
        try:
            doc = fitz.open(path)
            text = ''
            for p in doc:
                text += p.get_text('text') + '\n'
            doc.close()
        except Exception:
            continue

        # 파일명도 포함
        full_text = path.name + '\n' + text
        lcs = extract_lcs(full_text)
        if not lcs:
            continue

        # amount/date 힌트
        amt = ''
        m = RE_USD_AMT.search(text) or RE_AMOUNT.search(text)
        if m:
            amt = m.group(0)[:30]

        issue = ''
        m = RE_ISSUE_DATE.search(text)
        if m:
            d = m.group(1)
            issue = f'20{d[:2]}-{d[2:4]}-{d[4:6]}'

        for lc in lcs:
            lc_to_files[lc].append((rel, amt, issue, path.name))

        rows.append({
            'rel_path': rel,
            'lc_nos': '|'.join(sorted(lcs)),
            'new_lc_nos': '|'.join(sorted(lcs - DB_LCS)),
            'amount_hint': amt,
            'issue_hint': issue,
        })

        if (i + 1) % 100 == 0:
            print(f'  진행: {i+1}/{len(all_files)}')

    # 저장
    with (OUT_DIR / 'lc_broad_scan_files.csv').open('w', encoding='utf-8-sig', newline='') as f:
        wr = csv.DictWriter(f, fieldnames=['rel_path', 'lc_nos', 'new_lc_nos', 'amount_hint', 'issue_hint'])
        wr.writeheader()
        wr.writerows(rows)

    new_lcs = set()
    for lc in lc_to_files.keys():
        if lc not in DB_LCS:
            new_lcs.add(lc)

    print(f'\n=== 결과 ===')
    print(f'LC 추출된 PDF:        {len(rows)}')
    print(f'고유 LC no 발견:      {len(lc_to_files)}')
    print(f'  그 중 DB 미등록:    {len(new_lcs)}')

    # 신규 LC 별 상세 — amount/date 와 함께
    print(f'\n--- 신규 LC no 후보 ---')
    with (OUT_DIR / 'lc_broad_new_candidates.csv').open('w', encoding='utf-8-sig', newline='') as f:
        wr = csv.writer(f)
        wr.writerow(['lc_number', 'file_count', 'amount_hint', 'issue_hint', 'sample_files'])
        for lc in sorted(new_lcs):
            files = lc_to_files[lc]
            # 가장 풍부한 hint 픽
            best_amt = next((a for _, a, _, _ in files if a), '')
            best_iss = next((i for _, _, i, _ in files if i), '')
            sample = ' | '.join(fn for _, _, _, fn in files[:3])
            wr.writerow([lc, len(files), best_amt, best_iss, sample])
            print(f'  {lc} ({len(files)} 파일) amt={best_amt:<25} issue={best_iss}')
            for r, a, iss, fn in files[:3]:
                print(f'      [{a:<20}] {fn[:55]}')


if __name__ == '__main__':
    main()
