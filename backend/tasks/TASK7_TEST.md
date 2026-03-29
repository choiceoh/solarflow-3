# 작업: 자동 검증 시스템 도입
RULES.md를 반드시 따를 것.

## 파일 1: internal/model/company_test.go (신규)
CreateCompanyRequest.Validate() 단위 테스트 (DB 불필요):
- TestValidate_EmptyName: CompanyName 빈 값 → "법인명은 필수입니다"
- TestValidate_NameTooLong: CompanyName 101자 → "법인명은 100자 이내여야 합니다"
- TestValidate_EmptyCode: CompanyCode 빈 값 → "법인코드는 필수입니다"
- TestValidate_CodeTooLong: CompanyCode 11자 → "법인코드는 10자 이내여야 합니다"
- TestValidate_Success: 정상 데이터 → 빈 문자열 반환

## 파일 2: internal/model/product_test.go (신규)
CreateProductRequest.Validate() 단위 테스트 (DB 불필요):
- TestProductValidate_EmptyCode: ProductCode 빈 값 → 에러
- TestProductValidate_EmptyName: ProductName 빈 값 → 에러
- TestProductValidate_EmptyManufacturerID: ManufacturerID 빈 값 → 에러
- TestProductValidate_ZeroSpecWp: SpecWp 0 → 에러 (양수 필수)
- TestProductValidate_NegativeSpecWp: SpecWp -1 → 에러
- TestProductValidate_ZeroWattageKw: WattageKw 0 → 에러 (양수 필수)
- TestProductValidate_ZeroWidth: ModuleWidthMm 0 → 에러 (양수 필수)
- TestProductValidate_ZeroHeight: ModuleHeightMm 0 → 에러 (양수 필수)
- TestProductValidate_NegativeWidth: ModuleWidthMm -1 → 에러
- TestProductValidate_Success: 정상 데이터(모든 필수값 양수) → 빈 문자열

## 파일 3: .github/workflows/ci.yml (신규)
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.26'
      - run: go build ./...
      - run: go vet ./...
      - run: go test ./... -v
      - run: bash scripts/lint_rules.sh

## 파일 4: scripts/lint_rules.sh (신규)
RULES.md 위반 자동 검출 스크립트.
검출 대상 (internal/ 하위 .go 파일, _test.go 제외):
1. map[string]interface 사용 → 위반
2. 문자열 붙이기 에러 응답: `{"error":"` 패턴 → 위반
3. json.Unmarshal 호출 후 에러 미처리 패턴 → 위반
각 위반마다 파일명:행번호 출력.
위반 0건이면 exit 0, 있으면 exit 1.
실행권한: chmod +x scripts/lint_rules.sh

## 완료 후
1. go test ./... -v 실행 결과 보여주기 (전체 테스트 통과 확인)
2. bash scripts/lint_rules.sh 실행 결과 보여주기 (위반 0건 확인)
3. 4개 파일 전체 코드 보여주기
