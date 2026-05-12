-- @auto-apply: yes
-- 098_fifo_pattern_a_spare_split.sql
--
-- 097 가 처리하지 못한 잔존 100건 over-allocation 의 가장 흔한 패턴(68건):
--   sale outbound 1건 + fifo 행 2개 (상품판매 main + 상품판매(스페어) 1개) 가
--   동일 outbound 에 묶여 있는 케이스. ERP 원본은 main / spare 2 줄이지만
--   임포터가 outbound 를 1건만 만들어서 spare 행이 sale 출고에 누적됐다.
--
-- 본 마이그레이션:
--   1. 누락된 sale_spare outbound 를 신규 생성 (qty = 스페어 fifo 행 allocated_qty)
--   2. 대응 sale 레코드 신규 생성 (단가/공급가 0 — 기존 sale_spare 관행)
--   3. 스페어 fifo_match.outbound_id 를 신규 outbound 로 재할당
--   4. 변경 내역을 _fifo_pattern_a_audit_20260512 에 보존
--
-- 안전: 신규 outbound 의 source_payload 에 'auto_split_from' 메타를 박아
-- 추후 식별 가능. fifo_matches 의 다른 필드는 유지.

BEGIN;

CREATE TABLE IF NOT EXISTS _fifo_pattern_a_audit_20260512 (
  audit_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orig_outbound_id      uuid NOT NULL,
  new_outbound_id       uuid NOT NULL,
  new_sale_id           uuid NOT NULL,
  fifo_match_id         uuid NOT NULL,
  erp_outbound_no       text,
  outbound_date         date,
  product_id            uuid,
  spare_qty             integer,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- 1) Pattern A 케이스 식별 + 필요한 컬럼 추출
WITH bad AS (
  SELECT o.outbound_id, o.erp_outbound_no, o.outbound_date, o.product_id,
         o.company_id, o.warehouse_id, o.quantity AS ob_qty,
         o.site_name, o.site_address, o.target_company_id, o.bl_id, o.order_id
  FROM outbounds o
  JOIN fifo_matches fm ON fm.outbound_id = o.outbound_id
  WHERE o.usage_category = 'sale' AND o.status = 'active'
  GROUP BY o.outbound_id, o.quantity, o.erp_outbound_no, o.outbound_date,
           o.product_id, o.company_id, o.warehouse_id, o.site_name,
           o.site_address, o.target_company_id, o.bl_id, o.order_id
  HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
),
classified AS (
  SELECT b.*,
         COUNT(fm.match_id) AS match_n,
         SUM(fm.allocated_qty) FILTER (WHERE fm.usage_category_raw='상품판매') AS main_qty,
         SUM(fm.allocated_qty) FILTER (WHERE fm.usage_category_raw='상품판매(스페어)') AS spare_qty
  FROM bad b
  JOIN fifo_matches fm ON fm.outbound_id = b.outbound_id
  GROUP BY b.outbound_id, b.erp_outbound_no, b.outbound_date, b.product_id,
           b.company_id, b.warehouse_id, b.ob_qty, b.site_name, b.site_address,
           b.target_company_id, b.bl_id, b.order_id
),
pattern_a AS (
  -- 2-row 패턴이면서 main=ob_qty 정확히 매칭, spare 가 orphan
  SELECT c.*,
         (SELECT customer_id FROM sales WHERE outbound_id=c.outbound_id AND status='active' LIMIT 1) AS customer_id,
         (SELECT match_id FROM fifo_matches WHERE outbound_id=c.outbound_id AND usage_category_raw='상품판매(스페어)' LIMIT 1) AS spare_match_id
  FROM classified c
  WHERE c.match_n = 2 AND c.main_qty = c.ob_qty AND c.spare_qty > 0
),

-- 2) 새 outbound 생성 (sale_spare)
new_outbounds AS (
  INSERT INTO outbounds (
    outbound_date, company_id, product_id, quantity, warehouse_id,
    usage_category, order_id, site_name, site_address, target_company_id, bl_id,
    erp_outbound_no, memo, status, source_payload
  )
  SELECT
    pa.outbound_date, pa.company_id, pa.product_id, pa.spare_qty, pa.warehouse_id,
    'sale_spare', pa.order_id, pa.site_name, pa.site_address, pa.target_company_id, pa.bl_id,
    pa.erp_outbound_no,
    '[098] 자동 분리: ERP 한 줄의 스페어 행에서 생성',
    'active',
    jsonb_build_object(
      'auto_split_from', pa.outbound_id::text,
      'spare_match_id',  pa.spare_match_id::text,
      'migration',       '098_fifo_pattern_a_spare_split'
    )
  FROM pattern_a pa
  RETURNING outbound_id, source_payload
),
new_outbounds_with_orig AS (
  SELECT no.outbound_id AS new_outbound_id,
         (no.source_payload->>'auto_split_from')::uuid AS orig_outbound_id,
         (no.source_payload->>'spare_match_id')::uuid AS spare_match_id
  FROM new_outbounds no
),

-- 3) 대응 sale 레코드 생성 (단가 0)
new_sales AS (
  INSERT INTO sales (
    outbound_id, customer_id, unit_price_wp, unit_price_ea,
    supply_amount, vat_amount, total_amount, quantity, status, memo
  )
  SELECT
    nw.new_outbound_id, pa.customer_id, 0, 0, 0, 0, 0, pa.spare_qty,
    'active', '[098] 자동 분리: sale_spare (무상)'
  FROM new_outbounds_with_orig nw
  JOIN pattern_a pa ON pa.outbound_id = nw.orig_outbound_id
  RETURNING sale_id, outbound_id
),

-- 4) audit 기록
audit_inserted AS (
  INSERT INTO _fifo_pattern_a_audit_20260512
    (orig_outbound_id, new_outbound_id, new_sale_id, fifo_match_id,
     erp_outbound_no, outbound_date, product_id, spare_qty)
  SELECT nw.orig_outbound_id, nw.new_outbound_id, ns.sale_id, nw.spare_match_id,
         pa.erp_outbound_no, pa.outbound_date, pa.product_id, pa.spare_qty
  FROM new_outbounds_with_orig nw
  JOIN new_sales ns  ON ns.outbound_id = nw.new_outbound_id
  JOIN pattern_a pa  ON pa.outbound_id = nw.orig_outbound_id
  RETURNING audit_id, fifo_match_id, new_outbound_id
)

-- 5) fifo_matches.outbound_id 재할당
UPDATE fifo_matches fm
SET outbound_id = a.new_outbound_id
FROM audit_inserted a
WHERE fm.match_id = a.fifo_match_id;

-- 6) 검증 NOTICE
DO $$
DECLARE
  v_split int;
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_split FROM _fifo_pattern_a_audit_20260512;
  SELECT COUNT(*) INTO v_remaining FROM (
    SELECT o.outbound_id
    FROM outbounds o
    JOIN fifo_matches fm ON fm.outbound_id = o.outbound_id
    WHERE o.usage_category IN ('sale','sale_spare') AND o.status='active'
    GROUP BY o.outbound_id, o.quantity
    HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
  ) t;

  RAISE NOTICE '[098] Pattern A 분리: %건 신규 outbound 생성, 잔존 over-allocated outbounds: %', v_split, v_remaining;
END $$;

COMMENT ON TABLE _fifo_pattern_a_audit_20260512 IS
  '098 마이그레이션이 자동 분리한 sale_spare outbound 의 (orig, new) 매핑. 잔존 사례별 검토 후 DROP.';

COMMIT;
