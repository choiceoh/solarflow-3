# 작업 지시: 법인(company) 핸들러 재작성

RULES.md를 먼저 읽고 모든 규칙을 따를 것.

## 파일 1: internal/response/response.go (신규)

모든 핸들러가 공통으로 쓸 JSON 응답 유틸리티.

- ErrorResponse 구조체: Code int, Message string
- RespondJSON 함수: Content-Type 설정 + JSON 인코딩 + 에러 로깅
- RespondError 함수: ErrorResponse를 RespondJSON으로 전달
- 문자열 붙이기 금지, 주석 한국어

## 파일 2: internal/model/company.go (신규)

- Company 구조체: CompanyID, CompanyName, CompanyCode, BusinessNumber(nullable), IsActive
- CreateCompanyRequest 구조체 + Validate 메서드
- UpdateCompanyRequest 구조체
- 검증: company_name 필수+100자, company_code 필수+10자

## 파일 3: internal/handler/company.go (재작성)

기존 코드 완전 삭제 후 새로 작성.
- model.Company 구조체 사용 (map[string]interface 금지)
- response 패키지 사용 (문자열 붙이기 금지)
- json.Unmarshal 에러 반드시 처리
- 5개 메서드: List, GetByID, Create, Update, ToggleStatus
- 주석 한국어

## 완료 후 실행
1. go build ./...
2. go vet ./...

## 체크리스트 보고
struct 타입, 에러 처리, 입력값 검증, 설계문서 필드, 에러 응답 형식 각각 O/X 보고.
자체 평가 10점 만점.
