-- 079: tts_dashboard() RPC. 응답 셰이프 TTDashboard struct 와 1:1.
-- TT 는 purchase_orders / manufacturers join 으로 manufacturer_name + po_number 도 함께.

CREATE OR REPLACE FUNCTION tts_dashboard(
  p_company_id   uuid DEFAULT NULL,
  p_status       text DEFAULT NULL,
  p_po_id        uuid DEFAULT NULL,
  p_status_scope text DEFAULT 'lifetime'  -- lifetime | completed | planned
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
        tt.tt_id,
        tt.po_id,
        tt.remit_date,
        tt.amount_usd,
        tt.purpose,
        tt.status,
        tt.bank_name,
        po.po_number,
        m.name_kr AS manufacturer_name
      FROM tt_remittances tt
      LEFT JOIN purchase_orders po ON po.po_id = tt.po_id
      LEFT JOIN manufacturers m ON m.manufacturer_id = po.manufacturer_id
      WHERE
        (p_company_id IS NULL OR po.company_id = p_company_id)
        AND (p_status IS NULL OR tt.status = p_status)
        AND (p_po_id IS NULL OR tt.po_id = p_po_id)
    ),
    months AS (
      SELECT to_char(date_trunc('month', v_now) - (gs * interval '1 month'), 'YYYY-MM') AS month
      FROM generate_series(0, 23) gs
    ),
    totals AS (
      SELECT
        count(*)::int AS count,
        count(*) FILTER (WHERE status = 'completed')::int AS completed_count,
        count(*) FILTER (WHERE status = 'planned')::int AS planned_count,
        COALESCE(sum(amount_usd) FILTER (WHERE status = 'completed'), 0)::numeric AS completed_amount_usd,
        COALESCE(sum(amount_usd) FILTER (WHERE status = 'planned'), 0)::numeric AS planned_amount_usd,
        COALESCE(sum(amount_usd), 0)::numeric AS total_amount_usd,
        count(DISTINCT po_id) FILTER (WHERE po_id IS NOT NULL)::int AS po_count
      FROM base
    ),
    trend_raw AS (
      SELECT
        to_char(remit_date::date, 'YYYY-MM') AS month,
        count(*)::int AS count,
        count(*) FILTER (WHERE status = 'completed')::int AS completed_count,
        count(*) FILTER (WHERE status = 'planned')::int AS planned_count,
        COALESCE(sum(amount_usd) FILTER (WHERE status = 'completed'), 0)::numeric AS completed_amount_usd,
        COALESCE(sum(amount_usd) FILTER (WHERE status = 'planned'), 0)::numeric AS planned_amount_usd,
        count(DISTINCT po_id) FILTER (WHERE po_id IS NOT NULL)::int AS distinct_pos
      FROM base
      WHERE remit_date IS NOT NULL
      GROUP BY 1
    ),
    trend24_arr AS (
      SELECT
        m.month,
        COALESCE(t.count, 0) AS count,
        COALESCE(t.completed_count, 0) AS completed_count,
        COALESCE(t.planned_count, 0) AS planned_count,
        COALESCE(t.completed_amount_usd, 0::numeric) AS completed_amount_usd,
        COALESCE(t.planned_amount_usd, 0::numeric) AS planned_amount_usd,
        COALESCE(t.distinct_pos, 0) AS distinct_pos
      FROM months m
      LEFT JOIN trend_raw t ON t.month = m.month
    ),
    scoped AS (
      SELECT * FROM base
      WHERE
        (p_status_scope = 'lifetime')
        OR (p_status_scope = 'completed' AND status = 'completed')
        OR (p_status_scope = 'planned' AND status = 'planned')
    ),
    scoped_total AS (SELECT count(*)::int AS n FROM scoped),
    by_status_raw AS (
      SELECT
        status AS key,
        CASE status WHEN 'planned' THEN '예정' WHEN 'completed' THEN '완료' ELSE status END AS label,
        count(*)::int AS count,
        COALESCE(sum(amount_usd), 0)::numeric AS amount_usd_sum
      FROM scoped GROUP BY status
    ),
    by_status AS (
      SELECT s.key, s.label, s.count, s.amount_usd_sum,
        CASE WHEN st.n > 0 THEN s.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_status_raw s, scoped_total st ORDER BY s.amount_usd_sum DESC, s.count DESC
    ),
    by_mfg_raw AS (
      SELECT
        COALESCE(NULLIF(manufacturer_name, ''), '__unset__') AS key,
        COALESCE(manufacturer_name, '미지정') AS label,
        count(*)::int AS count,
        COALESCE(sum(amount_usd), 0)::numeric AS amount_usd_sum
      FROM scoped GROUP BY manufacturer_name
    ),
    by_mfg_top10 AS (
      SELECT m.key, m.label, m.count, m.amount_usd_sum,
        CASE WHEN st.n > 0 THEN m.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_mfg_raw m, scoped_total st ORDER BY m.amount_usd_sum DESC, m.count DESC LIMIT 10
    ),
    by_bank_raw AS (
      SELECT
        COALESCE(NULLIF(bank_name, ''), '__unset__') AS key,
        COALESCE(bank_name, '미지정') AS label,
        count(*)::int AS count,
        COALESCE(sum(amount_usd), 0)::numeric AS amount_usd_sum
      FROM scoped GROUP BY bank_name
    ),
    by_bank_top10 AS (
      SELECT b.key, b.label, b.count, b.amount_usd_sum,
        CASE WHEN st.n > 0 THEN b.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_bank_raw b, scoped_total st ORDER BY b.amount_usd_sum DESC, b.count DESC LIMIT 10
    ),
    by_purpose_raw AS (
      SELECT
        COALESCE(NULLIF(purpose, ''), '__unset__') AS key,
        COALESCE(purpose, '용도 미지정') AS label,
        count(*)::int AS count,
        COALESCE(sum(amount_usd), 0)::numeric AS amount_usd_sum
      FROM scoped GROUP BY purpose
    ),
    by_purpose_top10 AS (
      SELECT p.key, p.label, p.count, p.amount_usd_sum,
        CASE WHEN st.n > 0 THEN p.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_purpose_raw p, scoped_total st ORDER BY p.amount_usd_sum DESC, p.count DESC LIMIT 10
    ),
    by_po_raw AS (
      SELECT
        COALESCE(po_id::text, '__unset__') AS key,
        COALESCE(po_number, substr(po_id::text, 1, 8)) AS label,
        count(*)::int AS count,
        COALESCE(sum(amount_usd), 0)::numeric AS amount_usd_sum
      FROM scoped GROUP BY po_id, po_number
    ),
    by_po_top10 AS (
      SELECT p.key, p.label, p.count, p.amount_usd_sum,
        CASE WHEN st.n > 0 THEN p.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_po_raw p, scoped_total st ORDER BY p.amount_usd_sum DESC, p.count DESC LIMIT 10
    )
  SELECT jsonb_build_object(
    'totals', (SELECT row_to_json(t.*)::jsonb FROM totals t),
    'trend24', (SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY month), '[]'::jsonb) FROM trend24_arr x),
    'status_scope', p_status_scope,
    'by_status', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_status x),
    'by_manufacturer_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_mfg_top10 x),
    'by_bank_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_bank_top10 x),
    'by_purpose_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_purpose_top10 x),
    'by_po_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_po_top10 x)
  )
  INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION tts_dashboard(uuid, text, uuid, text)
  TO anon, authenticated, service_role;
