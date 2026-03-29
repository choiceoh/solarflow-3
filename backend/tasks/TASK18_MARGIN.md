# 작업: Step 16 — 마진/이익률 분석 + 단가 추이
RULES.md를 반드시 따를 것. CHECKLIST_TEMPLATE.md 양식으로 보고할 것.
감리 2건 지적사항 반영 완료.

## API 1: 마진/이익률 분석

POST /api/calc/margin-analysis
요청:
{
  "company_id": "uuid" (필수),
  "manufacturer_id": "uuid" (선택),
  "product_id": "uuid" (선택),
  "date_from": "2026-01-01" (선택),
  "date_to": "2026-03-31" (선택),
  "cost_basis": "cif" (선택 — "cif" 또는 "landed", 기본 "cif")
}

cost_basis:
- "cif": 회계 원가(cif_wp_krw) 기준 — 회계팀 보고용
- "landed": 실무 원가(landed_wp_krw) 기준 — 판매 의사결정용

응답:
{
  "items": [
    {
      "manufacturer_name": "진코솔라",
      "product_code": "M-JK0635-01",
      "product_name": "JKM635N-78HL4-BDV-S",
      "spec_wp": 635,
      "module_width_mm": 2465,
      "module_height_mm": 1134,
      "total_sold_qty": 5280,
      "total_sold_kw": 3352.8,
      "avg_sale_price_wp": 155.0,
      "avg_cost_wp": 131.5,
      "margin_wp": 23.5,
      "margin_rate": 15.16,
      "total_revenue_krw": 520584000,
      "total_cost_krw": 440964000,
      "total_margin_krw": 79620000,
      "cost_basis": "cif",
      "sale_count": 12
    }
  ],
  "summary": {
    "total_sold_kw": 25600.0,
    "total_revenue_krw": 3980000000,
    "total_cost_krw": 3350000000,
    "total_margin_krw": 630000000,
    "overall_margin_rate": 15.83,
    "cost_basis": "cif"
  },
  "calculated_at": "2026-03-29T12:00:00Z"
}

정렬: 제조사명 -> 모듈크기(mm) -> 출력(Wp)

### SQL (감리 지적 1번 반영: s.customer_id 제거)

1단계: 품번별 판매 집계
SELECT o.product_id, o.company_id,
       p.product_code, p.product_name, p.spec_wp,
       p.module_width_mm, p.module_height_mm,
       m.name_kr as manufacturer_name, m.manufacturer_id,
       SUM(o.quantity) as total_qty,
       SUM(o.capacity_kw) as total_kw,
       SUM(s.supply_amount) as total_revenue,
       COUNT(s.sale_id) as sale_count,
       CASE WHEN SUM(o.quantity * p.spec_wp) > 0
         THEN SUM(s.supply_amount)::float / SUM(o.quantity * p.spec_wp)
         ELSE 0 END as avg_sale_price_wp
FROM sales s
JOIN outbounds o ON s.outbound_id = o.outbound_id
JOIN products p ON o.product_id = p.product_id
JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
WHERE o.company_id = $1
  AND o.status = 'active'
  AND ($2::uuid IS NULL OR p.manufacturer_id = $2)
  AND ($3::uuid IS NULL OR o.product_id = $3)
  AND ($4::date IS NULL OR o.outbound_date >= $4)
  AND ($5::date IS NULL OR o.outbound_date <= $5)
GROUP BY o.product_id, o.company_id,
         p.product_code, p.product_name, p.spec_wp,
         p.module_width_mm, p.module_height_mm,
         m.name_kr, m.manufacturer_id
ORDER BY m.name_kr, p.module_width_mm, p.module_height_mm, p.spec_wp

2단계: 품번별 가중평균 원가 (CIF)
SELECT cd.product_id,
       CASE WHEN SUM(cd.quantity) > 0
         THEN SUM(cd.cif_wp_krw * cd.quantity)::float / SUM(cd.quantity)
         ELSE 0 END as avg_cif_wp
FROM cost_details cd
JOIN import_declarations id ON cd.declaration_id = id.declaration_id
WHERE id.company_id = $1
  AND ($2::uuid IS NULL OR cd.product_id = $2)
  AND cd.cif_wp_krw IS NOT NULL
GROUP BY cd.product_id

2-b단계: 품번별 가중평균 원가 (Landed)
SELECT cd.product_id,
       CASE WHEN SUM(cd.quantity) > 0
         THEN SUM(cd.landed_wp_krw * cd.quantity)::float / SUM(cd.quantity)
         ELSE 0 END as avg_landed_wp
FROM cost_details cd
JOIN import_declarations id ON cd.declaration_id = id.declaration_id
WHERE id.company_id = $1
  AND ($2::uuid IS NULL OR cd.product_id = $2)
  AND cd.landed_wp_krw IS NOT NULL
GROUP BY cd.product_id

3단계: Rust에서 조합
- 판매 집계 + 원가를 product_id로 매칭
- cost_basis에 따라 cif 또는 landed 선택
- margin_wp = avg_sale_price_wp - avg_cost_wp
- margin_rate = margin_wp / avg_sale_price_wp * 100
- 원가 없는 품번: avg_cost_wp = null, margin 계산 불가 표시

## API 2: 거래처별 매출/수금 분석 (감리 지적 2번 반영: 마진+계약금 추가)

POST /api/calc/customer-analysis
요청:
{
  "company_id": "uuid" (필수),
  "customer_id": "uuid" (선택),
  "date_from": "2026-01-01" (선택),
  "date_to": "2026-03-31" (선택)
}

응답:
{
  "items": [
    {
      "customer_id": "uuid",
      "customer_name": "바로(주)",
      "total_sales_krw": 850000000,
      "total_collected_krw": 785437600,
      "outstanding_krw": 64562400,
      "outstanding_count": 3,
      "oldest_outstanding_days": 45,
      "avg_payment_days": 38,
      "avg_margin_rate": 15.2,
      "avg_deposit_rate": 20.0,
      "status": "normal"
    }
  ],
  "summary": {
    "total_sales_krw": 3980000000,
    "total_collected_krw": 3650000000,
    "total_outstanding_krw": 330000000
  },
  "calculated_at": "2026-03-29T12:00:00Z"
}

status: "normal"(30일 이하), "warning"(31~60일), "overdue"(61일+)

### SQL

거래처별 매출:
SELECT s.customer_id, ptr.partner_name,
       SUM(s.total_amount) as total_sales,
       COUNT(s.sale_id) as sale_count
FROM sales s
JOIN partners ptr ON s.customer_id = ptr.partner_id
JOIN outbounds o ON s.outbound_id = o.outbound_id
WHERE o.company_id = $1
  AND o.status = 'active'
  AND ($2::uuid IS NULL OR s.customer_id = $2)
  AND ($3::date IS NULL OR o.outbound_date >= $3)
  AND ($4::date IS NULL OR o.outbound_date <= $4)
GROUP BY s.customer_id, ptr.partner_name

거래처별 수금:
SELECT r.customer_id,
       COALESCE(SUM(rm.matched_amount), 0) as total_collected
FROM receipts r
JOIN receipt_matches rm ON r.receipt_id = rm.receipt_id
WHERE ($1::uuid IS NULL OR r.customer_id = $1)
GROUP BY r.customer_id

미수금 건별 경과일:
SELECT s.sale_id, s.customer_id, s.total_amount,
       o.outbound_date,
       s.total_amount - COALESCE((
         SELECT SUM(rm2.matched_amount) FROM receipt_matches rm2
         WHERE rm2.outbound_id = o.outbound_id
       ), 0) as remaining,
       CURRENT_DATE - o.outbound_date as days_elapsed
FROM sales s
JOIN outbounds o ON s.outbound_id = o.outbound_id
WHERE o.company_id = $1
  AND o.status = 'active'
  AND s.total_amount > COALESCE((
    SELECT SUM(rm3.matched_amount) FROM receipt_matches rm3
    WHERE rm3.outbound_id = o.outbound_id
  ), 0)

거래처별 평균 마진율 (감리 지적 추가):
SELECT s.customer_id,
       CASE WHEN SUM(o.quantity * p.spec_wp) > 0
         THEN SUM(s.supply_amount)::float / SUM(o.quantity * p.spec_wp)
         ELSE 0 END as avg_sale_wp
FROM sales s
JOIN outbounds o ON s.outbound_id = o.outbound_id
JOIN products p ON o.product_id = p.product_id
WHERE o.company_id = $1 AND o.status = 'active'
GROUP BY s.customer_id

(품번별 가중평균 원가는 마진 분석과 동일 쿼리 재사용)

거래처별 평균 계약금 비율 (감리 지적 추가):
SELECT ord.customer_id,
       AVG(ord.deposit_rate) as avg_deposit_rate
FROM orders ord
WHERE ord.company_id = $1
  AND ord.deposit_rate IS NOT NULL
GROUP BY ord.customer_id

Rust에서:
- 매출 - 수금 = 미수금
- oldest_outstanding_days: 미수금 건 중 최장 경과일
- avg_payment_days: 수금 완료 건 기준 평균 결제일
- avg_margin_rate: 거래처 평균 판매단가 vs 품번별 원가 → 마진율
- avg_deposit_rate: 해당 거래처 수주의 평균 계약금 비율
- status 판별: 30/60일 기준

## API 3: 단가 추이 분석

POST /api/calc/price-trend
요청:
{
  "company_id": "uuid" (필수),
  "manufacturer_id": "uuid" (선택),
  "product_id": "uuid" (선택),
  "period": "quarterly" (선택 — "monthly"/"quarterly", 기본 "quarterly")
}

응답:
{
  "trends": [
    {
      "manufacturer_name": "진코솔라",
      "product_name": "JKM635N-78HL4-BDV-S",
      "spec_wp": 635,
      "data_points": [
        {
          "period": "2025-Q3",
          "avg_purchase_price_usd_wp": 0.087,
          "avg_purchase_price_krw_wp": 127.66,
          "avg_sale_price_krw_wp": 155.0,
          "exchange_rate": 1468.30,
          "volume_kw": 12500.0
        }
      ]
    }
  ],
  "calculated_at": "2026-03-29T12:00:00Z"
}

### SQL

구매 단가 추이 (면장 기준):
SELECT
  p.product_id, p.product_name, p.spec_wp,
  m.name_kr as manufacturer_name,
  CASE WHEN $1 = 'quarterly'
    THEN TO_CHAR(id.declaration_date, 'YYYY-"Q"Q')
    ELSE TO_CHAR(id.declaration_date, 'YYYY-MM')
  END as period,
  CASE WHEN SUM(cd.quantity * p.spec_wp) > 0
    THEN SUM(cd.fob_total_usd)::float / SUM(cd.quantity * p.spec_wp)
    ELSE 0 END as avg_usd_wp,
  CASE WHEN SUM(cd.quantity) > 0
    THEN SUM(cd.cif_wp_krw * cd.quantity)::float / SUM(cd.quantity)
    ELSE 0 END as avg_krw_wp,
  CASE WHEN SUM(cd.quantity) > 0
    THEN SUM(cd.exchange_rate * cd.quantity)::float / SUM(cd.quantity)
    ELSE 0 END as avg_exchange_rate,
  SUM(cd.capacity_kw) as volume_kw
FROM cost_details cd
JOIN import_declarations id ON cd.declaration_id = id.declaration_id
JOIN products p ON cd.product_id = p.product_id
JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
WHERE id.company_id = $2
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
  AND ($4::uuid IS NULL OR cd.product_id = $4)
GROUP BY p.product_id, p.product_name, p.spec_wp,
         m.name_kr, period
ORDER BY m.name_kr, p.spec_wp, period

판매 단가 추이:
SELECT
  o.product_id,
  CASE WHEN $1 = 'quarterly'
    THEN TO_CHAR(o.outbound_date, 'YYYY-"Q"Q')
    ELSE TO_CHAR(o.outbound_date, 'YYYY-MM')
  END as period,
  CASE WHEN SUM(o.quantity * p.spec_wp) > 0
    THEN SUM(s.supply_amount)::float / SUM(o.quantity * p.spec_wp)
    ELSE 0 END as avg_sale_wp
FROM sales s
JOIN outbounds o ON s.outbound_id = o.outbound_id
JOIN products p ON o.product_id = p.product_id
WHERE o.company_id = $2
  AND o.status = 'active'
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
  AND ($4::uuid IS NULL OR o.product_id = $4)
GROUP BY o.product_id, period

Rust에서: product_id + period로 매칭, 양쪽 데이터 조합

## Rust 파일

### engine/src/calc/margin.rs (신규)
- MarginAnalysisRequest, MarginItem, MarginSummary, MarginAnalysisResponse
- calculate_margin(pool, req) -> Result<MarginAnalysisResponse>
- CustomerAnalysisRequest, CustomerItem, CustomerSummary, CustomerAnalysisResponse
- analyze_customers(pool, req) -> Result<CustomerAnalysisResponse>
- PriceTrendRequest, TrendProduct, TrendDataPoint, PriceTrendResponse
- calculate_price_trend(pool, req) -> Result<PriceTrendResponse>

### engine/src/calc/mod.rs 수정
- pub mod margin; 추가

### engine/src/routes/calc.rs 수정
- POST /api/calc/margin-analysis 추가
- POST /api/calc/customer-analysis 추가
- POST /api/calc/price-trend 추가

### engine/src/model/margin.rs (신규)
### engine/src/model/mod.rs 수정

## Go 연동

### backend/internal/engine/client.go 메서드 추가
- GetMarginAnalysis(req) (MarginAnalysisResponse, error)
- GetCustomerAnalysis(req) (CustomerAnalysisResponse, error)
- GetPriceTrend(req) (PriceTrendResponse, error)

### backend/internal/model/margin_response.go (신규)

## 테스트

### Rust: engine/tests/margin_test.rs
- margin-analysis: company_id 누락 400
- margin-analysis: 데이터 없으면 빈 items
- margin-analysis: cost_basis 기본값 "cif" 확인
- customer-analysis: company_id 누락 400
- customer-analysis: 데이터 없으면 빈 items
- price-trend: company_id 누락 400
- price-trend: period 기본값 "quarterly" 확인
- 마진 단위: sale=155, cost=131.5 -> margin=23.5, rate=15.16%
- 미수금 status 단위: 30일 normal, 45일 warning, 65일 overdue

### Go: backend/internal/engine/margin_test.go
- mock 서버로 3개 메서드 호출 테스트

## DECISIONS.md 추가
- D-031: 마진 원가는 품번별 가중평균 (FIFO 미적용)
- D-032: cost_basis 선택 (cif/landed)
- D-033: 미수금 경과일 기준은 출고일 (outbound_date)
- D-034: 거래처 분석에 마진율+계약금비율 포함
  이유: "미수금 많은 업체 -> 마진은? -> 계약금은?" 한 화면 판단.

## PROGRESS.md 업데이트
- Step 16 완료 기록
- 현재 단계: Step 17 (월별 수급 전망) 대기

## 완료 기준
1. cargo build --release 성공
2. cargo test 성공
3. go build + go test 성공
4. curl 테스트:
   POST /api/calc/margin-analysis -> 200
   POST /api/calc/customer-analysis -> 200 (avg_margin_rate, avg_deposit_rate 포함 확인)
   POST /api/calc/price-trend -> 200
5. CHECKLIST_TEMPLATE.md 양식으로 보고
6. 전체 파일 코드(cat) 보여주기
