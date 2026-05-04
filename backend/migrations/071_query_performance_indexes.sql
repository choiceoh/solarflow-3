-- 071_query_performance_indexes.sql
-- 목적: Rust 계산엔진의 느린 쿼리 최적화
-- 영향: inventory, lc-schedule, turnover, margin, customer-analysis API 응답 속도 향상
-- 적용 전: 1-10초
-- 적용 후 예상: 50-500ms

BEGIN;

-- 1. outbounds: 출하 목록 조회 + 기간 필터링 최적화
-- turnover.rs, inventory.rs, lc_schedule.rs 에서频繁使用
CREATE INDEX IF NOT EXISTS idx_outbounds_company_status
    ON outbounds(company_id, status)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_outbounds_company_status_date
    ON outbounds(company_id, status, outbound_date)
    WHERE status = 'active';

-- 2. sales: outbounds JOIN 최적화 (customer-analysis，慢查询 4-10초)
CREATE INDEX IF NOT EXISTS idx_sales_outbound_id
    ON sales(outbound_id)
    WHERE outbound_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_outbound_id_status
    ON sales(outbound_id, status)
    WHERE outbound_id IS NOT NULL;

-- 3. receipt_matches: 수금 매칭 서브쿼리 최적화 (慢查询 1-4초)
-- customer-analysis 에서 반복 호출되는 receipt_matches.outbound_id SUM
CREATE INDEX IF NOT EXISTS idx_receipt_matches_outbound_id
    ON receipt_matches(outbound_id);

CREATE INDEX IF NOT EXISTS idx_receipt_matches_outbound_id_matched
    ON receipt_matches(outbound_id, matched_amount);

-- 4. orders: 재고 예약/배정 쿼리 최적화 (慢查询 1.7초)
-- inventory.rs: fetch_reserved, fetch_allocated, fetch_incoming_reserved
CREATE INDEX IF NOT EXISTS idx_orders_company_status_category_source
    ON orders(company_id, status, management_category, fulfillment_source)
    WHERE fulfillment_source IN ('stock', 'incoming');

CREATE INDEX IF NOT EXISTS idx_orders_company_status_fulfillment
    ON orders(company_id, status, fulfillment_source)
    WHERE status IN ('received', 'partial');

-- 5. lc_records: 만기 알림 + 한도 조회 최적화 (慢查询 2-6초)
-- lc_schedule.rs: lc-maturity-alert, lc-limit-timeline
CREATE INDEX IF NOT EXISTS idx_lc_records_status_maturity
    ON lc_records(status, maturity_date)
    WHERE status IN ('opened', 'docs_received');

CREATE INDEX IF NOT EXISTS idx_lc_records_bank_status
    ON lc_records(bank_id, status)
    WHERE status IN ('opened', 'docs_received');

CREATE INDEX IF NOT EXISTS idx_lc_records_status_company
    ON lc_records(status, company_id)
    WHERE status IN ('opened', 'docs_received');

-- 6. bl_shipments: BL 입고/출고 집계 최적화
-- inventory.rs, turnover.rs, lc_schedule.rs
CREATE INDEX IF NOT EXISTS idx_bl_shipments_status_company
    ON bl_shipments(status, company_id)
    WHERE status IN ('completed', 'erp_done', 'shipping', 'arrived', 'customs');

CREATE INDEX IF NOT EXISTS idx_bl_shipments_status_lc
    ON bl_shipments(status, lc_id)
    WHERE lc_id IS NOT NULL
      AND status IN ('completed', 'erp_done', 'shipping', 'arrived', 'customs');

CREATE INDEX IF NOT EXISTS idx_bl_shipments_lc_status
    ON bl_shipments(lc_id, status)
    WHERE lc_id IS NOT NULL;

-- 7. bl_line_items: BL 라인 품목 집계 최적화
CREATE INDEX IF NOT EXISTS idx_bl_line_items_bl_id
    ON bl_line_items(bl_id);

CREATE INDEX IF NOT EXISTS idx_bl_line_items_product_id
    ON bl_line_items(product_id);

CREATE INDEX IF NOT EXISTS idx_bl_line_items_bl_product
    ON bl_line_items(bl_id, product_id);

-- 8. po_line_items: P/O 라인 품목 집계 최적화 (LC 미착품 계산)
-- inventory.rs: fetch_lc_incoming
CREATE INDEX IF NOT EXISTS idx_po_line_items_po_id
    ON po_line_items(po_id);

CREATE INDEX IF NOT EXISTS idx_po_line_items_product_id
    ON po_line_items(product_id);

-- 9. products: 활성 품목 조회 최적화
CREATE INDEX IF NOT EXISTS idx_products_active
    ON products(is_active)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_manufacturer_active
    ON products(manufacturer_id, is_active)
    WHERE is_active = true;

-- 10. inventory_allocations: 재고 배정 쿼리 최적화
-- inventory.rs: fetch_alloc_stock, fetch_alloc_incoming
CREATE INDEX IF NOT EXISTS idx_inventory_allocations_company_source_status
    ON inventory_allocations(company_id, source_type, status)
    WHERE source_type IN ('stock', 'incoming');

CREATE INDEX IF NOT EXISTS idx_inventory_allocations_company_product
    ON inventory_allocations(company_id, product_id);

-- 11. banks: 은행별 LC 한도 조회 최적화
-- lc_schedule.rs: calculate_limit_timeline
CREATE INDEX IF NOT EXISTS idx_banks_active
    ON banks(is_active, company_id)
    WHERE is_active = true;

-- 12. cost_details: 원가 상세 조회 최적화
-- landed_cost.rs
CREATE INDEX IF NOT EXISTS idx_cost_details_declaration_id
    ON cost_details(declaration_id);

CREATE INDEX IF NOT EXISTS idx_cost_details_product_id
    ON cost_details(product_id);

-- 13. import_declarations: 신고서 조회 최적화
CREATE INDEX IF NOT EXISTS idx_import_declarations_company_date
    ON import_declarations(company_id, declaration_date DESC);

COMMIT;

-- ANALYZE: 통계 정보 갱신 (적용 후 쿼리 플래너 최적화)
-- 필요시 수동 실행: ANALYZE outbounds; ANALYZE sales; ANALYZE orders; ANALYZE lc_records;
