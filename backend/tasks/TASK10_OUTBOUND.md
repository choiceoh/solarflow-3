# 작업: Step 9 — 출고/판매 Go 핸들러
RULES.md를 반드시 따를 것. CHECKLIST_TEMPLATE.md 양식으로 보고할 것.

## 파일 1: internal/model/outbound.go (신규)
Outbound 구조체 (설계문서 Section 4.6):
- OutboundID, OutboundDate, CompanyID, ProductID string
- Quantity int, CapacityKw *float64
- WarehouseID, UsageCategory string
- OrderID *string (nullable)
- SiteName, SiteAddress *string
- SpareQty *int
- GroupTrade *bool, TargetCompanyID *string
- ErpOutboundNo *string, Memo *string
CreateOutboundRequest + Validate:
- outbound_date 필수
- company_id 필수
- product_id 필수
- quantity 필수 + 양수
- warehouse_id 필수
- usage_category 필수 + map[string]bool: sale/construction/spare/replacement/repowering/transfer/adjustment
- spare_qty 있으면 양수
- group_trade true이면 target_company_id 필수
UpdateOutboundRequest + Validate

## 파일 2: internal/model/sale.go (신규)
Sale 구조체:
- SaleID, OutboundID, CustomerID string
- UnitPriceWp float64 (필수)
- UnitPriceEa, SupplyAmount, VatAmount, TotalAmount *float64 (자동 계산)
- TaxInvoiceDate, TaxInvoiceEmail *string
- ErpClosed *bool, ErpClosedDate *string, Memo *string
CreateSaleRequest + Validate:
- outbound_id 필수
- customer_id 필수
- unit_price_wp 필수 + 양수
UpdateSaleRequest + Validate

## 파일 3: internal/handler/outbound.go (신규)
- List (company_id, warehouse_id, usage_category, order_id 필터), GetByID, Create, Update
- Rust TODO: // TODO: Rust 계산엔진 연동 — 재고 차감 검증 (가용재고 >= 출고수량)
- 그룹내 거래: // TODO: 그룹 내 거래 — 출고 시 상대 법인 입고 자동 생성

## 파일 4: internal/handler/sale.go (신규)
- List (outbound_id, customer_id, erp_closed 필터), GetByID, Create, Update
- List 주석: // TODO: 세금계산서 미발행 목록 필터 (tax_invoice_date IS NULL + outbound completed)
- Rust TODO: // TODO: Rust 계산엔진 연동 — 마진/이익률 분석 (원가 vs 판매가)
- Go 허용 자동 계산은 현재 단계에서 TODO 주석으로 남김:
  // TODO: Go 자동 계산 — unit_price_ea = unit_price_wp x spec_wp, supply = ea x qty, vat = supply x 0.1, total = supply + vat
  // (product 테이블에서 spec_wp 조회 필요, Phase 4 프론트엔드 연동 시 구현)

## 파일 5: internal/model/outbound_test.go (신규)
- TestOutboundValidate_EmptyDate -> 에러
- TestOutboundValidate_ZeroQuantity -> 에러
- TestOutboundValidate_InvalidUsageCategory -> 에러
- TestOutboundValidate_GroupTradeNoTarget -> 에러 (group_trade=true, target 없음)
- TestOutboundValidate_GroupTradeWithTarget -> 성공
- TestOutboundValidate_Success -> 빈 문자열

## 파일 6: internal/model/sale_test.go (신규)
- TestSaleValidate_EmptyOutboundID -> 에러
- TestSaleValidate_EmptyCustomerID -> 에러
- TestSaleValidate_ZeroPrice -> 에러
- TestSaleValidate_Success -> 빈 문자열

## router.go 수정
새 핸들러 2개(outbound, sale) 라우터 등록

## 완료 후
1. go build ./...
2. go vet ./...
3. go test ./... -v
4. bash scripts/lint_rules.sh
5. CHECKLIST_TEMPLATE.md 양식으로 보고
6. 전체 파일 코드(cat) 보여주기
