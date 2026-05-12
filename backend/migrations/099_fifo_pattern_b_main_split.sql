-- @auto-apply: yes
-- 099_fifo_pattern_b_main_split.sql
--
-- 098 가 처리하지 못한 Pattern B (17건): sale_spare outbound 1건 + fifo 2행
-- (상품판매 main + 상품판매(스페어)) 가 동일 outbound 에 묶인 케이스. 본래는
-- 매출(sale) outbound 가 별도 있어야 했는데 임포터가 sale_spare 만 만들었다.
--
-- fifo 의 orphan main 행에는 sales_unit_price_ea 가 채워져 있어 누락된 sale
-- outbound 의 단가/공급가 를 정확히 복원할 수 있다.
--
-- 본 마이그레이션:
--   1. 누락된 sale outbound 신규 생성 (qty = main fifo 행 allocated_qty)
--   2. 대응 sale 레코드 신규 생성 (unit_price_ea = fifo.sales_unit_price_ea,
--      supply_amount = fifo.sales_amount, unit_price_wp = ea/spec_wp)
--   3. main fifo_match.outbound_id 를 신규 outbound 로 재할당
--   4. 변경 내역을 _fifo_pattern_b_audit_20260512 에 보존
--
-- 결과: 매출분석에 ~570만원 (sum of orphan sales_amount) 의 누락 매출이
-- 복원됨. 이는 임포터 버그로 인해 그동안 매출 합계에서 빠져있던 분.

BEGIN;

CREATE TABLE IF NOT EXISTS _fifo_pattern_b_audit_20260512 (
  audit_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orig_outbound_id      uuid NOT NULL,
  new_outbound_id       uuid NOT NULL,
  new_sale_id           uuid NOT NULL,
  fifo_match_id         uuid NOT NULL,
  erp_outbound_no       text,
  outbound_date         date,
  product_id            uuid,
  main_qty              integer,
  unit_price_ea         numeric,
  supply_amount         numeric,
  created_at            timestamptz NOT NULL DEFAULT now()
);

WITH bad AS (
  SELECT o.outbound_id, o.erp_outbound_no, o.outbound_date, o.product_id,
         o.company_id, o.warehouse_id, o.quantity AS ob_qty,
         o.site_name, o.site_address, o.target_company_id, o.bl_id, o.order_id
  FROM outbounds o
  JOIN fifo_matches fm ON fm.outbound_id = o.outbound_id
  WHERE o.usage_category = 'sale_spare' AND o.status='active'
  GROUP BY o.outbound_id, o.quantity, o.erp_outbound_no, o.outbound_date, o.product_id,
           o.company_id, o.warehouse_id, o.site_name, o.site_address, o.target_company_id, o.bl_id, o.order_id
  HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
),
classified AS (
  SELECT b.*,
         COUNT(fm.match_id) AS match_n,
         SUM(fm.allocated_qty) FILTER (WHERE fm.usage_category_raw='상품판매') AS main_qty,
         SUM(fm.allocated_qty) FILTER (WHERE fm.usage_category_raw='상품판매(스페어)') AS spare_qty
  FROM bad b
  JOIN fifo_matches fm ON fm.outbound_id = b.outbound_id
  GROUP BY b.outbound_id, b.erp_outbound_no, b.outbound_date, b.product_id, b.company_id,
           b.warehouse_id, b.ob_qty, b.site_name, b.site_address, b.target_company_id, b.bl_id, b.order_id
),
pattern_b AS (
  SELECT c.*,
         (SELECT customer_id FROM sales WHERE outbound_id=c.outbound_id AND status='active' LIMIT 1) AS customer_id,
         (SELECT match_id FROM fifo_matches WHERE outbound_id=c.outbound_id AND usage_category_raw='상품판매' LIMIT 1) AS main_match_id,
         (SELECT sales_unit_price_ea FROM fifo_matches WHERE outbound_id=c.outbound_id AND usage_category_raw='상품판매' LIMIT 1) AS unit_price_ea,
         (SELECT sales_amount FROM fifo_matches WHERE outbound_id=c.outbound_id AND usage_category_raw='상품판매' LIMIT 1) AS supply_amount,
         (SELECT spec_wp FROM products WHERE product_id=c.product_id) AS spec_wp
  FROM classified c
  WHERE c.match_n = 2 AND c.spare_qty = c.ob_qty AND c.main_qty > 0
),

new_outbounds AS (
  INSERT INTO outbounds (
    outbound_date, company_id, product_id, quantity, warehouse_id,
    usage_category, order_id, site_name, site_address, target_company_id, bl_id,
    erp_outbound_no, memo, status, source_payload
  )
  SELECT
    pb.outbound_date, pb.company_id, pb.product_id, pb.main_qty, pb.warehouse_id,
    'sale', pb.order_id, pb.site_name, pb.site_address, pb.target_company_id, pb.bl_id,
    pb.erp_outbound_no,
    '[099] 자동 분리: ERP main 행에서 생성 (fifo sales_unit_price_ea 사용)',
    'active',
    jsonb_build_object(
      'auto_split_from', pb.outbound_id::text,
      'main_match_id',   pb.main_match_id::text,
      'migration',       '099_fifo_pattern_b_main_split'
    )
  FROM pattern_b pb
  RETURNING outbound_id, source_payload
),
new_outbounds_with_orig AS (
  SELECT no.outbound_id AS new_outbound_id,
         (no.source_payload->>'auto_split_from')::uuid AS orig_outbound_id,
         (no.source_payload->>'main_match_id')::uuid AS main_match_id
  FROM new_outbounds no
),

new_sales AS (
  INSERT INTO sales (
    outbound_id, customer_id, unit_price_wp, unit_price_ea,
    supply_amount, vat_amount, total_amount, quantity, status, memo
  )
  SELECT
    nw.new_outbound_id, pb.customer_id,
    -- spec_wp 가 NULL/0 이면 0 으로 폴백 (unit_price_wp NOT NULL 제약)
    CASE WHEN COALESCE(pb.spec_wp, 0) > 0 THEN ROUND(pb.unit_price_ea / pb.spec_wp, 2) ELSE 0 END,
    pb.unit_price_ea,
    pb.supply_amount, 0, pb.supply_amount, pb.main_qty,
    'active', '[099] 자동 분리: 누락 매출 복원'
  FROM new_outbounds_with_orig nw
  JOIN pattern_b pb ON pb.outbound_id = nw.orig_outbound_id
  RETURNING sale_id, outbound_id
),

audit_inserted AS (
  INSERT INTO _fifo_pattern_b_audit_20260512
    (orig_outbound_id, new_outbound_id, new_sale_id, fifo_match_id,
     erp_outbound_no, outbound_date, product_id, main_qty, unit_price_ea, supply_amount)
  SELECT nw.orig_outbound_id, nw.new_outbound_id, ns.sale_id, nw.main_match_id,
         pb.erp_outbound_no, pb.outbound_date, pb.product_id, pb.main_qty,
         pb.unit_price_ea, pb.supply_amount
  FROM new_outbounds_with_orig nw
  JOIN new_sales ns ON ns.outbound_id = nw.new_outbound_id
  JOIN pattern_b pb ON pb.outbound_id = nw.orig_outbound_id
  RETURNING audit_id, fifo_match_id, new_outbound_id
)

UPDATE fifo_matches fm
SET outbound_id = a.new_outbound_id
FROM audit_inserted a
WHERE fm.match_id = a.fifo_match_id;

DO $$
DECLARE
  v_split int;
  v_remaining int;
  v_supply_restored numeric;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(supply_amount), 0)
    INTO v_split, v_supply_restored
    FROM _fifo_pattern_b_audit_20260512;
  SELECT COUNT(*) INTO v_remaining FROM (
    SELECT o.outbound_id FROM outbounds o
    JOIN fifo_matches fm ON fm.outbound_id=o.outbound_id
    WHERE o.usage_category IN ('sale','sale_spare') AND o.status='active'
    GROUP BY o.outbound_id, o.quantity HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
  ) t;
  RAISE NOTICE '[099] Pattern B 분리: %건 신규 sale outbound, 매출 복원 %원, 잔존 over-allocated: %',
    v_split, v_supply_restored::bigint, v_remaining;
END $$;

COMMENT ON TABLE _fifo_pattern_b_audit_20260512 IS
  '099 마이그레이션이 자동 분리한 sale outbound (누락된 매출 복원) 의 (orig, new) 매핑. 잔존 사례별 검토 후 DROP.';

COMMIT;
