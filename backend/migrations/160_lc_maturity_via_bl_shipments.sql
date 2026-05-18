-- M160: LC 한도 점유 판정을 BL 만기 기반으로 전환
--
-- 배경 (M142 운영자 룰):
--   PO 1개 → LC 1개 → BL 여러 개. LC 1행에 만기 단일값 표현 불가.
--   만기는 bl_shipments.lc_maturity_date (B/L date + 90일) 에 BL 단위로 보관.
--
-- 진단 (2026-05-18):
--   M155~M159 가 lc_records.maturity_date 를 봤는데 78건 전부 NULL (의도된 설계).
--   결과적으로 모든 LC 가 영원히 한도 점유로 잡혀서 BankingPage 가 모두 100% 캡.
--
-- 새 룰:
--   한도 점유 LC = 미상환 + 미취소 + EXISTS(BL where lc_maturity_date >= today).
--   BL 미연결 LC = 데이터 갭 (2024년 LC 21건 등) 으로 간주, 자동 상환 처리.
--   `is_maturity_soon` = LC 가 연결 BL 중 [today, today+30] 만기 BL 보유.
--   `is_overdue` = false 고정 (M159 의 자동 상환 룰 유지).

-- =========================================================================
-- 1) banking_dashboard
-- =========================================================================

CREATE OR REPLACE FUNCTION public.banking_dashboard(p_company_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_now date := current_date;
  v_result jsonb;
BEGIN
  WITH
    bank_rows AS (
      SELECT
        b.bank_id, b.bank_name, b.company_id, c.company_name, b.lc_limit_usd,
        b.opening_fee_rate, b.acceptance_fee_rate, b.fee_calc_method
      FROM banks b
      LEFT JOIN companies c ON c.company_id = b.company_id
      WHERE b.is_active = true
        AND (p_company_id IS NULL OR b.company_id = p_company_id)
    ),
    -- 한도 점유 LC: 미상환·미취소 + 연결 BL 중 미래 만기 존재.
    held_lcs AS (
      SELECT lc.lc_id, lc.bank_id, lc.amount_usd, lc.open_date, lc.company_id
      FROM lc_records lc
      WHERE coalesce(lc.repaid, false) = false
        AND lc.status <> 'cancelled'
        AND EXISTS (
          SELECT 1 FROM bl_shipments bl
          WHERE bl.lc_id = lc.lc_id AND bl.lc_maturity_date >= v_now
        )
    ),
    used_per_bank AS (
      SELECT bank_id, COALESCE(sum(amount_usd), 0)::numeric AS used_usd
      FROM held_lcs GROUP BY bank_id
    ),
    by_bank_full AS (
      SELECT
        br.bank_id, br.bank_name, br.company_id, br.company_name, br.lc_limit_usd,
        LEAST(COALESCE(u.used_usd, 0), br.lc_limit_usd) AS used_usd,
        GREATEST(0, br.lc_limit_usd - LEAST(COALESCE(u.used_usd, 0), br.lc_limit_usd)) AS available_usd,
        CASE WHEN br.lc_limit_usd > 0
             THEN LEAST(100, LEAST(COALESCE(u.used_usd, 0), br.lc_limit_usd) / br.lc_limit_usd * 100)
             ELSE 0 END AS usage_rate,
        br.opening_fee_rate, br.acceptance_fee_rate, br.fee_calc_method
      FROM bank_rows br LEFT JOIN used_per_bank u ON u.bank_id = br.bank_id
    ),
    totals AS (
      SELECT count(*)::int AS bank_count,
             COALESCE(sum(lc_limit_usd), 0)::numeric AS total_limit_usd,
             COALESCE(sum(used_usd), 0)::numeric AS total_used_usd,
             COALESCE(sum(available_usd), 0)::numeric AS total_available_usd,
             count(DISTINCT company_id)::int AS company_count
      FROM by_bank_full
    ),
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
      SELECT to_char(change_date::date, 'YYYY-MM') AS month,
             COALESCE(sum(delta), 0)::numeric AS limit_delta_usd
      FROM limit_changes_filtered GROUP BY 1
    ),
    lc_open_filtered AS (
      SELECT hl.open_date, hl.amount_usd
      FROM held_lcs hl
      WHERE hl.open_date IS NOT NULL
        AND (p_company_id IS NULL OR hl.company_id = p_company_id)
    ),
    lc_open_trend_raw AS (
      SELECT to_char(open_date::date, 'YYYY-MM') AS month,
             COALESCE(sum(amount_usd), 0)::numeric AS lc_open_usd,
             count(*)::int AS lc_open_count
      FROM lc_open_filtered GROUP BY 1
    ),
    trend24_arr AS (
      SELECT m.month,
             COALESCE(lt.limit_delta_usd, 0::numeric) AS limit_delta_usd,
             COALESCE(ot.lc_open_usd, 0::numeric) AS lc_open_usd,
             COALESCE(ot.lc_open_count, 0) AS lc_open_count
      FROM months m
      LEFT JOIN limit_trend_raw lt ON lt.month = m.month
      LEFT JOIN lc_open_trend_raw ot ON ot.month = m.month
    ),
    by_bank_arr AS (
      SELECT bank_id, bank_name, company_id, company_name, lc_limit_usd,
             used_usd AS used, available_usd AS available, usage_rate,
             opening_fee_rate, acceptance_fee_rate, fee_calc_method
      FROM by_bank_full ORDER BY lc_limit_usd DESC, bank_name
    ),
    by_company AS (
      SELECT company_id AS key, COALESCE(company_name, '미지정') AS label,
             count(*)::int AS bank_count,
             COALESCE(sum(lc_limit_usd), 0)::numeric AS limit_usd,
             COALESCE(sum(used_usd), 0)::numeric AS used_usd,
             COALESCE(sum(available_usd), 0)::numeric AS available_usd
      FROM by_bank_full GROUP BY company_id, company_name
      ORDER BY limit_usd DESC
    ),
    -- 만기 임박 알림: BL 단위 (LC 1개가 BL N개 → BL N행).
    maturity_filtered AS (
      SELECT lc.lc_id, lc.lc_number, lc.po_id, po.po_number,
             lc.bank_id, b.bank_name, lc.amount_usd,
             bl.lc_maturity_date AS maturity_date,
             (bl.lc_maturity_date - v_now)::int AS days_remaining,
             lc.status
      FROM bl_shipments bl
      JOIN lc_records lc ON lc.lc_id = bl.lc_id
      LEFT JOIN banks b ON b.bank_id = lc.bank_id
      LEFT JOIN purchase_orders po ON po.po_id = lc.po_id
      WHERE bl.lc_maturity_date BETWEEN v_now AND v_now + 30
        AND coalesce(lc.repaid, false) = false
        AND lc.status <> 'cancelled'
        AND (p_company_id IS NULL OR lc.company_id = p_company_id)
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
      SELECT u.key, u.label,
             COALESCE(count(mf.lc_id) FILTER (WHERE mf.days_remaining BETWEEN u.lo AND u.hi), 0)::int AS count,
             COALESCE(sum(mf.amount_usd) FILTER (WHERE mf.days_remaining BETWEEN u.lo AND u.hi), 0)::numeric AS amount_usd_sum
      FROM maturity_by_urgency u
      LEFT JOIN maturity_filtered mf ON mf.days_remaining BETWEEN u.lo AND u.hi
      GROUP BY u.key, u.label, u.lo ORDER BY u.lo
    ),
    maturity_urgency AS (
      SELECT m.key, m.label, m.count, m.amount_usd_sum,
             CASE WHEN mt.n > 0 THEN m.count::numeric / mt.n ELSE 0::numeric END AS share
      FROM maturity_urgency_rows m, maturity_total mt
    ),
    maturity_by_bank_raw AS (
      SELECT COALESCE(bank_name, '미지정') AS key,
             COALESCE(bank_name, '미지정') AS label,
             count(*)::int AS count,
             COALESCE(sum(amount_usd), 0)::numeric AS amount_usd_sum
      FROM maturity_filtered GROUP BY bank_name
    ),
    maturity_by_bank AS (
      SELECT b.key, b.label, b.count, b.amount_usd_sum,
             CASE WHEN mt.n > 0 THEN b.count::numeric / mt.n ELSE 0::numeric END AS share
      FROM maturity_by_bank_raw b, maturity_total mt
      ORDER BY b.amount_usd_sum DESC, b.count DESC LIMIT 10
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
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

-- =========================================================================
-- 2) lcs_dashboard
--    is_maturity_soon: LC 가 [today, today+30] BL 만기 보유.
--    is_overdue: false 유지 (M159).
-- =========================================================================

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
  v_horizon_end date := current_date + INTERVAL '30 days';
  v_result jsonb;
BEGIN
  WITH
    base AS (
      SELECT
        lc.lc_id, lc.bank_id, lc.open_date, lc.maturity_date, lc.amount_usd,
        lc.status, lc.repaid, b.bank_name,
        (lc.status <> 'cancelled') AS is_active,
        (coalesce(lc.repaid, false) = false AND lc.status <> 'cancelled'
          AND EXISTS (
            SELECT 1 FROM bl_shipments bl
            WHERE bl.lc_id = lc.lc_id
              AND bl.lc_maturity_date BETWEEN v_now AND v_horizon_end
          )) AS is_maturity_soon,
        false AS is_overdue
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
      SELECT count(*)::int AS count,
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
      SELECT to_char(open_date, 'YYYY-MM') AS month,
             count(*)::int AS count,
             count(*) FILTER (WHERE is_active)::int AS active_count,
             COALESCE(sum(amount_usd), 0)::numeric AS amount_usd,
             count(DISTINCT bank_id) FILTER (WHERE bank_id IS NOT NULL)::int AS distinct_banks
      FROM base WHERE open_date IS NOT NULL GROUP BY 1
    ),
    trend24_arr AS (
      SELECT m.month,
             COALESCE(t.count, 0) AS count,
             COALESCE(t.active_count, 0) AS active_count,
             COALESCE(t.amount_usd, 0::numeric) AS amount_usd,
             COALESCE(t.distinct_banks, 0) AS distinct_banks
      FROM months m LEFT JOIN trend_raw t ON t.month = m.month
    ),
    scoped AS (
      SELECT * FROM base
      WHERE (p_status_scope = 'lifetime')
         OR (p_status_scope = 'active' AND is_active)
         OR (p_status_scope = 'maturity_soon' AND is_maturity_soon)
    ),
    scoped_total AS (SELECT count(*)::int AS n FROM scoped),
    by_status_raw AS (
      SELECT status AS key,
             CASE status
               WHEN 'opened' THEN '개설'
               WHEN 'settled' THEN '정산'
               WHEN 'cancelled' THEN '취소'
               ELSE status END AS label,
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
      SELECT COALESCE(bank_id::text, '__unset__') AS key,
             COALESCE(bank_name, '미지정') AS label,
             count(*)::int AS count,
             COALESCE(sum(amount_usd), 0)::numeric AS amount_usd_sum
      FROM scoped GROUP BY bank_id, bank_name
    ),
    by_bank_top10 AS (
      SELECT b.key, b.label, b.count, b.amount_usd_sum,
             CASE WHEN st.n > 0 THEN b.count::numeric / st.n ELSE 0::numeric END AS share
      FROM by_bank_raw b, scoped_total st
      ORDER BY b.amount_usd_sum DESC, b.count DESC LIMIT 10
    ),
    -- urgency: scoped LC 의 BL 최이른 미래 만기 (LC 단위 단일 days_remaining).
    scoped_min_bl_maturity AS (
      SELECT s.lc_id, MIN(bl.lc_maturity_date) AS min_maturity
      FROM scoped s
      JOIN bl_shipments bl ON bl.lc_id = s.lc_id
      WHERE bl.lc_maturity_date BETWEEN v_now AND v_horizon_end
      GROUP BY s.lc_id
    ),
    urgency_raw AS (
      SELECT
        CASE
          WHEN smm.min_maturity <= v_now + INTERVAL '7 days' THEN 'urgent'
          WHEN smm.min_maturity <= v_now + INTERVAL '14 days' THEN 'soon14'
          ELSE 'later'
        END AS key,
        count(*)::int AS count,
        COALESCE(sum(s.amount_usd), 0)::numeric AS amount_usd_sum
      FROM scoped s
      JOIN scoped_min_bl_maturity smm ON smm.lc_id = s.lc_id
      WHERE p_status_scope = 'maturity_soon'
      GROUP BY 1
    ),
    urgency_keys AS (
      SELECT unnest(ARRAY['urgent', 'soon14', 'later']) AS k
    ),
    by_urgency AS (
      SELECT uk.k AS key,
             CASE uk.k
               WHEN 'urgent' THEN '긴급 (7일 이내)'
               WHEN 'soon14' THEN '주의 (8~14일)'
               WHEN 'later' THEN '여유 (15~30일)' END AS label,
             COALESCE(ur.count, 0) AS count,
             COALESCE(ur.amount_usd_sum, 0::numeric) AS amount_usd_sum,
             CASE WHEN st.n > 0 THEN COALESCE(ur.count, 0)::numeric / st.n ELSE 0::numeric END AS share
      FROM urgency_keys uk
      LEFT JOIN urgency_raw ur ON ur.key = uk.k
      , scoped_total st
      ORDER BY array_position(ARRAY['urgent', 'soon14', 'later'], uk.k)
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
  ) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION lcs_dashboard(uuid, uuid, uuid, text, text)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
