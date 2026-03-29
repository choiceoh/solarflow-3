# 작업: Step 11A — 스키마 변경 반영 Go 코드 수정
RULES.md를 반드시 따를 것. CHECKLIST_TEMPLATE.md 양식으로 보고할 것.

## 변경 배경
DB 스키마 변경 4건이 Supabase에서 실행 완료됨:
1. outbounds에 status 컬럼 추가 (active/cancel_pending/cancelled)
2. outbounds usage_category CHECK 변경 (9개 값)
3. orders에 management_category 컬럼 추가 (6개 값)
4. orders에 fulfillment_source 컬럼 추가 (stock/incoming)

## 파일 1: internal/model/outbound.go 수정

Outbound 구조체에 추가:
- Status string `json:"status"` (필수)

CreateOutboundRequest에 추가:
- Status string (기본값 "active", 입력 안 하면 active)

Validate 수정:
- usage_category 허용값 변경 (map[string]bool):
  sale, sale_spare, construction, construction_damage,
  maintenance, disposal, transfer, adjustment, other
- status 추가: active/cancel_pending/cancelled (입력 시 검증)

UpdateOutboundRequest에 추가:
- Status *string `json:"status,omitempty"` (포인터, omitempty)

UpdateOutboundRequest Validate 수정:
- status 있으면 active/cancel_pending/cancelled만 허용

## 파일 2: internal/model/order.go 수정

Order 구조체에 추가:
- ManagementCategory string `json:"management_category"` (필수)
- FulfillmentSource string `json:"fulfillment_source"` (필수)

CreateOrderRequest에 추가:
- ManagementCategory string (기본값 "sale")
- FulfillmentSource string (기본값 "stock")

Validate 수정:
- management_category 허용값 (map[string]bool):
  sale, construction, spare, repowering, maintenance, other
- fulfillment_source 허용값 (map[string]bool):
  stock, incoming

UpdateOrderRequest에 추가:
- ManagementCategory *string `json:"management_category,omitempty"`
- FulfillmentSource *string `json:"fulfillment_source,omitempty"`

UpdateOrderRequest Validate 수정:
- management_category 있으면 6개 값만 허용
- fulfillment_source 있으면 stock/incoming만 허용

## 파일 3: internal/handler/outbound.go 수정

List에 status 필터 추가: ?status=active
Create에서 Status 기본값 처리: 빈 값이면 "active"로 설정

## 파일 4: internal/handler/order.go 수정

List에 management_category 필터 추가: ?management_category=sale
List에 fulfillment_source 필터 추가: ?fulfillment_source=stock
Create에서 기본값 처리:
- ManagementCategory 빈 값이면 "sale"
- FulfillmentSource 빈 값이면 "stock"

## 파일 5: internal/model/outbound_test.go 수정

추가 테스트:
- TestOutboundValidate_InvalidStatus -> 에러 ("invalid_status" 입력)
- TestOutboundValidate_InvalidUsageCategory_Old -> 에러 ("replacement" — 기존 값 거부 확인)
- TestOutboundValidate_NewUsageCategories -> 성공 (sale_spare, construction_damage, maintenance, disposal, other 각각)

## 파일 6: internal/model/order_test.go 수정

추가 테스트:
- TestOrderValidate_InvalidManagementCategory -> 에러
- TestOrderValidate_InvalidFulfillmentSource -> 에러
- TestOrderValidate_ConstructionWithIncoming -> 성공 (construction + incoming 조합)
- TestOrderValidate_AllManagementCategories -> 성공 (6개 각각)

## 파일 7: DECISIONS.md 추가 (기존 내용 뒤에 append)

- D-013: 출고 취소 3단계 (active/cancel_pending/cancelled)
  이유: 실무자가 취소 여부를 즉시 결정 못할 수 있음.
  cancel_pending은 가용재고 미차감. 실무자가 판단 후 삭제 또는 복원.

- D-014: ERP 관리구분과 usage_category 일치
  이유: ERP 내보내기 시 매핑 정확성. ERP 1,881건 분석 기반으로 재설계.
  기존 7개에서 9개로 변경. replacement는 construction_damage로 대체.
  repowering은 outbounds에서 제거, orders.management_category에는 유지.

- D-015: 수주 충당 소스 구분 (fulfillment_source: stock/incoming)
  이유: 미착품에도 판매/공사 예약이 걸릴 수 있음.
  "총확보량"이 실제보다 부풀려지는 것을 방지.
  실무자가 "이 수주는 미착품에서 충당"이라는 의사결정을 기록.

## 파일 8: PROGRESS.md 업데이트
- Step 10 점수: 10/10으로 수정 (이전 감리 지적)
- Step 11A 스키마 변경 + Go 코드 수정 완료 기록
- 현재 단계: Phase 3 Step 11B (Rust 프로젝트 초기화) 대기

## 완료 후
1. go build ./...
2. go vet ./...
3. go test ./... -v
4. bash scripts/lint_rules.sh
5. CHECKLIST_TEMPLATE.md 양식으로 보고
6. 수정된 파일 전체 코드(cat) 보여주기
