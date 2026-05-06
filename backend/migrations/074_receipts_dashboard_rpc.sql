-- 074: receipts_dashboard() RPC — sales_dashboard 패턴 동일.
-- 운영 측정 receipts/dashboard avg 881ms / max 5200ms — DB-side 집계로 ~50-150ms 목표.
--
-- 응답 셰이프는 ReceiptDashboard struct (handler/tx_receipt_dashboard.go) 와 1:1:
--   { totals, trend24[], by_customer_top10[], by_match_status[] }

CREATE OR REPLACE FUNCTION receipts_dashboard(
  p_company_id   uuid DEFAULT NULL,
  p_customer_id  uuid DEFAULT NULL,
  p_month        text DEFAULT NULL,    -- YYYY-MM
  p_start        date DEFAULT NULL,
  p_end          date DEFAULT NULL
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
        r.receipt_id,
        r.customer_id,
        r.receipt_date,
        r.amount,
        r.matched_total,
        r.remaining,
        GREATEST(r.amount - r.remaining, 0) AS matched_amount,
        CASE
          WHEN r.matched_total > 0 AND r.remaining <= 0 THEN 'matched'
          WHEN r.matched_total > 0 AND r.remaining  > 0 THEN 'partial'
          ELSE 'unmatched'
        END AS match_status,
        p.partner_name AS customer_name
      FROM receipts r
      LEFT JOIN partners p ON p.partner_id = r.customer_id
      WHERE
        (p_company_id IS NULL)  -- receipts 테이블에 company_id 직접 없음 (List 도 무시)
        AND (p_customer_id IS NULL OR r.customer_id = p_customer_id)
        AND (p_month IS NULL OR r.receipt_date::text LIKE p_month || '%')
        AND (p_start IS NULL OR r.receipt_date >= p_start)
        AND (p_end   IS NULL OR r.receipt_date <= p_end)
    ),
    months AS (
      SELECT to_char(date_trunc('month', v_now) - (gs * interval '1 month'), 'YYYY-MM') AS month
      FROM generate_series(0, 23) gs
    ),
    totals AS (
      SELECT
        count(*)::int AS count,
        COALESCE(sum(amount), 0)::numeric AS amount_sum,
        COALESCE(sum(matched_amount), 0)::numeric AS matched_sum,
        COALESCE(sum(remaining), 0)::numeric AS remaining_sum,
        count(*) FILTER (WHERE match_status = 'matched')::int AS matched_count,
        count(*) FILTER (WHERE match_status = 'partial')::int AS partial_match_count,
        count(*) FILTER (WHERE match_status = 'unmatched')::int AS unmatched_count,
        count(DISTINCT customer_id)::int AS customers_count,
        CASE WHEN COALESCE(sum(amount), 0) > 0
          THEN (sum(matched_amount) / sum(amount) * 100)::numeric
          ELSE 0::numeric
        END AS recovery_rate
      FROM base
    ),
    trend_raw AS (
      SELECT
        to_char(receipt_date, 'YYYY-MM') AS month,
        count(*)::int AS count,
        COALESCE(sum(amount), 0)::numeric AS amount_sum,
        COALESCE(sum(remaining), 0)::numeric AS remaining_sum,
        COALESCE(sum(matched_amount), 0)::numeric AS matched_sum,
        count(*) FILTER (WHERE match_status = 'partial')::int AS partial_count,
        CASE WHEN COALESCE(sum(amount), 0) > 0
          THEN (sum(matched_amount) / sum(amount) * 100)::numeric
          ELSE 0::numeric
        END AS recovery_rate
      FROM base
      GROUP BY 1
    ),
    trend24_arr AS (
      SELECT
        m.month,
        COALESCE(t.count, 0) AS count,
        COALESCE(t.amount_sum, 0::numeric) AS amount_sum,
        COALESCE(t.remaining_sum, 0::numeric) AS remaining_sum,
        COALESCE(t.matched_sum, 0::numeric) AS matched_sum,
        COALESCE(t.partial_count, 0) AS partial_count,
        COALESCE(t.recovery_rate, 0::numeric) AS recovery_rate
      FROM months m
      LEFT JOIN trend_raw t ON t.month = m.month
    ),
    by_customer_raw AS (
      SELECT
        COALESCE(customer_id::text, '__unset__') AS key,
        COALESCE(customer_name, '미지정') AS label,
        count(*)::int AS count,
        COALESCE(sum(amount), 0)::numeric AS amount_sum,
        COALESCE(sum(remaining), 0)::numeric AS remaining_sum,
        COALESCE(sum(matched_amount), 0)::numeric AS matched_sum,
        count(*) FILTER (WHERE match_status = 'partial')::int AS partial_match_count
      FROM base
      GROUP BY customer_id, customer_name
    ),
    base_total AS (SELECT count(*)::int AS n FROM base),
    by_customer_top10 AS (
      SELECT
        c.key, c.label, c.count, c.amount_sum, c.remaining_sum, c.matched_sum, c.partial_match_count,
        CASE WHEN c.count >= 3 AND c.amount_sum > 0
          THEN (c.matched_sum / c.amount_sum * 100)::numeric
          ELSE 0::numeric
        END AS recovery_rate,
        CASE WHEN bt.n > 0 THEN c.count::numeric / bt.n ELSE 0::numeric END AS share
      FROM by_customer_raw c, base_total bt
      ORDER BY c.amount_sum DESC, c.count DESC
      LIMIT 10
    ),
    by_status_raw AS (
      SELECT
        ms AS key,
        CASE ms
          WHEN 'matched'   THEN '완전 매칭'
          WHEN 'partial'   THEN '부분 매칭'
          WHEN 'unmatched' THEN '미매칭'
        END AS label,
        count(*)::int AS count,
        COALESCE(sum(amount), 0)::numeric AS amount_sum,
        COALESCE(sum(remaining), 0)::numeric AS remaining_sum,
        COALESCE(sum(matched_amount), 0)::numeric AS matched_sum,
        0::int AS partial_match_count
      FROM (SELECT unnest(ARRAY['matched', 'partial', 'unmatched']) AS ms) status_keys
      LEFT JOIN base ON base.match_status = status_keys.ms
      GROUP BY ms
    ),
    by_match_status AS (
      SELECT
        s.key, s.label, s.count, s.amount_sum, s.remaining_sum, s.matched_sum, s.partial_match_count,
        CASE WHEN s.amount_sum > 0
          THEN (s.matched_sum / s.amount_sum * 100)::numeric
          ELSE 0::numeric
        END AS recovery_rate,
        CASE WHEN bt.n > 0 THEN s.count::numeric / bt.n ELSE 0::numeric END AS share
      FROM by_status_raw s, base_total bt
      ORDER BY array_position(ARRAY['matched', 'partial', 'unmatched'], s.key)
    )
  SELECT jsonb_build_object(
    'totals', (SELECT row_to_json(t.*)::jsonb FROM totals t),
    'trend24', (
      SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY month), '[]'::jsonb)
      FROM trend24_arr x
    ),
    'by_customer_top10', (
      SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb)
      FROM by_customer_top10 x
    ),
    'by_match_status', (
      SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb)
      FROM by_match_status x
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION receipts_dashboard(uuid, uuid, text, date, date)
  TO anon, authenticated, service_role;
