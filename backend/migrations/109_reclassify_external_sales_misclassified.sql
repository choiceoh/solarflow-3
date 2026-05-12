-- @auto-apply: yes
-- 109_reclassify_external_sales_misclassified.sql
--
-- ERP "관리구분" 입력 오류로 외부 매출이 'construction' / 'maintenance' 카테고리로
-- 출고된 5건을 'sale' 로 정정. 13.88억원 매출이 매출분석에서 누락되던 문제 해소.
--
-- 식별 시그니처 (자동 검출 가능): usage_category NOT IN ('sale','sale_spare')
--   AND s.supply_amount > 0 AND s.erp_sales_no IS NOT NULL
--   AND partners.partner_type = 'customer' (외부 고객)
-- → 2026-05-12 시점 정확히 5건. 영향:
--   - construction 4건 합계 13.88억 (JKM635N 3건 + SPM450 1건)
--   - maintenance 1건 18만 (CS3U-365MS, 단발성)
--
-- 임포터(`scripts/backfill_erp_outbound.py`) 는 ERP "관리구분" 컬럼을 그대로
-- 매핑하므로 잘못은 ERP 입력 측. 임포터를 고치지 않고 데이터만 정정 + 동일
-- 패턴 회귀 감지용 anomaly 룰 추가.
--
-- 안전:
-- - 5개 outbound_id 를 명시 — WHERE 절이 idempotent (재실행해도 이미 'sale'
--   인 행은 ROW_COUNT=0)
-- - 원본 카테고리는 _outbound_category_fix_audit_20260512 에 보존
--   (ON CONFLICT DO NOTHING 으로 재실행 안전)

BEGIN;

-- 1) 감사 테이블
CREATE TABLE IF NOT EXISTS _outbound_category_fix_audit_20260512 (
  outbound_id       uuid        PRIMARY KEY,
  prev_category     varchar(20) NOT NULL,
  new_category      varchar(20) NOT NULL,
  outbound_date     date,
  erp_outbound_no   varchar(20),
  customer_name     text,
  supply_amount     numeric,
  reason            text,
  applied_at        timestamptz NOT NULL DEFAULT now()
);

-- 2) 원본 카테고리 기록 (5건 — 이미 기록된 행은 skip)
INSERT INTO _outbound_category_fix_audit_20260512
  (outbound_id, prev_category, new_category, outbound_date, erp_outbound_no,
   customer_name, supply_amount, reason)
SELECT o.outbound_id, o.usage_category, 'sale', o.outbound_date,
       o.erp_outbound_no, ptr.partner_name, s.supply_amount,
       '외부 고객 (' || COALESCE(ptr.partner_type,'?') || ') + supply>0 + erp_sales_no — ERP 관리구분 입력 오류'
FROM outbounds o
JOIN sales s ON s.outbound_id = o.outbound_id
LEFT JOIN partners ptr ON s.customer_id = ptr.partner_id
WHERE o.outbound_id IN (
  'c6a21382-311e-4fd2-a835-bdef2c9893e8',  -- 2025-05-24 엠그린에너지 4.54억
  'c526e53e-fc94-4d70-a758-d634375a9523',  -- 2025-06-14 엠그린솔라  4.39억
  'e10858be-33ab-4237-b3d9-beb6472f926c',  -- 2025-06-14 엠그린솔라  190만 (SC2506000514 동일 sale 추가라인)
  '0260eec2-6dc2-4a4d-a855-00e28613c360',  -- 2025-09-19 빛고을운정  4.94억
  '5ae0a84b-148d-4964-aabd-d3c7a813d6b7'   -- 2025-11-24 별량그린     18만 (maintenance → sale)
)
ON CONFLICT (outbound_id) DO NOTHING;

-- 3) 카테고리 정정 (idempotent — 이미 'sale' 인 행은 영향 없음)
UPDATE outbounds
SET usage_category = 'sale',
    updated_at = now()
WHERE outbound_id IN (
  'c6a21382-311e-4fd2-a835-bdef2c9893e8',
  'c526e53e-fc94-4d70-a758-d634375a9523',
  'e10858be-33ab-4237-b3d9-beb6472f926c',
  '0260eec2-6dc2-4a4d-a855-00e28613c360',
  '5ae0a84b-148d-4964-aabd-d3c7a813d6b7'
)
AND usage_category IN ('construction','construction_damage','maintenance','disposal','other');

DO $$
DECLARE
  v_fixed int;
BEGIN
  SELECT COUNT(*) INTO v_fixed FROM _outbound_category_fix_audit_20260512;
  RAISE NOTICE '[109] 5건 카테고리 정정 (audit 보존: %건)', v_fixed;
END $$;

-- 4) anomaly 룰 추가 — 같은 패턴 재발 자동 감지
-- v_db_anomalies 는 single SELECT + UNION ALL 체인이라 새 룰 1개 끼우려고
-- 전체 재정의가 필요. 마이그 096 의 정의를 그대로 복사 + 새 UNION ALL 절 추가.

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
  AND o.usage_category IN ('sale', 'sale_spare')
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

-- ───────────────── 신규: 외부 매출 카테고리 오분류 ─────────────────
UNION ALL
SELECT 'outbounds.external_sale_misclassified', 'high', '출고',
       '외부 고객 + 매출 + ERP sale_no 가 있는데 카테고리가 sale 아님 — ERP 관리구분 입력 오류 의심 (mig 109)',
       'outbounds', o.outbound_id::text,
       COALESCE(o.erp_outbound_no, 'outbound ' || left(o.outbound_id::text, 8)),
       jsonb_build_object(
         'usage_category', o.usage_category,
         'supply_amount',  s.supply_amount,
         'customer_name',  ptr.partner_name,
         'erp_sales_no',   s.erp_sales_no,
         'outbound_date',  o.outbound_date
       )
FROM outbounds o
JOIN sales s ON s.outbound_id = o.outbound_id
LEFT JOIN partners ptr ON s.customer_id = ptr.partner_id
WHERE o.status = 'active'
  AND COALESCE(s.status,'active') <> 'cancelled'
  AND o.usage_category NOT IN ('sale','sale_spare')
  AND s.supply_amount > 0
  AND s.erp_sales_no IS NOT NULL
  AND COALESCE(ptr.partner_type,'customer') = 'customer'

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
  'PR 094 + 096 + 109: sales 룰은 sale 카테고리만 검사 (false positive 제거). 109 신규 outbounds.external_sale_misclassified — 외부 매출이 sale 외 카테고리에 잘못 분류된 케이스 감지 (ERP 관리구분 입력 오류 회귀 방지).';

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

COMMIT;
