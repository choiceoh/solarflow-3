-- 077: pos_dashboard() RPC.
-- 응답 셰이프 PODashboard struct 와 1:1.

CREATE OR REPLACE FUNCTION pos_dashboard(
  p_company_id      uuid DEFAULT NULL,
  p_manufacturer_id uuid DEFAULT NULL,
  p_status          text DEFAULT NULL,
  p_contract_type   text DEFAULT NULL,
  p_status_scope    text DEFAULT 'lifetime'  -- lifetime | active | shipping
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
    base AS (
      SELECT
        po.po_id,
        po.contract_date,
        po.contract_type,
        po.status,
        po.total_mw,
        po.manufacturer_id,
        m.name_kr AS manufacturer_name,
        (po.status NOT IN ('completed', 'cancelled')) AS is_active,
        (po.status IN ('shipping', 'in_progress')) AS is_shipping
      FROM purchase_orders po
      LEFT JOIN manufacturers m ON m.manufacturer_id = po.manufacturer_id
      WHERE
        (p_company_id IS NULL OR po.company_id = p_company_id)
        AND (p_manufacturer_id IS NULL OR po.manufacturer_id = p_manufacturer_id)
        AND (p_status IS NULL OR po.status = p_status)
        AND (p_contract_type IS NULL OR po.contract_type = p_contract_type)
    ),
    months AS (
      SELECT to_char(date_trunc('month', v_now) - (gs * interval '1 month'), 'YYYY-MM') AS month
      FROM generate_series(0, 23) gs
    ),
    totals AS (
      SELECT
        count(*)::int AS count,
        count(*) FILTER (WHERE is_active)::int AS active_count,
        count(*) FILTER (WHERE is_shipping)::int AS shipping_count,
        count(*) FILTER (WHERE status = 'completed')::int AS completed_count,
        count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
        COALESCE(sum(total_mw), 0)::numeric AS total_mw,
        COALESCE(sum(total_mw) FILTER (WHERE is_active), 0)::numeric AS active_mw,
        count(DISTINCT contract_type) FILTER (WHERE contract_type IS NOT NULL AND contract_type <> '')::int AS contract_types_count
      FROM base
    ),
    trend_raw AS (
      SELECT
        to_char(contract_date::date, 'YYYY-MM') AS month,
        count(*)::int AS count,
        count(*) FILTER (WHERE is_active)::int AS active_count,
        count(*) FILTER (WHERE is_shipping)::int AS shipping_count,
        COALESCE(sum(total_mw), 0)::numeric AS total_mw,
        count(DISTINCT contract_type) FILTER (WHERE contract_type IS NOT NULL AND contract_type <> '')::int AS distinct_contract_types
      FROM base
      WHERE contract_date IS NOT NULL
      GROUP BY 1
    ),
    trend24_arr AS (
      SELECT
        m.month,
        COALESCE(t.count, 0) AS count,
        COALESCE(t.active_count, 0) AS active_count,
        COALESCE(t.shipping_count, 0) AS shipping_count,
        COALESCE(t.total_mw, 0::numeric) AS total_mw,
        COALESCE(t.distinct_contract_types, 0) AS distinct_contract_types
      FROM months m
      LEFT JOIN trend_raw t ON t.month = m.month
    ),
    scoped AS (
      SELECT * FROM base
      WHERE
        (p_status_scope = 'lifetime')
        OR (p_status_scope = 'active' AND is_active)
        OR (p_status_scope = 'shipping' AND is_shipping)
    ),
    scoped_total AS (SELECT count(*)::int AS n FROM scoped),
    by_status_raw AS (
      SELECT
        status AS key,
        CASE status
          WHEN 'contracted' THEN '계약'
          WHEN 'in_progress' THEN '진행'
          WHEN 'shipping' THEN '운송중'
          WHEN 'completed' THEN '완료'
          WHEN 'cancelled' THEN '취소'
          ELSE status
        END AS label,
        count(*)::int AS count,
        COALESCE(sum(total_mw), 0)::numeric AS total_mw
      FROM scoped GROUP BY status
    ),
    by_status AS (
      SELECT s.key, s.label, s.count, s.total_mw,
        CASE WHEN st.n > 0 THEN s.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_status_raw s, scoped_total st
      ORDER BY s.count DESC, s.total_mw DESC
    ),
    by_ct_raw AS (
      SELECT
        contract_type AS key,
        CASE contract_type
          WHEN 'spot' THEN '스팟'
          WHEN 'frame' THEN '프레임'
          ELSE contract_type
        END AS label,
        count(*)::int AS count,
        COALESCE(sum(total_mw), 0)::numeric AS total_mw
      FROM scoped GROUP BY contract_type
    ),
    by_contract_type AS (
      SELECT c.key, c.label, c.count, c.total_mw,
        CASE WHEN st.n > 0 THEN c.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_ct_raw c, scoped_total st
      ORDER BY c.count DESC
    ),
    by_mfg_raw AS (
      SELECT
        COALESCE(manufacturer_id::text, '__unset__') AS key,
        COALESCE(manufacturer_name, '미지정') AS label,
        count(*)::int AS count,
        COALESCE(sum(total_mw), 0)::numeric AS total_mw
      FROM scoped GROUP BY manufacturer_id, manufacturer_name
    ),
    by_mfg_top10 AS (
      SELECT m.key, m.label, m.count, m.total_mw,
        CASE WHEN st.n > 0 THEN m.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_mfg_raw m, scoped_total st
      ORDER BY m.count DESC, m.total_mw DESC
      LIMIT 10
    )
  SELECT jsonb_build_object(
    'totals', (SELECT row_to_json(t.*)::jsonb FROM totals t),
    'trend24', (SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY month), '[]'::jsonb) FROM trend24_arr x),
    'status_scope', p_status_scope,
    'by_status', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_status x),
    'by_contract_type', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_contract_type x),
    'by_manufacturer_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_mfg_top10 x)
  )
  INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION pos_dashboard(uuid, uuid, text, text, text)
  TO anon, authenticated, service_role;
