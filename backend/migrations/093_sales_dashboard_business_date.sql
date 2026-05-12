-- 093: sales_dashboard() RPC — 기간 필터를 business_date 기반으로 통일
--
-- 배경 (회귀):
--   073 RPC 는 기간 필터를 s.tax_invoke_date 만으로 매칭한다.
--   반면 표(List)는 tx_sale.go applySaleFilters → saleIDsByBusinessDate 가
--   tax_invoice_date → outbound_date → order_date 폴백으로 매칭한다.
--   → 기간 필터를 걸면 미발행 매출(tax_invoice_date IS NULL) 이 카드에서 통째로 사라져
--     KPI 카드(매출 합계 / 계산서 미발행 / 거래처)와 표의 행수가 안 맞는 사용자 체감 버그.
--
-- 본 패치:
--   base CTE 가 이미 COALESCE(tax_invoice_date, outbound_date, order_date) 를 bin_date 로 계산해 두었다.
--   WHERE 절에서 s.tax_invoice_date 대신 그 COALESCE 식을 그대로 써서 기간 필터를 적용한다.
--   month/start/end 모두 동일 정책.

CREATE OR REPLACE FUNCTION sales_dashboard(
  p_company_id     uuid    DEFAULT NULL,
  p_customer_id    uuid    DEFAULT NULL,
  p_outbound_id    uuid    DEFAULT NULL,
  p_order_id       uuid    DEFAULT NULL,
  p_status         text    DEFAULT NULL,
  p_month          text    DEFAULT NULL,
  p_start          date    DEFAULT NULL,
  p_end            date    DEFAULT NULL,
  p_invoice_status text    DEFAULT NULL,
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
        COALESCE(s.tax_invoice_date::date, o.outbound_date::date, ord.order_date::date) AS bin_date,
        COALESCE(o.outbound_date::date, ord.order_date::date) AS pending_bin_date,
        p.partner_name AS customer_name,
        prod.spec_wp,
        prod.manufacturer_id,
        m.name_kr AS manufacturer_name,
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
        -- 기간 필터: business_date (계산서일 우선 → 출고일 → 수주일) 기반으로 통일.
        AND (p_month IS NULL
             OR to_char(COALESCE(s.tax_invoice_date::date, o.outbound_date::date, ord.order_date::date), 'YYYY-MM') = p_month)
        AND (p_start IS NULL
             OR COALESCE(s.tax_invoice_date::date, o.outbound_date::date, ord.order_date::date) >= p_start)
        AND (p_end IS NULL
             OR COALESCE(s.tax_invoice_date::date, o.outbound_date::date, ord.order_date::date) <= p_end)
        AND (p_invoice_status IS NULL
          OR (p_invoice_status = 'issued'  AND s.tax_invoice_date IS NOT NULL)
          OR (p_invoice_status = 'pending' AND s.tax_invoice_date IS NULL)
          OR p_invoice_status NOT IN ('issued', 'pending'))
        AND (p_q IS NULL OR s.customer_id IN (
          SELECT partner_id FROM partners WHERE partner_name ILIKE '%' || p_q || '%'
        ))
    ),
    months AS (
      SELECT to_char(date_trunc('month', v_now) - (gs * interval '1 month'), 'YYYY-MM') AS month
      FROM generate_series(0, 23) gs
    ),
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

GRANT EXECUTE ON FUNCTION sales_dashboard(uuid, uuid, uuid, uuid, text, text, date, date, text, text)
  TO anon, authenticated, service_role;
