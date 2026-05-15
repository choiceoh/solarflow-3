#!/usr/bin/env python
"""LC 관련 Dropbox 파일 인벤토리 + 49 lc_records 와 매칭.

분류:
  - opening_swift  : 'KDB_SWIFT발신', '개설 전신문', '개설 전문', '가전문'
  - application    : '신청서', 'LC개설 Draft', '개설 신청'
  - amendment      : '조건변경', 'amendment', 'Amend'
  - acceptance     : '인수통지', '인수증', '인수서'
  - notification   : '도착통지', '통지서'
  - other          : 위에 안 맞는 것

매칭:
  1. lc_number 가 파일명에 있는지 (정확)
  2. PDF 본문 텍스트에서 lc_number 추출 (fitz)
  3. 파일이 위치한 폴더 prefix → 어떤 BL/LC 와 관련됐는지

출력:
  scripts/output/lc_doc_inventory.csv
  scripts/output/lc_doc_matched.csv     (49 lc_records 와 매칭된 파일)
  scripts/output/lc_doc_unmatched.csv
"""

import csv
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import fitz

sys.stdout.reconfigure(encoding='utf-8')

DROPBOX_ROOT = Path(r'C:\Users\user\Dropbox (개인용)\8. 코딩\솔라플로우 참고 자료')
SCRIPT_DIR = Path(__file__).parent
OUT_DIR = SCRIPT_DIR / 'output'

# 49 lc_records 로드
with (OUT_DIR / 'lc_records_all.psv').open(encoding='utf-8') as f:
    LC_RECORDS = []
    for line in f:
        parts = line.strip().split('|')
        if len(parts) < 4:
            continue
        LC_RECORDS.append({
            'lc_number': parts[0],
            'open_date': parts[1],
            'amount_usd': int(parts[2]) if parts[2] else 0,
            'status': parts[3],
        })

LC_NUMBERS = set(r['lc_number'] for r in LC_RECORDS if r['lc_number'] and r['lc_number'] != '없음')
print(f'lc_records: {len(LC_RECORDS)}건 / 고유 lc_number: {len(LC_NUMBERS)}')

# LC no 패턴: M12MK..., M0215..., M100R..., M52(...) 등 12~20자 영숫자
# 우리 운영 데이터 패턴 분석:
#   M12MK2502NU00018, M0215506NU00438, M100R2509NU00040
# 공통: 'M' + 숫자/영문 + 'NU' + 숫자 5개 (또는 다른 패턴)
LC_NO_RE = re.compile(r'\b(M[A-Z0-9]{2,8}\d{2}NU\d{5,6})\b')


def classify_lc_doc(filename: str) -> str:
    up = filename.upper().replace(' ', '')
    name = filename.replace(' ', '')
    if 'KDB_SWIFT' in up or 'SWIFT발신' in up:
        return 'opening_swift'
    if '조건변경' in name or 'AMEND' in up or '어멘드' in name:
        return 'amendment'
    if '개설신청' in name or '개설_신청' in name or 'DRAFT' in up or '신청서' in name:
        return 'application'
    if '개설전신문' in name or '개설전문' in name or '가전문' in name:
        return 'opening_swift'
    if '인수통지' in name or '인수증' in name or '인수서' in name or '인수통지증' in name:
        return 'acceptance'
    if '도착통지' in name or '도착안내' in name or '통지서' in name:
        return 'notification'
    if 'LC' in up or '신용장' in name:
        return 'other_lc'
    return 'other'


def find_lc_files():
    """LC 관련 파일 찾기 (PDF + xlsx)."""
    keywords = [
        'LC개설', 'LC 개설', 'LC개설', 'LC 전문', 'LC전문', '가전문', '개설 전신문', '개설 전문',
        'KDB_SWIFT', '수입신용장', '조건변경', '인수통지', '신용장',
    ]
    seen = set()
    for ext in ('.pdf', '.xlsx', '.PDF', '.XLSX'):
        for path in DROPBOX_ROOT.rglob(f'*{ext}'):
            name = path.name
            if any(k in name for k in keywords):
                if path not in seen:
                    seen.add(path)
                    yield path


def extract_lc_nos_from_pdf(path: Path, max_pages: int = 2) -> set:
    """PDF 첫 2 페이지에서 LC no 추출."""
    out = set()
    try:
        doc = fitz.open(path)
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            text = page.get_text('text')
            for m in LC_NO_RE.finditer(text):
                out.add(m.group(1))
        doc.close()
    except Exception:
        pass
    return out


def main():
    files = list(find_lc_files())
    print(f'LC 관련 파일: {len(files)}')

    rows = []
    by_category = defaultdict(int)
    matched_lc = defaultdict(list)  # lc_number → [(file_path, source)]
    unmatched = []

    for i, path in enumerate(files):
        rel = path.relative_to(DROPBOX_ROOT).as_posix()
        category = classify_lc_doc(path.name)
        by_category[category] += 1

        # 1차: 파일명에서 LC no 추출
        filename_lcs = set(LC_NO_RE.findall(path.name))
        # 2차: PDF 본문 (PDF 만)
        text_lcs = set()
        if path.suffix.lower() == '.pdf':
            text_lcs = extract_lc_nos_from_pdf(path)

        all_lcs = filename_lcs | text_lcs
        matched = all_lcs & LC_NUMBERS

        rows.append({
            'category': category,
            'filename': path.name,
            'rel_path': rel,
            'lc_from_filename': '|'.join(sorted(filename_lcs)),
            'lc_from_pdf_text': '|'.join(sorted(text_lcs)),
            'matched_to_lc_records': '|'.join(sorted(matched)),
            'parent': path.parent.name,
        })

        if matched:
            for lc in matched:
                matched_lc[lc].append((rel, category))
        else:
            unmatched.append({
                'category': category,
                'filename': path.name,
                'rel_path': rel,
                'extracted_lcs': '|'.join(sorted(all_lcs)),
                'parent': path.parent.name,
            })

        if (i + 1) % 25 == 0:
            print(f'  진행: {i+1}/{len(files)}')

    # 저장
    with (OUT_DIR / 'lc_doc_inventory.csv').open('w', encoding='utf-8-sig', newline='') as f:
        wr = csv.DictWriter(f, fieldnames=['category', 'filename', 'rel_path',
                                            'lc_from_filename', 'lc_from_pdf_text',
                                            'matched_to_lc_records', 'parent'])
        wr.writeheader()
        wr.writerows(rows)

    with (OUT_DIR / 'lc_doc_unmatched.csv').open('w', encoding='utf-8-sig', newline='') as f:
        wr = csv.DictWriter(f, fieldnames=['category', 'filename', 'rel_path', 'extracted_lcs', 'parent'])
        wr.writeheader()
        wr.writerows(unmatched)

    # lc_records 입장에서 어떤 LC 에 자료 있는지
    with (OUT_DIR / 'lc_doc_matched.csv').open('w', encoding='utf-8-sig', newline='') as f:
        wr = csv.writer(f)
        wr.writerow(['lc_number', 'doc_count', 'category_breakdown', 'sample_files'])
        for lc in sorted(LC_NUMBERS):
            docs = matched_lc.get(lc, [])
            if not docs:
                wr.writerow([lc, 0, '', ''])
                continue
            cat_counts = defaultdict(int)
            for _, c in docs:
                cat_counts[c] += 1
            cb = ', '.join(f'{c}={n}' for c, n in sorted(cat_counts.items()))
            sample = ' | '.join(p.split('/')[-1] for p, _ in docs[:5])
            wr.writerow([lc, len(docs), cb, sample])

    # 요약
    print('\n=== 카테고리별 분포 ===')
    for c, n in sorted(by_category.items(), key=lambda x: -x[1]):
        print(f'  {c:<20} {n}')

    lcs_with_doc = sum(1 for lc in LC_NUMBERS if matched_lc.get(lc))
    print()
    print(f'49 lc_records 중 자료 매칭됨: {lcs_with_doc}')
    print(f'  자료 없는 LC: {len(LC_NUMBERS) - lcs_with_doc}')
    print(f'전체 파일 중 lc_records 와 매칭됨: {len(rows) - len(unmatched)} / {len(rows)}')
    print(f'  매칭 안 됨 (lc_records 미등록 LC): {len(unmatched)}')

    # lc_records 에 없는데 PDF 에 등장하는 LC no
    new_lcs_in_pdf = set()
    for r in rows:
        if r['lc_from_pdf_text']:
            for lc in r['lc_from_pdf_text'].split('|'):
                if lc and lc not in LC_NUMBERS:
                    new_lcs_in_pdf.add(lc)
    if new_lcs_in_pdf:
        print(f'\n⚠️ PDF/파일명엔 있으나 lc_records 에 없는 LC no: {len(new_lcs_in_pdf)}건')
        for lc in sorted(new_lcs_in_pdf)[:20]:
            print(f'  {lc}')


if __name__ == '__main__':
    main()
