package middleware

import "context"

// contextKey — context에 저장할 키의 타입
// 비유: 사원증에 부착하는 태그 종류 — "이름표", "부서표", "이메일표" 등
type contextKey string

const (
	// 비유: 사원증의 각 태그 이름
	keyUserID         contextKey = "user_id"
	keyUserRole       contextKey = "user_role"
	keyUserEmail      contextKey = "user_email"
	keyTenantScope    contextKey = "tenant_scope"
	keyAllowedModules contextKey = "allowed_modules"
)

// 테넌트 스코프 상수 (D-108, D-119)
// module/cable/baro가 같은 코드/DB를 공유하되, 사용자별로 어느 앱에 속하는지 구분
const (
	TenantScopeTopsolar = "topsolar"
	TenantScopeCable    = "cable"
	TenantScopeBaro     = "baro"
)

// SetUserContext — 인증된 사용자 정보를 context에 저장
// 비유: 보안 게이트를 통과한 사람에게 사원증을 발급하는 것
// tenantScope이 빈 문자열이면 topsolar로 본다(D-108 호환).
func SetUserContext(ctx context.Context, userID, role, email, tenantScope string, allowedModules []string) context.Context {
	if tenantScope == "" {
		tenantScope = TenantScopeTopsolar
	}
	ctx = context.WithValue(ctx, keyUserID, userID)
	ctx = context.WithValue(ctx, keyUserRole, role)
	ctx = context.WithValue(ctx, keyUserEmail, email)
	ctx = context.WithValue(ctx, keyTenantScope, tenantScope)
	ctx = context.WithValue(ctx, keyAllowedModules, allowedModules)
	return ctx
}

// GetUserID — context에서 사용자 ID를 꺼냄
// 비유: 사원증에서 사번을 읽는 것
func GetUserID(ctx context.Context) string {
	val, ok := ctx.Value(keyUserID).(string)
	if !ok {
		return ""
	}
	return val
}

// GetUserRole — context에서 사용자 역할을 꺼냄
// 비유: 사원증에서 직급을 읽는 것
func GetUserRole(ctx context.Context) string {
	val, ok := ctx.Value(keyUserRole).(string)
	if !ok {
		return ""
	}
	return val
}

// GetUserEmail — context에서 사용자 이메일을 꺼냄
// 비유: 사원증에서 이메일 주소를 읽는 것
func GetUserEmail(ctx context.Context) string {
	val, ok := ctx.Value(keyUserEmail).(string)
	if !ok {
		return ""
	}
	return val
}

// GetAllowedModules — context에서 허용된 모듈 목록을 꺼냄
// 비유: 사원증에서 출입 허용 구역 목록을 읽는 것
func GetAllowedModules(ctx context.Context) []string {
	val, ok := ctx.Value(keyAllowedModules).([]string)
	if !ok {
		return nil
	}
	return val
}

// GetTenantScope — context에서 사용자 테넌트 스코프를 꺼냄(D-108)
// 비유: 사원증에서 "어느 회사 소속" 표식을 읽는 것
// 값이 비어 있으면 topsolar로 간주해 기존 사용자가 격리에 막히지 않게 한다.
func GetTenantScope(ctx context.Context) string {
	val, ok := ctx.Value(keyTenantScope).(string)
	if !ok || val == "" {
		return TenantScopeTopsolar
	}
	return val
}
