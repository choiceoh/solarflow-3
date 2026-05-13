-- 112: outbounds_with_meta view — q 검색·제조사 필터를 server-side 술어로 옮기는 view.
--      094 / 110 / 111 와 동일 패턴 (Go 측 UUID 리스트 IN URL 폭주 → DB-side 컬럼).
--
-- 배경:
--   applyOutboundSearch 가 q 매칭 시 products/orders/warehouses/companies 에서
--   각각 UUID 리스트를 끌어와 outbounds.<fk>.in.(...) 으로 합친다. 한 마스터에
--   수백~수천 매칭이 잡히면 한 URL 이 Cloudflare 한도(~8KB)를 넘어 평문 400.
--   동일하게 manufacturer_id 필터도 products.product_id IN 으로 우회한다.
--
-- 해법:
--   조회 base 를 outbounds_with_meta 로 옮긴다. q 검색은 view 컬럼에 직접 ilike,
--   제조사는 view 의 product_manufacturer_id 에 eq. UUID 왕복 없음.

CREATE OR REPLACE VIEW outbounds_with_meta AS
SELECT
  o.*,
  p.product_code,
  p.product_name,
  p.manufacturer_id   AS product_manufacturer_id,
  ord.order_number,
  w.warehouse_name,
  tc.company_name     AS target_company_name,
  tc.company_code     AS target_company_code
FROM outbounds o
LEFT JOIN products    p   ON p.product_id   = o.product_id
LEFT JOIN orders      ord ON ord.order_id   = o.order_id
LEFT JOIN warehouses  w   ON w.warehouse_id = o.warehouse_id
LEFT JOIN companies   tc  ON tc.company_id  = o.target_company_id;

GRANT SELECT ON outbounds_with_meta TO anon, authenticated, service_role;

-- 110 의 outbounds_sale_unregistered 도 위 view 기반으로 재정의 — 한 곳에서 meta
-- 컬럼을 공유해 work_queue=sale_unregistered 경로도 동일 q 검색이 가능.
CREATE OR REPLACE VIEW outbounds_sale_unregistered AS
SELECT om.*
FROM outbounds_with_meta om
WHERE om.usage_category IN ('sale', 'sale_spare')
  AND NOT EXISTS (
    SELECT 1
    FROM sales s
    WHERE s.outbound_id = om.outbound_id
      AND s.status <> 'cancelled'
  );

GRANT SELECT ON outbounds_sale_unregistered TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_products_manufacturer_id
  ON products(manufacturer_id)
  WHERE manufacturer_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
