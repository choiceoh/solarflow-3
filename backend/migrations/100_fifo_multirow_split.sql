-- @auto-apply: yes
-- 100_fifo_multirow_split.sql
--
-- 098 + 099 가 처리하지 못한 다행 (multi-row) 케이스 정리. 패턴:
--   A2: sale outbound + 다중 상품판매 fifo 행 (합 = ob_qty) + 단일 스페어 orphan
--   B2: sale_spare outbound + 다중 상품판매(스페어) fifo 행 (합 = ob_qty) + 단일 main orphan
--
-- 098/099 는 match_n=2 만 다뤄서 N>=3 케이스 (예: IS2505000093 ob=787, fifo
-- = 545+242 main + 5 spare orphan) 를 누락. 같은 로직을 다행으로 확장한다.

BEGIN;

CREATE TABLE IF NOT EXISTS _fifo_multirow_audit_20260512 (
  audit_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern               text NOT NULL,  -- 'A2' or 'B2'
  orig_outbound_id      uuid NOT NULL,
  new_outbound_id       uuid NOT NULL,
  new_sale_id           uuid NOT NULL,
  fifo_match_id         uuid NOT NULL,
  erp_outbound_no       text,
  outbound_date         date,
  product_id            uuid,
  orphan_qty            integer,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ===== Pattern A2: sale + 다중 main + 1 spare orphan =====
WITH bad AS (
  SELECT o.outbound_id, o.erp_outbound_no, o.outbound_date, o.product_id,
         o.company_id, o.warehouse_id, o.quantity AS ob_qty,
         o.site_name, o.site_address, o.target_company_id, o.bl_id, o.order_id
  FROM outbounds o
  JOIN fifo_matches fm ON fm.outbound_id = o.outbound_id
  WHERE o.usage_category='sale' AND o.status='active'
  GROUP BY o.outbound_id, o.quantity, o.erp_outbound_no, o.outbound_date, o.product_id,
           o.company_id, o.warehouse_id, o.site_name, o.site_address, o.target_company_id, o.bl_id, o.order_id
  HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
),
classified AS (
  SELECT b.*,
         SUM(fm.allocated_qty) FILTER (WHERE fm.usage_category_raw='상품판매') AS main_qty,
         COUNT(*) FILTER (WHERE fm.usage_category_raw='상품판매(스페어)') AS spare_n,
         SUM(fm.allocated_qty) FILTER (WHERE fm.usage_category_raw='상품판매(스페어)') AS spare_qty
  FROM bad b JOIN fifo_matches fm ON fm.outbound_id=b.outbound_id
  GROUP BY b.outbound_id, b.erp_outbound_no, b.outbound_date, b.product_id, b.company_id,
           b.warehouse_id, b.ob_qty, b.site_name, b.site_address, b.target_company_id, b.bl_id, b.order_id
),
pattern_a2 AS (
  -- main 합 = ob_qty, spare 행 1개 (098 의 match_n=2 제약 제거)
  SELECT c.*,
         (SELECT customer_id FROM sales WHERE outbound_id=c.outbound_id AND status='active' LIMIT 1) AS customer_id,
         (SELECT match_id FROM fifo_matches WHERE outbound_id=c.outbound_id AND usage_category_raw='상품판매(스페어)' LIMIT 1) AS spare_match_id
  FROM classified c
  WHERE c.main_qty = c.ob_qty AND c.spare_n = 1 AND c.spare_qty > 0
),
a2_new_outbounds AS (
  INSERT INTO outbounds (
    outbound_date, company_id, product_id, quantity, warehouse_id, usage_category,
    order_id, site_name, site_address, target_company_id, bl_id, erp_outbound_no,
    memo, status, source_payload
  )
  SELECT pa.outbound_date, pa.company_id, pa.product_id, pa.spare_qty, pa.warehouse_id, 'sale_spare',
         pa.order_id, pa.site_name, pa.site_address, pa.target_company_id, pa.bl_id, pa.erp_outbound_no,
         '[100/A2] 자동 분리: 다중 main + 1 spare orphan',
         'active',
         jsonb_build_object('auto_split_from', pa.outbound_id::text,
                            'spare_match_id', pa.spare_match_id::text,
                            'migration', '100_fifo_multirow_split',
                            'pattern', 'A2')
  FROM pattern_a2 pa
  RETURNING outbound_id, source_payload
),
a2_ob_link AS (
  SELECT outbound_id AS new_outbound_id,
         (source_payload->>'auto_split_from')::uuid AS orig_outbound_id,
         (source_payload->>'spare_match_id')::uuid AS spare_match_id
  FROM a2_new_outbounds
),
a2_new_sales AS (
  INSERT INTO sales (outbound_id, customer_id, unit_price_wp, unit_price_ea,
                     supply_amount, vat_amount, total_amount, quantity, status, memo)
  SELECT l.new_outbound_id, pa.customer_id, 0, 0, 0, 0, 0, pa.spare_qty,
         'active', '[100/A2] 자동 분리: sale_spare (무상)'
  FROM a2_ob_link l JOIN pattern_a2 pa ON pa.outbound_id = l.orig_outbound_id
  RETURNING sale_id, outbound_id
),
a2_audit AS (
  INSERT INTO _fifo_multirow_audit_20260512
    (pattern, orig_outbound_id, new_outbound_id, new_sale_id, fifo_match_id,
     erp_outbound_no, outbound_date, product_id, orphan_qty)
  SELECT 'A2', l.orig_outbound_id, l.new_outbound_id, ns.sale_id, l.spare_match_id,
         pa.erp_outbound_no, pa.outbound_date, pa.product_id, pa.spare_qty
  FROM a2_ob_link l
  JOIN a2_new_sales ns ON ns.outbound_id = l.new_outbound_id
  JOIN pattern_a2 pa ON pa.outbound_id = l.orig_outbound_id
  RETURNING audit_id, fifo_match_id, new_outbound_id
)
UPDATE fifo_matches fm
SET outbound_id = a.new_outbound_id
FROM a2_audit a
WHERE fm.match_id = a.fifo_match_id;

-- ===== Pattern B2: sale_spare + 다중 spare + 1 main orphan =====
WITH bad AS (
  SELECT o.outbound_id, o.erp_outbound_no, o.outbound_date, o.product_id,
         o.company_id, o.warehouse_id, o.quantity AS ob_qty,
         o.site_name, o.site_address, o.target_company_id, o.bl_id, o.order_id
  FROM outbounds o
  JOIN fifo_matches fm ON fm.outbound_id=o.outbound_id
  WHERE o.usage_category='sale_spare' AND o.status='active'
  GROUP BY o.outbound_id, o.quantity, o.erp_outbound_no, o.outbound_date, o.product_id,
           o.company_id, o.warehouse_id, o.site_name, o.site_address, o.target_company_id, o.bl_id, o.order_id
  HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
),
classified AS (
  SELECT b.*,
         COUNT(*) FILTER (WHERE fm.usage_category_raw='상품판매') AS main_n,
         SUM(fm.allocated_qty) FILTER (WHERE fm.usage_category_raw='상품판매(스페어)') AS spare_qty
  FROM bad b JOIN fifo_matches fm ON fm.outbound_id=b.outbound_id
  GROUP BY b.outbound_id, b.erp_outbound_no, b.outbound_date, b.product_id, b.company_id,
           b.warehouse_id, b.ob_qty, b.site_name, b.site_address, b.target_company_id, b.bl_id, b.order_id
),
pattern_b2 AS (
  SELECT c.*,
         (SELECT customer_id FROM sales WHERE outbound_id=c.outbound_id AND status='active' LIMIT 1) AS customer_id,
         (SELECT match_id FROM fifo_matches WHERE outbound_id=c.outbound_id AND usage_category_raw='상품판매' LIMIT 1) AS main_match_id,
         (SELECT sales_unit_price_ea FROM fifo_matches WHERE outbound_id=c.outbound_id AND usage_category_raw='상품판매' LIMIT 1) AS unit_price_ea,
         (SELECT sales_amount FROM fifo_matches WHERE outbound_id=c.outbound_id AND usage_category_raw='상품판매' LIMIT 1) AS supply_amount,
         (SELECT allocated_qty FROM fifo_matches WHERE outbound_id=c.outbound_id AND usage_category_raw='상품판매' LIMIT 1) AS main_qty,
         (SELECT spec_wp FROM products WHERE product_id=c.product_id) AS spec_wp
  FROM classified c
  WHERE c.main_n = 1 AND c.spare_qty = c.ob_qty
),
b2_new_outbounds AS (
  INSERT INTO outbounds (outbound_date, company_id, product_id, quantity, warehouse_id, usage_category,
                         order_id, site_name, site_address, target_company_id, bl_id, erp_outbound_no, memo, status, source_payload)
  SELECT pb.outbound_date, pb.company_id, pb.product_id, pb.main_qty, pb.warehouse_id, 'sale',
         pb.order_id, pb.site_name, pb.site_address, pb.target_company_id, pb.bl_id, pb.erp_outbound_no,
         '[100/B2] 자동 분리: 다중 spare + 1 main orphan',
         'active',
         jsonb_build_object('auto_split_from', pb.outbound_id::text,
                            'main_match_id', pb.main_match_id::text,
                            'migration', '100_fifo_multirow_split',
                            'pattern', 'B2')
  FROM pattern_b2 pb
  RETURNING outbound_id, source_payload
),
b2_ob_link AS (
  SELECT outbound_id AS new_outbound_id,
         (source_payload->>'auto_split_from')::uuid AS orig_outbound_id,
         (source_payload->>'main_match_id')::uuid AS main_match_id
  FROM b2_new_outbounds
),
b2_new_sales AS (
  INSERT INTO sales (outbound_id, customer_id, unit_price_wp, unit_price_ea,
                     supply_amount, vat_amount, total_amount, quantity, status, memo)
  SELECT l.new_outbound_id, pb.customer_id,
         CASE WHEN COALESCE(pb.spec_wp, 0) > 0 THEN ROUND(pb.unit_price_ea/pb.spec_wp, 2) ELSE 0 END,
         pb.unit_price_ea, pb.supply_amount, 0, pb.supply_amount, pb.main_qty,
         'active', '[100/B2] 자동 분리: 누락 매출 복원'
  FROM b2_ob_link l JOIN pattern_b2 pb ON pb.outbound_id=l.orig_outbound_id
  RETURNING sale_id, outbound_id
),
b2_audit AS (
  INSERT INTO _fifo_multirow_audit_20260512
    (pattern, orig_outbound_id, new_outbound_id, new_sale_id, fifo_match_id,
     erp_outbound_no, outbound_date, product_id, orphan_qty)
  SELECT 'B2', l.orig_outbound_id, l.new_outbound_id, ns.sale_id, l.main_match_id,
         pb.erp_outbound_no, pb.outbound_date, pb.product_id, pb.main_qty
  FROM b2_ob_link l
  JOIN b2_new_sales ns ON ns.outbound_id = l.new_outbound_id
  JOIN pattern_b2 pb ON pb.outbound_id = l.orig_outbound_id
  RETURNING audit_id, fifo_match_id, new_outbound_id
)
UPDATE fifo_matches fm
SET outbound_id = a.new_outbound_id
FROM b2_audit a
WHERE fm.match_id = a.fifo_match_id;

DO $$
DECLARE
  v_a2 int;
  v_b2 int;
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_a2 FROM _fifo_multirow_audit_20260512 WHERE pattern='A2';
  SELECT COUNT(*) INTO v_b2 FROM _fifo_multirow_audit_20260512 WHERE pattern='B2';
  SELECT COUNT(*) INTO v_remaining FROM (
    SELECT o.outbound_id FROM outbounds o JOIN fifo_matches fm ON fm.outbound_id=o.outbound_id
    WHERE o.usage_category IN ('sale','sale_spare') AND o.status='active'
    GROUP BY o.outbound_id, o.quantity HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
  ) t;
  RAISE NOTICE '[100] A2 분리 %건, B2 분리 %건, 잔존 over-allocated: %', v_a2, v_b2, v_remaining;
END $$;

COMMIT;
