-- M136: M135 baro orders 추가 후 outbound↔order 재매칭 (M128 휴리스틱 재실행)
BEGIN;

WITH tier_c AS (
  SELECT DISTINCT ON (o.outbound_id) o.outbound_id, ord.order_id
  FROM outbounds o
  JOIN sales s ON s.outbound_id = o.outbound_id
  JOIN orders ord ON ord.company_id = o.company_id
                 AND ord.customer_id = s.customer_id
                 AND ord.product_id = o.product_id
                 AND abs(ord.order_date - o.outbound_date) <= 365
  WHERE o.order_id IS NULL AND o.usage_category IN ('sale','sale_spare')
  ORDER BY o.outbound_id, abs(ord.order_date - o.outbound_date) ASC
)
UPDATE outbounds o SET
  order_id = c.order_id,
  memo = COALESCE(NULLIF(o.memo,''),'') ||
         CASE WHEN COALESCE(o.memo,'')='' THEN '' ELSE E'\n' END ||
         'M136: M135 baro orders 추가 후 재매칭'
FROM tier_c c WHERE o.outbound_id = c.outbound_id;

UPDATE sales s SET order_id = o.order_id
FROM outbounds o
WHERE s.outbound_id = o.outbound_id
  AND s.order_id IS NULL
  AND o.order_id IS NOT NULL;

INSERT INTO schema_migrations(filename) VALUES ('136_relink_after_baro.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
