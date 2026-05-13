-- 111: sales_with_meta — outbound_company_id / order_company_id 컬럼 추가.
--      094 가 erp_closed/날짜/수금을 server-side 술어로 옮긴 것과 동일 패턴으로
--      company_id 필터까지 server-side 로 끝낸다.
--
-- 배경:
--   applySaleFilters 의 company_id 분기가 outbounds.company_id / orders.company_id
--   를 Go 측에서 UUID 리스트로 끌어와 (outbound_id.in.(...) OR order_id.in.(...))
--   URL 로 합친다. 대형 테넌트(예: outbounds 2,747 + orders 471) 에서 한 URL 이
--   ~115KB 가 되어 Cloudflare 가 평문 "Bad Request" 로 거절 → postgrest-go 가
--   JSON 파싱 실패 ("invalid character 'B' looking for beginning of value") → 500.
--   /sales, /sales/summary, /sales/dashboard 모두 동일 경로.
--
-- 해법:
--   sales_with_meta 가 이미 outbounds / orders 에 LEFT JOIN 중이므로 두 회사
--   컬럼만 추가 노출하면 server-side `or(outbound_company_id.eq.X,order_company_id.eq.X)`
--   술어로 끝난다. UUID 리스트 왕복도 없다.
--
-- 정합성: 094 와 동일한 LEFT JOIN — sale 이 outbound/order 어느 쪽에도 안 붙으면
--   두 컬럼 모두 NULL. eq 필터는 그 행을 자연히 배제하므로 기존 idsByCompany
--   (양쪽 모두 매칭 가능) 동작과 일치.

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
  END AS receipt_status,
  o.company_id   AS outbound_company_id,
  ord.company_id AS order_company_id
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

-- company_id 필터 가속 — outbounds/orders 의 company_id 인덱스가 없으면 추가.
CREATE INDEX IF NOT EXISTS idx_outbounds_company_id ON outbounds(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_company_id    ON orders(company_id)    WHERE company_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
