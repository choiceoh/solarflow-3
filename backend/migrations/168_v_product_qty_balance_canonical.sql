-- @auto-apply: yes
-- M165: v_product_qty_balance 정본 마이그 이전
--
-- 배경: 본 view 는 `scripts/fix_data_integrity.py:150` 의 ad-hoc `CREATE OR REPLACE
-- VIEW` 호출로 prod 에 들어가 있었다. schema_migrations 에 기록되지 않아 다음 사항이
-- 위험:
--   1. dbschema codegen 이 정의를 잃을 수 있음 (현재 dbschema/tables.gen.go 에
--      VProductQtyBalance 가 introspect 됐지만, view 가 prod 에서 DROP 되면 다음
--      codegen 부터 type 이 사라짐)
--   2. M077_integrity_check_view 가 `v_product_qty_balance` 를 4개 검증식에서 참조 —
--      view 가 정본 없이 존재하면 회귀 검증 자체가 stale 상태
--
-- 본 마이그는 prod 의 현재 정의 (pg_get_viewdef 로 확보) 를 그대로 멱등 재생성한다.
-- view 본문은 동일 — 새 기능 없음. 단지 schema_migrations 추적 + GRANT 명시화.
--
-- 정의 출처: `scripts/fix_data_integrity.py:150` 의 `CREATE OR REPLACE VIEW`.
-- 컬럼: product_id, product_code, product_name, spec_wp,
--       initial_qty (`inventory_movements.movement_subtype='기초'` 합),
--       inbound_qty (`inbounds.quantity` 합),
--       outbound_qty (`outbounds.quantity` 합, status='active'),
--       balance_qty = initial + inbound - outbound

BEGIN;

CREATE OR REPLACE VIEW v_product_qty_balance AS
WITH initial_stock AS (
  SELECT product_id, sum(beginning_qty) AS initial_qty
  FROM inventory_movements
  WHERE movement_subtype = '기초'
  GROUP BY product_id
),
inbound_sum AS (
  SELECT product_id, sum(quantity) AS in_qty
  FROM inbounds
  GROUP BY product_id
),
outbound_sum AS (
  SELECT product_id, sum(quantity) AS out_qty
  FROM outbounds
  WHERE status = 'active'
  GROUP BY product_id
)
SELECT
  p.product_id,
  p.product_code,
  p.product_name,
  p.spec_wp,
  COALESCE(i.initial_qty, 0) AS initial_qty,
  COALESCE(ib.in_qty, 0) AS inbound_qty,
  COALESCE(ob.out_qty, 0) AS outbound_qty,
  COALESCE(i.initial_qty, 0) + COALESCE(ib.in_qty, 0) - COALESCE(ob.out_qty, 0) AS balance_qty
FROM products p
LEFT JOIN initial_stock i USING (product_id)
LEFT JOIN inbound_sum ib USING (product_id)
LEFT JOIN outbound_sum ob USING (product_id)
WHERE p.is_active;

COMMENT ON VIEW v_product_qty_balance IS
  'M165: product 별 누계 재고 = 기초(inventory_movements) + 입고(inbounds) - 출고(outbounds active). M077 정합성 검증 2건 (balance < 0, 출고>입고+초기 1.05) 의 데이터 소스.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON v_product_qty_balance TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON v_product_qty_balance TO service_role;
  END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
