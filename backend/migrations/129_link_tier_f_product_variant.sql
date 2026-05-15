-- M129: Tier F — customer + 같은 manufacturer + 같은 spec_wp (product_id 변형 허용)
-- 134 건의 'customer 매치+product 불일치' 케이스 처리
-- 예: outbound JKM635N-78HL4-BDV-S ↔ order JKM635N-78HL4-BDV (S 없는 변형)
BEGIN;

WITH tier_f AS (
  SELECT DISTINCT ON (o.outbound_id) o.outbound_id, ord.order_id
  FROM outbounds o
  JOIN sales s ON s.outbound_id = o.outbound_id
  JOIN products po_p ON po_p.product_id = o.product_id
  JOIN products ord_p ON ord_p.manufacturer_id = po_p.manufacturer_id
                     AND ord_p.spec_wp = po_p.spec_wp
                     AND ord_p.product_id <> po_p.product_id
  JOIN orders ord ON ord.company_id = o.company_id
                 AND ord.customer_id = s.customer_id
                 AND ord.product_id = ord_p.product_id
                 AND abs(ord.order_date - o.outbound_date) <= 365
  WHERE o.order_id IS NULL AND o.usage_category IN ('sale','sale_spare')
  ORDER BY o.outbound_id, abs(ord.order_date - o.outbound_date) ASC
)
UPDATE outbounds o SET
  order_id = f.order_id,
  memo = COALESCE(NULLIF(o.memo,''),'') ||
         CASE WHEN COALESCE(o.memo,'')='' THEN '' ELSE E'\n' END ||
         'M129 tier F: 같은 manufacturer+spec_wp 의 product 변형 매칭'
FROM tier_f f WHERE o.outbound_id = f.outbound_id;

-- transitive sales
UPDATE sales s SET order_id = o.order_id
FROM outbounds o
WHERE s.outbound_id = o.outbound_id
  AND s.order_id IS NULL
  AND o.order_id IS NOT NULL;

INSERT INTO schema_migrations(filename) VALUES ('129_link_tier_f_product_variant.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
