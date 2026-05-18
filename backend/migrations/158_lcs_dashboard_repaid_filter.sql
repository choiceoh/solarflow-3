-- M158: lcs_dashboard RPC 의 is_maturity_soon / is_overdue 플래그 필터 정정 (M155 후속)
--
-- 배경:
--   M078 의 lcs_dashboard 가 maturity_soon / overdue 판정을
--     status <> 'settled' AND coalesce(repaid, false) = false
--   로 묶고 있어, usance LC 의 정상 흐름(status='settled' → repaid 전 한도 점유)
--   에서 만기/연체 알림이 전부 빠짐. M155 (banking_dashboard) 와 동일한 의미 버그.
--
-- 수정:
--   coalesce(repaid, false) = false AND status <> 'cancelled' 로 통일.
--   = "아직 상환 안 됐고 취소되지도 않은 LC".
--
-- 영향:
--   - totals.maturity_soon_count / overdue_count 가 정확해짐
--   - status_scope='maturity_soon' 으로 호출 시 by_status / by_bank_top10 / by_urgency
--     집계도 정정
--   - is_active 정의(lc.status <> 'cancelled') 는 기존 유지 — 이미 옳음

CREATE OR REPLACE FUNCTION lcs_dashboard(
  p_company_id   uuid DEFAULT NULL,
  p_po_id        uuid DEFAULT NULL,
  p_bank_id      uuid DEFAULT NULL,
  p_status       text DEFAULT NULL,
  p_status_scope text DEFAULT 'lifetime'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now date := current_date;
  v_horizon_start date := current_date - INTERVAL '30 days';
  v_horizon_end   date := current_date + INTERVAL '30 days';
  v_result jsonb;
BEGIN
  WITH
    base AS (
      SELECT
        lc.lc_id,
        lc.bank_id,
        lc.open_date,
        lc.maturity_date,
        lc.amount_usd,
        lc.status,
        lc.repaid,
        b.bank_name,
        (lc.status <> 'cancelled') AS is_active,
        -- maturity_soon: 미상환·미취소 + maturity_date 가 오늘 ± 30일 (overdue 포함).
        (coalesce(lc.repaid, false) = false AND lc.status <> 'cancelled'
          AND lc.maturity_date IS NOT NULL
          AND lc.maturity_date BETWEEN v_horizon_start AND v_horizon_end) AS is_maturity_soon,
        -- overdue: 미상환·미취소 + maturity_date 가 이미 지남.
        (coalesce(lc.repaid, false) = false AND lc.status <> 'cancelled'
          AND lc.maturity_date IS NOT NULL
          AND lc.maturity_date < v_now) AS is_overdue
      FROM lc_records lc
      LEFT JOIN banks b ON b.bank_id = lc.bank_id
      WHERE
        (p_company_id IS NULL OR lc.company_id = p_company_id)
        AND (p_po_id IS NULL OR lc.po_id = p_po_id)
        AND (p_bank_id IS NULL OR lc.bank_id = p_bank_id)
        AND (p_status IS NULL OR lc.status = p_status)
    ),
    months AS (
      SELECT to_char(date_trunc('month', v_now) - (gs * interval '1 month'), 'YYYY-MM') AS month
      FROM generate_series(0, 23) gs
    ),
    totals AS (
      SELECT
        count(*)::int AS count,
        count(*) FILTER (WHERE is_active)::int AS active_count,
        count(*) FILTER (WHERE status = 'opened')::int AS opened_count,
        count(*) FILTER (WHERE status = 'settled')::int AS settled_count,
        count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
        COALESCE(sum(amount_usd), 0)::numeric AS total_amount_usd,
        COALESCE(sum(amount_usd) FILTER (WHERE is_active), 0)::numeric AS active_amount_usd,
        count(DISTINCT bank_id) FILTER (WHERE bank_id IS NOT NULL)::int AS banks_count,
        count(*) FILTER (WHERE is_maturity_soon)::int AS maturity_soon_count,
        count(*) FILTER (WHERE is_overdue)::int AS overdue_count
      FROM base
    ),
    trend_raw AS (
      SELECT
        to_char(open_date, 'YYYY-MM') AS month,
        count(*)::int AS count,
        count(*) FILTER (WHERE is_active)::int AS active_count,
        COALESCE(sum(amount_usd), 0)::numeric AS amount_usd,
        count(DISTINCT bank_id) FILTER (WHERE bank_id IS NOT NULL)::int AS distinct_banks
      FROM base
      WHERE open_date IS NOT NULL
      GROUP BY 1
    ),
    trend24_arr AS (
      SELECT
        m.month,
        COALESCE(t.count, 0) AS count,
        COALESCE(t.active_count, 0) AS active_count,
        COALESCE(t.amount_usd, 0::numeric) AS amount_usd,
        COALESCE(t.distinct_banks, 0) AS distinct_banks
      FROM months m
      LEFT JOIN trend_raw t ON t.month = m.month
    ),
    scoped AS (
      SELECT * FROM base
      WHERE
        (p_status_scope = 'lifetime')
        OR (p_status_scope = 'active' AND is_active)
        OR (p_status_scope = 'maturity_soon' AND is_maturity_soon)
    ),
    scoped_total AS (SELECT count(*)::int AS n FROM scoped),
    by_status_raw AS (
      SELECT
        status AS key,
        CASE status
          WHEN 'opened' THEN '개설'
          WHEN 'settled' THEN '정산'
          WHEN 'cancelled' THEN '취소'
          ELSE status
        END AS label,
        count(*)::int AS count,
        COALESCE(sum(amount_usd), 0)::numeric AS amount_usd_sum
      FROM scoped GROUP BY status
    ),
    by_status AS (
      SELECT s.key, s.label, s.count, s.amount_usd_sum,
        CASE WHEN st.n > 0 THEN s.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_status_raw s, scoped_total st
      ORDER BY s.amount_usd_sum DESC, s.count DESC
    ),
    by_bank_raw AS (
      SELECT
        COALESCE(bank_id::text, '__unset__') AS key,
        COALESCE(bank_name, '미지정') AS label,
        count(*)::int AS count,
        COALESCE(sum(amount_usd), 0)::numeric AS amount_usd_sum
      FROM scoped GROUP BY bank_id, bank_name
    ),
    by_bank_top10 AS (
      SELECT b.key, b.label, b.count, b.amount_usd_sum,
        CASE WHEN st.n > 0 THEN b.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_bank_raw b, scoped_total st
      ORDER BY b.amount_usd_sum DESC, b.count DESC
      LIMIT 10
    ),
    urgency_raw AS (
      SELECT
        CASE
          WHEN maturity_date < v_now THEN 'overdue'
          WHEN maturity_date <= v_now + INTERVAL '7 days' THEN 'urgent'
          WHEN maturity_date <= v_now + INTERVAL '14 days' THEN 'soon14'
          ELSE 'later'
        END AS key,
        count(*)::int AS count,
        COALESCE(sum(amount_usd), 0)::numeric AS amount_usd_sum
      FROM scoped
      WHERE p_status_scope = 'maturity_soon' AND maturity_date IS NOT NULL
      GROUP BY 1
    ),
    urgency_keys AS (
      SELECT unnest(ARRAY['overdue', 'urgent', 'soon14', 'later']) AS k
    ),
    by_urgency AS (
      SELECT
        uk.k AS key,
        CASE uk.k
          WHEN 'overdue' THEN '연체'
          WHEN 'urgent' THEN '긴급 (7일 이내)'
          WHEN 'soon14' THEN '주의 (8~14일)'
          WHEN 'later' THEN '여유 (15~30일)'
        END AS label,
        COALESCE(ur.count, 0) AS count,
        COALESCE(ur.amount_usd_sum, 0::numeric) AS amount_usd_sum,
        CASE WHEN st.n > 0 THEN COALESCE(ur.count, 0)::numeric / st.n ELSE 0::numeric END AS share
      FROM urgency_keys uk
      LEFT JOIN urgency_raw ur ON ur.key = uk.k
      , scoped_total st
      ORDER BY array_position(ARRAY['overdue', 'urgent', 'soon14', 'later'], uk.k)
    )
  SELECT jsonb_build_object(
    'totals', (SELECT row_to_json(t.*)::jsonb FROM totals t),
    'trend24', (SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY month), '[]'::jsonb) FROM trend24_arr x),
    'status_scope', p_status_scope,
    'by_status', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_status x),
    'by_bank_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_bank_top10 x),
    'by_urgency', CASE WHEN p_status_scope = 'maturity_soon'
      THEN (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_urgency x)
      ELSE '[]'::jsonb
    END
  )
  INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION lcs_dashboard(uuid, uuid, uuid, text, text)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
