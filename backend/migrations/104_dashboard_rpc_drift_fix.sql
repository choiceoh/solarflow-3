-- @auto-apply: yes
-- 104: receipts_dashboard / orders_dashboard RPC 스키마 드리프트 수정.
--
-- 증상 (운영 로그):
--   [수금 대시보드 RPC 실패 — fallback 사용] (42703) column r.matched_total does not exist
--   [수주 대시보드 RPC 실패 — fallback 사용] (42703) column o.wattage_kw does not exist
--
-- 원인: 074/075 는 LANGUAGE plpgsql 이라 CREATE 시 컬럼 참조가 검증되지 않음.
--   - receipts 에는 matched_total/remaining 컬럼이 없다 (Go enrich 가
--     receipt_matches.matched_amount SUM 으로 derive — tx_receipt.go:167-170).
--   - orders 에는 wattage_kw/spec_wp 컬럼이 없다 (products 에만 있고
--     Go enrich 가 product join 으로 채움 — domains/order/handler.go:509).
--
-- 수정 방향: 컬럼을 새로 만들지 않고 RPC 본문에서 derive.
--   - receipts_dashboard: receipt_matches 를 LEFT JOIN 으로 SUM 집계.
--   - orders_dashboard: 이미 있는 LEFT JOIN products prod 의 prod.* 참조.

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
      -- matched_total: receipt_matches.matched_amount 의 receipt 별 SUM.
      -- remaining: amount - matched_total (음수 clamp). Go enrich 와 동일 로직.
      SELECT
        r.receipt_id,
        r.customer_id,
        r.receipt_date,
        r.amount,
        COALESCE(rm.matched_total, 0)                          AS matched_total,
        GREATEST(r.amount - COALESCE(rm.matched_total, 0), 0)  AS remaining,
        LEAST(COALESCE(rm.matched_total, 0), r.amount)         AS matched_amount,
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
        (p_company_id IS NULL)  -- receipts.company_id 필터는 별건 (074 기존 동작 유지)
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


CREATE OR REPLACE FUNCTION orders_dashboard(
  p_company_id           uuid DEFAULT NULL,
  p_customer_id          uuid DEFAULT NULL,
  p_status               text DEFAULT NULL,
  p_management_category  text DEFAULT NULL,
  p_work_queue           text DEFAULT NULL,    -- delivery_soon | no_site
  p_q                    text DEFAULT NULL,
  p_status_scope         text DEFAULT 'lifetime'  -- lifetime | active | partial
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now date := current_date;
  v_recent_30 date := current_date - INTERVAL '30 days';
  v_delivery_horizon date := current_date + INTERVAL '7 days';
  v_result jsonb;
BEGIN
  WITH
    -- 1) wattage_kw / spec_wp 는 orders 가 아닌 products 에 있다. prod.* 참조로 정정.
    base AS (
      SELECT
        o.order_id,
        o.customer_id,
        o.product_id,
        o.order_date,
        o.delivery_due,
        o.remaining_qty,
        o.quantity,
        o.capacity_kw,
        prod.wattage_kw,
        prod.spec_wp,
        o.unit_price_wp,
        o.unit_price_ea,
        o.site_name,
        o.status,
        o.management_category,
        partner.partner_name AS customer_name,
        m.name_kr AS manufacturer_name,
        prod.manufacturer_id,
        -- effective kw: capacity_kw 우선, 없으면 quantity × prod.wattage_kw.
        COALESCE(o.capacity_kw, o.quantity * COALESCE(prod.wattage_kw, 0)) AS eff_kw,
        -- effective unit_price_wp: WP 우선, 없으면 EA/prod.spec_wp.
        CASE
          WHEN o.unit_price_wp > 0 THEN o.unit_price_wp
          WHEN prod.spec_wp > 0 AND o.unit_price_ea IS NOT NULL THEN o.unit_price_ea / prod.spec_wp
          ELSE 0
        END AS eff_uwp,
        (o.status NOT IN ('completed', 'cancelled')) AS is_active,
        (o.status IN ('received', 'partial')
          AND o.remaining_qty IS NOT NULL AND o.remaining_qty > 0
          AND o.delivery_due IS NOT NULL
          AND o.delivery_due BETWEEN v_now AND v_delivery_horizon) AS is_delivery_soon,
        ((o.status NOT IN ('completed', 'cancelled')) AND (o.site_name IS NULL OR o.site_name = '')) AS is_no_site
      FROM orders o
      LEFT JOIN products prod    ON prod.product_id = o.product_id
      LEFT JOIN manufacturers m  ON m.manufacturer_id = prod.manufacturer_id
      LEFT JOIN partners partner ON partner.partner_id = o.customer_id
      WHERE
        (p_company_id IS NULL OR o.company_id = p_company_id)
        AND (p_customer_id IS NULL OR o.customer_id = p_customer_id)
        AND (p_status IS NULL OR o.status = p_status)
        AND (p_management_category IS NULL OR o.management_category = p_management_category)
        AND (p_work_queue IS NULL
          OR (p_work_queue = 'delivery_soon'
              AND o.status IN ('received', 'partial')
              AND o.remaining_qty IS NOT NULL AND o.remaining_qty > 0
              AND o.delivery_due IS NOT NULL
              AND o.delivery_due BETWEEN v_now AND v_delivery_horizon)
          OR (p_work_queue = 'no_site'
              AND o.status IN ('received', 'partial')
              AND (o.site_name IS NULL OR o.site_name = '')))
        AND (p_q IS NULL OR
          o.order_number ILIKE '%' || p_q || '%' OR
          o.site_name ILIKE '%' || p_q || '%' OR
          o.customer_id IN (SELECT partner_id FROM partners WHERE partner_name ILIKE '%' || p_q || '%')
        )
    ),
    months AS (
      SELECT to_char(date_trunc('month', v_now) - (gs * interval '1 month'), 'YYYY-MM') AS month
      FROM generate_series(0, 23) gs
    ),
    totals AS (
      SELECT
        count(*)::int AS count,
        count(*) FILTER (WHERE is_active)::int AS active_count,
        count(*) FILTER (WHERE status = 'received')::int AS received_count,
        count(*) FILTER (WHERE status = 'partial')::int AS partial_count,
        count(*) FILTER (WHERE status = 'completed')::int AS completed_count,
        count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
        COALESCE(sum(eff_kw) FILTER (WHERE is_active), 0)::numeric AS kw_sum,
        count(DISTINCT customer_id)::int AS customers_count,
        count(DISTINCT customer_id) FILTER (WHERE is_active)::int AS active_customers_count,
        COALESCE(avg(eff_uwp) FILTER (WHERE eff_uwp > 0), 0)::numeric AS avg_unit_price_wp,
        COALESCE(avg(eff_uwp) FILTER (WHERE eff_uwp > 0 AND order_date >= v_recent_30), 0)::numeric AS recent_30_avg_unit_price_wp,
        count(*) FILTER (WHERE eff_uwp > 0 AND order_date >= v_recent_30)::int AS recent_30_count,
        count(*) FILTER (WHERE is_delivery_soon)::int AS delivery_soon_count,
        count(*) FILTER (WHERE is_no_site)::int AS no_site_count
      FROM base
    ),
    trend_raw AS (
      SELECT
        to_char(order_date, 'YYYY-MM') AS month,
        count(*)::int AS count,
        count(*) FILTER (WHERE is_active)::int AS active_count,
        count(*) FILTER (WHERE status = 'partial')::int AS partial_count,
        count(DISTINCT customer_id)::int AS distinct_customers,
        COALESCE(avg(eff_uwp) FILTER (WHERE eff_uwp > 0), 0)::numeric AS avg_unit_price_wp
      FROM base
      WHERE order_date IS NOT NULL
      GROUP BY 1
    ),
    trend24_arr AS (
      SELECT
        m.month,
        COALESCE(t.count, 0) AS count,
        COALESCE(t.active_count, 0) AS active_count,
        COALESCE(t.partial_count, 0) AS partial_count,
        COALESCE(t.distinct_customers, 0) AS distinct_customers,
        COALESCE(t.avg_unit_price_wp, 0::numeric) AS avg_unit_price_wp
      FROM months m
      LEFT JOIN trend_raw t ON t.month = m.month
    ),
    daily_180 AS (
      SELECT
        gs::date AS d,
        COALESCE(sum(eff_uwp) FILTER (WHERE eff_uwp > 0), 0)::numeric AS day_sum,
        COALESCE(count(*) FILTER (WHERE eff_uwp > 0), 0)::int AS day_n
      FROM generate_series(v_now - INTERVAL '193 days', v_now, '1 day') gs
      LEFT JOIN base ON base.order_date = gs::date
      GROUP BY 1
    ),
    daily_ma15 AS (
      SELECT
        d,
        sum(day_sum) OVER w AS w_sum,
        sum(day_n) OVER w AS w_n
      FROM daily_180
      WINDOW w AS (ORDER BY d ROWS BETWEEN 14 PRECEDING AND CURRENT ROW)
    ),
    ma15_180_arr AS (
      SELECT
        CASE WHEN w_n > 0 THEN (w_sum / w_n)::numeric ELSE 0::numeric END AS v
      FROM daily_ma15
      WHERE d > v_now - INTERVAL '180 days'
      ORDER BY d ASC
    ),
    scoped AS (
      SELECT * FROM base
      WHERE
        (p_status_scope = 'lifetime')
        OR (p_status_scope = 'active'  AND is_active)
        OR (p_status_scope = 'partial' AND status = 'partial')
    ),
    scoped_total AS (SELECT count(*)::int AS n FROM scoped),
    by_status_raw AS (
      SELECT
        status AS key,
        CASE status
          WHEN 'received' THEN '접수'
          WHEN 'partial' THEN '분할출고'
          WHEN 'completed' THEN '완료'
          WHEN 'cancelled' THEN '취소'
          ELSE status
        END AS label,
        count(*)::int AS count,
        COALESCE(sum(eff_kw), 0)::numeric AS kw_sum,
        COALESCE(avg(eff_uwp) FILTER (WHERE eff_uwp > 0), 0)::numeric AS avg_uwp,
        count(*) FILTER (WHERE eff_uwp > 0)::int AS priced_count
      FROM scoped
      GROUP BY status
    ),
    by_status AS (
      SELECT s.key, s.label, s.count, s.kw_sum,
        CASE WHEN s.priced_count >= 3 THEN s.avg_uwp ELSE 0::numeric END AS avg_unit_price_wp,
        CASE WHEN st.n > 0 THEN s.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_status_raw s, scoped_total st
      ORDER BY s.count DESC, s.kw_sum DESC
    ),
    by_customer_raw AS (
      SELECT
        COALESCE(customer_id::text, '__unset__') AS key,
        COALESCE(customer_name, '미지정') AS label,
        count(*)::int AS count,
        COALESCE(sum(eff_kw), 0)::numeric AS kw_sum,
        COALESCE(avg(eff_uwp) FILTER (WHERE eff_uwp > 0), 0)::numeric AS avg_uwp,
        count(*) FILTER (WHERE eff_uwp > 0)::int AS priced_count
      FROM scoped
      GROUP BY customer_id, customer_name
    ),
    by_customer_top10 AS (
      SELECT c.key, c.label, c.count, c.kw_sum,
        CASE WHEN c.priced_count >= 3 THEN c.avg_uwp ELSE 0::numeric END AS avg_unit_price_wp,
        CASE WHEN st.n > 0 THEN c.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_customer_raw c, scoped_total st
      ORDER BY c.count DESC, c.kw_sum DESC
      LIMIT 10
    ),
    by_mfg_raw AS (
      SELECT
        COALESCE(manufacturer_name, '__unset__') AS key,
        COALESCE(manufacturer_name, '미지정') AS label,
        count(*)::int AS count,
        COALESCE(sum(eff_kw), 0)::numeric AS kw_sum,
        COALESCE(avg(eff_uwp) FILTER (WHERE eff_uwp > 0), 0)::numeric AS avg_uwp,
        count(*) FILTER (WHERE eff_uwp > 0)::int AS priced_count
      FROM scoped
      GROUP BY manufacturer_name
    ),
    by_mfg_top10 AS (
      SELECT m.key, m.label, m.count, m.kw_sum,
        CASE WHEN m.priced_count >= 3 THEN m.avg_uwp ELSE 0::numeric END AS avg_unit_price_wp,
        CASE WHEN st.n > 0 THEN m.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_mfg_raw m, scoped_total st
      ORDER BY m.count DESC, m.kw_sum DESC
      LIMIT 10
    ),
    by_cat_raw AS (
      SELECT
        management_category AS key,
        CASE management_category
          WHEN 'sale' THEN '판매'
          WHEN 'sale_spare' THEN '판매(스페어)'
          WHEN 'construction' THEN '공사'
          WHEN 'adjustment' THEN '재고조정'
          WHEN 'transfer' THEN '창고이동'
          WHEN 'other' THEN '기타'
          ELSE management_category
        END AS label,
        count(*)::int AS count,
        COALESCE(sum(eff_kw), 0)::numeric AS kw_sum,
        COALESCE(avg(eff_uwp) FILTER (WHERE eff_uwp > 0), 0)::numeric AS avg_uwp,
        count(*) FILTER (WHERE eff_uwp > 0)::int AS priced_count
      FROM scoped
      GROUP BY management_category
    ),
    by_category AS (
      SELECT c.key, c.label, c.count, c.kw_sum,
        CASE WHEN c.priced_count >= 3 THEN c.avg_uwp ELSE 0::numeric END AS avg_unit_price_wp,
        CASE WHEN st.n > 0 THEN c.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_cat_raw c, scoped_total st
      ORDER BY c.count DESC
    )
  SELECT jsonb_build_object(
    'totals', (SELECT row_to_json(t.*)::jsonb FROM totals t),
    'trend24', (SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY month), '[]'::jsonb) FROM trend24_arr x),
    'unit_price_ma15_180', (SELECT COALESCE(jsonb_agg(v), '[]'::jsonb) FROM ma15_180_arr),
    'status_scope', p_status_scope,
    'by_status', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_status x),
    'by_customer_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_customer_top10 x),
    'by_manufacturer_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_mfg_top10 x),
    'by_category', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_category x)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION orders_dashboard(uuid, uuid, text, text, text, text, text)
  TO anon, authenticated, service_role;
