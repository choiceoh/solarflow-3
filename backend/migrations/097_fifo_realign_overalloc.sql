-- @auto-apply: yes
-- 097_fifo_realign_overalloc.sql
--
-- 배경: ERP 출고번호(IS2509000118 등) 가 법인 간 / 같은 날짜 / 동일 제품 내에서
-- 재사용돼, FIFO 매칭이 잘못된 outbound_id 로 연결된 케이스가 513건 누적됐다.
-- 대표 증상: SalesAnalysisPage 거래처별 이익률 합계 ≠ 전체 요약 (미래에스엠 -43% 등).
--
-- 원인: 매칭 알고리즘이 (erp_outbound_no, customer_name) 키로 outbound 1건만 잡고
-- 형제 outbound (same erp_no/date/product 다른 quantity) 를 무시함. 결과적으로
-- 형제 outbound 의 fifo 행까지 한 outbound 에 누적 (over-allocation).
--
-- 본 마이그레이션:
--   1. 형제 outbound 가 strict 5-key (erp_no, date, product, company, quantity = allocated_qty)
--      로 유일하게 식별되는 fifo_match 를 sibling outbound 로 재할당 (예상 ~439건)
--   2. 재할당 결과는 감사용 _fifo_realign_audit_20260512 테이블에 보존
--   3. v_fifo_overallocation VIEW 와 v_db_anomalies 의 fifo.over_allocation 룰 추가
--      → 운영자가 'DB 정합성' 페이지에서 잔존 over-allocation 을 추적 가능
--
-- 비파괴: fifo_matches 의 sale_id, allocated_qty, cost_amount 등 다른 필드는 건드리지 않고
-- outbound_id 만 재할당. ROLLBACK 시 audit 테이블 로 원복 가능.

BEGIN;

-- 1) 감사 테이블 (one-shot, 정리 끝나면 별도 PR 로 DROP)
CREATE TABLE IF NOT EXISTS _fifo_realign_audit_20260512 (
  match_id        uuid PRIMARY KEY,
  old_outbound_id uuid NOT NULL,
  new_outbound_id uuid NOT NULL,
  erp_outbound_no text,
  outbound_date   date,
  product_id      uuid,
  allocated_qty   integer,
  realigned_at    timestamptz NOT NULL DEFAULT now()
);

-- 2) 유일 형제 매칭 식별 + audit insert
WITH bad_ob AS (
  SELECT o.outbound_id
  FROM outbounds o
  JOIN fifo_matches fm ON fm.outbound_id = o.outbound_id
  WHERE o.usage_category IN ('sale','sale_spare')
    AND o.status = 'active'
  GROUP BY o.outbound_id, o.quantity
  HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
),
sibling_pair AS (
  SELECT fm.match_id,
         fm.outbound_id AS curr_ob,
         fm.allocated_qty,
         o.erp_outbound_no,
         o.outbound_date,
         o.product_id,
         sib.outbound_id AS sibling_ob,
         COUNT(*) OVER (PARTITION BY fm.match_id) AS sibling_count
  FROM fifo_matches fm
  JOIN bad_ob bo   ON bo.outbound_id = fm.outbound_id
  JOIN outbounds o ON o.outbound_id  = fm.outbound_id
  JOIN outbounds sib
    ON sib.erp_outbound_no = o.erp_outbound_no
   AND sib.outbound_date   = o.outbound_date
   AND sib.product_id      = o.product_id
   AND sib.company_id      = o.company_id
   AND sib.outbound_id    <> o.outbound_id
   AND sib.status          = 'active'
   AND sib.usage_category  IN ('sale','sale_spare')
   AND sib.quantity        = fm.allocated_qty
)
INSERT INTO _fifo_realign_audit_20260512
  (match_id, old_outbound_id, new_outbound_id, erp_outbound_no, outbound_date, product_id, allocated_qty)
SELECT match_id, curr_ob, sibling_ob, erp_outbound_no, outbound_date, product_id, allocated_qty
FROM sibling_pair
WHERE sibling_count = 1
ON CONFLICT (match_id) DO NOTHING;

-- 3) 실제 재할당
UPDATE fifo_matches fm
SET outbound_id = a.new_outbound_id
FROM _fifo_realign_audit_20260512 a
WHERE fm.match_id = a.match_id;

-- 4) 감사 결과 요약 (psql notice 로 출력)
DO $$
DECLARE
  v_realigned int;
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_realigned FROM _fifo_realign_audit_20260512;

  SELECT COUNT(*) INTO v_remaining FROM (
    SELECT o.outbound_id
    FROM outbounds o
    JOIN fifo_matches fm ON fm.outbound_id = o.outbound_id
    WHERE o.usage_category IN ('sale','sale_spare') AND o.status = 'active'
    GROUP BY o.outbound_id, o.quantity
    HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
  ) t;

  RAISE NOTICE '[097] fifo_matches 재할당: % rows, 잔존 over-allocated outbounds: %', v_realigned, v_remaining;
END $$;

-- 5) 안전망: v_fifo_overallocation VIEW (운영자가 조회 가능)
CREATE OR REPLACE VIEW v_fifo_overallocation AS
SELECT o.outbound_id,
       o.erp_outbound_no,
       o.outbound_date,
       o.quantity                  AS ob_qty,
       SUM(fm.allocated_qty)       AS fifo_qty,
       SUM(fm.allocated_qty) - o.quantity AS excess_qty,
       o.company_id,
       (SELECT company_name FROM companies WHERE company_id = o.company_id) AS company_name,
       o.product_id,
       (SELECT product_code FROM products WHERE product_id = o.product_id)  AS product_code,
       o.usage_category,
       COUNT(fm.match_id)          AS match_count
FROM outbounds o
JOIN fifo_matches fm ON fm.outbound_id = o.outbound_id
WHERE o.usage_category IN ('sale','sale_spare')
  AND o.status = 'active'
GROUP BY o.outbound_id, o.erp_outbound_no, o.outbound_date, o.quantity, o.company_id, o.product_id, o.usage_category
HAVING SUM(fm.allocated_qty) > o.quantity * 1.001;

-- 6) v_db_anomalies 에 룰 추가 (96 의 기존 VIEW 본문은 보존, UNION ALL 만 덧붙임)
DROP VIEW IF EXISTS v_db_anomalies;

CREATE VIEW v_db_anomalies AS

-- ───────────────── 매출 (sales) ─────────────────
SELECT 'sales.zero_supply'::text  AS rule_name,
       'high'::text                AS severity,
       '매출'::text                AS category,
       '공급가가 0 또는 NULL — 판매가 누락 의심 (sale 카테고리 한정)'::text AS description,
       'sales'::text              AS table_name,
       s.sale_id::text            AS row_pk,
       COALESCE(s.erp_sales_no, 'sale ' || left(s.sale_id::text, 8)) AS row_label,
       jsonb_build_object(
         'supply_amount',     s.supply_amount,
         'total_amount',      s.total_amount,
         'erp_sales_no',      s.erp_sales_no,
         'tax_invoice_date',  s.tax_invoice_date,
         'usage_category',    o.usage_category
       ) AS detail
FROM sales s
JOIN outbounds o ON s.outbound_id = o.outbound_id
WHERE s.status = 'active'
  AND o.usage_category = 'sale'
  AND (s.supply_amount IS NULL OR s.supply_amount = 0)

UNION ALL

SELECT 'sales.zero_unit_price', 'high', '매출',
       '단가 0 또는 NULL — 가격 누락 의심 (sale 카테고리 한정)',
       'sales', s.sale_id::text,
       COALESCE(s.erp_sales_no, 'sale ' || left(s.sale_id::text, 8)),
       jsonb_build_object(
         'unit_price_ea',     s.unit_price_ea,
         'unit_price_wp',     s.unit_price_wp,
         'erp_sales_no',      s.erp_sales_no,
         'usage_category',    o.usage_category
       )
FROM sales s
JOIN outbounds o ON s.outbound_id = o.outbound_id
WHERE s.status = 'active'
  AND o.usage_category = 'sale'
  AND COALESCE(s.unit_price_ea, 0) = 0
  AND COALESCE(s.unit_price_wp, 0) = 0

UNION ALL

SELECT 'sales.supply_vat_total_mismatch', 'medium', '매출',
       'supply + vat ≠ total — 금액 식 불일치 (1원 이상)',
       'sales', s.sale_id::text,
       COALESCE(s.erp_sales_no, 'sale ' || left(s.sale_id::text, 8)),
       jsonb_build_object(
         'supply_amount',  s.supply_amount,
         'vat_amount',     s.vat_amount,
         'total_amount',   s.total_amount,
         'diff',           s.total_amount - COALESCE(s.supply_amount, 0) - COALESCE(s.vat_amount, 0)
       )
FROM sales s
WHERE s.status = 'active'
  AND s.total_amount IS NOT NULL
  AND s.supply_amount IS NOT NULL
  AND ABS(s.total_amount - COALESCE(s.supply_amount, 0) - COALESCE(s.vat_amount, 0)) >= 1

UNION ALL

-- ───────────────── 출고 (outbounds) ─────────────────
SELECT 'outbounds.zero_quantity', 'medium', '출고',
       '수량 0 또는 NULL — 등록 오류 의심 (active 출고만)',
       'outbounds', o.outbound_id::text,
       COALESCE(o.erp_outbound_no, 'ob ' || left(o.outbound_id::text, 8)),
       jsonb_build_object(
         'quantity',       o.quantity,
         'erp_outbound_no', o.erp_outbound_no,
         'outbound_date',  o.outbound_date,
         'status',         o.status
       )
FROM outbounds o
WHERE o.status = 'active'
  AND COALESCE(o.quantity, 0) <= 0

UNION ALL

-- ───────────────── FIFO 정합 (신규) ─────────────────
SELECT 'fifo.over_allocation', 'high', 'FIFO',
       'FIFO 매칭 합계가 출고 수량을 초과 — ERP 출고번호 재사용으로 인한 잘못된 매칭 의심',
       'outbounds', v.outbound_id::text,
       COALESCE(v.erp_outbound_no, 'ob ' || left(v.outbound_id::text, 8)),
       jsonb_build_object(
         'ob_qty',         v.ob_qty,
         'fifo_qty',       v.fifo_qty,
         'excess_qty',     v.excess_qty,
         'match_count',    v.match_count,
         'erp_outbound_no', v.erp_outbound_no,
         'outbound_date',  v.outbound_date,
         'company_name',   v.company_name,
         'product_code',   v.product_code
       )
FROM v_fifo_overallocation v;

COMMENT ON TABLE _fifo_realign_audit_20260512 IS
  '097_fifo_realign_overalloc 마이그레이션이 재할당한 fifo_matches 의 (old, new) outbound_id 스냅샷. 잔존 over-allocation 정리 후 DROP.';
COMMENT ON VIEW v_fifo_overallocation IS
  'FIFO 매칭이 출고 수량을 초과한 outbound 목록. /admin/db-integrity 에서 조회.';

COMMIT;
