-- M126: inbounds.supply_amount/vat_amount/total_amount 도출 — unit_price_wp × spec_wp × quantity
-- KRW 만 대상 (USD inbound 는 환율 곱셈 필요해 별도)
BEGIN;

UPDATE inbounds i
SET supply_amount = ROUND(i.unit_price_wp * p.spec_wp * i.quantity)
FROM products p
WHERE i.product_id = p.product_id
  AND (i.supply_amount IS NULL OR i.supply_amount = 0)
  AND i.unit_price_wp IS NOT NULL
  AND i.unit_price_wp > 0
  AND p.spec_wp IS NOT NULL
  AND i.quantity > 0
  AND i.currency = 'KRW';

-- VAT 도 도출 가능 (공급가 × 0.1)
UPDATE inbounds
SET vat_amount = ROUND(supply_amount * 0.1)
WHERE (vat_amount IS NULL OR vat_amount = 0)
  AND supply_amount IS NOT NULL
  AND supply_amount > 0
  AND currency = 'KRW';

-- total = supply + vat
UPDATE inbounds
SET total_amount = supply_amount + vat_amount
WHERE (total_amount IS NULL OR total_amount = 0)
  AND supply_amount IS NOT NULL
  AND vat_amount IS NOT NULL;

INSERT INTO schema_migrations(filename) VALUES ('126_inbounds_supply_derive.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
