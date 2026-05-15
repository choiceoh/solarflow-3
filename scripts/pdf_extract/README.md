# pdf_extract — PDF 본문 정형 추출 모듈

운영 무역 문서 PDF (BL / OBL / HBL / PL / CI / 면장) 의 정형 필드를
자동 추출하는 통합 모듈. 디지털 PDF 는 fitz + 정규식, 스캔본은 RapidOCR + 정규식.

## 추출 가능 필드 (BL/OBL/HBL 기준 — 운영 97 PDF 평균 92%)

| 필드 | 추출률 | 비고 |
|---|---|---|
| port_of_loading | 100% | 도시 화이트리스트 |
| port_of_discharge | 98% | 도시 화이트리스트 |
| place_of_delivery | 98% | POD 와 동일 추정 |
| lc_no | 93% | DOCUMENTARY CREDIT NUMBER 라벨 + bare |
| total_weight_kg | 93% | KGS 라벨 + loose fallback |
| model | 92% | JKM/JAM/LR/RSM + OCR 노이즈 대응 |
| date_hint | 92% | 6가지 날짜 형식 |
| bl_no_in_pdf | 91% | 운영 prefix 화이트리스트 (SNKO/JWSH/EASEK 등) |
| total_cbm | 89% | CBM 라벨 |
| total_pallets | 88% | TOTAL: N PALLETS 라벨 |
| hs_code | 87% | HS NO. + bare 8541... 패턴 |
| containers | 86% | ISO 6346 owner code 화이트리스트 |

CI/PL: invoice_no/lc_no/pa_no/qty_pc/unit_price_usd_wp/total_usd 등.
면장: declaration_no/bl_awb_no/master_bl_no/cif_usd/exchange_rate 등.

## CLI 사용

```bash
# 단일 PDF
python -m scripts.pdf_extract /path/to/file.pdf
# → file_type / classification / extractor / parse_status / parsed fields

# JSON 출력 (raw_text 포함)
python -m scripts.pdf_extract /path/to/file.pdf --json

# JSON 출력 (raw_text 제외, summary 만)
python -m scripts.pdf_extract /path/to/file.pdf --json --no-raw

# file_type 명시 (자동 추정 우회)
python -m scripts.pdf_extract /path/to/file.pdf --file-type BL

# 디렉토리 일괄 처리
python -m scripts.pdf_extract /path/to/dir --batch
```

## Python API 사용

```python
from scripts.pdf_extract import extract, extract_batch

# 단일 파일
result = extract('/path/to/file.pdf')
# → {
#     'pdf_path': '...',
#     'file_type': 'BL',
#     'classification': 'SCAN',
#     'page_count': 2,
#     'extractor': 'rapidocr+bl-regex',
#     'parse_status': 'success',
#     'parsed': {'bl_no_in_pdf': 'SNKO03K250201370', 'lc_no': 'M12MK2502NU00032', ...},
#     'raw_text': '--- page 1 ---\nShipper\n...'
# }

# 디렉토리 일괄
results = extract_batch('/path/to/dir', file_types=['BL', 'OBL', 'HBL'])
```

## 의존성

```bash
pip install pymupdf rapidocr_onnxruntime
```

`rapidocr_onnxruntime` 은 ONNX CPU 추론 — GPU 불필요. 페이지당 ~3초 (CPU).

## 모듈 구조

```
pdf_extract/
├── __init__.py        # 공개 API: extract, extract_batch
├── __main__.py        # CLI 진입점
├── classify.py        # DIGITAL/SCAN 분류 + 파일명 file_type 추정
├── digital.py         # fitz + CI/PL/면장 정규식 파서
├── ocr.py             # RapidOCR + BL/OBL/HBL 정규식 파서 (OCR 노이즈 대응)
├── extract.py         # 통합 진입점 (자동 분류 → 적절한 파서)
└── README.md          # 본 문서
```

## 운영 사용 예시

새 PDF 가 Dropbox/운영 스토리지에 들어왔을 때:

```bash
# 1. 단일 파일 처리 후 DB 직접 INSERT
python << 'PYEOF'
import json, psycopg, os
from scripts.pdf_extract import extract

r = extract('/path/to/new_bl.pdf')
print(f'{r["parse_status"]}: {len(r["parsed"])} fields')

# pdf_extractions UPSERT
with psycopg.connect(os.environ['SUPABASE_DB_URL']) as conn, conn.cursor() as cur:
    cur.execute("""
        INSERT INTO pdf_extractions (file_id, file_type, extractor, parse_status, page_count, raw_text, parsed)
        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
        ON CONFLICT (file_id) DO UPDATE SET
            parsed = EXCLUDED.parsed,
            parse_status = EXCLUDED.parse_status,
            raw_text = EXCLUDED.raw_text,
            extracted_at = now()
    """, (file_id, r['file_type'], r['extractor'], r['parse_status'],
          r['page_count'], r['raw_text'], json.dumps(r['parsed'], ensure_ascii=False)))
    conn.commit()
PYEOF
```

## 기존 백필 스크립트와의 관계

본 모듈은 다음 백필 스크립트의 파서 로직을 통합·재사용 가능하게 한 것:
- `scripts/ocr_scan_pdfs.py` — 99 SCAN PDF 일괄 OCR (PR #869)
- `scripts/parse_ocr_bl.py` — OCR 텍스트 → BL 정형 데이터
- `scripts/extract_and_load_pdfs.py` — 213 DIGITAL PDF 정규식 파서

기존 스크립트는 일회성 백필이고, 본 모듈은 **신규 PDF 추가 시 재사용** 용도.
운영자가 새 PDF 를 받으면 CLI 1줄로 처리 가능.
