-- 054: purchase_orders_ext 뷰에 is_sandbox 노출
--
-- 053에서 base table에 컬럼 추가했지만 view는 갱신 안 됨.
-- list endpoint(tx_po.go)가 view를 호출하므로 view에서 is_sandbox 필터 가능하게 추가.
--
-- application 코드는 ?include_sandbox=true 쿼리 미지정 시 .Eq("is_sandbox","false") 자동.
--
-- 운영 적용:
--   psql -d solarflow -f backend/migrations/054_onboarding_sandbox_view.sql
--   systemctl --user restart solarflow-postgrest

CREATE OR REPLACE VIEW purchase_orders_ext AS
SELECT
  po.po_id,
  po.po_number,
  po.company_id,
  po.manufacturer_id,
  po.contract_type,
  po.contract_date,
  po.incoterms,
  po.payment_terms,
  po.total_qty,
  po.total_mw,
  po.contract_period_start,
  po.contract_period_end,
  po.status,
  po.memo,
  po.created_at,
  po.updated_at,
  po.parent_po_id,
  po.is_sandbox,
  m.name_kr AS manufacturer_name,
  m.name_en AS manufacturer_name_en,
  first_line.spec_wp AS first_spec_wp
FROM purchase_orders po
LEFT JOIN manufacturers m ON po.manufacturer_id = m.manufacturer_id
LEFT JOIN LATERAL (
  SELECT pr.spec_wp
  FROM po_line_items pl
  LEFT JOIN products pr ON pl.product_id = pr.product_id
  WHERE pl.po_id = po.po_id
    AND (pl.payment_type IS NULL OR pl.payment_type = 'paid')
  ORDER BY pl.created_at ASC
  LIMIT 1
) first_line ON true;
