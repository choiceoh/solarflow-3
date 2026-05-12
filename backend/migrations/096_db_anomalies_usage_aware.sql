-- @auto-apply: yes
-- 096_db_anomalies_usage_aware.sql
-- PR 091/094 의 sales.zero_supply 룰이 1,000 건을 모두 'high' 로 잡았으나
-- 실제로는 998 건이 의도된 0원 (sale_spare 무상 스페어, construction/maintenance/disposal 등
-- 매출 아닌 자체 사용·비용 분류) 이고 진성 누락은 2 건 뿐이었다.
-- false positive 998 건 때문에 운영자가 진짜 누락을 찾기 어려운 상태.
--
-- 이 마이그레이션은 sales 룰을 outbounds.usage_category 와 join 해서
-- '매출 거래 (sale)' 만 검사 대상으로 좁힌다.
--   - sales.zero_supply: usage_category = 'sale' 인데 supply=0 인 경우만
--   - sales.zero_unit_price: usage_category = 'sale' 인데 단가=0 (스페어/공사용은 단가 없는 게 정상)
--   - sales.supply_vat_total_mismatch: 모든 카테고리 (수식 정합성은 카테고리 무관)
--
-- 또한 outbounds.zero_quantity 도 cancelled 출고는 제외하도록 보강.

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
  AND o.usage_category = 'sale'   -- 진성 매출만. sale_spare/construction 등은 0원이 정상이라 제외.
  AND (s.supply_amount IS NULL OR s.supply_amount = 0)

UNION ALL
SELECT 'sales.zero_unit_price', 'med', '매출',
       '공급가는 있는데 단가가 0 — ERP backfill 시 단가 결손 의심',
       'sales', s.sale_id::text,
       COALESCE(s.erp_sales_no, 'sale ' || left(s.sale_id::text, 8)),
       jsonb_build_object(
         'unit_price_wp', s.unit_price_wp,
         'supply_amount', s.supply_amount,
         'quantity',      s.quantity,
         'usage_category', o.usage_category
       )
FROM sales s
JOIN outbounds o ON s.outbound_id = o.outbound_id
WHERE s.status = 'active'
  AND o.usage_category IN ('sale', 'sale_spare')   -- 매출 관련만. 공사사용/유지관리는 단가 0 정상.
  AND (s.unit_price_wp IS NULL OR s.unit_price_wp = 0)
  AND s.supply_amount > 0

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

-- ───────────────── FIFO ─────────────────
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

-- ───────────────── 면장 ─────────────────
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
  'PR 094 + 096: sales 룰이 outbounds.usage_category 와 join 해서 sale 카테고리만 검사. sale_spare/construction 등 의도된 0원 false positive 998건 제거.';

-- RPC 시그니처 유지 (091 의 list_db_anomalies)
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
) LANGUAGE sql STABLE AS $$
  SELECT rule_name, severity, category, table_name, row_pk, row_label, description, detail
  FROM v_db_anomalies
  WHERE NOT EXISTS (
    SELECT 1 FROM anomaly_ignores ai
    WHERE ai.rule_name = v_db_anomalies.rule_name
      AND ai.row_pk = v_db_anomalies.row_pk
      AND ai.table_name = v_db_anomalies.table_name
  );
$$;
