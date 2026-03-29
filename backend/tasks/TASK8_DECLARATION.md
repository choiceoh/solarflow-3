# 작업: Step 7 — 면장/원가 Go 핸들러
RULES.md를 반드시 따를 것. CHECKLIST_TEMPLATE.md 양식으로 보고할 것.

## 파일 1: internal/model/declaration.go (신규)
ImportDeclaration 구조체 (설계문서 Section 4.4):
- DeclarationID string, DeclarationNumber string, BLID string,
  CompanyID string, DeclarationDate string,
  ArrivalDate/ReleaseDate/HSCode/CustomsOffice/Port *string,
  Memo *string
CreateDeclarationRequest + Validate:
- declaration_number 필수 + 30자
- bl_id 필수
- company_id 필수
- declaration_date 필수
UpdateDeclarationRequest + Validate

## 파일 2: internal/model/cost_detail.go (신규)
CostDetail 구조체 (원가 3단계 전체 필드):
- CostID, DeclarationID, ProductID string
- Quantity int, CapacityKw *float64
- FOB: FobUnitUsd, FobTotalUsd, FobWpKrw *float64
- CIF: ExchangeRate float64(필수), CifTotalKrw float64(필수),
  CifUnitUsd, CifTotalUsd *float64, CifWpKrw float64(필수)
- Tariff: TariffRate, TariffAmount *float64
- VatAmount *float64
- Landed: CustomsFee, IncidentalCost, LandedTotalKrw, LandedWpKrw *float64
- Memo *string
CreateCostDetailRequest + Validate:
- declaration_id 필수
- product_id 필수
- quantity 필수 + 양수
- exchange_rate 필수 + 양수
- cif_total_krw 필수
- cif_wp_krw 필수
- landed 필드는 nullable (Rust 계산 또는 수동 입력)
UpdateCostDetailRequest + Validate

## 파일 3: internal/model/expense.go (신규)
IncidentalExpense 구조체:
- ExpenseID, BLID(*string nullable), Month(*string nullable),
  CompanyID, ExpenseType string
- Amount, Total float64(필수), Vat *float64
- Vendor, Memo *string
CreateExpenseRequest + Validate:
- company_id 필수
- expense_type 필수 + 허용값 map[string]bool로 검증:
  dock_charge/shuttle/customs_fee/transport/storage/handling/surcharge/lc_fee/lc_acceptance/telegraph/other
- amount 필수 + 양수
- total 필수 + 양수
- bl_id 또는 month 둘 중 하나는 있어야 함
UpdateExpenseRequest + Validate

## 파일 4: internal/handler/declaration.go (신규)
- List (bl_id 필터, company_id 필터), GetByID, Create, Update
- response 패키지 사용, model 구조체 사용

## 파일 5: internal/handler/cost_detail.go (신규)
- List (declaration_id 필터 필수), GetByID, Create, Update
- Rust TODO 주석 필수:
  // TODO: Rust 계산엔진 연동 — Landed Cost 계산 (CIF + 관세 + 부대비용 -> Landed Wp단가)

## 파일 6: internal/handler/expense.go (신규)
- List (bl_id 필터, month 필터, company_id 필터, expense_type 필터), GetByID, Create, Update

## 파일 7: internal/model/declaration_test.go (신규)
- TestDeclarationValidate_EmptyNumber -> 에러
- TestDeclarationValidate_EmptyBLID -> 에러
- TestDeclarationValidate_Success -> 빈 문자열

## 파일 8: internal/model/expense_test.go (신규)
- TestExpenseValidate_NoBLIDNoMonth -> 에러 (둘 다 없으면)
- TestExpenseValidate_InvalidType -> 에러
- TestExpenseValidate_ZeroAmount -> 에러
- TestExpenseValidate_WithBLID -> 성공
- TestExpenseValidate_WithMonth -> 성공

## 파일 9: migrations/007_declarations.sql
위 SQL을 파일로 저장 (이미 Supabase에서 실행 완료)

## router.go 수정
새 핸들러 3개를 라우터에 등록

## 완료 후
1. go build ./...
2. go vet ./...
3. go test ./... -v
4. bash scripts/lint_rules.sh
5. CHECKLIST_TEMPLATE.md 양식으로 보고
6. 전체 파일 코드(cat) 보여주기
