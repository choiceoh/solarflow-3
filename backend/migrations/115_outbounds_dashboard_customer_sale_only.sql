-- @auto-apply: yes
-- 115: outbounds_dashboard() — by_customer_top10 을 sale / sale_spare 출고에만 한정.
--
-- 배경: '거래처' 는 outbounds.order_id → orders.customer_id 경로로만 풀린다. 그런데
-- 실제로 order_id 가 있는 출고는 usage_category in (sale, sale_spare) 뿐이고,
-- 나머지 용도(construction, construction_damage, repowering, maintenance,
-- disposal, transfer, adjustment, other) 는 전부 customer_id NULL 이 된다. 결과적으로
-- 금년/전월 거래처 분해에서 비-판매 출고가 한 덩어리로 '미지정' 단일 버킷에 쌓여
-- 거래처 차원 분해 의미가 사라졌다.
--
-- 수정: by_customer_top10 만 sale-eligible(usage_category in (sale, sale_spare))
-- subset 에서 산출. share 의 분모도 같은 subset 의 count 로 변경해 % 합이 의미를
-- 가지도록 한다. by_usage / by_manufacturer_top10 / totals / trend24 / weekly12 /
-- yoy3y / sale_conversion 은 변경 없음.
--
-- 함수 시그니처는 그대로(uuid,text,text,uuid,text,text). 109 가 부여한
-- statement_timeout = '30s' 는 CREATE OR REPLACE 후에도 ALTER 로 다시 보장.

CREATE OR REPLACE FUNCTION outbounds_dashboard(
  p_company_id      uuid DEFAULT NULL,
  p_status          text DEFAULT NULL,
  p_usage_category  text DEFAULT NULL,
  p_manufacturer_id uuid DEFAULT NULL,
  p_q               text DEFAULT NULL,
  p_period          text DEFAULT 'lifetime'  -- lifetime | prev_month | year
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now date := current_date;
  v_year int := extract(year from v_now)::int;
  v_month int := extract(month from v_now)::int;
  v_day int := extract(day from v_now)::int;
  v_prev_month_start date := (date_trunc('month', v_now) - interval '1 month')::date;
  v_prev_month_end date := (date_trunc('month', v_now) - interval '1 day')::date;
  v_year_start date := make_date(v_year, 1, 1);
  v_this_week_start date := (v_now - ((extract(isodow from v_now)::int - 1) * interval '1 day'))::date;  -- ISO Monday
  v_result jsonb;
BEGIN
  WITH
    -- 1) 필터 적용된 outbounds + 메타.
    base AS (
      SELECT
        o.outbound_id,
        o.outbound_date,
        o.product_id,
        o.warehouse_id,
        o.company_id,
        o.target_company_id,
        o.order_id,
        o.usage_category,
        o.status,
        o.quantity,
        o.capacity_kw,
        prod.manufacturer_id,
        m.name_kr AS manufacturer_name,
        ord.customer_id,
        partner.partner_name AS customer_name,
        sale.sale_id,
        sale.total_amount AS sale_total_amount,
        sale.tax_invoice_date AS sale_tax_invoice_date
      FROM outbounds o
      LEFT JOIN products prod      ON prod.product_id = o.product_id
      LEFT JOIN manufacturers m    ON m.manufacturer_id = prod.manufacturer_id
      LEFT JOIN orders ord         ON ord.order_id = o.order_id
      LEFT JOIN partners partner   ON partner.partner_id = ord.customer_id
      LEFT JOIN sales sale         ON sale.outbound_id = o.outbound_id AND sale.status <> 'cancelled'
      WHERE
        (p_company_id IS NULL OR o.company_id = p_company_id)
        AND (p_status IS NULL OR o.status = p_status)
        AND (p_usage_category IS NULL OR o.usage_category = p_usage_category)
        AND (p_manufacturer_id IS NULL OR prod.manufacturer_id = p_manufacturer_id)
        AND (p_q IS NULL OR o.erp_outbound_no ILIKE '%' || p_q || '%' OR o.site_name ILIKE '%' || p_q || '%')
    ),
    months AS (
      SELECT to_char(date_trunc('month', v_now) - (gs * interval '1 month'), 'YYYY-MM') AS month
      FROM generate_series(0, 23) gs
    ),
    weeks AS (
      SELECT (v_this_week_start - ((11 - gs) * 7) * interval '1 day')::date AS week_start
      FROM generate_series(0, 11) gs
    ),
    -- 2) totals.
    totals AS (
      SELECT
        count(*)::int AS count,
        COALESCE(sum(capacity_kw), 0)::numeric AS kw_sum,
        count(*) FILTER (WHERE status = 'active')::int AS active_count,
        count(*) FILTER (WHERE status = 'cancel_pending')::int AS cancel_pending_count,
        count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
        COALESCE(sum(sale_total_amount), 0)::numeric AS sale_amount_sum,
        count(*) FILTER (WHERE sale_id IS NOT NULL AND sale_tax_invoice_date IS NULL)::int AS invoice_pending_count
      FROM base
    ),
    -- 3) trend24 — outbound_date 기반 월별.
    trend_raw AS (
      SELECT
        to_char(outbound_date::date, 'YYYY-MM') AS month,
        count(*)::int AS count,
        COALESCE(sum(capacity_kw), 0)::numeric AS kw_sum
      FROM base
      WHERE outbound_date IS NOT NULL
      GROUP BY 1
    ),
    trend24_arr AS (
      SELECT
        m.month,
        COALESCE(t.count, 0) AS count,
        COALESCE(t.kw_sum, 0::numeric) AS kw_sum
      FROM months m
      LEFT JOIN trend_raw t ON t.month = m.month
    ),
    -- 4) weekly12 — 직전 12 주 (월요일 시작), week_start 기준 그룹.
    weekly_raw AS (
      SELECT
        (date_trunc('week', outbound_date::date)::date) AS week_start,
        count(*)::int AS count,
        COALESCE(sum(capacity_kw), 0)::numeric AS kw_sum
      FROM base
      WHERE outbound_date IS NOT NULL
        AND outbound_date::date >= (v_this_week_start - interval '11 weeks')::date
        AND outbound_date::date <= v_now
      GROUP BY 1
    ),
    weekly12_arr AS (
      SELECT
        to_char(w.week_start, 'YYYY-MM-DD') AS week_start,
        COALESCE(wr.count, 0) AS count,
        COALESCE(wr.kw_sum, 0::numeric) AS kw_sum
      FROM weeks w
      LEFT JOIN weekly_raw wr ON wr.week_start = w.week_start
    ),
    -- 5) yoy3y — 올해 1월~현재월 의 (2년전, 1년전, 올해) 동월 kW 비교.
    yoy_months AS (
      SELECT generate_series(1, v_month) AS m
    ),
    yoy_data AS (
      SELECT
        extract(year from outbound_date::date)::int AS y,
        extract(month from outbound_date::date)::int AS mn,
        extract(day from outbound_date::date)::int AS d,
        capacity_kw
      FROM base
      WHERE outbound_date IS NOT NULL
        AND extract(year from outbound_date::date) IN (v_year, v_year - 1, v_year - 2)
    ),
    yoy3y_arr AS (
      SELECT
        m AS month_idx,
        COALESCE(sum(capacity_kw) FILTER (WHERE y = v_year - 2 AND mn = m), 0)::numeric AS two_years_ago,
        COALESCE(sum(capacity_kw) FILTER (WHERE y = v_year - 1 AND mn = m), 0)::numeric AS last_year,
        COALESCE(sum(capacity_kw) FILTER (WHERE y = v_year     AND mn = m), 0)::numeric AS current_year
      FROM yoy_months
      LEFT JOIN yoy_data ON yoy_data.mn = yoy_months.m
      GROUP BY m
      ORDER BY m
    ),
    yoy_summary AS (
      SELECT
        COALESCE(sum(capacity_kw) FILTER (WHERE y = v_year - 1
          AND (mn < v_month OR (mn = v_month AND d <= v_day))), 0)::numeric AS last_year_same,
        COALESCE(sum(capacity_kw) FILTER (WHERE y = v_year), 0)::numeric AS current_year_total,
        bool_or(y = v_year - 1) AS last_year_has_any
      FROM yoy_data
    ),
    -- 6) period 적용된 scoped (by_usage / by_manufacturer 용).
    scoped AS (
      SELECT * FROM base
      WHERE
        (p_period = 'lifetime')
        OR (p_period = 'prev_month' AND outbound_date::date BETWEEN v_prev_month_start AND v_prev_month_end)
        OR (p_period = 'year' AND outbound_date::date >= v_year_start AND outbound_date::date <= v_now)
    ),
    scoped_total AS (SELECT count(*)::int AS n FROM scoped),
    -- 6b) 거래처 차원만 sale-eligible 로 한정. order_id 가 있는 출고는
    --     usage_category in (sale, sale_spare) 뿐이므로 다른 용도가 섞이면 전부
    --     '미지정' 으로 떨어진다.
    cust_scoped AS (
      SELECT * FROM scoped WHERE usage_category IN ('sale', 'sale_spare')
    ),
    cust_scoped_total AS (SELECT count(*)::int AS n FROM cust_scoped),
    -- 7) by_usage.
    by_usage_raw AS (
      SELECT
        usage_category AS key,
        CASE usage_category
          WHEN 'sale' THEN '상품판매'
          WHEN 'sale_spare' THEN '상품판매(스페어)'
          WHEN 'construction' THEN '공사현장 출고'
          WHEN 'construction_damage' THEN '공사현장 출고(파손)'
          WHEN 'repowering' THEN '리파워링 출고'
          WHEN 'maintenance' THEN '유지관리'
          WHEN 'disposal' THEN '폐기'
          WHEN 'transfer' THEN '창고이동'
          WHEN 'adjustment' THEN '재고조정'
          WHEN 'other' THEN '기타'
          ELSE usage_category
        END AS label,
        count(*)::int AS count,
        COALESCE(sum(capacity_kw), 0)::numeric AS kw_sum
      FROM scoped
      GROUP BY usage_category
    ),
    by_usage AS (
      SELECT u.key, u.label, u.count, u.kw_sum,
        CASE WHEN st.n > 0 THEN u.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_usage_raw u, scoped_total st
      ORDER BY u.count DESC, u.kw_sum DESC
    ),
    -- 8) by_manufacturer top10.
    by_mfg_raw AS (
      SELECT
        COALESCE(manufacturer_id::text, '__unset__') AS key,
        COALESCE(manufacturer_name, '미지정') AS label,
        count(*)::int AS count,
        COALESCE(sum(capacity_kw), 0)::numeric AS kw_sum
      FROM scoped
      GROUP BY manufacturer_id, manufacturer_name
    ),
    by_mfg_top10 AS (
      SELECT m.key, m.label, m.count, m.kw_sum,
        CASE WHEN st.n > 0 THEN m.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_mfg_raw m, scoped_total st
      ORDER BY m.count DESC, m.kw_sum DESC
      LIMIT 10
    ),
    -- 9) by_customer top10 — sale-eligible 한정. 분모도 cust_scoped_total.
    by_cust_raw AS (
      SELECT
        COALESCE(customer_id::text, '__unset__') AS key,
        COALESCE(customer_name, '미지정') AS label,
        count(*)::int AS count,
        COALESCE(sum(capacity_kw), 0)::numeric AS kw_sum
      FROM cust_scoped
      GROUP BY customer_id, customer_name
    ),
    by_cust_top10 AS (
      SELECT c.key, c.label, c.count, c.kw_sum,
        CASE WHEN ct.n > 0 THEN c.count::numeric / ct.n ELSE 0::numeric END AS share
      FROM by_cust_raw c, cust_scoped_total ct
      ORDER BY c.count DESC, c.kw_sum DESC
      LIMIT 10
    ),
    -- 10) sale_conversion: usage_category in (sale, sale_spare) 인 행만.
    sc_base AS (
      SELECT * FROM base WHERE usage_category IN ('sale', 'sale_spare')
    ),
    sc_totals AS (
      SELECT
        count(*)::int AS eligible_count,
        count(*) FILTER (WHERE sale_id IS NOT NULL)::int AS linked_count
      FROM sc_base
    ),
    sc_monthly_raw AS (
      SELECT
        to_char(outbound_date::date, 'YYYY-MM') AS month,
        count(*)::int AS eligible_count,
        count(*) FILTER (WHERE sale_id IS NOT NULL)::int AS linked_count
      FROM sc_base
      WHERE outbound_date IS NOT NULL
      GROUP BY 1
    ),
    sc_monthly AS (
      SELECT
        m.month,
        COALESCE(s.eligible_count, 0) AS eligible_count,
        COALESCE(s.linked_count, 0) AS linked_count
      FROM months m
      LEFT JOIN sc_monthly_raw s ON s.month = m.month
    ),
    sc_usage_raw AS (
      SELECT
        usage_category AS key,
        CASE usage_category
          WHEN 'sale' THEN '상품판매'
          WHEN 'sale_spare' THEN '상품판매(스페어)'
          ELSE usage_category
        END AS label,
        count(*)::int AS eligible_count,
        count(*) FILTER (WHERE sale_id IS NOT NULL)::int AS linked_count
      FROM sc_base
      GROUP BY usage_category
    ),
    sc_by_usage AS (
      SELECT key, label, eligible_count, linked_count,
        CASE WHEN eligible_count > 0 THEN (linked_count::numeric / eligible_count * 100) ELSE 0::numeric END AS rate
      FROM sc_usage_raw
      ORDER BY eligible_count DESC, rate DESC
    ),
    sc_mfg_raw AS (
      SELECT
        COALESCE(manufacturer_id::text, '__unset__') AS key,
        COALESCE(manufacturer_name, '미지정') AS label,
        count(*)::int AS eligible_count,
        count(*) FILTER (WHERE sale_id IS NOT NULL)::int AS linked_count
      FROM sc_base
      GROUP BY manufacturer_id, manufacturer_name
    ),
    sc_by_mfg_top10 AS (
      SELECT key, label, eligible_count, linked_count,
        CASE WHEN eligible_count > 0 THEN (linked_count::numeric / eligible_count * 100) ELSE 0::numeric END AS rate
      FROM sc_mfg_raw
      ORDER BY eligible_count DESC, rate DESC
      LIMIT 10
    ),
    sc_cust_raw AS (
      SELECT
        COALESCE(customer_id::text, '__unset__') AS key,
        COALESCE(customer_name, '미지정') AS label,
        count(*)::int AS eligible_count,
        count(*) FILTER (WHERE sale_id IS NOT NULL)::int AS linked_count
      FROM sc_base
      GROUP BY customer_id, customer_name
    ),
    sc_by_cust_top10 AS (
      SELECT key, label, eligible_count, linked_count,
        CASE WHEN eligible_count > 0 THEN (linked_count::numeric / eligible_count * 100) ELSE 0::numeric END AS rate
      FROM sc_cust_raw
      ORDER BY eligible_count DESC, rate DESC
      LIMIT 10
    )
  SELECT jsonb_build_object(
    'totals', (SELECT row_to_json(t.*)::jsonb FROM totals t),
    'trend24', (SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY month), '[]'::jsonb) FROM trend24_arr x),
    'weekly12', (SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY week_start), '[]'::jsonb) FROM weekly12_arr x),
    'yoy3y', jsonb_build_object(
      'months_this_year', v_month,
      'two_years_ago', (SELECT COALESCE(jsonb_agg(two_years_ago ORDER BY month_idx), '[]'::jsonb) FROM yoy3y_arr),
      'last_year', (SELECT COALESCE(jsonb_agg(last_year ORDER BY month_idx), '[]'::jsonb) FROM yoy3y_arr),
      'current_year', (SELECT COALESCE(jsonb_agg(current_year ORDER BY month_idx), '[]'::jsonb) FROM yoy3y_arr),
      'last_year_same', (SELECT last_year_same FROM yoy_summary),
      'yoy_pct', (SELECT
        CASE WHEN last_year_has_any AND last_year_same > 0
          THEN ((current_year_total - last_year_same) / last_year_same * 100)::numeric
          ELSE NULL
        END FROM yoy_summary)
    ),
    'period', p_period,
    'by_usage', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_usage x),
    'by_manufacturer_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_mfg_top10 x),
    'by_customer_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_cust_top10 x),
    'sale_conversion', jsonb_build_object(
      'eligible_count', (SELECT eligible_count FROM sc_totals),
      'linked_count', (SELECT linked_count FROM sc_totals),
      'monthly', (SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY month), '[]'::jsonb) FROM sc_monthly x),
      'by_usage', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM sc_by_usage x),
      'by_manufacturer_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM sc_by_mfg_top10 x),
      'by_customer_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM sc_by_cust_top10 x)
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- 109 가 부여한 함수 단위 statement_timeout 을 재보장. CREATE OR REPLACE 이후
-- 보존 동작이 PostgreSQL 버전에 따라 다를 수 있어 명시적으로 다시 설정.
ALTER FUNCTION outbounds_dashboard(uuid, text, text, uuid, text, text)
  SET statement_timeout = '30s';

GRANT EXECUTE ON FUNCTION outbounds_dashboard(uuid, text, text, uuid, text, text)
  TO anon, authenticated, service_role;
