-- @auto-apply: yes
-- 082: customs_dashboard() RPC. CustomsPage 4개 insight (TypeCount/AvgExpense/BlLinked/ExpenseTotal)
-- 의 client-side 집계를 SQL 한 round-trip 으로 대체.
-- 데이터 소스: incidental_expenses + bl_shipments(BL 번호 join).

CREATE OR REPLACE FUNCTION customs_dashboard(
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
    base AS (
      SELECT
        ie.expense_id,
        ie.bl_id,
        bl.bl_number,
        ie.month,
        ie.expense_type,
        ie.amount,
        ie.vat,
        ie.total,
        ie.vendor,
        -- month 가 비어있으면 created_at 으로 fallback
        COALESCE(
          NULLIF(ie.month, ''),
          to_char(ie.created_at::date, 'YYYY-MM')
        ) AS effective_month
      FROM incidental_expenses ie
      LEFT JOIN bl_shipments bl ON bl.bl_id = ie.bl_id
      WHERE p_company_id IS NULL OR ie.company_id = p_company_id
    ),
    months AS (
      SELECT to_char(date_trunc('month', v_now) - (gs * interval '1 month'), 'YYYY-MM') AS month
      FROM generate_series(0, 23) gs
    ),
    -- amount = COALESCE(total, amount, 0) — frontend 와 동일 (e.total ?? e.amount ?? 0)
    base_amt AS (
      SELECT b.*, COALESCE(b.total, b.amount, 0)::numeric AS effective_amount
      FROM base b
    ),
    totals AS (
      SELECT
        count(*)::int AS count,
        COALESCE(sum(effective_amount), 0)::numeric AS sum_amount,
        CASE WHEN count(*) > 0 THEN COALESCE(sum(effective_amount), 0)::numeric / count(*) ELSE 0::numeric END AS avg_amount,
        count(DISTINCT expense_type)::int AS distinct_type_count,
        count(*) FILTER (WHERE bl_id IS NOT NULL)::int AS bl_linked_count
      FROM base_amt
    ),
    trend_raw AS (
      SELECT
        effective_month AS month,
        count(*)::int AS count,
        COALESCE(sum(effective_amount), 0)::numeric AS sum_amount,
        count(*) FILTER (WHERE bl_id IS NOT NULL)::int AS bl_linked_count,
        COUNT(DISTINCT expense_type)::int AS distinct_types
      FROM base_amt
      WHERE effective_month IS NOT NULL
      GROUP BY 1
    ),
    trend24_arr AS (
      SELECT
        m.month,
        COALESCE(t.count, 0) AS count,
        COALESCE(t.sum_amount, 0::numeric) AS sum_amount,
        COALESCE(t.bl_linked_count, 0) AS bl_linked_count,
        COALESCE(t.distinct_types, 0) AS distinct_types,
        CASE WHEN COALESCE(t.count, 0) > 0
             THEN COALESCE(t.sum_amount, 0::numeric) / t.count
             ELSE 0::numeric END AS avg_amount
      FROM months m
      LEFT JOIN trend_raw t ON t.month = m.month
    ),
    base_count AS (SELECT count(*)::int AS n FROM base_amt),
    by_type_raw AS (
      SELECT
        expense_type AS key,
        expense_type AS label,
        count(*)::int AS count,
        COALESCE(sum(effective_amount), 0)::numeric AS sum_amount,
        CASE WHEN count(*) > 0 THEN COALESCE(sum(effective_amount), 0)::numeric / count(*) ELSE 0::numeric END AS avg_amount
      FROM base_amt
      GROUP BY expense_type
    ),
    by_type AS (
      SELECT t.key, t.label, t.count, t.sum_amount, t.avg_amount,
        CASE WHEN bc.n > 0 THEN t.count::numeric / bc.n ELSE 0::numeric END AS share
      FROM by_type_raw t, base_count bc
      ORDER BY t.sum_amount DESC, t.count DESC
    ),
    by_bl_raw AS (
      SELECT
        COALESCE(bl_id::text, '__unset__') AS key,
        COALESCE(bl_number, '미연결') AS label,
        count(*)::int AS count,
        COALESCE(sum(effective_amount), 0)::numeric AS sum_amount,
        CASE WHEN count(*) > 0 THEN COALESCE(sum(effective_amount), 0)::numeric / count(*) ELSE 0::numeric END AS avg_amount
      FROM base_amt
      GROUP BY bl_id, bl_number
    ),
    by_bl_top10 AS (
      SELECT b.key, b.label, b.count, b.sum_amount, b.avg_amount,
        CASE WHEN bc.n > 0 THEN b.count::numeric / bc.n ELSE 0::numeric END AS share
      FROM by_bl_raw b, base_count bc
      ORDER BY b.sum_amount DESC, b.count DESC
      LIMIT 10
    ),
    by_bl_avg_top10 AS (
      SELECT b.key, b.label, b.count, b.sum_amount, b.avg_amount,
        CASE WHEN bc.n > 0 THEN b.count::numeric / bc.n ELSE 0::numeric END AS share
      FROM by_bl_raw b, base_count bc
      WHERE b.count >= 3
      ORDER BY b.avg_amount DESC, b.count DESC
      LIMIT 10
    ),
    by_vendor_raw AS (
      SELECT
        COALESCE(NULLIF(vendor, ''), '__unset__') AS key,
        COALESCE(NULLIF(vendor, ''), '미지정') AS label,
        count(*)::int AS count,
        COALESCE(sum(effective_amount), 0)::numeric AS sum_amount,
        CASE WHEN count(*) > 0 THEN COALESCE(sum(effective_amount), 0)::numeric / count(*) ELSE 0::numeric END AS avg_amount
      FROM base_amt
      GROUP BY vendor
    ),
    by_vendor_top10 AS (
      SELECT v.key, v.label, v.count, v.sum_amount, v.avg_amount,
        CASE WHEN bc.n > 0 THEN v.count::numeric / bc.n ELSE 0::numeric END AS share
      FROM by_vendor_raw v, base_count bc
      ORDER BY v.sum_amount DESC, v.count DESC
      LIMIT 10
    ),
    by_vendor_avg_top10 AS (
      SELECT v.key, v.label, v.count, v.sum_amount, v.avg_amount,
        CASE WHEN bc.n > 0 THEN v.count::numeric / bc.n ELSE 0::numeric END AS share
      FROM by_vendor_raw v, base_count bc
      WHERE v.count >= 3
      ORDER BY v.avg_amount DESC, v.count DESC
      LIMIT 10
    )
  SELECT jsonb_build_object(
    'totals', (SELECT row_to_json(t.*)::jsonb FROM totals t),
    'trend24', (SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY month), '[]'::jsonb) FROM trend24_arr x),
    'by_type', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_type x),
    'by_bl_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_bl_top10 x),
    'by_bl_avg_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_bl_avg_top10 x),
    'by_vendor_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_vendor_top10 x),
    'by_vendor_avg_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_vendor_avg_top10 x)
  )
  INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION customs_dashboard(uuid)
  TO anon, authenticated, service_role;
