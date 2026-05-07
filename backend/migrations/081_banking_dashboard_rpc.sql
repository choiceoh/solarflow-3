-- @auto-apply: yes
-- 081: banking_dashboard() RPC. BankingPage 4개 insight (TotalLimit/Used/Available/MaturityAlert)
-- 의 client-side 집계를 SQL 한 round-trip 으로 대체.
-- Maturity 부분은 Rust calc 가 별도로 살아있으므로 simple count/by_bank/by_urgency 만 산출.

CREATE OR REPLACE FUNCTION banking_dashboard(
  p_company_id    uuid DEFAULT NULL
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
    -- 모든 활성 은행 + 회사명
    bank_rows AS (
      SELECT
        b.bank_id,
        b.bank_name,
        b.company_id,
        c.company_name,
        b.lc_limit_usd,
        b.opening_fee_rate,
        b.acceptance_fee_rate,
        b.fee_calc_method
      FROM banks b
      LEFT JOIN companies c ON c.company_id = b.company_id
      WHERE b.is_active = true
        AND (p_company_id IS NULL OR b.company_id = p_company_id)
    ),
    -- 은행별 활성 LC 사용액
    used_per_bank AS (
      SELECT
        bank_id,
        COALESCE(sum(amount_usd), 0)::numeric AS used_usd
      FROM lc_records
      WHERE status <> 'settled' AND repaid IS NOT TRUE
      GROUP BY bank_id
    ),
    -- 행별 used / available / usage_rate 계산
    by_bank_full AS (
      SELECT
        br.bank_id,
        br.bank_name,
        br.company_id,
        br.company_name,
        br.lc_limit_usd,
        LEAST(COALESCE(u.used_usd, 0), br.lc_limit_usd) AS used_usd,
        GREATEST(0, br.lc_limit_usd - LEAST(COALESCE(u.used_usd, 0), br.lc_limit_usd)) AS available_usd,
        CASE WHEN br.lc_limit_usd > 0
             THEN LEAST(100, LEAST(COALESCE(u.used_usd, 0), br.lc_limit_usd) / br.lc_limit_usd * 100)
             ELSE 0 END AS usage_rate,
        br.opening_fee_rate,
        br.acceptance_fee_rate,
        br.fee_calc_method
      FROM bank_rows br
      LEFT JOIN used_per_bank u ON u.bank_id = br.bank_id
    ),
    totals AS (
      SELECT
        count(*)::int AS bank_count,
        COALESCE(sum(lc_limit_usd), 0)::numeric AS total_limit_usd,
        COALESCE(sum(used_usd), 0)::numeric AS total_used_usd,
        COALESCE(sum(available_usd), 0)::numeric AS total_available_usd,
        count(DISTINCT company_id)::int AS company_count
      FROM by_bank_full
    ),
    -- limit_changes 24mo trend (delta = new - previous)
    months AS (
      SELECT to_char(date_trunc('month', v_now) - (gs * interval '1 month'), 'YYYY-MM') AS month
      FROM generate_series(0, 23) gs
    ),
    limit_changes_filtered AS (
      SELECT lc.change_date, (lc.new_limit - lc.previous_limit)::numeric AS delta
      FROM limit_changes lc
      JOIN banks b ON b.bank_id = lc.bank_id
      WHERE p_company_id IS NULL OR b.company_id = p_company_id
    ),
    limit_trend_raw AS (
      SELECT
        to_char(change_date::date, 'YYYY-MM') AS month,
        COALESCE(sum(delta), 0)::numeric AS limit_delta_usd
      FROM limit_changes_filtered
      GROUP BY 1
    ),
    -- LC open_date 24mo trend (active LC amount sum)
    lc_open_filtered AS (
      SELECT lr.open_date, lr.amount_usd
      FROM lc_records lr
      WHERE lr.status <> 'settled' AND lr.repaid IS NOT TRUE
        AND lr.open_date IS NOT NULL
        AND (p_company_id IS NULL OR lr.company_id = p_company_id)
    ),
    lc_open_trend_raw AS (
      SELECT
        to_char(open_date::date, 'YYYY-MM') AS month,
        COALESCE(sum(amount_usd), 0)::numeric AS lc_open_usd,
        count(*)::int AS lc_open_count
      FROM lc_open_filtered
      GROUP BY 1
    ),
    trend24_arr AS (
      SELECT
        m.month,
        COALESCE(lt.limit_delta_usd, 0::numeric) AS limit_delta_usd,
        COALESCE(ot.lc_open_usd, 0::numeric) AS lc_open_usd,
        COALESCE(ot.lc_open_count, 0) AS lc_open_count
      FROM months m
      LEFT JOIN limit_trend_raw lt ON lt.month = m.month
      LEFT JOIN lc_open_trend_raw ot ON ot.month = m.month
    ),
    -- by_bank rows (개별 은행 행 — frontend BankLimitRow 호환)
    by_bank_arr AS (
      SELECT
        bank_id,
        bank_name,
        company_id,
        company_name,
        lc_limit_usd,
        used_usd AS used,
        available_usd AS available,
        usage_rate,
        opening_fee_rate,
        acceptance_fee_rate,
        fee_calc_method
      FROM by_bank_full
      ORDER BY lc_limit_usd DESC, bank_name
    ),
    -- by_company aggregate
    by_company AS (
      SELECT
        company_id AS key,
        COALESCE(company_name, '미지정') AS label,
        count(*)::int AS bank_count,
        COALESCE(sum(lc_limit_usd), 0)::numeric AS limit_usd,
        COALESCE(sum(used_usd), 0)::numeric AS used_usd,
        COALESCE(sum(available_usd), 0)::numeric AS available_usd
      FROM by_bank_full
      GROUP BY company_id, company_name
      ORDER BY limit_usd DESC
    ),
    -- by_bank top10 (한도/사용/가용 별 정렬은 frontend 가 처리)
    -- Maturity (30일 이내 만기 LC)
    maturity_filtered AS (
      SELECT
        lr.lc_id,
        lr.lc_number,
        lr.po_id,
        po.po_number,
        lr.bank_id,
        b.bank_name,
        lr.amount_usd,
        lr.maturity_date,
        (lr.maturity_date - v_now)::int AS days_remaining,
        lr.status
      FROM lc_records lr
      LEFT JOIN banks b ON b.bank_id = lr.bank_id
      LEFT JOIN purchase_orders po ON po.po_id = lr.po_id
      WHERE lr.maturity_date IS NOT NULL
        AND lr.maturity_date BETWEEN v_now AND v_now + 30
        AND lr.status <> 'settled' AND lr.repaid IS NOT TRUE
        AND (p_company_id IS NULL OR lr.company_id = p_company_id)
    ),
    maturity_total AS (SELECT count(*)::int AS n FROM maturity_filtered),
    maturity_by_urgency AS (
      SELECT * FROM (
        VALUES
          ('urgent', '긴급 (7일 이내)', 0, 7),
          ('soon',   '주의 (8~14일)',   8, 14),
          ('later',  '여유 (15~30일)', 15, 30)
      ) AS u(key, label, lo, hi)
    ),
    maturity_urgency_rows AS (
      SELECT
        u.key, u.label,
        COALESCE(count(mf.lc_id) FILTER (WHERE mf.days_remaining BETWEEN u.lo AND u.hi), 0)::int AS count,
        COALESCE(sum(mf.amount_usd) FILTER (WHERE mf.days_remaining BETWEEN u.lo AND u.hi), 0)::numeric AS amount_usd_sum
      FROM maturity_by_urgency u
      LEFT JOIN maturity_filtered mf ON mf.days_remaining BETWEEN u.lo AND u.hi
      GROUP BY u.key, u.label, u.lo
      ORDER BY u.lo
    ),
    maturity_urgency AS (
      SELECT m.key, m.label, m.count, m.amount_usd_sum,
        CASE WHEN mt.n > 0 THEN m.count::numeric / mt.n ELSE 0::numeric END AS share
      FROM maturity_urgency_rows m, maturity_total mt
    ),
    maturity_by_bank_raw AS (
      SELECT
        COALESCE(bank_name, '미지정') AS key,
        COALESCE(bank_name, '미지정') AS label,
        count(*)::int AS count,
        COALESCE(sum(amount_usd), 0)::numeric AS amount_usd_sum
      FROM maturity_filtered GROUP BY bank_name
    ),
    maturity_by_bank AS (
      SELECT b.key, b.label, b.count, b.amount_usd_sum,
        CASE WHEN mt.n > 0 THEN b.count::numeric / mt.n ELSE 0::numeric END AS share
      FROM maturity_by_bank_raw b, maturity_total mt
      ORDER BY b.amount_usd_sum DESC, b.count DESC
      LIMIT 10
    )
  SELECT jsonb_build_object(
    'totals', (SELECT row_to_json(t.*)::jsonb FROM totals t),
    'trend24', (SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY month), '[]'::jsonb) FROM trend24_arr x),
    'by_bank', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_bank_arr x),
    'by_company', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM by_company x),
    'maturity', jsonb_build_object(
      'total_count', (SELECT n FROM maturity_total),
      'by_urgency', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM maturity_urgency x),
      'by_bank_top10', (SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) FROM maturity_by_bank x)
    )
  )
  INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION banking_dashboard(uuid)
  TO anon, authenticated, service_role;
