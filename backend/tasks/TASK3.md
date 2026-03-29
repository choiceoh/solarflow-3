# 작업: 인증 미들웨어 (Supabase Auth + JWT)
RULES.md를 반드시 따를 것.
## 배경
- 인증 방식: Supabase Auth가 발급한 JWT 토큰을 Go 미들웨어에서 검증
- Supabase URL: 환경변수 SUPABASE_URL에서 가져옴
- JWT Secret: 환경변수 SUPABASE_JWT_SECRET에서 가져옴 (fly.io secrets에 등록 필요)
- 사용자 역할: user_profiles 테이블의 role 필드 (admin/executive/manager/staff/viewer)
- staff 모듈 접근: user_profiles 테이블의 allowed_modules 필드 (TEXT[])
## 파일 1: internal/middleware/auth.go (신규)
AuthMiddleware:
- Authorization 헤더에서 "Bearer {token}" 추출
- JWT 토큰 검증 (SUPABASE_JWT_SECRET 환경변수로 서명 확인)
- 토큰에서 user_id(sub 클레임) 추출
- user_profiles 테이블에서 해당 user_id의 role, is_active, allowed_modules 조회
- is_active가 false면 403 응답
- user_id, role, email, allowed_modules를 context에 저장
- 토큰 없으면: 401 "인증이 필요합니다"
- 토큰 유효하지 않으면: 401 "유효하지 않은 토큰입니다"
- 사용자 없으면: 401 "등록되지 않은 사용자입니다"
- 비활성 사용자: 403 "비활성화된 계정입니다"
RoleMiddleware(allowedRoles ...string):
- context에서 role 가져옴
- allowedRoles에 포함되지 않으면 403 "접근 권한이 없습니다"
- 예: RoleMiddleware("admin", "manager") — admin과 manager만 허용
참고: staff의 allowed_modules 기반 모듈 접근 제어는 TODO로 남김.
현재는 role 기반 접근만 구현. 추후 각 핸들러 라우트에 모듈 체크 추가.
## 파일 2: internal/middleware/context.go (신규)
context에 저장/조회하는 헬퍼 함수:
- SetUserContext(ctx, userID, role, email, allowedModules) context.Context
- GetUserID(ctx) string
- GetUserRole(ctx) string
- GetUserEmail(ctx) string
- GetAllowedModules(ctx) []string
## 파일 3: router.go 수정
미들웨어 적용:
- /health — 인증 불필요
- /api/v1/* 모든 경로 — AuthMiddleware 적용
- 필요한 JWT 라이브러리 go get으로 설치 (github.com/golang-jwt/jwt/v5 추천)
## 환경변수
- SUPABASE_JWT_SECRET: Supabase 대시보드 → Settings → API → JWT Secret 값
- fly.io에 등록: fly secrets set SUPABASE_JWT_SECRET="값" -a solarflow-backend
- 이 값은 Alex가 별도로 등록해야 함 (코드에 하드코딩 금지)
## 공통 규칙
- response 패키지 사용 (에러 응답 통일)
- 에러 메시지 한국어
- 주석 한국어
- map[string]interface 금지
- 모든 에러 처리 필수
## 완료 후
1. go build ./...
2. go vet ./...
3. 전체 파일 코드 보여주기 (auth.go, context.go, router 수정부분)
4. RULES.md 체크리스트 보고 — 인증 체크가 "O"가 되어야 함
