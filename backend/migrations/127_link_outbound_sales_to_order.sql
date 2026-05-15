-- M127: outbounds.order_id 휴리스틱 매칭 — (company, customer, product) + outbound_date 가 order_date 이후 14~60일 윈도우
-- sale/sale_spare 만 대상. 같은 customer+product 다중 후보 시 가장 가까운(=가장 최근) order 우선.
BEGIN;

WITH tier_a AS (
  SELECT DISTINCT ON (o.outbound_id) o.outbound_id, ord.order_id
  FROM outbounds o
  JOIN sales s ON s.outbound_id = o.outbound_id
  JOIN orders ord ON ord.company_id = o.company_id
                 AND ord.customer_id = s.customer_id
                 AND ord.product_id = o.product_id
                 AND o.outbound_date >= ord.order_date
                 AND o.outbound_date <= ord.order_date + INTERVAL '14 days'
  WHERE o.order_id IS NULL AND o.usage_category IN ('sale','sale_spare')
  ORDER BY o.outbound_id, ord.order_date DESC
)
UPDATE outbounds SET order_id = tier_a.order_id,
                     memo = COALESCE(NULLIF(memo,''), '') ||
                            CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END ||
                            'M127: (cust+prod+14d) 휴리스틱 매칭'
FROM tier_a WHERE outbounds.outbound_id = tier_a.outbound_id;

WITH tier_b AS (
  SELECT DISTINCT ON (o.outbound_id) o.outbound_id, ord.order_id
  FROM outbounds o
  JOIN sales s ON s.outbound_id = o.outbound_id
  JOIN orders ord ON ord.company_id = o.company_id
                 AND ord.customer_id = s.customer_id
                 AND ord.product_id = o.product_id
                 AND o.outbound_date >= ord.order_date
                 AND o.outbound_date <= ord.order_date + INTERVAL '60 days'
  WHERE o.order_id IS NULL AND o.usage_category IN ('sale','sale_spare')
  ORDER BY o.outbound_id, ord.order_date DESC
)
UPDATE outbounds SET order_id = tier_b.order_id,
                     memo = COALESCE(NULLIF(memo,''), '') ||
                            CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END ||
                            'M127: (cust+prod+60d) 휴리스틱 매칭 — 운영자 검토 권장'
FROM tier_b WHERE outbounds.outbound_id = tier_b.outbound_id;

-- transitive: sales.order_id 보강
UPDATE sales s SET order_id = o.order_id
FROM outbounds o
WHERE s.outbound_id = o.outbound_id
  AND s.order_id IS NULL
  AND o.order_id IS NOT NULL;

INSERT INTO schema_migrations(filename) VALUES ('127_link_outbound_sales_to_order.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
