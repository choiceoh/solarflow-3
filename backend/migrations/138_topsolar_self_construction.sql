-- M138: 탑솔라 주식회사 자기 회사 출고건 5개를 공사사용건 (construction) 으로 전환
-- M137 implicit orders 중 customer=탑솔라 주식회사 인 케이스가 실은 자기 회사 출고건 가능성 높음.
-- PR #819 의 construction 카테고리는 customer_id NULL 허용 + unit_price 0 허용.

BEGIN;

-- 1) orders.management_category = 'construction', customer_id 그대로 (자기회사 customer 유지)
UPDATE orders SET
  management_category = 'construction',
  memo = COALESCE(NULLIF(memo,''),'') || E'\nM138: 자기회사 출고건 → 공사사용건 전환'
WHERE memo LIKE 'M137%'
  AND customer_id = (SELECT partner_id FROM partners WHERE partner_name = '탑솔라 주식회사');

-- 2) 해당 outbound 의 usage_category 도 sale→construction (sale_spare 면 그대로)
UPDATE outbounds o SET
  usage_category = 'construction',
  memo = COALESCE(NULLIF(o.memo,''),'') || E'\nM138: 공사사용건 전환'
FROM orders ord
WHERE o.order_id = ord.order_id
  AND ord.memo LIKE '%M138%'
  AND o.usage_category = 'sale';

INSERT INTO schema_migrations(filename) VALUES ('138_topsolar_self_construction.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
