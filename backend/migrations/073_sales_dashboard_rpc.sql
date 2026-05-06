-- 073: sales_dashboard() RPC — DB-side GROUP BY 집계로 1 round-trip
--
-- 이전 동작 (Go 핸들러):
--   1. PostgREST 청크 fetch (sales 1000 rows × N) — 각 청크 round-trip
--   2. enrichSales 가 orders/outbounds/products/manufacturers/partners 전체 fetch (수만 행)
--   3. Go 메모리에서 totals/trend24/by_customer/by_manufacturer 집계
--   → 운영 측정 결과 avg 2.3s, max 12.7s
--
-- 본 RPC:
--   - 단일 SQL 트랜잭션에서 sales JOIN outbounds/orders/products/manufacturers/partners
--   - WITH CTE 로 totals/trend24/pending_trend24/by_customer/by_manufacturer 동시 집계
--   - jsonb_build_object 로 응답 형태 그대로 반환
--   → 1 round-trip + DB-side aggregate. 인덱스 활용 시 수십~수백 ms 예상.
--
-- 응답 셰이프는 SaleDashboard struct (handler/tx_sale_dashboard.go) 와 동일:
--   { totals, trend24[], pending_trend24[], by_customer_top10[], by_manufacturer_top10[] }
--
-- 호출: PostgREST .Rpc("sales_dashboard", { p_company_id, p_customer_id, ... })
-- 또는 Supabase rpc('sales_dashboard', {...}).

CREATE OR REPLACE FUNCTION sales_dashboard(
  p_company_id     uuid    DEFAULT NULL,
  p_customer_id    uuid    DEFAULT NULL,
  p_outbound_id    uuid    DEFAULT NULL,
  p_order_id       uuid    DEFAULT NULL,
  p_status         text    DEFAULT NULL,
  p_month          text    DEFAULT NULL,    -- YYYY-MM
  p_start          date    DEFAULT NULL,
  p_end            date    DEFAULT NULL,
  p_invoice_status text    DEFAULT NULL,    -- issued | pending
  p_q              text    DEFAULT NULL
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
    -- 1) 필터 적용된 sales + 메타 join. effective_unit_price_wp 와 binning date 도 미리 계산.
    base AS (
      SELECT
        s.sale_id,
        s.customer_id,
        s.outbound_id,
        s.order_id,
        s.unit_price_wp,
        s.unit_price_ea,
        s.supply_amount,
        s.vat_amount,
        s.total_amount,
        s.tax_invoice_date,
        s.status,
        o.outbound_date,
        ord.order_date,
        -- bin date: tax_invoice_date 우선 → outbound_date → order_date
        COALESCE(s.tax_invoice_date::date, o.outbound_date::date, ord.order_date::date) AS bin_date,
        -- pending bin date: outbound_date → order_date (tax_invoice_date 는 NULL 인 행만 사용)
        COALESCE(o.outbound_date::date, ord.order_date::date) AS pending_bin_date,
        p.partner_name AS customer_name,
        prod.spec_wp,
        prod.manufacturer_id,
        m.name_kr AS manufacturer_name,
        -- effective unit_price_wp: WP 우선, 없으면 EA/spec_wp 도출
        CASE
          WHEN s.unit_price_wp > 0 THEN s.unit_price_wp
          WHEN prod.spec_wp IS NOT NULL AND prod.spec_wp > 0 AND s.unit_price_ea IS NOT NULL
            THEN s.unit_price_ea / prod.spec_wp
          ELSE 0
        END AS eff_uwp
      FROM sales s
      LEFT JOIN outbounds o     ON s.outbound_id = o.outbound_id
      LEFT JOIN orders ord      ON s.order_id    = ord.order_id
      LEFT JOIN products prod   ON prod.product_id = COALESCE(o.product_id, ord.product_id)
      LEFT JOIN manufacturers m ON m.manufacturer_id = prod.manufacturer_id
      LEFT JOIN partners p      ON p.partner_id = s.customer_id
      WHERE
        (p_company_id IS NULL
          OR o.company_id = p_company_id
          OR ord.company_id = p_company_id)
        AND (p_customer_id IS NULL OR s.customer_id = p_customer_id)
        AND (p_outbound_id IS NULL OR s.outbound_id = p_outbound_id)
        AND (p_order_id    IS NULL OR s.order_id    = p_order_id)
        AND (CASE WHEN p_status IS NOT NULL THEN s.status = p_status ELSE s.status <> 'cancelled' END)
        AND (p_month IS NULL OR s.tax_invoice_date::text LIKE p_month || '%')
        AND (p_start IS NULL OR s.tax_invoice_date::date >= p_start)
        AND (p_end   IS NULL OR s.tax_invoice_date::date <= p_end)
        AND (p_invoice_status IS NULL
          OR (p_invoice_status = 'issued'  AND s.tax_invoice_date IS NOT NULL)
          OR (p_invoice_status = 'pending' AND s.tax_invoice_date IS NULL)
          OR p_invoice_status NOT IN ('issued', 'pending'))
        AND (p_q IS NULL OR s.customer_id IN (
          SELECT partner_id FROM partners WHERE partner_name ILIKE '%' || p_q || '%'
        ))
    ),
    -- 2) 24-month 라벨 시계열 (현재월 포함, 과거 23개월).
    months AS (
      SELECT to_char(date_trunc('month', v_now) - (gs * interval '1 month'), 'YYYY-MM') AS month
      FROM generate_series(0, 23) gs
    ),
    -- 3) totals — Go computeSaleDashTotals 와 동일.
    totals AS (
      SELECT
        count(*)::int AS count,
        COALESCE(sum(total_amount), 0)::numeric AS sale_amount_sum,
        COALESCE(sum(supply_amount), 0)::numeric AS supply_amount_sum,
        COALESCE(sum(vat_amount), 0)::numeric AS vat_amount_sum,
        count(*) FILTER (WHERE tax_invoice_date IS NOT NULL)::int AS invoice_issued_count,
        count(*) FILTER (WHERE tax_invoice_date IS NULL)::int AS invoice_pending_count,
        count(DISTINCT customer_id)::int AS customers_count,
        COALESCE(avg(eff_uwp) FILTER (WHERE eff_uwp > 0), 0)::numeric AS avg_unit_price_wp
      FROM base
    ),
    -- 4) trend24 — bin_date 기반 월별 집계.
    trend_raw AS (
      SELECT
        to_char(bin_date, 'YYYY-MM') AS month,
        count(*)::int AS count,
        COALESCE(sum(total_amount), 0)::numeric AS sale_amount_sum,
        count(*) FILTER (WHERE tax_invoice_date IS NULL)::int AS pending_count,
        count(DISTINCT customer_id)::int AS distinct_customers,
        COALESCE(avg(eff_uwp) FILTER (WHERE eff_uwp > 0), 0)::numeric AS avg_unit_price_wp
      FROM base
      WHERE bin_date IS NOT NULL
      GROUP BY 1
    ),
    trend24_arr AS (
      SELECT
        m.month,
        COALESCE(t.count, 0) AS count,
        COALESCE(t.sale_amount_sum, 0::numeric) AS sale_amount_sum,
        COALESCE(t.pending_count, 0) AS pending_count,
        COALESCE(t.distinct_customers, 0) AS distinct_customers,
        COALESCE(t.avg_unit_price_wp, 0::numeric) AS avg_unit_price_wp
      FROM months m
      LEFT JOIN trend_raw t ON t.month = m.month
    ),
    -- 5) pending_trend24 — tax_invoice_date NULL 인 행만 outbound_date 로 binning.
    pending_raw AS (
      SELECT
        to_char(pending_bin_date, 'YYYY-MM') AS month,
        count(*)::int AS pending_count
      FROM base
      WHERE tax_invoice_date IS NULL
        AND pending_bin_date IS NOT NULL
      GROUP BY 1
    ),
    pending_trend_arr AS (
      SELECT
        m.month,
        COALESCE(p.pending_count, 0) AS count,
        0::numeric AS sale_amount_sum,
        COALESCE(p.pending_count, 0) AS pending_count,
        0 AS distinct_customers,
        0::numeric AS avg_unit_price_wp
      FROM months m
      LEFT JOIN pending_raw p ON p.month = m.month
    ),
    -- 6) by_customer top10 (sale_amount desc).
    by_customer_raw AS (
      SELECT
        COALESCE(customer_id::text, '__unset__') AS key,
        COALESCE(customer_name, '미지정') AS label,
        count(*)::int AS count,
        COALESCE(sum(total_amount), 0)::numeric AS sale_amount_sum,
        count(*) FILTER (WHERE tax_invoice_date IS NULL)::int AS invoice_pending_count,
        COALESCE(avg(eff_uwp) FILTER (WHERE eff_uwp > 0), 0)::numeric AS avg_uwp,
        count(*) FILTER (WHERE eff_uwp > 0)::int AS priced_count
      FROM base
      GROUP BY customer_id, customer_name
    ),
    base_total AS (SELECT count(*)::int AS n FROM base),
    by_customer_top10 AS (
      SELECT
        c.key,
        c.label,
        c.count,
        c.sale_amount_sum,
        c.invoice_pending_count,
        CASE WHEN c.priced_count >= 3 THEN c.avg_uwp ELSE 0::numeric END AS avg_unit_price_wp,
        CASE WHEN bt.n > 0 THEN c.count::numeric / bt.n ELSE 0::numeric END AS share
      FROM by_customer_raw c, base_total bt
      ORDER BY c.sale_amount_sum DESC, c.count DESC
      LIMIT 10
    ),
    -- 7) by_manufacturer top10.
    by_mfg_raw AS (
      SELECT
        COALESCE(manufacturer_id::text, '__unset__') AS key,
        COALESCE(manufacturer_name, '미지정') AS label,
        count(*)::int AS count,
        COALESCE(sum(total_amount), 0)::numeric AS sale_amount_sum,
        count(*) FILTER (WHERE tax_invoice_date IS NULL)::int AS invoice_pending_count,
        COALESCE(avg(eff_uwp) FILTER (WHERE eff_uwp > 0), 0)::numeric AS avg_uwp,
        count(*) FILTER (WHERE eff_uwp > 0)::int AS priced_count
      FROM base
      GROUP BY manufacturer_id, manufacturer_name
    ),
    by_mfg_top10 AS (
      SELECT
        m.key,
        m.label,
        m.count,
        m.sale_amount_sum,
        m.invoice_pending_count,
        CASE WHEN m.priced_count >= 3 THEN m.avg_uwp ELSE 0::numeric END AS avg_unit_price_wp,
        CASE WHEN bt.n > 0 THEN m.count::numeric / bt.n ELSE 0::numeric END AS share
      FROM by_mfg_raw m, base_total bt
      ORDER BY m.sale_amount_sum DESC, m.count DESC
      LIMIT 10
    )
  SELECT jsonb_build_object(
    'totals', (SELECT row_to_json(t.*)::jsonb FROM totals t),
    'trend24', (
      SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY month), '[]'::jsonb)
      FROM trend24_arr x
    ),
    'pending_trend24', (
      SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY month), '[]'::jsonb)
      FROM pending_trend_arr x
    ),
    'by_customer_top10', (
      SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb)
      FROM by_customer_top10 x
    ),
    'by_manufacturer_top10', (
      SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb)
      FROM by_mfg_top10 x
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- PostgREST 가 anon/authenticated 역할로 호출할 수 있도록 권한 부여 (운영 RLS 정책에 맞춰 조정 필요).
GRANT EXECUTE ON FUNCTION sales_dashboard(uuid, uuid, uuid, uuid, text, text, date, date, text, text)
  TO anon, authenticated, service_role;
