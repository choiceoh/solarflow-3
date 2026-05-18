#!/usr/bin/env python
"""SCAN 분류 PDF 99개 OCR — RapidOCR (CPU ONNX).

각 PDF 의 모든 페이지 → 이미지 (fitz) → RapidOCR → 텍스트.
결과를 pdf_extractions 테이블에 UPDATE (이미 raw_text 가 비어있는 SCAN 행).

옵션:
  --dry-run  파싱만, DB UPDATE 안 함 (CSV 출력)
  --limit N  처음 N개만
"""

import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path

import fitz
from rapidocr_onnxruntime import RapidOCR

sys.stdout.reconfigure(encoding='utf-8')

DROPBOX = Path(r'C:\Users\user\Dropbox (개인용)\8. 코딩\솔라플로우 참고 자료')
OUT = Path(__file__).parent / 'output'


def render_page_to_png(page, dpi=180):
    """fitz page → PIL Image bytes (PNG)."""
    zoom = dpi / 72
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)
    return pix.tobytes('png')


def ocr_pdf(ocr, abs_path):
    """전체 페이지 OCR 결과를 합쳐서 반환."""
    doc = fitz.open(abs_path)
    parts = []
    for i, page in enumerate(doc):
        png_bytes = render_page_to_png(page)
        result, _ = ocr(png_bytes)
        if result:
            lines = [r[1] for r in result if r and len(r) >= 2]
            parts.append(f'--- page {i+1} ---\n' + '\n'.join(lines))
    doc.close()
    return '\n'.join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--limit', type=int, default=0)
    args = ap.parse_args()

    # SCAN 99개 로드
    scans = []
    with (OUT / 'pdf_text_classification.csv').open(encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            if r['classification'] == 'SCAN':
                scans.append(r)
    print(f'SCAN PDFs: {len(scans)}')
    if args.limit:
        scans = scans[: args.limit]

    print('RapidOCR 모델 로딩...')
    ocr = RapidOCR()
    print('OK')

    results = []
    t0 = time.time()
    for i, r in enumerate(scans):
        abs_path = DROPBOX / r['rel_path'].replace('/', os.sep)
        if not abs_path.exists():
            results.append({**r, 'text': '', 'error': 'file not found'})
            continue
        try:
            text = ocr_pdf(ocr, str(abs_path))
            results.append({
                'rel_path': r['rel_path'].replace('\\', '/'),
                'file_type': r['file_type'],
                'page_count': int(r['page_count']),
                'text': text,
                'text_len': len(text),
            })
        except Exception as e:
            results.append({**r, 'text': '', 'error': str(e)})
        elapsed = time.time() - t0
        if (i + 1) % 10 == 0 or (i + 1) == len(scans):
            avg = elapsed / (i + 1)
            eta = avg * (len(scans) - i - 1)
            print(f'  진행: {i+1}/{len(scans)} ({elapsed:.0f}s 소요, ETA {eta:.0f}s)')

    print(f'\n=== OCR 결과 ===')
    succ = [r for r in results if r.get('text')]
    print(f'성공: {len(succ)}/{len(results)}')
    print(f'평균 text 길이: {sum(r.get("text_len",0) for r in succ)//max(len(succ),1)} chars')

    # CSV 저장 (dry-run 검토용)
    csv_path = OUT / 'ocr_scan_results.csv'
    with csv_path.open('w', encoding='utf-8-sig', newline='') as f:
        wr = csv.DictWriter(f, fieldnames=['rel_path','file_type','page_count','text_len'])
        wr.writeheader()
        for r in succ:
            wr.writerow({'rel_path': r['rel_path'], 'file_type': r['file_type'],
                         'page_count': r['page_count'], 'text_len': r['text_len']})

    # 텍스트는 JSONL 로 (큼)
    jsonl_path = OUT / 'ocr_scan_results.jsonl'
    with jsonl_path.open('w', encoding='utf-8') as f:
        for r in succ:
            f.write(json.dumps({'rel_path': r['rel_path'], 'file_type': r['file_type'],
                                'page_count': r['page_count'], 'text': r['text']},
                               ensure_ascii=False) + '\n')

    print(f'CSV: {csv_path}')
    print(f'JSONL: {jsonl_path}')
    print(f'총 시간: {time.time()-t0:.0f}s')

    if args.dry_run:
        return

    # DB UPDATE
    import psycopg
    db_url = os.environ.get('SUPABASE_DB_URL')
    if not db_url:
        print('SUPABASE_DB_URL 누락')
        return

    # rel_path → file_id (M132 의 stored_path 기준)
    print('\nDB 접속...')
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT df.file_id, df.entity_id, df.stored_path, df.file_type
                FROM document_files df
                WHERE df.uploaded_by='M132-backfill'
            """)
            file_idx = {sp: (fid, eid, ft) for fid, eid, sp, ft in cur.fetchall()}

    inserted = updated = skipped = 0
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            for r in succ:
                key = r['rel_path']
                tup = file_idx.get(key)
                if not tup:
                    skipped += 1
                    continue
                file_id, bl_id, ft = tup
                # 기존 pdf_extractions 있는지 확인
                cur.execute("""
                    INSERT INTO pdf_extractions
                        (file_id, bl_id, file_type, extractor, parse_status, page_count, raw_text, parsed)
                    VALUES (%s, %s::uuid, %s, 'rapidocr-v1', 'partial', %s, %s, '{}'::jsonb)
                    ON CONFLICT (file_id) DO UPDATE SET
                        raw_text   = EXCLUDED.raw_text,
                        page_count = EXCLUDED.page_count,
                        extractor  = EXCLUDED.extractor,
                        extracted_at = now()
                    RETURNING (xmax = 0) AS inserted_new
                """, (file_id, bl_id, ft, r['page_count'], r['text']))
                row = cur.fetchone()
                if row and row[0]:
                    inserted += 1
                else:
                    updated += 1
        conn.commit()
    print(f'DB: inserted={inserted}, updated={updated}, skipped={skipped}')


if __name__ == '__main__':
    main()
