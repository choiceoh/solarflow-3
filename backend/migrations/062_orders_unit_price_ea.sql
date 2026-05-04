-- @auto-apply: yes
-- 061_orders_unit_price_ea.sql
-- D-059 PR 14 후속: orders 에 장당 단가(unit_price_ea) 컬럼 추가 + 백필.
--
-- 배경: PR 14 의 자동 모드 수주 등록(autoRegisterOrder)이 Topsolar 시트 col 11
--       (장당 단가) 을 unit_price_wp(₩/Wp) 에 그대로 박아 437 행이 단위 오염.
--       sales 처럼 두 단가를 별도 컬럼으로 분리하여 의미를 명확히 한다.
-- 단위:
--   unit_price_wp = 원/Wp  (예: 540W 모듈 145원/Wp)
--   unit_price_ea = 원/장  (예: 540W 모듈 78,300원/장)
--   관계: unit_price_ea = unit_price_wp × spec_wp

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS unit_price_ea numeric(12,2);

COMMENT ON COLUMN orders.unit_price_ea IS
  '장당 판매 단가 (원/장). unit_price_wp × spec_wp. 자동 모드는 시트 단가를 이쪽에 보존.';

-- 백필: unit_price_wp > 1000 인 행은 장당 단가가 들어가 있는 것으로 간주(₩/Wp 으로
-- 1000 이상은 비현실적). 그 값을 unit_price_ea 로 옮기고 wp 는 spec_wp 로 나눠 재계산.
UPDATE orders o
SET unit_price_ea = o.unit_price_wp,
    unit_price_wp = round((o.unit_price_wp / NULLIF(p.spec_wp, 0))::numeric, 2)
FROM products p
WHERE o.product_id = p.product_id
  AND o.unit_price_ea IS NULL
  AND o.unit_price_wp > 1000
  AND p.spec_wp > 0;

-- 정상 행(wp ≤ 1000) 은 wp 만 들어 있던 것 → ea 도 채움
UPDATE orders o
SET unit_price_ea = round((o.unit_price_wp * p.spec_wp)::numeric, 2)
FROM products p
WHERE o.product_id = p.product_id
  AND o.unit_price_ea IS NULL
  AND o.unit_price_wp > 0
  AND o.unit_price_wp <= 1000
  AND p.spec_wp > 0;
