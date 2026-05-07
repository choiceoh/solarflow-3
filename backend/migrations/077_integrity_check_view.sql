-- @auto-apply: yes
-- 076_integrity_check_view.sql
-- DB 정합성 검증 단일 통합 view (D-064 PR 38).
--
-- PR 37 의 backend 핸들러가 PostgREST count 만 사용해 산식/누계/orphan 검증을 못 했음.
-- 이 view 는 모든 검증 (count/null/산식/orphan/누계/외화/시점/UNIQUE/ERP 본질) 을
-- UNION ALL 로 통합해 한 번의 SELECT 으로 50+ 항목을 가져온다.
--
-- 컬럼:
--   name, category, severity, description, hint,
--   baseline (numeric), actual (numeric), tolerance (numeric),
--   status ('pass' | 'fail')
--
-- 사용:
--   SELECT * FROM v_integrity_check ORDER BY severity, category, name;
--
-- view 갱신 시 새 검증을 UNION ALL 추가 — 다른 코드 변경 0.

DROP VIEW IF EXISTS v_integrity_check CASCADE;

CREATE VIEW v_integrity_check AS

-- ============================================================
-- A. 데이터 손실 (HIGH) — count baseline ±5~10%
-- ============================================================
SELECT 'sales 행수'::text AS name, '데이터 손실'::text AS category, 'high'::text AS severity,
  '매출 행수가 baseline 대비 ±5% 이내인가'::text AS description,
  '갑작스런 감소 = 데이터 손실. 최근 cleanup/migration 확인.'::text AS hint,
  1976::numeric AS baseline, count(*)::numeric AS actual, 0.05::numeric AS tolerance,
  CASE WHEN abs(count(*) - 1976) / 1976.0 > 0.05 THEN 'fail' ELSE 'pass' END::text AS status
FROM sales

UNION ALL SELECT 'outbounds 행수 (active)', '데이터 손실', 'high',
  '활성 출고 행수가 baseline 대비 ±5% 이내인가',
  '감소 시 cancel 처리 누락. 증가 시 ERP backfill 중복.',
  2229, count(*), 0.05,
  CASE WHEN abs(count(*) - 2229) / 2229.0 > 0.05 THEN 'fail' ELSE 'pass' END
FROM outbounds WHERE status = 'active'

UNION ALL SELECT 'inbounds 행수', '데이터 손실', 'high',
  '입고 행수 baseline ±5%', 'ERP 입고 시트 reimport 누락 가능.',
  117, count(*), 0.05,
  CASE WHEN abs(count(*) - 117) / 117.0 > 0.05 THEN 'fail' ELSE 'pass' END
FROM inbounds

UNION ALL SELECT 'fifo_matches 행수', '데이터 손실', 'high',
  'FIFO 매칭 baseline ±5%', 'fifo_matches FK SET NULL 영향 가능.',
  3332, count(*), 0.05,
  CASE WHEN abs(count(*) - 3332) / 3332.0 > 0.05 THEN 'fail' ELSE 'pass' END
FROM fifo_matches

UNION ALL SELECT 'products 활성 행수', '데이터 손실', 'high',
  '활성 products baseline ±10%', 'PR 33 의 38건 비활성화 의도적.',
  104, count(*), 0.10,
  CASE WHEN abs(count(*) - 104) / 104.0 > 0.10 THEN 'fail' ELSE 'pass' END
FROM products WHERE is_active

-- ============================================================
-- B. NULL 비율 (HIGH) — 0% baseline
-- ============================================================
UNION ALL SELECT 'sales.tax_invoice_date NULL', '핵심 컬럼 NULL', 'high',
  '매출 계산서 발행일 NULL 비율 ≤ 5%',
  'NULL 증가 = ERP 매출 backfill 회귀 또는 새 매출 입력 시 발행일 누락.',
  0,
  count(*) FILTER (WHERE tax_invoice_date IS NULL),
  0.05,
  CASE WHEN count(*) FILTER (WHERE tax_invoice_date IS NULL)::numeric / GREATEST(count(*), 1) > 0.05
    THEN 'fail' ELSE 'pass' END
FROM sales

UNION ALL SELECT 'sales.outbound_id NULL', '핵심 컬럼 NULL', 'high',
  '매출이 출고와 연결됐는가 NULL ≤ 1%',
  'NULL = orphan 매출. order_id 만 있는 직접 매출은 정상.',
  0, count(*) FILTER (WHERE outbound_id IS NULL), 0.01,
  CASE WHEN count(*) FILTER (WHERE outbound_id IS NULL)::numeric / GREATEST(count(*), 1) > 0.01
    THEN 'fail' ELSE 'pass' END
FROM sales

UNION ALL SELECT 'outbounds.usage_category NULL', '핵심 컬럼 NULL', 'high',
  '출고 분류 NULL 0%', 'NULL = ERP 관리구분 매핑 누락. PR 33 후 0 유지 기대.',
  0, count(*) FILTER (WHERE usage_category IS NULL), 0,
  CASE WHEN count(*) FILTER (WHERE usage_category IS NULL) > 0 THEN 'fail' ELSE 'pass' END
FROM outbounds

-- ============================================================
-- C. 산식 정합성 (MED) — 행 단위 산식 mismatch 카운트
-- ============================================================
UNION ALL SELECT 'sales: supply+vat=total', '산식', 'med',
  '공급가 + 부가세 = 합계 (오차 5원 이내)',
  '계산서 발행 데이터 입력 오류 또는 ERP 시트 변환 오류.',
  0,
  count(*) FILTER (
    WHERE supply_amount IS NOT NULL AND vat_amount IS NOT NULL AND total_amount IS NOT NULL
      AND abs(supply_amount + vat_amount - total_amount) > 5
  ),
  0,
  CASE WHEN count(*) FILTER (
    WHERE supply_amount IS NOT NULL AND vat_amount IS NOT NULL AND total_amount IS NOT NULL
      AND abs(supply_amount + vat_amount - total_amount) > 5
  ) > 0 THEN 'fail' ELSE 'pass' END
FROM sales

UNION ALL SELECT 'sales: unit_price_wp × spec × qty ≈ supply (1%)', '산식', 'med',
  '단가/수량/금액 정합성 (1% 이내)',
  'mismatch = ERP 매출 시트 backfill 시 source_payload 결손. PR 34 의 SC2504000094 케이스.',
  0,
  (SELECT count(*) FROM sales s
   JOIN outbounds o ON s.outbound_id = o.outbound_id
   JOIN products p ON o.product_id = p.product_id
   WHERE s.unit_price_wp > 0 AND s.supply_amount > 0 AND s.quantity > 0 AND p.spec_wp > 0
     AND abs(s.unit_price_wp * p.spec_wp * s.quantity - s.supply_amount)
         / GREATEST(s.supply_amount, 1) > 0.01),
  0,
  CASE WHEN (SELECT count(*) FROM sales s
   JOIN outbounds o ON s.outbound_id = o.outbound_id
   JOIN products p ON o.product_id = p.product_id
   WHERE s.unit_price_wp > 0 AND s.supply_amount > 0 AND s.quantity > 0 AND p.spec_wp > 0
     AND abs(s.unit_price_wp * p.spec_wp * s.quantity - s.supply_amount)
         / GREATEST(s.supply_amount, 1) > 0.01) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'inbounds: supply+vat=total', '산식', 'med',
  '입고 공급가+부가세=총액',
  'ERP 입고 시트 자체 산식. mismatch = 입력 오류 가능성.',
  0,
  (SELECT count(*) FROM inbounds
   WHERE supply_amount IS NOT NULL AND vat_amount IS NOT NULL AND total_amount IS NOT NULL
     AND abs(supply_amount + vat_amount - total_amount) > 5),
  0,
  CASE WHEN (SELECT count(*) FROM inbounds
   WHERE supply_amount IS NOT NULL AND vat_amount IS NOT NULL AND total_amount IS NOT NULL
     AND abs(supply_amount + vat_amount - total_amount) > 5) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'fifo_matches: cost+profit=sales', '산식', 'med',
  'FIFO 원가+이익=매출 (1% 이내)',
  'mismatch = fifo_matches 산식 깨짐. PR 26 backfill 회귀.',
  0,
  (SELECT count(*) FROM fifo_matches
   WHERE cost_amount IS NOT NULL AND profit_amount IS NOT NULL AND sales_amount IS NOT NULL
     AND sales_amount > 0
     AND abs(cost_amount + profit_amount - sales_amount) / GREATEST(sales_amount, 1) > 0.01),
  0,
  CASE WHEN (SELECT count(*) FROM fifo_matches
   WHERE cost_amount IS NOT NULL AND profit_amount IS NOT NULL AND sales_amount IS NOT NULL
     AND sales_amount > 0
     AND abs(cost_amount + profit_amount - sales_amount) / GREATEST(sales_amount, 1) > 0.01) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'fifo_matches: ea_unit_cost × allocated ≈ cost', '산식', 'med',
  'EA 원가 × 배분수량 = 원가합계',
  'mismatch = ERP FIFO 시트 산식 깨짐.',
  0,
  (SELECT count(*) FROM fifo_matches
   WHERE ea_unit_cost > 0 AND allocated_qty > 0 AND cost_amount > 0
     AND abs(ea_unit_cost * allocated_qty - cost_amount) / GREATEST(cost_amount, 1) > 0.01),
  0,
  CASE WHEN (SELECT count(*) FROM fifo_matches
   WHERE ea_unit_cost > 0 AND allocated_qty > 0 AND cost_amount > 0
     AND abs(ea_unit_cost * allocated_qty - cost_amount) / GREATEST(cost_amount, 1) > 0.01) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'outbounds: capacity_kw = qty × spec / 1000', '산식', 'med',
  '출고 용량 산식 (0.5%)',
  'mismatch = backfill 시 capacity_kw 직접 입력 + spec 변경 가능성.',
  0,
  (SELECT count(*) FROM outbounds o JOIN products p ON o.product_id = p.product_id
   WHERE o.capacity_kw > 0 AND o.quantity > 0 AND p.spec_wp > 0
     AND abs(o.capacity_kw - o.quantity * p.spec_wp / 1000.0) / o.capacity_kw > 0.005),
  0,
  CASE WHEN (SELECT count(*) FROM outbounds o JOIN products p ON o.product_id = p.product_id
   WHERE o.capacity_kw > 0 AND o.quantity > 0 AND p.spec_wp > 0
     AND abs(o.capacity_kw - o.quantity * p.spec_wp / 1000.0) / o.capacity_kw > 0.005) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'inbounds: capacity_kw = qty × spec / 1000', '산식', 'med',
  '입고 용량 산식 (0.5%)', '동일 outbound 와 같은 산식.',
  0,
  (SELECT count(*) FROM inbounds i JOIN products p ON i.product_id = p.product_id
   WHERE i.capacity_kw > 0 AND i.quantity > 0 AND p.spec_wp > 0
     AND abs(i.capacity_kw - i.quantity * p.spec_wp / 1000.0) / i.capacity_kw > 0.005),
  0,
  CASE WHEN (SELECT count(*) FROM inbounds i JOIN products p ON i.product_id = p.product_id
   WHERE i.capacity_kw > 0 AND i.quantity > 0 AND p.spec_wp > 0
     AND abs(i.capacity_kw - i.quantity * p.spec_wp / 1000.0) / i.capacity_kw > 0.005) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

-- ============================================================
-- D. FK orphan (MED) — NOT EXISTS 검증
-- ============================================================
UNION ALL SELECT 'outbounds.product_id orphan', 'FK orphan', 'med',
  '출고가 존재하지 않는 product 참조',
  'orphan = product 삭제 후 outbound FK 미정리. 즉시 데이터 일관성 깨짐.',
  0,
  (SELECT count(*) FROM outbounds o WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id = o.product_id)),
  0,
  CASE WHEN (SELECT count(*) FROM outbounds o WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id = o.product_id)) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'sales.outbound_id orphan', 'FK orphan', 'med',
  '매출이 존재하지 않는 outbound 참조',
  'orphan = outbound 삭제 후 sales 정리 누락. PR 22 회귀 의심.',
  0,
  (SELECT count(*) FROM sales s WHERE outbound_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM outbounds o WHERE o.outbound_id = s.outbound_id)),
  0,
  CASE WHEN (SELECT count(*) FROM sales s WHERE outbound_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM outbounds o WHERE o.outbound_id = s.outbound_id)) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'sales.customer_id orphan', 'FK orphan', 'med',
  '매출이 존재하지 않는 partner 참조',
  'orphan = partner 삭제 후 sales 정리 누락.',
  0,
  (SELECT count(*) FROM sales s WHERE NOT EXISTS(SELECT 1 FROM partners p WHERE p.partner_id = s.customer_id)),
  0,
  CASE WHEN (SELECT count(*) FROM sales s WHERE NOT EXISTS(SELECT 1 FROM partners p WHERE p.partner_id = s.customer_id)) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'inbounds.product_id orphan', 'FK orphan', 'med',
  '입고가 존재하지 않는 product 참조', '동일 outbound 패턴.',
  0,
  (SELECT count(*) FROM inbounds i WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id = i.product_id)),
  0,
  CASE WHEN (SELECT count(*) FROM inbounds i WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id = i.product_id)) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'inbounds.supplier_partner_id orphan', 'FK orphan', 'med',
  '입고 공급사가 존재하지 않는 partner', 'partner 삭제 + 입고 정리 누락.',
  0,
  (SELECT count(*) FROM inbounds i WHERE supplier_partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM partners p WHERE p.partner_id = i.supplier_partner_id)),
  0,
  CASE WHEN (SELECT count(*) FROM inbounds i WHERE supplier_partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM partners p WHERE p.partner_id = i.supplier_partner_id)) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'fifo_matches.outbound_id orphan', 'FK orphan', 'med',
  'FIFO 매칭이 존재하지 않는 outbound 참조',
  'PR 26 fifo FK SET NULL 정책. orphan 발견 시 cleanup 작업 필요.',
  0,
  (SELECT count(*) FROM fifo_matches fm WHERE outbound_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM outbounds o WHERE o.outbound_id = fm.outbound_id)),
  0,
  CASE WHEN (SELECT count(*) FROM fifo_matches fm WHERE outbound_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM outbounds o WHERE o.outbound_id = fm.outbound_id)) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'fifo_matches.inbound_id orphan', 'FK orphan', 'med',
  'FIFO 매칭이 존재하지 않는 inbound 참조',
  '동일 outbound orphan 패턴.',
  0,
  (SELECT count(*) FROM fifo_matches fm WHERE inbound_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inbounds i WHERE i.inbound_id = fm.inbound_id)),
  0,
  CASE WHEN (SELECT count(*) FROM fifo_matches fm WHERE inbound_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inbounds i WHERE i.inbound_id = fm.inbound_id)) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'fifo_matches.product_id orphan', 'FK orphan', 'med',
  'FIFO 매칭이 존재하지 않는 product 참조 (NOT NULL FK)',
  'product 삭제 시 fifo cascade 가능성. PR 33 비활성화는 영향 없음 (delete 아님).',
  0,
  (SELECT count(*) FROM fifo_matches fm WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id = fm.product_id)),
  0,
  CASE WHEN (SELECT count(*) FROM fifo_matches fm WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id = fm.product_id)) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'orders.customer_id orphan', 'FK orphan', 'med',
  '수주가 존재하지 않는 partner 참조', 'NOT NULL FK — orphan 발생 시 즉시 위반.',
  0,
  (SELECT count(*) FROM orders o WHERE NOT EXISTS(SELECT 1 FROM partners p WHERE p.partner_id = o.customer_id)),
  0,
  CASE WHEN (SELECT count(*) FROM orders o WHERE NOT EXISTS(SELECT 1 FROM partners p WHERE p.partner_id = o.customer_id)) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'inventory_movements.product_id orphan', 'FK orphan', 'med',
  'movements 가 존재하지 않는 product 참조',
  '시계열 LEDGER 의 cascade 영향.',
  0,
  (SELECT count(*) FROM inventory_movements m WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id = m.product_id)),
  0,
  CASE WHEN (SELECT count(*) FROM inventory_movements m WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id = m.product_id)) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'import_declarations.bl_id orphan', 'FK orphan', 'med',
  '면장이 존재하지 않는 BL 참조 (NOT NULL FK)',
  'BL 삭제 시 면장 cascade 영향. PR 24 신규 6 BL 영향 가능.',
  0,
  (SELECT count(*) FROM import_declarations d WHERE NOT EXISTS(SELECT 1 FROM bl_shipments b WHERE b.bl_id = d.bl_id)),
  0,
  CASE WHEN (SELECT count(*) FROM import_declarations d WHERE NOT EXISTS(SELECT 1 FROM bl_shipments b WHERE b.bl_id = d.bl_id)) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

-- ============================================================
-- E. 누계 정합성 (MED) — v_product_qty_balance 활용
-- ============================================================
UNION ALL SELECT 'v_product_qty_balance: 출고>입고+초기 1.05', '누계', 'med',
  '출고가 입고+초기재고 ×1.05 초과한 product 수',
  '출고 > 누적 입고 = 데이터 무결성 위협. 입고 시트 누락 또는 출고 중복.',
  0,
  (SELECT count(*) FROM v_product_qty_balance WHERE outbound_qty > (initial_qty + inbound_qty) * 1.05),
  0,
  CASE WHEN (SELECT count(*) FROM v_product_qty_balance WHERE outbound_qty > (initial_qty + inbound_qty) * 1.05) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'v_product_qty_balance: balance < 0', '누계', 'med',
  '잔량 음수인 product 수',
  '음수 = 입고/초기 자료 누락. PR 33 의 v_product_qty_balance 적용 후 0 유지 기대.',
  0,
  (SELECT count(*) FROM v_product_qty_balance WHERE balance_qty < 0),
  0,
  CASE WHEN (SELECT count(*) FROM v_product_qty_balance WHERE balance_qty < 0) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'fifo allocated 합 ≠ outbound qty + spare', '누계', 'med',
  'FIFO 배분수량 합이 출고 수량 + 무상 합과 일치',
  'PR 33 의 spare_qty 백필 후 0 유지. 회귀 시 FIFO 산식 손상.',
  0,
  (WITH t AS (
    SELECT o.outbound_id, o.quantity, COALESCE(o.spare_qty, 0) AS sp,
      (SELECT sum(allocated_qty) FROM fifo_matches WHERE outbound_id = o.outbound_id) AS fm_sum
    FROM outbounds o
    WHERE o.usage_category IN ('sale', 'sale_spare') AND o.status = 'active'
  ) SELECT count(*) FROM t WHERE fm_sum IS NOT NULL AND fm_sum != quantity + sp),
  0,
  CASE WHEN (WITH t AS (
    SELECT o.outbound_id, o.quantity, COALESCE(o.spare_qty, 0) AS sp,
      (SELECT sum(allocated_qty) FROM fifo_matches WHERE outbound_id = o.outbound_id) AS fm_sum
    FROM outbounds o
    WHERE o.usage_category IN ('sale', 'sale_spare') AND o.status = 'active'
  ) SELECT count(*) FROM t WHERE fm_sum IS NOT NULL AND fm_sum != quantity + sp) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

-- ============================================================
-- F. 외화 정합성 (MED)
-- ============================================================
UNION ALL SELECT 'sales 외화: KRW 100%', '외화', 'med',
  '국내 매출은 100% KRW. USD/CNY 등 외화는 별도 처리.',
  '외화 매출 발견 시 ERP currency 라벨링 또는 분류 확인.',
  0,
  count(*) FILTER (WHERE currency IS DISTINCT FROM 'KRW'),
  0,
  CASE WHEN count(*) FILTER (WHERE currency IS DISTINCT FROM 'KRW') > 0 THEN 'fail' ELSE 'pass' END
FROM sales

UNION ALL SELECT 'inbounds USD 단가 단위 일관', '외화', 'med',
  'USD inbound 단가가 USD 단위 (10원/Wp 미만)',
  'PR 34 fix 회귀: USD 표기인데 KRW 단가 다시 들어왔을 가능성.',
  0,
  count(*) FILTER (WHERE currency = 'USD' AND unit_price > 1000),
  0,
  CASE WHEN count(*) FILTER (WHERE currency = 'USD' AND unit_price > 1000) > 0 THEN 'fail' ELSE 'pass' END
FROM inbounds

-- ============================================================
-- G. 시점 일관성 (MED)
-- ============================================================
UNION ALL SELECT 'sales: created_at > updated_at', '시점', 'med',
  '생성 시각 > 갱신 시각 (불가능한 시점)',
  '데이터 입력 오류 또는 timestamp 처리 버그.',
  0, count(*) FILTER (WHERE created_at > updated_at), 0,
  CASE WHEN count(*) FILTER (WHERE created_at > updated_at) > 0 THEN 'fail' ELSE 'pass' END
FROM sales

UNION ALL SELECT 'outbounds: created_at > updated_at', '시점', 'med',
  '생성 > 갱신', '동일 sales 패턴.',
  0, count(*) FILTER (WHERE created_at > updated_at), 0,
  CASE WHEN count(*) FILTER (WHERE created_at > updated_at) > 0 THEN 'fail' ELSE 'pass' END
FROM outbounds

UNION ALL SELECT 'inbounds: created_at > updated_at', '시점', 'med',
  '생성 > 갱신', '동일 sales 패턴.',
  0, count(*) FILTER (WHERE created_at > updated_at), 0,
  CASE WHEN count(*) FILTER (WHERE created_at > updated_at) > 0 THEN 'fail' ELSE 'pass' END
FROM inbounds

-- ============================================================
-- H. UNIQUE 가정 (MED) — ERP 식별 키 중복
-- ============================================================
UNION ALL SELECT 'sales (erp_sales_no, erp_line_no) 중복', 'UNIQUE', 'med',
  'ERP 매출 마감번호 + 순번 UNIQUE',
  'PR 22 partial UNIQUE 인덱스 위반 시 검출.',
  0,
  (SELECT count(*) FROM (
    SELECT erp_sales_no, erp_line_no FROM sales
    WHERE erp_sales_no IS NOT NULL
    GROUP BY 1, 2 HAVING count(*) > 1
  ) t),
  0,
  CASE WHEN (SELECT count(*) FROM (
    SELECT erp_sales_no, erp_line_no FROM sales
    WHERE erp_sales_no IS NOT NULL
    GROUP BY 1, 2 HAVING count(*) > 1
  ) t) > 0 THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'inbounds (erp_inbound_no, erp_line_no) 중복', 'UNIQUE', 'med',
  'ERP 입고번호 + 순번 UNIQUE', '동일 sales 패턴.',
  0,
  (SELECT count(*) FROM (
    SELECT erp_inbound_no, erp_line_no FROM inbounds
    WHERE erp_inbound_no IS NOT NULL
    GROUP BY 1, 2 HAVING count(*) > 1
  ) t),
  0,
  CASE WHEN (SELECT count(*) FROM (
    SELECT erp_inbound_no, erp_line_no FROM inbounds
    WHERE erp_inbound_no IS NOT NULL
    GROUP BY 1, 2 HAVING count(*) > 1
  ) t) > 0 THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'declarations.declaration_number 중복', 'UNIQUE', 'med',
  '면장번호 UNIQUE',
  'PR 24 마이그레이션 067 의 UNIQUE 인덱스 위반 시 검출.',
  0,
  (SELECT count(*) FROM (
    SELECT declaration_number FROM import_declarations
    GROUP BY 1 HAVING count(*) > 1
  ) t),
  0,
  CASE WHEN (SELECT count(*) FROM (
    SELECT declaration_number FROM import_declarations
    GROUP BY 1 HAVING count(*) > 1
  ) t) > 0 THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'products.product_code 중복 (활성)', 'UNIQUE', 'med',
  '활성 product 코드 UNIQUE',
  '중복 = 마스터 등록 오류. PR 33 비활성화로 줄어든 상태.',
  0,
  (SELECT count(*) FROM (
    SELECT product_code FROM products
    WHERE is_active GROUP BY 1 HAVING count(*) > 1
  ) t),
  0,
  CASE WHEN (SELECT count(*) FROM (
    SELECT product_code FROM products
    WHERE is_active GROUP BY 1 HAVING count(*) > 1
  ) t) > 0 THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

-- ============================================================
-- I. 관련 컬럼 정합성 (MED)
-- ============================================================
UNION ALL SELECT 'sales: erp_closed=true 인데 erp_closed_date NULL', '관련 컬럼', 'med',
  'ERP 마감된 매출은 마감일자도 있어야',
  'mismatch = ERP backfill 시 erp_closed_date 채움 누락.',
  0,
  (SELECT count(*) FROM sales WHERE erp_closed = true AND erp_closed_date IS NULL),
  0,
  CASE WHEN (SELECT count(*) FROM sales WHERE erp_closed = true AND erp_closed_date IS NULL) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'outbounds.spare_qty 음수', '관련 컬럼', 'med',
  '무상 수량은 0 이상',
  'PR 33 의 spare_qty 백필 산식 (fm_sum - quantity) 음수 케이스 감지.',
  0,
  (SELECT count(*) FROM outbounds WHERE spare_qty < 0),
  0,
  CASE WHEN (SELECT count(*) FROM outbounds WHERE spare_qty < 0) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

UNION ALL SELECT 'declarations: cif_krw = paid_cif + free_cif', '관련 컬럼', 'med',
  'CIF 합계 = 유상 CIF + 무상 CIF (5%)',
  'mismatch = ERP 면장 시트의 CIF 분리 입력 오류.',
  0,
  (SELECT count(*) FROM import_declarations
   WHERE cif_krw > 0 AND paid_cif_krw IS NOT NULL AND free_cif_krw IS NOT NULL
     AND abs(cif_krw - (paid_cif_krw + free_cif_krw)) / GREATEST(cif_krw, 1) > 0.05),
  0,
  CASE WHEN (SELECT count(*) FROM import_declarations
   WHERE cif_krw > 0 AND paid_cif_krw IS NOT NULL AND free_cif_krw IS NOT NULL
     AND abs(cif_krw - (paid_cif_krw + free_cif_krw)) / GREATEST(cif_krw, 1) > 0.05) > 0
    THEN 'fail' ELSE 'pass' END
FROM (SELECT 1) AS dummy

-- ============================================================
-- J. ERP 본질 추세 (LOW)
-- ============================================================
UNION ALL SELECT '면장 사후신고 (declaration > arrival)', 'ERP 본질 (참고)', 'low',
  '관세법 입항 전 5일 신고 — 정상 패턴',
  '수치 변화 시 ERP 면장 입력 패턴 변화. 운영자 확인.',
  43,
  count(*) FILTER (WHERE declaration_date > arrival_date),
  0.20,
  CASE WHEN abs(count(*) FILTER (WHERE declaration_date > arrival_date) - 43) / 43.0 > 0.20
    THEN 'fail' ELSE 'pass' END
FROM import_declarations

UNION ALL SELECT '면장 입항 > 반출 (ERP 동시 처리)', 'ERP 본질 (참고)', 'low',
  '반출이 입항보다 빠른 케이스 — ERP 입력 관행',
  '수치 변화 시 ERP 입력 패턴 변화.',
  22,
  count(*) FILTER (WHERE arrival_date > release_date),
  0.20,
  CASE WHEN abs(count(*) FILTER (WHERE arrival_date > release_date) - 22) / 22.0 > 0.20
    THEN 'fail' ELSE 'pass' END
FROM import_declarations

UNION ALL SELECT '면장 paid + free ≠ qty (ERP 추가분)', 'ERP 본질 (참고)', 'low',
  'paid_qty + free_qty 가 quantity 와 다른 ERP 정의 케이스',
  '97/100 정상, 2건만 ERP 의도적 추가분. 변화 시 새 패턴 감지.',
  2,
  count(*) FILTER (WHERE paid_qty IS NOT NULL AND free_qty IS NOT NULL AND quantity IS NOT NULL AND paid_qty + free_qty != quantity),
  0.50,
  CASE WHEN abs(count(*) FILTER (WHERE paid_qty IS NOT NULL AND free_qty IS NOT NULL AND quantity IS NOT NULL AND paid_qty + free_qty != quantity) - 2) > 1
    THEN 'fail' ELSE 'pass' END
FROM import_declarations
;

-- view 권한 (RLS 의도적 X — 운영자 page 가 view 호출)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON v_integrity_check TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON v_integrity_check TO service_role;
  END IF;
END $$;

COMMENT ON VIEW v_integrity_check IS
  'D-064 PR 38: DB 정합성 검증 50+ 통합 view. /api/v1/admin/db-integrity 가 SELECT * 한 번으로 모든 검증 결과 가져옴. 새 검증은 UNION ALL 추가.';
