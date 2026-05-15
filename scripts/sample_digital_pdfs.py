#!/usr/bin/env python
"""DIGITAL 분류된 PDF 의 텍스트를 벤더별로 1-2개씩 sample 출력 — 파싱 패턴 잡기용."""

import csv
import os
import sys
from collections import defaultdict

import fitz

DROPBOX_ROOT = r'C:\Users\user\Dropbox (개인용)\8. 코딩\솔라플로우 참고 자료'
CLASS_CSV = os.path.join(os.path.dirname(__file__), 'output', 'pdf_text_classification.csv')

sys.stdout.reconfigure(encoding='utf-8')

# 벤더별로 file_type 별 1개씩
samples = defaultdict(dict)
with open(CLASS_CSV, encoding='utf-8-sig', newline='') as f:
    rdr = csv.DictReader(f)
    for row in rdr:
        if row['classification'] != 'DIGITAL':
            continue
        vendor = row['rel_path'].split(os.sep)[1] if os.sep in row['rel_path'] else row['rel_path'].split('/')[1]
        key = (vendor, row['file_type'])
        if key not in samples:
            samples[key] = row

for (vendor, ft), row in list(samples.items())[:14]:
    full = os.path.join(DROPBOX_ROOT, row['rel_path'].replace('/', os.sep))
    print(f'\n{"="*80}\n=== {vendor} / {ft}: {row["filename"]} ===\n')
    try:
        doc = fitz.open(full)
        for i, page in enumerate(doc):
            print(f'\n--- page {i+1}/{doc.page_count} ---')
            print(page.get_text('text')[:1800])
            if i >= 1:
                break
        doc.close()
    except Exception as e:
        print(f'ERROR: {e}')
