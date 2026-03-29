# 작업: Step 8 — 수주/수금 Go 핸들러
RULES.md를 반드시 따를 것. CHECKLIST_TEMPLATE.md 양식으로 보고할 것.

## 파일 1: internal/model/order.go (신규)
Order 구조체 (설계문서 Section 4.5 전체 필드):
- OrderID, OrderNumber(*string nullable), CompanyID, CustomerID string
- OrderDate, ReceiptMethod string
- ProductID string, Quantity int, CapacityKw *float64
- UnitPriceWp float64 (필수)
- SiteName, SiteAddress, SiteContact, SitePhone *string
- PaymentTerms *string, DepositRate *float64, DeliveryDue *string
- ShippedQty *int, RemainingQty *int
- Status string, SpareQty *int, Memo *string
CreateOrderRequest + Validate:
- company_id 필수
- customer_id 필수
- order_date 필수
- receipt_method 필수 + purchase_order/phone/email/other (map[string]bool)
- product_id 필수
- quantity 필수 + 양수
- unit_price_wp 필수 + 양수
- status 필수 + received/partial/completed/cancelled (map[string]bool)
- deposit_rate 있으면 0~100 범위
- spare_qty 있으면 양수
UpdateOrderRequest + Validate

## 파일 2: internal/model/receipt.go (신규)
Receipt 구조체:
- ReceiptID, CustomerID, ReceiptDate string
- Amount float64 (필수)
- BankAccount, Memo *string
CreateReceiptRequest + Validate:
- customer_id 필수
- receipt_date 필수
- amount 필수 + 양수
UpdateReceiptRequest + Validate

## 파일 3: internal/model/receipt_match.go (신규)
ReceiptMatch 구조체:
- MatchID, ReceiptID, OutboundID string
- MatchedAmount float64 (필수)
CreateReceiptMatchRequest + Validate:
- receipt_id 필수
- outbound_id 필수
- matched_amount 필수 + 양수

## 파일 4: internal/handler/order.go (신규)
- List (company_id, customer_id, status, product_id 필터), GetByID, Create, Update
- List에 주석: // TODO: delivery_due 범위 필터 추가 (대시보드 출고 예정 알림용)
- remaining_qty = quantity - shipped_qty는 Go 허용 (한 행 뺄셈)

## 파일 5: internal/handler/receipt.go (신규)
- List (customer_id 필터), GetByID, Create, Update

## 파일 6: internal/handler/receipt_match.go (신규)
- List (receipt_id 필터), Create, Delete
- Rust TODO: // TODO: Rust 계산엔진 연동 — 수금 매칭 자동 추천 (미수금 금액 조합 최적화)
- Rust TODO: // TODO: Rust 계산엔진 연동 — 거래처별 미수금 총괄 (미수금, 경과일, 상태)

## 파일 7: internal/model/order_test.go (신규)
- TestOrderValidate_EmptyCompanyID -> 에러
- TestOrderValidate_InvalidReceiptMethod -> 에러
- TestOrderValidate_ZeroQuantity -> 에러
- TestOrderValidate_ZeroPrice -> 에러
- TestOrderValidate_InvalidStatus -> 에러
- TestOrderValidate_DepositRateOver100 -> 에러
- TestOrderValidate_Success -> 빈 문자열

## 파일 8: internal/model/receipt_test.go (신규)
- TestReceiptValidate_ZeroAmount -> 에러
- TestReceiptValidate_EmptyCustomerID -> 에러
- TestReceiptValidate_Success -> 빈 문자열

## router.go 수정
새 핸들러 3개(order, receipt, receipt_match) 라우터 등록

## 완료 후
1. go build ./...
2. go vet ./...
3. go test ./... -v
4. bash scripts/lint_rules.sh
5. CHECKLIST_TEMPLATE.md 양식으로 보고
6. 전체 파일 코드(cat) 보여주기
