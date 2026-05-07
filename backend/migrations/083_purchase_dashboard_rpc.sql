-- @auto-apply: yes
-- 083: purchase_dashboard() RPC. PurchaseHistoryPage 4개 insight (Chains/Variants/PriceChanges/RecentEvents)
-- 의 client-side 집계를 SQL 한 round-trip 으로 대체.
-- 데이터 소스: purchase_orders + price_histories + lc_records + bl_shipments + tt_remittances.
-- 이벤트 종류: po(head), variant, price, lc_open, lc_settle, bl, tt — frontend KIND_LABEL 과 1:1.

CREATE OR REPLACE FUNCTION purchase_dashboard(
  p_company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now date := current_date;
  v_result jsonb;
BEGIN
  WITH
    months AS (
      SELECT to_char(date_trunc('month', v_now) - (gs * interval '1 month'), 'YYYY-MM') AS month
      FROM generate_series(0, 23) gs
    ),
    -- PO scope (filtered by company)
    po_scope AS (
      SELECT po.po_id, po.po_number, po.parent_po_id, po.contract_date,
             po.manufacturer_id, m.name_kr AS manufacturer_name
      FROM purchase_orders po
      LEFT JOIN manufacturers m ON m.manufacturer_id = po.manufacturer_id
      WHERE p_company_id IS NULL OR po.company_id = p_company_id
    ),
    -- head PO (parent_po_id IS NULL) = 계약 체인의 시작점
    chains AS (
      SELECT po_id, po_number, contract_date, manufacturer_id, manufacturer_name
      FROM po_scope WHERE parent_po_id IS NULL
    ),
    -- 변경계약 (parent_po_id IS NOT NULL)
    variants AS (
      SELECT v.po_id, v.po_number, v.parent_po_id, v.contract_date,
             v.manufacturer_id, v.manufacturer_name,
             h.po_number AS head_po_number, h.po_id AS head_po_id
      FROM po_scope v
      LEFT JOIN po_scope h ON h.po_id = v.parent_po_id
      WHERE v.parent_po_id IS NOT NULL
    ),
    -- price_histories (filter by company OR PO's company)
    ph_scope AS (
      SELECT ph.price_history_id, ph.change_date, ph.manufacturer_id,
             m.name_kr AS manufacturer_name,
             ph.product_id, p.product_name, ph.reason
      FROM price_histories ph
      LEFT JOIN manufacturers m ON m.manufacturer_id = ph.manufacturer_id
      LEFT JOIN products p ON p.product_id = ph.product_id
      WHERE p_company_id IS NULL OR ph.company_id = p_company_id
    ),
    -- LC events (open + settle)
    lc_scope AS (
      SELECT lr.lc_id, lr.po_id, lr.open_date, lr.settlement_date
      FROM lc_records lr
      WHERE p_company_id IS NULL OR lr.company_id = p_company_id
    ),
    -- BL events (event_date = actual_arrival ?? eta ?? etd)
    bl_scope AS (
      SELECT bl.bl_id, COALESCE(bl.actual_arrival, bl.eta, bl.etd) AS event_date
      FROM bl_shipments bl
      WHERE p_company_id IS NULL OR bl.company_id = p_company_id
    ),
    -- TT events (remit_date)
    tt_scope AS (
      SELECT tt.tt_id, tt.remit_date
      FROM tt_remittances tt
      JOIN purchase_orders po ON po.po_id = tt.po_id
      WHERE p_company_id IS NULL OR po.company_id = p_company_id
    ),
    -- 통합 이벤트 스트림
    events AS (
      SELECT 'po'::text AS kind, contract_date AS event_date FROM chains WHERE contract_date IS NOT NULL
      UNION ALL
      SELECT 'variant'::text, contract_date FROM variants WHERE contract_date IS NOT NULL
      UNION ALL
      SELECT 'price'::text, change_date FROM ph_scope WHERE change_date IS NOT NULL
      UNION ALL
      SELECT 'lc_open'::text, open_date FROM lc_scope WHERE open_date IS NOT NULL
      UNION ALL
      SELECT 'lc_settle'::text, settlement_date FROM lc_scope WHERE settlement_date IS NOT NULL
      UNION ALL
      SELECT 'bl'::text, event_date FROM bl_scope WHERE event_date IS NOT NULL
      UNION ALL
      SELECT 'tt'::text, remit_date FROM tt_scope WHERE remit_date IS NOT NULL
    ),
    -- totals
    chain_count_cte AS (SELECT count(*)::int AS n FROM chains),
    variant_count_cte AS (SELECT count(*)::int AS n FROM variants),
    chain_with_variants AS (
      SELECT count(DISTINCT v.parent_po_id)::int AS n FROM variants v
    ),
    price_count_cte AS (SELECT count(*)::int AS n FROM ph_scope),
    event_count_cte AS (SELECT count(*)::int AS n FROM events),
    totals AS (
      SELECT
        (SELECT n FROM chain_count_cte) AS chain_count,
        (SELECT n FROM variant_count_cte) AS variant_count,
        (SELECT n FROM price_count_cte) AS price_change_count,
        (SELECT n FROM event_count_cte) AS event_count,
        (SELECT n FROM chain_with_variants) AS chains_with_variants_count
    ),
    -- trend24 별도 시리즈 (chains/variants/prices/events)
    chain_trend_raw AS (
      SELECT to_char(contract_date::date, 'YYYY-MM') AS month, count(*)::int AS n
      FROM chains WHERE contract_date IS NOT NULL GROUP BY 1
    ),
    variant_trend_raw AS (
      SELECT to_char(contract_date::date, 'YYYY-MM') AS month, count(*)::int AS n
      FROM variants WHERE contract_date IS NOT NULL GROUP BY 1
    ),
    price_trend_raw AS (
      SELECT to_char(change_date::date, 'YYYY-MM') AS month, count(*)::int AS n
      FROM ph_scope WHERE change_date IS NOT NULL GROUP BY 1
    ),
    event_trend_raw AS (
      SELECT to_char(event_date::date, 'YYYY-MM') AS month, count(*)::int AS n
      FROM events GROUP BY 1
    ),
    trend24_arr AS (
      SELECT
        m.month,
        COALESCE(c.n, 0) AS chain_count,
        COALESCE(v.n, 0) AS variant_count,
        COALESCE(p.n, 0) AS price_change_count,
        COALESCE(e.n, 0) AS event_count
      FROM months m
      LEFT JOIN chain_trend_raw c ON c.month = m.month
      LEFT JOIN variant_trend_raw v ON v.month = m.month
      LEFT JOIN price_trend_raw p ON p.month = m.month
      LEFT JOIN event_trend_raw e ON e.month = m.month
    ),
    -- by_kind (events 종류별)
    event_total AS (SELECT count(*)::int AS n FROM events),
    by_kind_raw AS (
      SELECT kind AS key,
        CASE kind
          WHEN 'po' THEN 'PO 생성'
          WHEN 'variant' THEN '변경계약'
          WHEN 'price' THEN '단가 변동'
          WHEN 'lc_open' THEN 'LC 개설'
          WHEN 'lc_settle' THEN 'LC 결제'
          WHEN 'bl' THEN 'B/L 등록'
          WHEN 'tt' THEN 'T/T 송금'
          ELSE kind
        END AS label,
        count(*)::int AS count
      FROM events GROUP BY kind
    ),
    by_kind AS (
      SELECT k.key, k.label, k.count,
        CASE WHEN et.n > 0 THEN k.count::numeric / et.n ELSE 0::numeric END AS share
      FROM by_kind_raw k, event_total et
      ORDER BY k.count DESC
    ),
    -- chains 변경 포함 여부 (with_variants vs single)
    chains_breakdown_raw AS (
      SELECT
        'with_variants'::text AS key,
        '변경계약 포함' AS label,
        (SELECT n FROM chain_with_variants) AS count
      UNION ALL
      SELECT 'single'::text, '단일 체인',
        (SELECT n FROM chain_count_cte) - (SELECT n FROM chain_with_variants)
    ),
    chains_breakdown AS (
      SELECT cb.key, cb.label, cb.count,
        CASE WHEN cc.n > 0 THEN cb.count::numeric / cc.n ELSE 0::numeric END AS share
      FROM chains_breakdown_raw cb, chain_count_cte cc
    ),
    -- by_manufacturer (chains/variants/price 합계)
    chain_by_mfg AS (
      SELECT
        COALESCE(manufacturer_id::text, '__unset__') AS key,
        COALESCE(manufacturer_name, '미지정') AS label,
        count(*)::int AS chain_count
      FROM chains GROUP BY manufacturer_id, manufacturer_name
    ),
    variant_by_mfg AS (
      SELECT
        COALESCE(manufacturer_id::text, '__unset__') AS key,
        count(*)::int AS variant_count
      FROM variants GROUP BY manufacturer_id
    ),
    price_by_mfg AS (
      SELECT
        COALESCE(manufacturer_id::text, '__unset__') AS key,
        count(*)::int AS price_change_count
      FROM ph_scope GROUP BY manufacturer_id
    ),
    by_mfg_raw AS (
      SELECT
        c.key, c.label,
        COALESCE(c.chain_count, 0) AS chain_count,
        COALESCE(v.variant_count, 0) AS variant_count,
        COALESCE(p.price_change_count, 0) AS price_change_count,
        COALESCE(c.chain_count, 0) + COALESCE(v.variant_count, 0) + COALESCE(p.price_change_count, 0) AS total_count
      FROM chain_by_mfg c
      LEFT JOIN variant_by_mfg v ON v.key = c.key
      LEFT JOIN price_by_mfg p ON p.key = c.key
      UNION ALL
      SELECT v.key, COALESCE(c.label, '미지정'), 0, v.variant_count, COALESCE(p.price_change_count, 0),
             v.variant_count + COALESCE(p.price_change_count, 0)
      FROM variant_by_mfg v
      LEFT JOIN chain_by_mfg c ON c.key = v.key
      LEFT JOIN price_by_mfg p ON p.key = v.key
      WHERE c.key IS NULL
      UNION ALL
      SELECT p.key, COALESCE(NULLIF(p.key, '__unset__'), '미지정'), 0, 0, p.price_change_count, p.price_change_count
      FROM price_by_mfg p
      LEFT JOIN chain_by_mfg c ON c.key = p.key
      LEFT JOIN variant_by_mfg v ON v.key = p.key
      WHERE c.key IS NULL AND v.key IS NULL
    ),
    by_manufacturer_top10 AS (
      SELECT key, label, chain_count, variant_count, price_change_count, total_count
      FROM by_mfg_raw
      ORDER BY total_count DESC, chain_count DESC
      LIMIT 10
    ),
    -- by_product (price changes only)
    price_count_total AS (SELECT count(*)::int AS n FROM ph_scope),
    by_product_raw AS (
      SELECT
        COALESCE(product_id::text, '__unset__') AS key,
        COALESCE(product_name, '미지정') AS label,
        count(*)::int AS count
      FROM ph_scope GROUP BY product_id, product_name
    ),
    by_product_top10 AS (
      SELECT bp.key, bp.label, bp.count,
        CASE WHEN pt.n > 0 THEN bp.count::numeric / pt.n ELSE 0::numeric END AS share
      FROM by_product_raw bp, price_count_total pt
      ORDER BY bp.count DESC LIMIT 10
    ),
    -- by_reason (price changes only)
    by_reason_raw AS (
      SELECT
        COALESCE(NULLIF(reason, ''), '__unset__') AS key,
        COALESCE(NULLIF(reason, ''), '사유 미입력') AS label,
        count(*)::int AS count
      FROM ph_scope GROUP BY reason
    ),
    by_reason_top10 AS (
      SELECT br.key, br.label, br.count,
        CASE WHEN pt.n > 0 THEN br.count::numeric / pt.n ELSE 0::numeric END AS share
      FROM by_reason_raw br, price_count_total pt
      ORDER BY br.count DESC LIMIT 10
    ),
    -- by_head_po (variants 그룹별)
    variant_count_total AS (SELECT count(*)::int AS n FROM variants),
    by_head_po_raw AS (
      SELECT
        COALESCE(head_po_id::text, '__unset__') AS key,
        COALESCE(head_po_number, substr(head_po_id::text, 1, 8), '미지정') AS label,
        count(*)::int AS count
      FROM variants GROUP BY head_po_id, head_po_number
    ),
    by_head_po_top10 AS (
      SELECT bh.key, bh.label, bh.count,
        CASE WHEN vt.n > 0 THEN bh.count::numeric / vt.n ELSE 0::numeric END AS share
      FROM by_head_po_raw bh, variant_count_total vt
      ORDER BY bh.count DESC LIMIT 10
    )
  SELECT jsonb_build_object(
    'totals', (SELECT row_to_json(t.*)::jsonb FROM totals t),
    'trend24', (SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY month), '[]'::jsonb) FROM trend24_arr x),
    'by_kind', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_kind x),
    'chains_breakdown', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM chains_breakdown x),
    'by_manufacturer_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_manufacturer_top10 x),
    'by_product_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_product_top10 x),
    'by_reason_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_reason_top10 x),
    'by_head_po_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_head_po_top10 x)
  )
  INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION purchase_dashboard(uuid)
  TO anon, authenticated, service_role;
