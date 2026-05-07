-- 089: PO 본문 + 라인아이템 저장을 Postgres 함수 1회 호출로 묶는다.
-- 목적: 웹 직접입력/엑셀 Import 모두 헤더만 저장되고 라인이 실패하는 반쪽 PO를 방지한다.

CREATE OR REPLACE FUNCTION sf_create_purchase_order_with_lines(
  p_po jsonb,
  p_lines jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_po purchase_orders%ROWTYPE;
  v_line_count int := 0;
BEGIN
  INSERT INTO purchase_orders (
    po_number,
    company_id,
    manufacturer_id,
    contract_type,
    contract_date,
    incoterms,
    payment_terms,
    total_qty,
    total_mw,
    contract_period_start,
    contract_period_end,
    status,
    memo,
    parent_po_id
  )
  VALUES (
    NULLIF(p_po->>'po_number', ''),
    (p_po->>'company_id')::uuid,
    (p_po->>'manufacturer_id')::uuid,
    p_po->>'contract_type',
    NULLIF(p_po->>'contract_date', '')::date,
    NULLIF(p_po->>'incoterms', ''),
    NULLIF(p_po->>'payment_terms', ''),
    NULLIF(p_po->>'total_qty', '')::int,
    NULLIF(p_po->>'total_mw', '')::numeric,
    NULLIF(p_po->>'contract_period_start', '')::date,
    NULLIF(p_po->>'contract_period_end', '')::date,
    COALESCE(NULLIF(p_po->>'status', ''), 'draft'),
    NULLIF(p_po->>'memo', ''),
    NULLIF(p_po->>'parent_po_id', '')::uuid
  )
  RETURNING * INTO v_po;

  WITH input_lines AS (
    SELECT *
    FROM jsonb_to_recordset(
      CASE
        WHEN p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN '[]'::jsonb
        ELSE p_lines
      END
    ) AS line (
      product_id text,
      quantity int,
      unit_price_usd numeric,
      unit_price_usd_wp numeric,
      total_amount_usd numeric,
      item_type text,
      payment_type text,
      memo text
    )
  )
  INSERT INTO po_line_items (
    po_id,
    product_id,
    quantity,
    unit_price_usd,
    unit_price_usd_wp,
    total_amount_usd,
    item_type,
    payment_type,
    memo
  )
  SELECT
    v_po.po_id,
    line.product_id::uuid,
    line.quantity,
    line.unit_price_usd,
    COALESCE(
      line.unit_price_usd_wp,
      CASE
        WHEN line.unit_price_usd IS NOT NULL AND pr.spec_wp IS NOT NULL AND pr.spec_wp > 0
        THEN line.unit_price_usd / pr.spec_wp
      END
    ),
    COALESCE(
      line.total_amount_usd,
      CASE
        WHEN line.unit_price_usd IS NOT NULL AND line.quantity IS NOT NULL
        THEN line.unit_price_usd * line.quantity
      END
    ),
    COALESCE(NULLIF(line.item_type, ''), 'main'),
    COALESCE(NULLIF(line.payment_type, ''), 'paid'),
    NULLIF(line.memo, '')
  FROM input_lines line
  LEFT JOIN products pr ON pr.product_id = line.product_id::uuid;

  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  IF v_line_count > 0 THEN
    UPDATE purchase_orders po
       SET total_qty = totals.total_qty,
           total_mw = totals.total_mw
      FROM (
        SELECT
          NULLIF(COALESCE(sum(pl.quantity), 0), 0)::int AS total_qty,
          NULLIF(COALESCE(sum((pl.quantity::numeric * pr.spec_wp::numeric) / 1000000), 0), 0) AS total_mw
        FROM po_line_items pl
        LEFT JOIN products pr ON pr.product_id = pl.product_id
        WHERE pl.po_id = v_po.po_id
      ) totals
     WHERE po.po_id = v_po.po_id
     RETURNING po.* INTO v_po;
  END IF;

  RETURN to_jsonb(v_po);
END;
$$;

-- purchase_orders_ext 의 수량/MW는 라인아이템을 우선 정본으로 본다.
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
  COALESCE(line_totals.total_qty, po.total_qty) AS total_qty,
  COALESCE(line_totals.total_mw, po.total_mw) AS total_mw,
  po.contract_period_start,
  po.contract_period_end,
  po.status,
  po.memo,
  po.created_at,
  po.updated_at,
  po.parent_po_id,
  m.name_kr AS manufacturer_name,
  m.name_en AS manufacturer_name_en,
  first_line.spec_wp AS first_spec_wp
FROM purchase_orders po
LEFT JOIN manufacturers m ON po.manufacturer_id = m.manufacturer_id
LEFT JOIN LATERAL (
  SELECT
    NULLIF(COALESCE(sum(pl.quantity), 0), 0)::int AS total_qty,
    NULLIF(COALESCE(sum((pl.quantity::numeric * pr.spec_wp::numeric) / 1000000), 0), 0) AS total_mw
  FROM po_line_items pl
  LEFT JOIN products pr ON pl.product_id = pr.product_id
  WHERE pl.po_id = po.po_id
) line_totals ON true
LEFT JOIN LATERAL (
  SELECT pr.spec_wp
  FROM po_line_items pl
  LEFT JOIN products pr ON pl.product_id = pr.product_id
  WHERE pl.po_id = po.po_id
    AND (pl.payment_type IS NULL OR pl.payment_type = 'paid')
  ORDER BY pl.created_at ASC
  LIMIT 1
) first_line ON true;
