# 작업: Step 13 — 재고 집계 API (Rust 계산엔진 첫 구현)
RULES.md를 반드시 따를 것. CHECKLIST_TEMPLATE.md 양식으로 보고할 것.
감리 3건 지적사항 반영 완료.

## API 엔드포인트

POST /api/calc/inventory
요청:
{
  "company_id": "uuid" (필수),
  "product_id": "uuid" (선택),
  "manufacturer_id": "uuid" (선택)
}

응답:
{
  "items": [
    {
      "product_id": "uuid",
      "product_code": "M-JK0635-01",
      "product_name": "JKM635N-78HL4-BDV-S",
      "manufacturer_name": "진코솔라",
      "spec_wp": 635,
      "module_width_mm": 2465,
      "module_height_mm": 1134,
      "physical_kw": 48200.0,
      "reserved_kw": 12800.0,
      "allocated_kw": 5200.0,
      "available_kw": 30200.0,
      "incoming_kw": 30000.0,
      "incoming_reserved_kw": 20000.0,
      "available_incoming_kw": 10000.0,
      "total_secured_kw": 40200.0,
      "long_term_status": "normal"
    }
  ],
  "summary": {
    "total_physical_kw": 78500.0,
    "total_available_kw": 45300.0,
    "total_incoming_kw": 52000.0,
    "total_secured_kw": 67200.0
  },
  "calculated_at": "2026-03-29T12:00:00Z"
}

정렬: 제조사명 -> 모듈크기(width_mm, height_mm) -> 출력(spec_wp)

## 재고 집계 SQL 상세 (감리 지적 3건 반영)

### 모든 쿼리 공통 필터
- $1: company_id (필수)
- $2: product_id (선택, NULL이면 전체)
- $3: manufacturer_id (선택, NULL이면 전체)
- manufacturer_id 필터: products 테이블 JOIN 후 AND ($3::uuid IS NULL OR p.manufacturer_id = $3)

### 1. 물리적 재고 = 입고완료 - 출고(active)

입고 합계:
SELECT bli.product_id, COALESCE(SUM(bli.capacity_kw), 0) as inbound_kw
FROM bl_line_items bli
JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
JOIN products p ON bli.product_id = p.product_id
WHERE bl.status IN ('completed', 'erp_done')
  AND bl.company_id = $1
  AND ($2::uuid IS NULL OR bli.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
GROUP BY bli.product_id

출고 합계 (status='active'만):
SELECT o.product_id, COALESCE(SUM(o.capacity_kw), 0) as outbound_kw
FROM outbounds o
JOIN products p ON o.product_id = p.product_id
WHERE o.status = 'active'
  AND o.company_id = $1
  AND ($2::uuid IS NULL OR o.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
GROUP BY o.product_id

물리적 = 입고 - 출고

### 2. 예약 (감리 지적 1번 반영: maintenance, other 추가)

SELECT ord.product_id,
  COALESCE(SUM(ord.remaining_qty * p.wattage_kw), 0) as reserved_kw
FROM orders ord
JOIN products p ON ord.product_id = p.product_id
WHERE ord.status IN ('received', 'partial')
  AND ord.management_category IN ('sale', 'spare', 'maintenance', 'other')
  AND ord.fulfillment_source = 'stock'
  AND ord.company_id = $1
  AND ($2::uuid IS NULL OR ord.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
GROUP BY ord.product_id

### 3. 배정

SELECT ord.product_id,
  COALESCE(SUM(ord.remaining_qty * p.wattage_kw), 0) as allocated_kw
FROM orders ord
JOIN products p ON ord.product_id = p.product_id
WHERE ord.status IN ('received', 'partial')
  AND ord.management_category IN ('construction', 'repowering')
  AND ord.fulfillment_source = 'stock'
  AND ord.company_id = $1
  AND ($2::uuid IS NULL OR ord.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
GROUP BY ord.product_id

### 4. 가용재고 = 물리적 - 예약 - 배정

### 5. 미착품 (감리 지적 2번 반영: PO 상태 필터 일치)

PO 계약량 (contracted/shipping 상태만):
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

해당 PO에 연결된 B/L 중 입고완료 (같은 PO 필터 적용):
SELECT bli.product_id,
  COALESCE(SUM(bli.capacity_kw), 0) as received_kw
FROM bl_line_items bli
JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
JOIN products p ON bli.product_id = p.product_id
WHERE bl.status IN ('completed', 'erp_done')
  AND bl.po_id IN (
    SELECT po_id FROM purchase_orders
    WHERE status IN ('contracted', 'shipping')
      AND company_id = $1
  )
  AND ($2::uuid IS NULL OR bli.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
GROUP BY bli.product_id

미착품 = PO 계약량 - 해당 PO 입고량
(완료된 PO는 양쪽 모두에서 제외되므로 음수 불가)

### 6. 미착품 예약

SELECT ord.product_id,
  COALESCE(SUM(ord.remaining_qty * p.wattage_kw), 0) as incoming_reserved_kw
FROM orders ord
JOIN products p ON ord.product_id = p.product_id
WHERE ord.status IN ('received', 'partial')
  AND ord.fulfillment_source = 'incoming'
  AND ord.company_id = $1
  AND ($2::uuid IS NULL OR ord.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
GROUP BY ord.product_id

### 7. 가용미착품 = 미착품 - 미착품예약

### 8. 총확보량 = 가용재고 + 가용미착품

## 장기재고 판별

SELECT bli.product_id, MIN(bl.actual_arrival) as earliest_arrival
FROM bl_line_items bli
JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
JOIN products p ON bli.product_id = p.product_id
WHERE bl.status IN ('completed', 'erp_done')
  AND bl.company_id = $1
  AND ($2::uuid IS NULL OR bli.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
GROUP BY bli.product_id

Rust에서 계산:
- 현재일 - earliest_arrival
- 0~180일: "normal"
- 181~365일: "warning"
- 366일+: "critical"

## Rust 파일

### engine/src/calc/inventory.rs (신규)
- InventoryRequest: company_id(필수), product_id(Option), manufacturer_id(Option)
- InventoryItem: 품번별 재고 상세 (위 응답 구조)
- InventorySummary: 전체 합계
- InventoryResponse: items + summary + calculated_at
- calculate_inventory(pool: &PgPool, req: InventoryRequest) -> Result<InventoryResponse>
  위 SQL 8단계 실행 + 장기재고 판별 + 정렬 + 합계

### engine/src/calc/mod.rs 수정
- pub mod inventory; 추가

### engine/src/routes/calc.rs (신규)
- POST /api/calc/inventory 핸들러
- company_id 없으면 400 에러
- calculate_inventory 호출 -> 200 + JSON

### engine/src/routes/mod.rs 수정
- /api/calc/inventory 라우트 등록

### engine/src/model/inventory.rs (신규)
- 요청/응답 Serialize, Deserialize 구조체

### engine/src/model/mod.rs 수정
- pub mod inventory; 추가

## Go 연동

### backend/internal/engine/client.go에 메서드 추가
- GetInventory(companyID string, productID, manufacturerID *string) (InventoryResponse, error)
  CallCalc("inventory", 요청) 호출 -> 응답 파싱

### backend/internal/model/inventory_response.go (신규)
- Go 측 InventoryResponse 구조체 (Rust 응답과 동일 구조)

## 테스트

### Rust: engine/tests/inventory_test.rs
- API 엔드포인트 POST /api/calc/inventory -> 200 확인
- company_id 누락 -> 400 확인
- 데이터 없는 상태: 빈 items + 0 summary 확인

### Go: backend/internal/engine/inventory_test.go
- mock 서버로 GetInventory 호출 테스트

## DECISIONS.md 추가
- D-021: 재고 집계를 단일 API로 제공
  이유: 물리적/가용/미착품을 별도 API로 분리하면 시점 차이로 데이터 불일치.
- D-022: 장기재고 판별은 최초 입고일 기준 (FIFO 미적용)
  이유: 정확한 FIFO는 건별 추적 필요. 실무 문제 시 추후 확장.

## PROGRESS.md 업데이트
- Step 13 재고 집계 API 완료 기록
- 현재 단계: Step 14 (Landed Cost) 대기

## 완료 기준
1. cargo build --release 성공 (engine/)
2. cargo test 성공
3. go build + go test 성공 (backend/)
4. curl 테스트:
   POST http://localhost:8081/api/calc/inventory
   Body: {"company_id": "실제UUID"}
   -> 200 + JSON (데이터 없으면 빈 items + 0 summary)
5. CHECKLIST_TEMPLATE.md 양식으로 보고
6. 전체 파일 코드(cat) 보여주기
