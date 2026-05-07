-- @auto-apply: yes
-- 084: purchase_orders_ext 뷰에 row-level aggregate 추가 — POListTable 의 N+1 해결.
-- 기존 view (083 이전) 는 PO + manufacturer + first_line.spec_wp 만 join.
-- POListTable 가 각 PO 마다 lines/lcs/tts 를 fetchWithAuth 로 따로 호출 (N+1) 하던 패턴을
-- 한 query 의 join 으로 대체. 펼침 (expanded) 상세 LC 목록은 그대로 lazy fetch 유지.

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
  first_line.spec_wp AS first_spec_wp,
  first_line.product_name AS first_product_name,
  first_line.product_code AS first_product_code,
  -- po_line_items 합계 (paid 라인만 — 기존 first_line 필터와 동일).
  COALESCE(line_agg.line_count, 0) AS line_count,
  COALESCE(line_agg.line_total_usd, 0)::numeric AS line_total_usd,
  COALESCE(line_agg.line_total_wp, 0)::numeric AS line_total_wp,
  COALESCE(line_agg.line_extra_count, 0) AS line_extra_count,
  -- lc_records 합계 (status 무관 — 행 표시는 전체).
  COALESCE(lc_agg.lc_count, 0) AS lc_count,
  COALESCE(lc_agg.lc_total_usd, 0)::numeric AS lc_total_usd,
  COALESCE(lc_agg.lc_total_mw, 0)::numeric AS lc_total_mw,
  -- tt_remittances 합계 (completed 만 송금 누계, count 는 전체).
  COALESCE(tt_agg.tt_count, 0) AS tt_count,
  COALESCE(tt_agg.tt_completed_usd, 0)::numeric AS tt_completed_usd
FROM purchase_orders po
LEFT JOIN manufacturers m ON po.manufacturer_id = m.manufacturer_id
LEFT JOIN LATERAL (
  SELECT pr.spec_wp, pr.product_name, pr.product_code
  FROM po_line_items pl
  LEFT JOIN products pr ON pl.product_id = pr.product_id
  WHERE pl.po_id = po.po_id AND (pl.payment_type IS NULL OR pl.payment_type = 'paid')
  ORDER BY pl.created_at
  LIMIT 1
) first_line ON true
LEFT JOIN LATERAL (
  SELECT
    count(*)::int AS line_count,
    COALESCE(sum(pl.total_amount_usd), 0)::numeric AS line_total_usd,
    COALESCE(sum(pl.quantity * pr.spec_wp), 0)::numeric AS line_total_wp,
    GREATEST(count(*) - 1, 0)::int AS line_extra_count
  FROM po_line_items pl
  LEFT JOIN products pr ON pl.product_id = pr.product_id
  WHERE pl.po_id = po.po_id AND (pl.payment_type IS NULL OR pl.payment_type = 'paid')
) line_agg ON true
LEFT JOIN LATERAL (
  SELECT
    count(*)::int AS lc_count,
    COALESCE(sum(amount_usd), 0)::numeric AS lc_total_usd,
    COALESCE(sum(target_mw), 0)::numeric AS lc_total_mw
  FROM lc_records
  WHERE po_id = po.po_id
) lc_agg ON true
LEFT JOIN LATERAL (
  SELECT
    count(*)::int AS tt_count,
    COALESCE(sum(amount_usd) FILTER (WHERE status = 'completed'), 0)::numeric AS tt_completed_usd
  FROM tt_remittances
  WHERE po_id = po.po_id
) tt_agg ON true;

GRANT SELECT ON purchase_orders_ext TO anon, authenticated, service_role;
