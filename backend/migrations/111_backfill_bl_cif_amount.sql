-- 111_backfill_bl_cif_amount.sql
-- bl_shipments.cif_amount_krw 백필 — import_declarations.cif_krw 합산
--
-- 배경:
--   bl_shipments 119건(탑솔라) 중 6건만 cif_amount_krw 채워져 있었음. 면장
--   (import_declarations) 에는 cif_krw 가 들어 있으므로 BL 단위로 합산해
--   BL 마스터에 보강. 일부 BL 은 면장이 여러 건(예: DFS815002444) 매달려
--   있어 SUM 필수.
--
-- 영향:
--   - TS 73 + DW 16 + HS 5 = 94 행 UPDATE 예상
--   - cif_amount_krw 가 NULL 인 BL 만 갱신 (이미 값 있는 6건은 보존)
--   - 매출/원가 집계엔 직접 영향 없음 (BL 화면/대시보드용 표시값)
--
-- 멱등성: WHERE cif_amount_krw IS NULL 가드로 재실행 안전

BEGIN;

WITH bl_cif AS (
  SELECT bl_id, SUM(cif_krw)::bigint AS cif_sum
  FROM import_declarations
  WHERE cif_krw IS NOT NULL AND bl_id IS NOT NULL
  GROUP BY bl_id
)
UPDATE bl_shipments b
SET cif_amount_krw = bc.cif_sum,
    updated_at = now()
FROM bl_cif bc
WHERE b.bl_id = bc.bl_id
  AND b.cif_amount_krw IS NULL;

-- 검증
SELECT
  c.company_code,
  COUNT(*) FILTER (WHERE cif_amount_krw IS NOT NULL) AS with_cif,
  COUNT(*) FILTER (WHERE cif_amount_krw IS NULL)     AS without_cif,
  COUNT(*)                                           AS total_bls
FROM bl_shipments b
JOIN companies c ON c.company_id = b.company_id
GROUP BY c.company_code
ORDER BY c.company_code;

COMMIT;
