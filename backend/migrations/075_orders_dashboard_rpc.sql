-- 075: orders_dashboard() RPC — DB-side 집계.
-- 운영 측정 orders/dashboard avg 1.9s / max 9.7s.
--
-- 응답 셰이프는 OrderDashboard struct (handler/tx_order_dashboard.go) 와 1:1.
-- unit_price_ma15_180 (180일 일별 + 15일 슬라이딩 평균) 도 SQL 내에서 generate_series + window function 으로 계산.

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
    -- 1) 필터 적용된 orders + 단가 effective. enrichOrders 가 product → manufacturer_name 채우는 것을 SQL join 으로 대체.
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
        o.wattage_kw,
        o.spec_wp,
        o.unit_price_wp,
        o.unit_price_ea,
        o.site_name,
        o.status,
        o.management_category,
        partner.partner_name AS customer_name,
        m.name_kr AS manufacturer_name,
        prod.manufacturer_id,
        -- effective kw: capacity_kw 우선, 없으면 quantity × wattage_kw.
        COALESCE(o.capacity_kw, o.quantity * COALESCE(o.wattage_kw, 0)) AS eff_kw,
        -- effective unit_price_wp: WP 우선, 없으면 EA/spec_wp.
        CASE
          WHEN o.unit_price_wp > 0 THEN o.unit_price_wp
          WHEN o.spec_wp > 0 AND o.unit_price_ea IS NOT NULL THEN o.unit_price_ea / o.spec_wp
          ELSE 0
        END AS eff_uwp,
        -- 활성 여부 (completed/cancelled 제외).
        (o.status NOT IN ('completed', 'cancelled')) AS is_active,
        -- delivery_soon 여부.
        (o.status IN ('received', 'partial')
          AND o.remaining_qty IS NOT NULL AND o.remaining_qty > 0
          AND o.delivery_due IS NOT NULL
          AND o.delivery_due BETWEEN v_now AND v_delivery_horizon) AS is_delivery_soon,
        -- no_site 여부.
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
    -- 2) totals.
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
    -- 3) trend24 — order_date 기반.
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
    -- 4) unit_price_ma15_180 — 180일 일별 평균 unit_price_wp 의 15일 슬라이딩 평균.
    --    날짜별 priced sum + count → window function 으로 sliding sum/count → ratio.
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
      -- 마지막 180일 (전체 194일 윈도우 - 14일 워밍업).
      SELECT
        CASE WHEN w_n > 0 THEN (w_sum / w_n)::numeric ELSE 0::numeric END AS v
      FROM daily_ma15
      WHERE d > v_now - INTERVAL '180 days'
      ORDER BY d ASC
    ),
    -- 5) status_scope 적용된 breakdowns 베이스.
    scoped AS (
      SELECT * FROM base
      WHERE
        (p_status_scope = 'lifetime')
        OR (p_status_scope = 'active'  AND is_active)
        OR (p_status_scope = 'partial' AND status = 'partial')
    ),
    scoped_total AS (SELECT count(*)::int AS n FROM scoped),
    -- 6) by_status (count + kw_sum + avg_unit_price ≥3 + share).
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
    -- 7) by_customer top10.
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
    -- 8) by_manufacturer top10. 키는 manufacturer_name 사용 (Order 모델에 manufacturer_id 없어 기존 코드도 name 기반).
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
    -- 9) by_category.
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
