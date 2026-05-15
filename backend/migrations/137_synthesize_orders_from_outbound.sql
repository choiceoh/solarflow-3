-- M137: 미연결 outbound 의 customer 가 orders 에 없는 케이스 → implicit orders 합성
-- 185 customer 다 실제 판매처 (에이치해솔, 제주탑솔라 등). orders 등록 누락 보강.

BEGIN;

-- 1) implicit orders INSERT (outbound 별 1개)
INSERT INTO orders (
  order_id, order_number, company_id, customer_id, order_date, receipt_method,
  product_id, quantity, capacity_kw, unit_price_wp, site_name, site_address,
  status, management_category, fulfillment_source, spare_qty, memo
)
SELECT 
  gen_random_uuid(),
  'M137-IMP-' || substr(o.outbound_id::text, 1, 12),
  o.company_id, s.customer_id, o.outbound_date, 'purchase_order',
  o.product_id, o.quantity, o.capacity_kw, COALESCE(s.unit_price_wp, 0),
  o.site_name, o.site_address,
  'completed', 'sale', 'stock', o.spare_qty,
  'M137: outbound 로부터 합성한 implicit order (누락 수주 보강)'
FROM outbounds o
JOIN sales s ON s.outbound_id = o.outbound_id
WHERE o.order_id IS NULL AND o.usage_category IN ('sale','sale_spare');

-- 2) outbound.order_id 매칭 (별도 statement — INSERT 결과 가시화)
UPDATE outbounds ob
SET order_id = ord.order_id,
    memo = COALESCE(NULLIF(ob.memo,''),'') ||
           CASE WHEN COALESCE(ob.memo,'')='' THEN '' ELSE E'\n' END ||
           'M137: implicit order 자동 생성 + 연결'
FROM orders ord
WHERE ord.order_number = 'M137-IMP-' || substr(ob.outbound_id::text, 1, 12)
  AND ob.order_id IS NULL
  AND ob.usage_category IN ('sale','sale_spare');

-- 3) sales.order_id transitive
UPDATE sales s SET order_id = o.order_id
FROM outbounds o
WHERE s.outbound_id = o.outbound_id
  AND s.order_id IS NULL
  AND o.order_id IS NOT NULL;

INSERT INTO schema_migrations(filename) VALUES ('137_synthesize_orders_from_outbound.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
