-- 113_backfill_outbound_bl_items.sql
-- outbound_bl_items 백필 — fifo_matches → import_declarations.bl_id 사슬
--
-- 배경:
--   outbounds 2025 (탑솔라) 2,169건 중 393건만 outbound_bl_items 에 매핑되어
--   있음 (18%). 반면 fifo_matches 는 출고-면장 매칭을 2,651건 보유하고,
--   면장에는 bl_id 가 90% 채워져 있어 출고 → BL 사슬을 직접 도출 가능.
--   이걸 outbound_bl_items 로 옮긴다.
--
-- 데이터 신뢰성:
--   xlsx (solarflow 자료.xlsx / 탑솔라Fifo_복사본) 의 (출고번호, BL No.)
--   페어 1,707건과 DB fifo_matches 의 동일 페어 1,705건이 99.9% 일치
--   (교차검증 완료, 2026-05-14).
--
-- 사슬:
--   fifo_matches.outbound_id (필수)
--     → fifo_matches.declaration_id (90% 채워짐)
--       → import_declarations.bl_id (대부분 채워짐)
--         → bl_shipments
--   nullable 체인이라 INNER JOIN + NOT NULL 가드로 안전 거르기.
--
-- 영향:
--   - INSERT ~2,458 행 (전 기간, 회사 무관)
--   - outbound_bl_items 매핑률 18% → 80%+ 회복
--   - 분할 출고 케이스 (한 출고 = 여러 BL) 자연 처리: GROUP BY 로 BL별 합산
--   - quantity 는 fifo_matches.allocated_qty SUM (CHECK quantity > 0 통과)
--
-- 멱등성:
--   (outbound_id, bl_id) 가 이미 있는 행은 NOT EXISTS 가드로 SKIP.
--   재실행 안전.
--
-- 안 건드림:
--   - outbounds.bl_id 직접 FK (이중 구조 일원화는 별도 PR 예정)
--   - 분할 비율이 변경되는 케이스 (수동 조정분) — 기존 obi 행이 있으면 그대로

BEGIN;

WITH src AS (
  SELECT
    fm.outbound_id,
    id.bl_id,
    SUM(fm.allocated_qty)::int AS qty
  FROM fifo_matches fm
  JOIN import_declarations id ON id.declaration_id = fm.declaration_id
  WHERE fm.outbound_id IS NOT NULL
    AND id.bl_id      IS NOT NULL
    AND fm.allocated_qty > 0
  GROUP BY fm.outbound_id, id.bl_id
  HAVING SUM(fm.allocated_qty) > 0
)
INSERT INTO outbound_bl_items (outbound_id, bl_id, quantity)
SELECT s.outbound_id, s.bl_id, s.qty
FROM src s
WHERE NOT EXISTS (
  SELECT 1 FROM outbound_bl_items obi
  WHERE obi.outbound_id = s.outbound_id
    AND obi.bl_id       = s.bl_id
);

-- 검증
SELECT
  'after'                AS stage,
  COUNT(*)               AS total_mappings,
  COUNT(DISTINCT outbound_id) AS distinct_outbounds,
  COUNT(DISTINCT bl_id)  AS distinct_bls
FROM outbound_bl_items;

-- 회사별 outbound 매핑률 (탑솔라 2025)
SELECT
  c.company_code,
  COUNT(*) AS total_outbounds_2025,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM outbound_bl_items obi WHERE obi.outbound_id = o.outbound_id
  )) AS mapped_outbounds,
  ROUND(100.0 * COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM outbound_bl_items obi WHERE obi.outbound_id = o.outbound_id
  )) / NULLIF(COUNT(*), 0), 1) AS mapped_pct
FROM outbounds o
JOIN companies c ON c.company_id = o.company_id
WHERE o.outbound_date BETWEEN '2025-01-01' AND '2025-12-31'
  AND o.company_id IN (
    '99f0fc15-0555-4a41-a025-8bf3630a7947',
    '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c',
    'a9c3c675-8ed5-4a33-80e7-190d25888e80'
  )
GROUP BY c.company_code
ORDER BY c.company_code;

COMMIT;
