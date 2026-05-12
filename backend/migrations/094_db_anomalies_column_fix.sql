-- @auto-apply: yes
-- 094_db_anomalies_column_fix.sql
-- PR 091 의 v_db_anomalies VIEW + list_db_anomalies() RPC 가 운영 DB 의 실제 컬럼명과 어긋남:
--   - sales.sales_date → 존재하지 않음. 실제는 tax_invoice_date (계산서 발행일).
--   - fifo_matches.fifo_match_id → 존재하지 않음. 실제는 match_id.
--
-- PR 091 적용 시 sales 룰의 첫 블록에서 fail → v_db_anomalies 생성 실패 →
-- list_db_anomalies() RPC 도 생성 실패 → /api/v1/admin/db-anomalies 가 "응답 처리 실패".
--
-- 이 마이그레이션은 view + function 을 정확한 컬럼명으로 재정의한다.
-- anomaly_ignores 테이블은 영향 없음 (이미 정상 생성됨).

DROP VIEW IF EXISTS v_db_anomalies;

CREATE VIEW v_db_anomalies AS

-- ───────────────── 매출 (sales) ─────────────────
SELECT 'sales.zero_supply'::text  AS rule_name,
       'high'::text                AS severity,
       '매출'::text                AS category,
       '공급가가 0 또는 NULL — 판매가 누락 의심'::text AS description,
       'sales'::text              AS table_name,
       s.sale_id::text            AS row_pk,
       COALESCE(s.erp_sales_no, 'sale ' || left(s.sale_id::text, 8)) AS row_label,
       jsonb_build_object(
         'supply_amount',     s.supply_amount,
         'total_amount',      s.total_amount,
         'erp_sales_no',      s.erp_sales_no,
         'tax_invoice_date',  s.tax_invoice_date
       ) AS detail
FROM sales s
WHERE s.supply_amount IS NULL OR s.supply_amount = 0

UNION ALL
SELECT 'sales.zero_unit_price', 'med', '매출',
       '공급가는 있는데 단가가 0 — ERP backfill 시 단가 결손 의심',
       'sales', s.sale_id::text,
       COALESCE(s.erp_sales_no, 'sale ' || left(s.sale_id::text, 8)),
       jsonb_build_object(
         'unit_price_wp', s.unit_price_wp,
         'supply_amount', s.supply_amount,
         'quantity',      s.quantity
       )
FROM sales s
WHERE (s.unit_price_wp IS NULL OR s.unit_price_wp = 0) AND s.supply_amount > 0

UNION ALL
SELECT 'sales.supply_vat_total_mismatch', 'med', '매출',
       '공급가 + 부가세 ≠ 합계 (5원 초과 차이)',
       'sales', s.sale_id::text,
       COALESCE(s.erp_sales_no, 'sale ' || left(s.sale_id::text, 8)),
       jsonb_build_object(
         'supply_amount', s.supply_amount,
         'vat_amount',    s.vat_amount,
         'total_amount',  s.total_amount,
         'diff',          s.supply_amount + s.vat_amount - s.total_amount
       )
FROM sales s
WHERE s.supply_amount IS NOT NULL AND s.vat_amount IS NOT NULL AND s.total_amount IS NOT NULL
  AND abs(s.supply_amount + s.vat_amount - s.total_amount) > 5

UNION ALL
SELECT 'sales.created_after_updated', 'low', '시점',
       '생성 시각 > 갱신 시각 — timestamp 처리 버그',
       'sales', s.sale_id::text,
       COALESCE(s.erp_sales_no, 'sale ' || left(s.sale_id::text, 8)),
       jsonb_build_object('created_at', s.created_at, 'updated_at', s.updated_at)
FROM sales s
WHERE s.created_at > s.updated_at

-- ───────────────── 출고 (outbounds) ─────────────────
UNION ALL
SELECT 'outbounds.null_usage_category', 'high', '출고',
       '관리구분(usage_category) 누락 — ERP 매핑 결손',
       'outbounds', o.outbound_id::text,
       'outbound ' || left(o.outbound_id::text, 8),
       jsonb_build_object('quantity', o.quantity, 'status', o.status, 'created_at', o.created_at)
FROM outbounds o
WHERE o.usage_category IS NULL AND o.status = 'active'

UNION ALL
SELECT 'outbounds.zero_quantity', 'med', '출고',
       '활성 출고 수량이 0 이하',
       'outbounds', o.outbound_id::text,
       'outbound ' || left(o.outbound_id::text, 8),
       jsonb_build_object('quantity', o.quantity, 'usage_category', o.usage_category, 'status', o.status)
FROM outbounds o
WHERE o.status = 'active' AND (o.quantity IS NULL OR o.quantity <= 0)

UNION ALL
SELECT 'outbounds.negative_spare_qty', 'med', '출고',
       '무상 수량(spare_qty) 음수 — backfill 산식 오류',
       'outbounds', o.outbound_id::text,
       'outbound ' || left(o.outbound_id::text, 8),
       jsonb_build_object('spare_qty', o.spare_qty, 'quantity', o.quantity)
FROM outbounds o
WHERE o.spare_qty < 0

-- ───────────────── 입고 (inbounds) ─────────────────
UNION ALL
SELECT 'inbounds.zero_supply', 'high', '입고',
       '입고 공급가가 0 또는 NULL',
       'inbounds', i.inbound_id::text,
       COALESCE(i.erp_inbound_no, 'inbound ' || left(i.inbound_id::text, 8)),
       jsonb_build_object(
         'supply_amount', i.supply_amount,
         'total_amount',  i.total_amount,
         'erp_inbound_no', i.erp_inbound_no
       )
FROM inbounds i
WHERE i.supply_amount IS NULL OR i.supply_amount = 0

UNION ALL
SELECT 'inbounds.supply_vat_total_mismatch', 'med', '입고',
       '입고 공급가 + 부가세 ≠ 합계 (5원 초과)',
       'inbounds', i.inbound_id::text,
       COALESCE(i.erp_inbound_no, 'inbound ' || left(i.inbound_id::text, 8)),
       jsonb_build_object(
         'supply_amount', i.supply_amount,
         'vat_amount',    i.vat_amount,
         'total_amount',  i.total_amount,
         'diff',          i.supply_amount + i.vat_amount - i.total_amount
       )
FROM inbounds i
WHERE i.supply_amount IS NOT NULL AND i.vat_amount IS NOT NULL AND i.total_amount IS NOT NULL
  AND abs(i.supply_amount + i.vat_amount - i.total_amount) > 5

UNION ALL
SELECT 'inbounds.usd_unit_price_too_large', 'med', '입고',
       'USD 표기인데 단가가 1000 초과 — KRW 단가가 USD 컬럼에 들어간 듯',
       'inbounds', i.inbound_id::text,
       COALESCE(i.erp_inbound_no, 'inbound ' || left(i.inbound_id::text, 8)),
       jsonb_build_object('currency', i.currency, 'unit_price', i.unit_price)
FROM inbounds i
WHERE i.currency = 'USD' AND i.unit_price > 1000

-- ───────────────── 마스터 (products) ─────────────────
UNION ALL
SELECT 'products.zero_spec_wp_active', 'med', '마스터',
       '활성 product 스펙(spec_wp) 이 0 이하 — 모듈 W 누락',
       'products', p.product_id::text,
       COALESCE(p.product_code, 'product ' || left(p.product_id::text, 8)),
       jsonb_build_object('spec_wp', p.spec_wp, 'product_code', p.product_code, 'is_active', p.is_active)
FROM products p
WHERE p.is_active AND (p.spec_wp IS NULL OR p.spec_wp <= 0)

-- ───────────────── FIFO (match_id, not fifo_match_id) ─────────────────
UNION ALL
SELECT 'fifo_matches.cost_profit_sales_mismatch', 'med', 'FIFO',
       '원가 + 이익 ≠ 매출 (1% 초과)',
       'fifo_matches', fm.match_id::text,
       'fifo ' || left(fm.match_id::text, 8),
       jsonb_build_object(
         'cost_amount',   fm.cost_amount,
         'profit_amount', fm.profit_amount,
         'sales_amount',  fm.sales_amount
       )
FROM fifo_matches fm
WHERE fm.cost_amount IS NOT NULL AND fm.profit_amount IS NOT NULL AND fm.sales_amount IS NOT NULL
  AND fm.sales_amount > 0
  AND abs(fm.cost_amount + fm.profit_amount - fm.sales_amount) / GREATEST(fm.sales_amount, 1) > 0.01

-- ───────────────── 면장 (import_declarations) ─────────────────
UNION ALL
SELECT 'declarations.cif_split_mismatch', 'med', '면장',
       'CIF 합계 ≠ 유상 CIF + 무상 CIF (5% 초과)',
       'import_declarations', d.declaration_id::text,
       COALESCE(d.declaration_number, 'decl ' || left(d.declaration_id::text, 8)),
       jsonb_build_object(
         'cif_krw',      d.cif_krw,
         'paid_cif_krw', d.paid_cif_krw,
         'free_cif_krw', d.free_cif_krw
       )
FROM import_declarations d
WHERE d.cif_krw > 0 AND d.paid_cif_krw IS NOT NULL AND d.free_cif_krw IS NOT NULL
  AND abs(d.cif_krw - (d.paid_cif_krw + d.free_cif_krw)) / GREATEST(d.cif_krw, 1) > 0.05

UNION ALL
SELECT 'declarations.duplicate_number', 'med', '면장',
       '면장번호 중복 — UNIQUE 위반',
       'import_declarations', d.declaration_id::text,
       d.declaration_number,
       jsonb_build_object('declaration_number', d.declaration_number)
FROM import_declarations d
WHERE d.declaration_number IN (
  SELECT declaration_number
  FROM import_declarations
  WHERE declaration_number IS NOT NULL
  GROUP BY declaration_number
  HAVING count(*) > 1
);

COMMENT ON VIEW v_db_anomalies IS
  'PR 091 / PR 094 fix: row 단위 이상치. sales_date→tax_invoice_date, fifo_match_id→match_id 정정.';

-- RPC 재정의 (시그니처 동일)
CREATE OR REPLACE FUNCTION list_db_anomalies()
RETURNS TABLE (
  rule_name   text,
  severity    text,
  category    text,
  table_name  text,
  row_pk      text,
  row_label   text,
  description text,
  detail      jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.rule_name, a.severity, a.category, a.table_name, a.row_pk,
         a.row_label, a.description, a.detail
  FROM v_db_anomalies a
  WHERE NOT EXISTS (
    SELECT 1 FROM anomaly_ignores i
    WHERE i.table_name = a.table_name
      AND i.row_pk     = a.row_pk
      AND i.rule_name  = a.rule_name
  )
  ORDER BY CASE a.severity WHEN 'high' THEN 1 WHEN 'med' THEN 2 ELSE 3 END,
           a.category, a.rule_name;
$$;

-- 권한 (PR 091 에서 누락 가능성 대비 재부여)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON v_db_anomalies TO authenticated;
    GRANT EXECUTE ON FUNCTION list_db_anomalies() TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON v_db_anomalies TO service_role;
    GRANT EXECUTE ON FUNCTION list_db_anomalies() TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
