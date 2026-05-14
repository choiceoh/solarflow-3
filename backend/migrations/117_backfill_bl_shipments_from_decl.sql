-- 117_backfill_bl_shipments_from_decl.sql
-- bl_shipments 의 declaration_number / invoice_number / exchange_rate /
-- actual_arrival 을 import_declarations 에서 끌어와 백필
--
-- 배경:
--   bl_shipments 150 건 중:
--     declaration_number  6/150 채워짐 (NULL 144)
--     invoice_number      0/150 채워짐 (NULL 150)
--     exchange_rate       6/150 채워짐 (NULL 144)
--     actual_arrival      6/150 채워짐 (NULL 144)
--   면장 (import_declarations) 에는 이 값들이 들어 있어 BL 단위로 끌어옴.
--   다면장 BL 도 있으므로 MAX 로 단일화 (declaration_number 는 운영 케이스
--   거의 1:1 이라 충돌 무시).
--
-- 변경:
--   src AS (
--     SELECT bl_id, MAX(declaration_number), MAX(invoice_no), MAX(exchange_rate),
--            MAX(release_date) FROM import_declarations GROUP BY bl_id
--   ) → UPDATE bl_shipments WHERE 해당 컬럼 NULL.
--
-- 영향 (dry-run 예상):
--   declaration_number 94 행 UPDATE
--   invoice_number      5 행 UPDATE (면장에도 대부분 NULL)
--   exchange_rate      94 행 UPDATE
--   actual_arrival     94 행 UPDATE
--
-- 멱등성: 각 컬럼 NULL 조건 가드 → 재실행 안전

BEGIN;

WITH src AS (
  SELECT bl_id,
         MAX(declaration_number) AS declaration_number,
         MAX(invoice_no)         AS invoice_no,
         MAX(exchange_rate)      AS exchange_rate,
         MAX(release_date)       AS release_date
  FROM import_declarations
  WHERE bl_id IS NOT NULL
  GROUP BY bl_id
)
UPDATE bl_shipments b
SET declaration_number = COALESCE(b.declaration_number, s.declaration_number),
    invoice_number     = COALESCE(b.invoice_number,     s.invoice_no),
    exchange_rate      = COALESCE(b.exchange_rate,      s.exchange_rate),
    actual_arrival     = COALESCE(b.actual_arrival,     s.release_date),
    updated_at = now()
FROM src s
WHERE b.bl_id = s.bl_id
  AND (
    (b.declaration_number IS NULL AND s.declaration_number IS NOT NULL) OR
    (b.invoice_number     IS NULL AND s.invoice_no          IS NOT NULL) OR
    (b.exchange_rate      IS NULL AND s.exchange_rate       IS NOT NULL) OR
    (b.actual_arrival     IS NULL AND s.release_date        IS NOT NULL)
  );

-- 검증
SELECT
  COUNT(*) total,
  COUNT(declaration_number) AS with_decl,
  COUNT(invoice_number)     AS with_inv,
  COUNT(exchange_rate)      AS with_xr,
  COUNT(actual_arrival)     AS with_arr
FROM bl_shipments;

COMMIT;
