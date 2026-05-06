-- 080: bls_dashboard() RPC. 응답 셰이프 BLDashboard struct 와 1:1.
-- bin date 우선순위: actual_arrival > eta > etd

CREATE OR REPLACE FUNCTION bls_dashboard(
  p_company_id      uuid DEFAULT NULL,
  p_manufacturer_id uuid DEFAULT NULL,
  p_status          text DEFAULT NULL,
  p_inbound_type    text DEFAULT NULL,
  p_status_scope    text DEFAULT 'lifetime'  -- lifetime | import | shipping | customs
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
        bl.bl_id,
        bl.manufacturer_id,
        bl.inbound_type,
        bl.status,
        bl.etd,
        bl.eta,
        bl.actual_arrival,
        bl.port,
        bl.forwarder,
        bl.cif_amount_krw,
        m.name_kr AS manufacturer_name,
        COALESCE(bl.actual_arrival, bl.eta, bl.etd)::date AS bin_date
      FROM bl_shipments bl
      LEFT JOIN manufacturers m ON m.manufacturer_id = bl.manufacturer_id
      WHERE
        (p_company_id IS NULL OR bl.company_id = p_company_id)
        AND (p_manufacturer_id IS NULL OR bl.manufacturer_id = p_manufacturer_id)
        AND (p_status IS NULL OR bl.status = p_status)
        AND (p_inbound_type IS NULL OR bl.inbound_type = p_inbound_type)
    ),
    months AS (
      SELECT to_char(date_trunc('month', v_now) - (gs * interval '1 month'), 'YYYY-MM') AS month
      FROM generate_series(0, 23) gs
    ),
    totals AS (
      SELECT
        count(*)::int AS count,
        count(*) FILTER (WHERE inbound_type = 'import')::int AS import_count,
        count(*) FILTER (WHERE status IN ('shipping', 'arrived'))::int AS shipping_count,
        count(*) FILTER (WHERE status = 'customs')::int AS customs_count,
        count(*) FILTER (WHERE status = 'completed')::int AS completed_count,
        COALESCE(sum(cif_amount_krw), 0)::numeric AS cif_amount_krw
      FROM base
    ),
    trend_raw AS (
      SELECT
        to_char(bin_date, 'YYYY-MM') AS month,
        count(*)::int AS count,
        count(*) FILTER (WHERE inbound_type = 'import')::int AS import_count,
        count(*) FILTER (WHERE status IN ('shipping', 'arrived'))::int AS shipping_count,
        count(*) FILTER (WHERE status = 'customs')::int AS customs_count
      FROM base
      WHERE bin_date IS NOT NULL
      GROUP BY 1
    ),
    trend24_arr AS (
      SELECT
        m.month,
        COALESCE(t.count, 0) AS count,
        COALESCE(t.import_count, 0) AS import_count,
        COALESCE(t.shipping_count, 0) AS shipping_count,
        COALESCE(t.customs_count, 0) AS customs_count
      FROM months m
      LEFT JOIN trend_raw t ON t.month = m.month
    ),
    scoped AS (
      SELECT * FROM base
      WHERE
        (p_status_scope = 'lifetime')
        OR (p_status_scope = 'import' AND inbound_type = 'import')
        OR (p_status_scope = 'shipping' AND status IN ('shipping', 'arrived'))
        OR (p_status_scope = 'customs' AND status = 'customs')
    ),
    scoped_total AS (SELECT count(*)::int AS n FROM scoped),
    by_status_raw AS (
      SELECT
        status AS key,
        CASE status
          WHEN 'draft' THEN '초안'
          WHEN 'shipping' THEN '선적'
          WHEN 'arrived' THEN '입항'
          WHEN 'customs' THEN '통관중'
          WHEN 'completed' THEN '완료'
          WHEN 'cancelled' THEN '취소'
          ELSE status
        END AS label,
        count(*)::int AS count
      FROM scoped GROUP BY status
    ),
    by_status AS (
      SELECT s.key, s.label, s.count,
        CASE WHEN st.n > 0 THEN s.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_status_raw s, scoped_total st ORDER BY s.count DESC
    ),
    by_inbound_raw AS (
      SELECT
        inbound_type AS key,
        CASE inbound_type
          WHEN 'import' THEN '해외직수입'
          WHEN 'domestic' THEN '국내'
          WHEN 'intercompany' THEN '그룹내거래'
          WHEN 'transfer' THEN '창고이동'
          ELSE inbound_type
        END AS label,
        count(*)::int AS count
      FROM scoped GROUP BY inbound_type
    ),
    by_inbound_type AS (
      SELECT i.key, i.label, i.count,
        CASE WHEN st.n > 0 THEN i.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_inbound_raw i, scoped_total st ORDER BY i.count DESC
    ),
    by_mfg_raw AS (
      SELECT
        COALESCE(manufacturer_id::text, '__unset__') AS key,
        COALESCE(manufacturer_name, '미지정') AS label,
        count(*)::int AS count
      FROM scoped GROUP BY manufacturer_id, manufacturer_name
    ),
    by_mfg_top10 AS (
      SELECT m.key, m.label, m.count,
        CASE WHEN st.n > 0 THEN m.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_mfg_raw m, scoped_total st ORDER BY m.count DESC LIMIT 10
    ),
    by_port_raw AS (
      SELECT
        COALESCE(NULLIF(port, ''), '__unset__') AS key,
        COALESCE(port, '미지정') AS label,
        count(*)::int AS count
      FROM scoped GROUP BY port
    ),
    by_port_top10 AS (
      SELECT p.key, p.label, p.count,
        CASE WHEN st.n > 0 THEN p.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_port_raw p, scoped_total st ORDER BY p.count DESC LIMIT 10
    ),
    by_fwd_raw AS (
      SELECT
        COALESCE(NULLIF(forwarder, ''), '__unset__') AS key,
        COALESCE(forwarder, '미지정') AS label,
        count(*)::int AS count
      FROM scoped GROUP BY forwarder
    ),
    by_forwarder_top10 AS (
      SELECT f.key, f.label, f.count,
        CASE WHEN st.n > 0 THEN f.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_fwd_raw f, scoped_total st ORDER BY f.count DESC LIMIT 10
    )
  SELECT jsonb_build_object(
    'totals', (SELECT row_to_json(t.*)::jsonb FROM totals t),
    'trend24', (SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY month), '[]'::jsonb) FROM trend24_arr x),
    'status_scope', p_status_scope,
    'by_status', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_status x),
    'by_inbound_type', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_inbound_type x),
    'by_manufacturer_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_mfg_top10 x),
    'by_port_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_port_top10 x),
    'by_forwarder_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_forwarder_top10 x)
  )
  INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION bls_dashboard(uuid, uuid, text, text, text)
  TO anon, authenticated, service_role;
