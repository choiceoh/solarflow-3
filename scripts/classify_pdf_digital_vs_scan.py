#!/usr/bin/env python
"""
M132 에 등록된 312 PDF 의 텍스트 추출 가능성 분류.

각 PDF 를 fitz 로 열어 page 텍스트 추출. 페이지당 평균 텍스트 길이로 분류:
- DIGITAL: 페이지당 평균 텍스트 ≥ 100 chars → 정규식 파싱 가능
- THIN: 30-100 chars → 부분 텍스트 (일부는 이미지)
- SCAN: < 30 chars → OCR 필요

출력: scripts/output/pdf_text_classification.csv
"""

import csv
import os
import sys
from collections import defaultdict

import fitz

DROPBOX_ROOT = r'C:\Users\user\Dropbox (개인용)\8. 코딩\솔라플로우 참고 자료'
INV_CSV = os.path.join(os.path.dirname(__file__), 'output', 'pl_bl_inventory.csv')
GROUP_TO_BL = os.path.join(os.path.dirname(__file__), 'output', 'group_to_bl.csv')
OUT_CSV = os.path.join(os.path.dirname(__file__), 'output', 'pdf_text_classification.csv')

# stdout 한글
sys.stdout.reconfigure(encoding='utf-8')

# 1. 인벤토리 + 매칭된 그룹의 파일만 대상
matched_groups = set()
with open(GROUP_TO_BL, encoding='utf-8-sig', newline='') as f:
    rdr = csv.DictReader(f)
    for row in rdr:
        matched_groups.add((row['year'], row['vendor'], row['group_prefix']))
print(f'매칭 그룹: {len(matched_groups)}')

target_files = []
with open(INV_CSV, encoding='utf-8-sig', newline='') as f:
    rdr = csv.DictReader(f)
    for row in rdr:
        key = (row['year'], row['vendor'], row['prefix'])
        if key in matched_groups:
            target_files.append(row)
print(f'대상 PDF: {len(target_files)}')

# 2. 각 PDF 텍스트 추출 + 분류
out_rows = []
by_class = defaultdict(int)
by_type_class = defaultdict(lambda: defaultdict(int))

for i, row in enumerate(target_files):
    full_path = os.path.join(DROPBOX_ROOT, row['rel_path'].replace('/', os.sep))
    try:
        doc = fitz.open(full_path)
        page_count = doc.page_count
        text = ''
        for p in doc:
            text += p.get_text('text')
        doc.close()
        avg_chars_per_page = len(text) / max(page_count, 1)
        if avg_chars_per_page >= 100:
            cls = 'DIGITAL'
        elif avg_chars_per_page >= 30:
            cls = 'THIN'
        else:
            cls = 'SCAN'
    except Exception as e:
        page_count = 0
        avg_chars_per_page = 0
        cls = 'FAIL'
        text = f'ERROR: {e}'

    by_class[cls] += 1
    by_type_class[row['file_type']][cls] += 1
    out_rows.append({
        'file_type': row['file_type'],
        'classification': cls,
        'page_count': page_count,
        'total_chars': len(text) if cls != 'FAIL' else 0,
        'avg_chars_per_page': round(avg_chars_per_page, 1),
        'filename': row['filename'],
        'rel_path': row['rel_path'],
    })

    if (i + 1) % 50 == 0:
        print(f'  진행: {i+1}/{len(target_files)}')

with open(OUT_CSV, 'w', encoding='utf-8-sig', newline='') as f:
    wr = csv.DictWriter(f, fieldnames=['file_type', 'classification', 'page_count', 'total_chars', 'avg_chars_per_page', 'filename', 'rel_path'])
    wr.writeheader()
    wr.writerows(out_rows)

print()
print('=== 전체 분류 ===')
total = len(out_rows)
for cls in ('DIGITAL', 'THIN', 'SCAN', 'FAIL'):
    n = by_class[cls]
    print(f'  {cls:<8}: {n:>3} ({n/total*100:.1f}%)')
print()
print('=== file_type 별 ===')
print(f'{"type":<22} {"DIGITAL":>8} {"THIN":>5} {"SCAN":>5} {"FAIL":>5}')
for ft in sorted(by_type_class.keys()):
    cs = by_type_class[ft]
    print(f'{ft:<22} {cs["DIGITAL"]:>8} {cs["THIN"]:>5} {cs["SCAN"]:>5} {cs["FAIL"]:>5}')

print()
print(f'결과: {OUT_CSV}')
