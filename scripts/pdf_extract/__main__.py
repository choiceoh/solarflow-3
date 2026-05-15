"""CLI 진입점 — python -m scripts.pdf_extract path/to/file.pdf"""

import argparse
import json
import sys
from pathlib import Path

from .extract import extract, extract_batch


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(
        prog='pdf_extract',
        description='PDF (BL/OBL/HBL/PL/CI/면장) 본문 추출 — 디지털은 fitz+정규식, 스캔본은 RapidOCR.',
    )
    ap.add_argument('path', help='PDF 파일 또는 디렉토리 경로')
    ap.add_argument('--file-type', help='명시적 file_type (BL/OBL/HBL/PL/CI/declaration_kr). 생략 시 파일명 추정')
    ap.add_argument('--json', action='store_true', help='JSON only (raw_text 포함)')
    ap.add_argument('--no-raw', action='store_true', help='raw_text 제외 (summary 만)')
    ap.add_argument('--batch', action='store_true', help='디렉토리 일괄 처리')
    args = ap.parse_args()

    p = Path(args.path)
    if not p.exists():
        print(f'ERROR: not found: {p}', file=sys.stderr)
        sys.exit(2)

    if args.batch or p.is_dir():
        results = extract_batch(p)
        print(f'처리: {len(results)}', file=sys.stderr)
        if args.json:
            out = []
            for r in results:
                if args.no_raw:
                    r = {k: v for k, v in r.items() if k != 'raw_text'}
                out.append(r)
            print(json.dumps(out, ensure_ascii=False, indent=2))
        else:
            success = sum(1 for r in results if r.get('parse_status') == 'success')
            partial = sum(1 for r in results if r.get('parse_status') == 'partial')
            failed = sum(1 for r in results if r.get('parse_status') == 'failed')
            print(f'  success: {success}')
            print(f'  partial: {partial}')
            print(f'  failed:  {failed}')
    else:
        r = extract(p, file_type=args.file_type)
        if args.no_raw and 'raw_text' in r:
            r = {k: v for k, v in r.items() if k != 'raw_text'}
        if args.json:
            print(json.dumps(r, ensure_ascii=False, indent=2))
        else:
            print(f'pdf:          {r["pdf_path"]}')
            print(f'file_type:    {r["file_type"]}')
            print(f'classification: {r["classification"]} ({r["page_count"]} pages)')
            print(f'extractor:    {r["extractor"]}')
            print(f'parse_status: {r["parse_status"]}')
            print(f'parsed ({len(r["parsed"])} fields):')
            for k, v in r['parsed'].items():
                if isinstance(v, list):
                    print(f'  {k}: <list len={len(v)}>')
                else:
                    print(f'  {k}: {v}')


if __name__ == '__main__':
    main()
