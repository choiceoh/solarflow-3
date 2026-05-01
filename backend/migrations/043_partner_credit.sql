-- 043_partner_credit.sql
-- BARO Phase 3 — 거래처별 신용한도 / 결제 조건 (미수금·한도 보드용)
--   partners 테이블에 신용한도(원), 결제일수 컬럼 추가.
--   집계는 sales/receipt_matches에서 RPC로 계산.
--
-- 적용:
--   psql $SUPABASE_DB_URL -f backend/migrations/043_partner_credit.sql
--   psql $SUPABASE_DB_URL -c "NOTIFY pgrst, 'reload schema';"

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS credit_limit_krw  numeric(18, 0),
  ADD COLUMN IF NOT EXISTS credit_payment_days integer;

COMMENT ON COLUMN partners.credit_limit_krw   IS 'BARO Phase 3: 거래처 신용한도(원). NULL=미설정.';
COMMENT ON COLUMN partners.credit_payment_days IS 'BARO Phase 3: 결제일수(매출일 기준). NULL=미설정.';

-- 미수금/한도 보드 집계 RPC
-- 비유: "거래처 명함" + "이번달 매출 - 입금" + "한도 - 미수 = 잔여 한도"
CREATE OR REPLACE FUNCTION baro_credit_board()
RETURNS TABLE (
  partner_id          uuid,
  partner_name        varchar,
  partner_type        varchar,
  credit_limit_krw    numeric,
  credit_payment_days integer,
  outstanding_krw     numeric,
  remaining_krw       numeric,
  utilization_pct     numeric,
  last_sale_date      date,
  last_receipt_date   date,
  oldest_unpaid_days  integer
) LANGUAGE sql STABLE AS $$
WITH sales_dated AS (
  -- 매출 1건의 기준일자: 세금계산서 발행일 우선, 없으면 created_at
  SELECT
    s.sale_id,
    s.customer_id,
    s.total_amount,
    s.status,
    COALESCE(s.tax_invoice_date, s.created_at::date) AS sale_date
  FROM sales s
  WHERE s.status = 'active' AND s.total_amount IS NOT NULL
),
sales_total AS (
  SELECT
    customer_id AS partner_id,
    SUM(total_amount) AS sales_sum,
    MAX(sale_date) AS last_sale
  FROM sales_dated
  GROUP BY customer_id
),
matched_total AS (
  SELECT
    s.customer_id AS partner_id,
    SUM(rm.matched_amount) AS matched_sum
  FROM receipt_matches rm
  JOIN sales s ON s.sale_id = rm.sale_id
  GROUP BY s.customer_id
),
last_receipt AS (
  SELECT
    r.customer_id AS partner_id,
    MAX(r.receipt_date) AS last_receipt_date
  FROM receipts r
  GROUP BY r.customer_id
),
oldest_open AS (
  SELECT
    sd.customer_id AS partner_id,
    MIN(sd.sale_date) FILTER (
      WHERE COALESCE((
        SELECT SUM(rm2.matched_amount) FROM receipt_matches rm2 WHERE rm2.sale_id = sd.sale_id
      ), 0) < sd.total_amount
    ) AS oldest_open_date
  FROM sales_dated sd
  GROUP BY sd.customer_id
)
SELECT
  p.partner_id,
  p.partner_name,
  p.partner_type,
  p.credit_limit_krw,
  p.credit_payment_days,
  GREATEST(COALESCE(st.sales_sum, 0) - COALESCE(mt.matched_sum, 0), 0) AS outstanding_krw,
  CASE
    WHEN p.credit_limit_krw IS NULL THEN NULL
    ELSE p.credit_limit_krw - GREATEST(COALESCE(st.sales_sum, 0) - COALESCE(mt.matched_sum, 0), 0)
  END AS remaining_krw,
  CASE
    WHEN p.credit_limit_krw IS NULL OR p.credit_limit_krw = 0 THEN NULL
    ELSE ROUND(
      GREATEST(COALESCE(st.sales_sum, 0) - COALESCE(mt.matched_sum, 0), 0) * 100.0 / p.credit_limit_krw,
      2
    )
  END AS utilization_pct,
  st.last_sale AS last_sale_date,
  lr.last_receipt_date,
  CASE
    WHEN oo.oldest_open_date IS NULL THEN NULL
    ELSE (CURRENT_DATE - oo.oldest_open_date)::integer
  END AS oldest_unpaid_days
FROM partners p
LEFT JOIN sales_total   st ON st.partner_id = p.partner_id
LEFT JOIN matched_total mt ON mt.partner_id = p.partner_id
LEFT JOIN last_receipt  lr ON lr.partner_id = p.partner_id
LEFT JOIN oldest_open   oo ON oo.partner_id = p.partner_id
WHERE p.is_active = true
  AND (p.partner_type = 'customer' OR p.partner_type = 'both');
$$;

COMMENT ON FUNCTION baro_credit_board() IS
  'BARO Phase 3: 거래처별 미수금/한도/연체일수 집계. 활성 customer/both 거래처 기준.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION baro_credit_board() TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION baro_credit_board() TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION baro_credit_board() TO service_role;
  END IF;
END $$;
