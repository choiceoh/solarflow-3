# 작업: Step 10 — 은행/LC 한도 변경이력 + omitempty 일괄 적용
RULES.md를 반드시 따를 것. CHECKLIST_TEMPLATE.md 양식으로 보고할 것.

## 작업 A: 한도 변경이력 핸들러

### 파일 1: internal/model/limit_change.go (신규)
LimitChange 구조체:
- LimitChangeID string, BankID string, ChangeDate string
- PreviousLimit float64, NewLimit float64
- Reason *string (nullable)
CreateLimitChangeRequest + Validate:
- bank_id 필수
- change_date 필수
- previous_limit: 0 이상 (음수만 차단, < 0이면 에러)
- new_limit: 0 이상 (음수만 차단, < 0이면 에러. 은행 한도 철회 시 0 가능)
- previous_limit과 new_limit이 같으면 에러: "이전 한도와 변경 한도가 같습니다"
Update/Delete 없음 — 이력은 수정/삭제하지 않음.

### 파일 2: internal/handler/limit_change.go (신규)
- List (bank_id 필터 필수), Create
- Update, Delete 없음 (이력 보존)
- Rust TODO: // TODO: Rust 계산엔진 연동 — LC 한도 복원 타임라인 (은행별 가용한도 계산)

### 파일 3: internal/model/limit_change_test.go (신규)
- TestLimitChangeValidate_EmptyBankID -> 에러
- TestLimitChangeValidate_EmptyDate -> 에러
- TestLimitChangeValidate_NegativePreviousLimit -> 에러
- TestLimitChangeValidate_NegativeNewLimit -> 에러
- TestLimitChangeValidate_SameLimit -> 에러
- TestLimitChangeValidate_ZeroPreviousLimit -> 성공 (신규 한도 설정)
- TestLimitChangeValidate_ZeroNewLimit -> 성공 (한도 철회)
- TestLimitChangeValidate_Success -> 빈 문자열

### router.go 수정
limit_change 핸들러 라우터 등록

## 작업 B: omitempty 일괄 적용

model/ 하위 모든 UpdateRequest 구조체의 포인터 필드에 omitempty 추가.
변경 예: json:"company_name" -> json:"company_name,omitempty"

대상 파일 전부:
- model/company.go — UpdateCompanyRequest
- model/manufacturer.go — UpdateManufacturerRequest
- model/product.go — UpdateProductRequest
- model/partner.go — UpdatePartnerRequest
- model/warehouse.go — UpdateWarehouseRequest
- model/bank.go — UpdateBankRequest
- model/po.go — UpdatePurchaseOrderRequest
- model/po_line.go — UpdatePOLineRequest
- model/lc.go — UpdateLCRequest
- model/tt.go — UpdateTTRequest
- model/bl.go — UpdateBLRequest
- model/bl_line.go — UpdateBLLineRequest
- model/declaration.go — UpdateDeclarationRequest
- model/cost_detail.go — UpdateCostDetailRequest
- model/expense.go — UpdateExpenseRequest
- model/order.go — UpdateOrderRequest
- model/receipt.go — UpdateReceiptRequest
- model/outbound.go — UpdateOutboundRequest
- model/sale.go — UpdateSaleRequest

주의: 포인터 필드(*string, *int, *float64, *bool)에만 omitempty 추가.
비포인터 필드는 건드리지 않음.
Create 구조체는 건드리지 않음.

## 작업 C: PROGRESS.md 업데이트
- Phase 2 전체 완료로 표시
- Step 7~10 완료 기록
- omitempty 일괄 적용 완료 기록
- 다음 작업: Phase 3 Rust 계산엔진

## 작업 D: DECISIONS.md 추가 (번호 주의: D-011, D-012)
- D-011: limit_changes에 Update/Delete 없음
  이유: 한도 변경은 이력이므로 수정/삭제하면 감사 추적 불가. 잘못 입력 시 새 이력으로 정정.
- D-012: omitempty 일괄 적용
  이유: UpdateRequest의 포인터 필드에 omitempty가 없으면 null 필드도 DB에 전송되어 의도치 않은 덮어쓰기 가능.

## 완료 후
1. go build ./...
2. go vet ./...
3. go test ./... -v
4. bash scripts/lint_rules.sh
5. CHECKLIST_TEMPLATE.md 양식으로 보고
6. 신규 파일 전체 코드(cat) + omitempty 변경된 파일 목록 보여주기
