-- @auto-apply: yes
-- 111: receipts.company_id 기반 수금 대시보드/원클릭 수금완료 정합성 복구.
--
-- 096에서 receipts.company_id가 추가됐지만 074/104 receipts_dashboard()는
-- (p_company_id IS NULL) 조건을 유지해 회사 필터가 들어오면 항상 빈 집계가 됐다.
-- 또한 기존 원클릭 수금완료로 생성된 receipt는 company_id가 NULL일 수 있으므로
-- receipt_matches -> sales/outbounds/orders 경로에서 회사가 1개로 확정되는 row만 audit 후 보정한다.

CREATE TABLE IF NOT EXISTS _receipts_company_backfill_audit_20260512 (
  audit_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id     uuid NOT NULL UNIQUE,
  old_company_id uuid,
  new_company_id uuid NOT NULL,
  matched_paths  int NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

WITH match_companies AS (
  SELECT rm.receipt_id, o.company_id
  FROM receipt_matches rm
  JOIN outbounds o ON o.outbound_id = rm.outbound_id
  WHERE o.company_id IS NOT NULL

  UNION ALL

  SELECT rm.receipt_id, o.company_id
  FROM receipt_matches rm
  JOIN sales s ON s.sale_id = rm.sale_id
  JOIN outbounds o ON o.outbound_id = s.outbound_id
  WHERE o.company_id IS NOT NULL

  UNION ALL

  SELECT rm.receipt_id, ord.company_id
  FROM receipt_matches rm
  JOIN sales s ON s.sale_id = rm.sale_id
  JOIN orders ord ON ord.order_id = s.order_id
  WHERE ord.company_id IS NOT NULL
),
resolved AS (
  SELECT
    receipt_id,
    min(company_id) AS company_id,
    count(*) AS matched_paths,
    count(DISTINCT company_id) AS company_count
  FROM match_companies
  GROUP BY receipt_id
),
affected AS (
  SELECT
    r.receipt_id,
    r.company_id AS old_company_id,
    resolved.company_id AS new_company_id,
    resolved.matched_paths
  FROM receipts r
  JOIN resolved ON resolved.receipt_id = r.receipt_id
  WHERE r.company_id IS NULL
    AND resolved.company_count = 1
    AND resolved.company_id IS NOT NULL
),
audit AS (
  INSERT INTO _receipts_company_backfill_audit_20260512 (
    receipt_id, old_company_id, new_company_id, matched_paths
  )
  SELECT receipt_id, old_company_id, new_company_id, matched_paths
  FROM affected
  ON CONFLICT (receipt_id) DO NOTHING
  RETURNING receipt_id, new_company_id
)
UPDATE receipts r
SET company_id = audit.new_company_id
FROM audit
WHERE r.receipt_id = audit.receipt_id
  AND r.company_id IS NULL;

CREATE OR REPLACE FUNCTION receipts_dashboard(
  p_company_id   uuid DEFAULT NULL,
  p_customer_id  uuid DEFAULT NULL,
  p_month        text DEFAULT NULL,
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
        COALESCE(rm.matched_total, 0)                         AS matched_total,
        GREATEST(r.amount - COALESCE(rm.matched_total, 0), 0) AS remaining,
        LEAST(COALESCE(rm.matched_total, 0), r.amount)        AS matched_amount,
        CASE
          WHEN COALESCE(rm.matched_total, 0) > 0
               AND r.amount - COALESCE(rm.matched_total, 0) <= 0 THEN 'matched'
          WHEN COALESCE(rm.matched_total, 0) > 0
               AND r.amount - COALESCE(rm.matched_total, 0)  > 0 THEN 'partial'
          ELSE 'unmatched'
        END AS match_status,
        p.partner_name AS customer_name
      FROM receipts r
      LEFT JOIN (
        SELECT receipt_id, SUM(matched_amount) AS matched_total
        FROM receipt_matches
        GROUP BY receipt_id
      ) rm ON rm.receipt_id = r.receipt_id
      LEFT JOIN partners p ON p.partner_id = r.customer_id
      WHERE
        (p_company_id IS NULL OR r.company_id = p_company_id)
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
