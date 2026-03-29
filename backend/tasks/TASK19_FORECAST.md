# 작업: Step 17 — 월별 수급 전망 (6개월)
RULES.md를 반드시 따를 것. CHECKLIST_TEMPLATE.md 양식으로 보고할 것.
감리 즉시 승인 — 지적사항 없음.

## API 엔드포인트

POST /api/calc/supply-forecast
요청:
{
  "company_id": "uuid" (필수),
  "product_id": "uuid" (선택),
  "manufacturer_id": "uuid" (선택),
  "months_ahead": 6 (선택 — 기본 6, 최대 12)
}

응답:
{
  "products": [
    {
      "product_id": "uuid",
      "product_code": "M-JK0635-01",
      "product_name": "JKM635N-78HL4-BDV-S",
      "manufacturer_name": "진코솔라",
      "spec_wp": 635,
      "module_width_mm": 2465,
      "module_height_mm": 1134,
      "months": [
        {
          "month": "2026-04",
          "opening_kw": 48200.0,
          "incoming_kw": 12000.0,
          "outgoing_construction_kw": 3200.0,
          "outgoing_sale_kw": 8500.0,
          "closing_kw": 48500.0,
          "reserved_kw": 5200.0,
          "allocated_kw": 2100.0,
          "available_kw": 41200.0,
          "insufficient": false
        }
      ],
      "unscheduled": {
        "sale_kw": 4500.0,
        "construction_kw": 2000.0,
        "incoming_kw": 8000.0
      }
    }
  ],
  "summary": {
    "months": [
      {
        "month": "2026-04",
        "total_opening_kw": 78500.0,
        "total_incoming_kw": 22000.0,
        "total_outgoing_kw": 18500.0,
        "total_closing_kw": 82000.0,
        "total_available_kw": 65300.0
      }
    ]
  },
  "calculated_at": "2026-03-29T12:00:00Z"
}

정렬: 제조사명 -> 모듈크기(mm) -> 출력(Wp)

## 계산 로직

### 핵심 원칙
- 1번째 달의 기초재고 = 현재 물리적 재고 (Step 13 재고집계와 동일)
- 기말재고 = 기초 + 입고예정 - 출고(공사) - 출고(판매)
- 다음 달 기초 = 이번 달 기말
- fulfillment_source='incoming' 수주는 제외 (D-037)
- closing 음수 허용 + insufficient=true 플래그 (D-038)

### 데이터 소스별 월 배분

입고예정:
- B/L(scheduled/shipping/arrived/customs) → ETA가 있으면 해당 월에 배분
- B/L ETA NULL → unscheduled.incoming
- PO(contracted/shipping) 잔량 중 B/L 미생성분 → unscheduled.incoming

출고 판매:
- orders(received/partial, management_category IN sale/spare/maintenance/other, fulfillment_source='stock')
- delivery_due 있으면 해당 월에 잔량 배분
- delivery_due NULL → unscheduled.sale

출고 공사:
- orders(received/partial, management_category IN construction/repowering, fulfillment_source='stock')
- delivery_due 있으면 해당 월에 잔량 배분
- delivery_due NULL → unscheduled.construction

### 각 월의 reserved/allocated
- reserved = 해당 월 이후 판매 수주 잔량 합계 (이미 출고된 분 제외)
- allocated = 해당 월 이후 공사 수주 잔량 합계
- available = closing - reserved - allocated

## SQL 상세

### 1. 현재 물리적 재고

입고완료:
SELECT bli.product_id, COALESCE(SUM(bli.capacity_kw), 0) as inbound_kw
FROM bl_line_items bli
JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
JOIN products p ON bli.product_id = p.product_id
WHERE bl.status IN ('completed', 'erp_done')
  AND bl.company_id = $1
  AND ($2::uuid IS NULL OR bli.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
GROUP BY bli.product_id

출고완료:
SELECT o.product_id, COALESCE(SUM(o.capacity_kw), 0) as outbound_kw
FROM outbounds o
JOIN products p ON o.product_id = p.product_id
WHERE o.status = 'active'
  AND o.company_id = $1
  AND ($2::uuid IS NULL OR o.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
GROUP BY o.product_id

### 2. 입고예정 (ETA 기준)

B/L 기반 (ETA 있음):
SELECT bli.product_id,
       TO_CHAR(bl.eta, 'YYYY-MM') as eta_month,
       COALESCE(SUM(bli.capacity_kw), 0) as incoming_kw
FROM bl_line_items bli
JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
JOIN products p ON bli.product_id = p.product_id
WHERE bl.status IN ('scheduled', 'shipping', 'arrived', 'customs')
  AND bl.company_id = $1
  AND ($2::uuid IS NULL OR bli.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
  AND bl.eta IS NOT NULL
GROUP BY bli.product_id, eta_month

B/L ETA NULL (unscheduled):
SELECT bli.product_id,
       COALESCE(SUM(bli.capacity_kw), 0) as unscheduled_incoming_kw
FROM bl_line_items bli
JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
JOIN products p ON bli.product_id = p.product_id
WHERE bl.status IN ('scheduled', 'shipping', 'arrived', 'customs')
  AND bl.company_id = $1
  AND ($2::uuid IS NULL OR bli.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
  AND bl.eta IS NULL
GROUP BY bli.product_id

PO 잔량 (B/L 미생성분):
-- PO 총량
SELECT pol.product_id,
       COALESCE(SUM(pol.quantity * p.wattage_kw), 0) as po_total_kw
FROM po_line_items pol
JOIN products p ON pol.product_id = p.product_id
JOIN purchase_orders po ON pol.po_id = po.po_id
WHERE po.status IN ('contracted', 'shipping')
  AND po.company_id = $1
  AND ($2::uuid IS NULL OR pol.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
GROUP BY pol.product_id

-- 해당 PO의 B/L 총량
SELECT bli.product_id,
       COALESCE(SUM(bli.capacity_kw), 0) as bl_total_kw
FROM bl_line_items bli
JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
JOIN products p ON bli.product_id = p.product_id
WHERE bl.po_id IN (
    SELECT po_id FROM purchase_orders
    WHERE status IN ('contracted', 'shipping') AND company_id = $1
  )
  AND ($2::uuid IS NULL OR bli.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
GROUP BY bli.product_id
-- B/L 미생성 잔량 = PO 총량 - B/L 총량 -> unscheduled.incoming에 합산

### 3. 출고예정 — 판매 (delivery_due 기준, fulfillment_source='stock')

delivery_due 있음:
SELECT ord.product_id,
       TO_CHAR(ord.delivery_due, 'YYYY-MM') as due_month,
       COALESCE(SUM(ord.remaining_qty * p.wattage_kw), 0) as sale_kw
FROM orders ord
JOIN products p ON ord.product_id = p.product_id
WHERE ord.status IN ('received', 'partial')
  AND ord.management_category IN ('sale', 'spare', 'maintenance', 'other')
  AND ord.fulfillment_source = 'stock'
  AND ord.company_id = $1
  AND ($2::uuid IS NULL OR ord.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
  AND ord.delivery_due IS NOT NULL
GROUP BY ord.product_id, due_month

delivery_due NULL (unscheduled):
SELECT ord.product_id,
       COALESCE(SUM(ord.remaining_qty * p.wattage_kw), 0) as unscheduled_sale_kw
FROM orders ord
JOIN products p ON ord.product_id = p.product_id
WHERE ord.status IN ('received', 'partial')
  AND ord.management_category IN ('sale', 'spare', 'maintenance', 'other')
  AND ord.fulfillment_source = 'stock'
  AND ord.company_id = $1
  AND ($2::uuid IS NULL OR ord.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
  AND ord.delivery_due IS NULL
GROUP BY ord.product_id

### 4. 출고예정 — 공사 (delivery_due 기준, fulfillment_source='stock')

delivery_due 있음:
SELECT ord.product_id,
       TO_CHAR(ord.delivery_due, 'YYYY-MM') as due_month,
       COALESCE(SUM(ord.remaining_qty * p.wattage_kw), 0) as construction_kw
FROM orders ord
JOIN products p ON ord.product_id = p.product_id
WHERE ord.status IN ('received', 'partial')
  AND ord.management_category IN ('construction', 'repowering')
  AND ord.fulfillment_source = 'stock'
  AND ord.company_id = $1
  AND ($2::uuid IS NULL OR ord.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
  AND ord.delivery_due IS NOT NULL
GROUP BY ord.product_id, due_month

delivery_due NULL (unscheduled):
SELECT ord.product_id,
       COALESCE(SUM(ord.remaining_qty * p.wattage_kw), 0) as unscheduled_construction_kw
FROM orders ord
JOIN products p ON ord.product_id = p.product_id
WHERE ord.status IN ('received', 'partial')
  AND ord.management_category IN ('construction', 'repowering')
  AND ord.fulfillment_source = 'stock'
  AND ord.company_id = $1
  AND ($2::uuid IS NULL OR ord.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
  AND ord.delivery_due IS NULL
GROUP BY ord.product_id

### 5. 품번 정보 (정렬+표시용)

SELECT p.product_id, p.product_code, p.product_name, p.spec_wp,
       p.module_width_mm, p.module_height_mm, p.wattage_kw,
       m.name_kr as manufacturer_name
FROM products p
JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
WHERE p.is_active = true
  AND ($1::uuid IS NULL OR p.product_id = $1)
  AND ($2::uuid IS NULL OR p.manufacturer_id = $2)
ORDER BY m.name_kr, p.module_width_mm, p.module_height_mm, p.spec_wp

### 6. Rust 계산 흐름 (품번별)

current_month = 현재 월의 다음 달 (3월이면 4월부터)
opening = 물리적 재고

for each month in 1..=months_ahead:
  incoming = 해당 월 입고예정 kw (매칭)
  out_construction = 해당 월 공사 출고 kw (매칭)
  out_sale = 해당 월 판매 출고 kw (매칭)
  closing = opening + incoming - out_construction - out_sale
  insufficient = closing < 0.0
  
  reserved = 해당 월 이후 판매 수주 잔량 합계
  allocated = 해당 월 이후 공사 수주 잔량 합계
  available = closing - reserved - allocated
  
  다음 달 opening = closing

summary: 전체 품번 합산 (월별)

## Rust 파일

### engine/src/calc/forecast.rs (신규)
- SupplyForecastRequest: company_id(필수), product_id(Option), manufacturer_id(Option), months_ahead(Option, 기본6, 최대12)
- ProductForecast: product 정보 + months Vec + unscheduled
- MonthForecast: month, opening_kw, incoming_kw, outgoing_construction_kw, outgoing_sale_kw, closing_kw, reserved_kw, allocated_kw, available_kw, insufficient(bool)
- UnscheduledForecast: sale_kw, construction_kw, incoming_kw
- ForecastSummary: months Vec
- SummaryMonth: month, total_opening/incoming/outgoing/closing/available
- SupplyForecastResponse: products + summary + calculated_at
- calculate_forecast(pool, req) -> Result<SupplyForecastResponse>

### engine/src/calc/mod.rs 수정
- pub mod forecast; 추가

### engine/src/routes/calc.rs 수정
- POST /api/calc/supply-forecast 추가

### engine/src/model/forecast.rs (신규)
- 요청/응답 Serialize, Deserialize

### engine/src/model/mod.rs 수정
- pub mod forecast; 추가

## Go 연동

### backend/internal/engine/client.go 메서드 추가
- GetSupplyForecast(req SupplyForecastRequest) (SupplyForecastResponse, error)

### backend/internal/model/forecast_response.go (신규)
- Go 측 응답 구조체

## 테스트

### Rust: engine/tests/forecast_test.rs
- POST /api/calc/supply-forecast: company_id 누락 400
- POST /api/calc/supply-forecast: months_ahead 기본값 6 확인
- POST /api/calc/supply-forecast: months_ahead 15 -> 12로 제한 확인
- POST /api/calc/supply-forecast: 데이터 없으면 빈 products
- 월별 누적 단위 테스트:
  opening=100, incoming=30, out_sale=20, out_construction=10
  -> closing=100 확인
- 연쇄 확인: month1 closing=80 -> month2 opening=80
- insufficient 테스트: opening=50, out_sale=60 -> closing=-10, insufficient=true
- unscheduled 테스트: delivery_due NULL -> unscheduled에 포함
- months_ahead=1 테스트: 1개월만 생성

### Go: backend/internal/engine/forecast_test.go
- mock 서버로 GetSupplyForecast 호출 테스트

## DECISIONS.md 추가
- D-035: 수급 전망 입고예정은 B/L ETA 기준
  이유: PO 계약일은 실제 입고와 수개월 차이. B/L 미생성분은 unscheduled.
- D-036: 수급 전망 출고예정은 delivery_due 기준
  이유: 납기 요청일이 실무 출고 시점. NULL은 unscheduled로 분리.
- D-037: fulfillment_source='incoming' 수주는 수급 전망에서 제외
  이유: 미착품 충당 수주는 물리적 재고에 영향 안 줌.
- D-038: closing 음수 허용 (insufficient 플래그)
  이유: 실무자 사전 경고. 0으로 자르면 이후 달 예측 부정확.

## PROGRESS.md 업데이트
- Step 17 완료 기록
- 현재 단계: Step 18 (수금 매칭 자동 추천) 대기

## 완료 기준
1. cargo build --release 성공
2. cargo test 성공
3. go build + go test 성공
4. curl 테스트:
   POST /api/calc/supply-forecast -> 200
5. CHECKLIST_TEMPLATE.md 양식으로 보고
6. 전체 파일 코드(cat) 보여주기
