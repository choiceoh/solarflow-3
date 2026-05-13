-- 113: orders_with_meta view — 수주 q 검색의 partner/product UUID 리스트 IN 을
--      server-side ilike 술어로 옮기는 view. 094 / 110 / 111 / 112 동일 패턴.
--
-- 배경:
--   applyOrderFilters 의 q 검색이 partners.partner_name 과 products.product_code/name
--   에서 UUID 리스트를 끌어와 orders.<fk>.in.(...) 으로 합친다. 매칭이 많을 때 URL 폭주.
--
-- 해법:
--   조회 base 를 orders_with_meta 로 옮긴다. customer_name / product_code / product_name
--   에 직접 ilike. UUID 왕복 없음.

CREATE OR REPLACE VIEW orders_with_meta AS
SELECT
  o.*,
  p.partner_name   AS customer_name,
  prod.product_code,
  prod.product_name
FROM orders o
LEFT JOIN partners p    ON p.partner_id    = o.customer_id
LEFT JOIN products prod ON prod.product_id = o.product_id;

GRANT SELECT ON orders_with_meta TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
