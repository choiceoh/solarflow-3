-- 094: sales_with_meta view — receipt_status / business_date 를 server-side 계산해
--       List/Summary 가 PostgREST 필터만으로 동작하게 한다 (수천 UUID URL 우회 근본 해법).
--
-- 배경 (PR #701 핫픽스 → 근본 해법):
--   applySaleFilters 가 erp_closed=false / 날짜 / 수금 세 필터를 Go 측에서
--   sale_id 리스트로 변환해 PostgREST .In() 으로 보내는데, receipt_status=open
--   같은 광범위 필터는 1,000건+ UUID 가 URL 한도(Cloudflare 측 ~8KB) 를 초과해
--   400 Bad Request → supabase-go JSON 파싱 실패 → 500.
--   #701 chunk 분할은 회피책일 뿐, 진짜 해법은 server-side 계산 컬럼.
--
-- 이 마이그레이션:
--   - business_date:   COALESCE(tax_invoice_date, outbound_date, order_date)
--                      (미발행 매출도 기간 필터에 잡히게 — 093 RPC 와 동일 정책)
--   - business_month:  business_date 의 YYYY-MM 텍스트 (month=YYYY-MM 필터 ergonomics)
--   - collected_amount: receipt_matches.matched_amount 합
--                       (sale_id 직매칭 + sale_id NULL 일 때 outbound_id 폴백)
--   - outstanding_amount: GREATEST(total_amount - collected, 0)
--   - receipt_status:  paid / unpaid / partial / NULL (총액 0 인 경우)
--                      "open" 은 application 측에서 in.(unpaid,partial) 로 매핑
--
-- 정합성: Go 측 saleReceiptStatusMatches / saleBusinessDateMatches 와 동일 의미.
-- 임계값 0.01 은 receiptMatchAmountEpsilon (Go const) 와 일치.

CREATE OR REPLACE VIEW sales_with_meta AS
SELECT
  s.*,
  COALESCE(s.tax_invoice_date::date, o.outbound_date::date, ord.order_date::date) AS business_date,
  to_char(
    COALESCE(s.tax_invoice_date::date, o.outbound_date::date, ord.order_date::date),
    'YYYY-MM'
  ) AS business_month,
  COALESCE(rm.collected, 0)::numeric(15,0) AS collected_amount,
  GREATEST(COALESCE(s.total_amount, 0) - COALESCE(rm.collected, 0), 0)::numeric(15,0) AS outstanding_amount,
  CASE
    WHEN COALESCE(s.total_amount, 0) <= 0.01 THEN NULL
    WHEN COALESCE(s.total_amount, 0) - COALESCE(rm.collected, 0) <= 0.01 THEN 'paid'
    WHEN COALESCE(rm.collected, 0) <= 0.01 THEN 'unpaid'
    ELSE 'partial'
  END AS receipt_status
FROM sales s
LEFT JOIN outbounds o ON o.outbound_id = s.outbound_id
LEFT JOIN orders ord  ON ord.order_id  = s.order_id
LEFT JOIN LATERAL (
  SELECT SUM(rm.matched_amount) AS collected
  FROM receipt_matches rm
  WHERE rm.sale_id = s.sale_id
     OR (rm.sale_id IS NULL AND rm.outbound_id = s.outbound_id)
) rm ON TRUE;

GRANT SELECT ON sales_with_meta TO anon, authenticated, service_role;

-- LATERAL 서브쿼리 / 기간 필터 성능을 위해 인덱스 보강 (이미 있으면 무시).
CREATE INDEX IF NOT EXISTS idx_receipt_matches_sale_id     ON receipt_matches(sale_id)     WHERE sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receipt_matches_outbound_id ON receipt_matches(outbound_id) WHERE outbound_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_outbound_id           ON sales(outbound_id)           WHERE outbound_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_order_id              ON sales(order_id)              WHERE order_id    IS NOT NULL;

NOTIFY pgrst, 'reload schema';
