package router_test

import (
	"flag"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/app"
	"solarflow-backend/internal/config"
	"solarflow-backend/internal/engine"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/router"
)

var update = flag.Bool("update", false, "update golden files")

// TestRouteSnapshot — D-RegisterRoutes 빅뱅 회귀 가드.
// 라우터 트리를 정렬해 testdata/routes.golden과 비교한다.
// 라우트 누락·추가·메서드/URL 변경이 있으면 즉시 깨진다.
//
// 신규 도메인을 추가하면 다음 명령으로 골든파일을 갱신한다:
//
//	go test ./internal/router -run TestRouteSnapshot -update
func TestRouteSnapshot(t *testing.T) {
	a := newTestApp(t, true)
	r := router.New(a)

	var routes []string
	walk := func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		routes = append(routes, fmt.Sprintf("%-7s %s", method, route))
		return nil
	}
	if err := chi.Walk(r.(chi.Routes), walk); err != nil {
		t.Fatalf("chi.Walk 실패: %v", err)
	}
	sort.Strings(routes)
	actual := strings.Join(routes, "\n") + "\n"

	const goldenPath = "testdata/routes.golden"
	if *update {
		if err := os.WriteFile(goldenPath, []byte(actual), 0o644); err != nil {
			t.Fatalf("golden 갱신 실패: %v", err)
		}
		return
	}
	expected, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("golden 읽기 실패 (-update로 생성 가능): %v", err)
	}
	if string(expected) != actual {
		t.Errorf("라우트 스냅샷 표류 — 변경 의도 시 `-update` 재생성\n--- expected ---\n%s\n--- actual ---\n%s", expected, actual)
	}
}

// TestRouteSnapshot_NoEngine — engine 미설정 시 calc/engine 라우트가 mount되지 않는다.
// 운영 PC는 engine이 있고 worktree/CI는 없을 수 있으므로 두 형태 모두 보장한다.
func TestRouteSnapshot_NoEngine(t *testing.T) {
	a := newTestApp(t, false)
	r := router.New(a)

	var hasCalc bool
	walk := func(_, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if strings.HasPrefix(route, "/api/v1/calc") || strings.HasPrefix(route, "/api/v1/engine") {
			hasCalc = true
		}
		return nil
	}
	if err := chi.Walk(r.(chi.Routes), walk); err != nil {
		t.Fatalf("chi.Walk 실패: %v", err)
	}
	if hasCalc {
		t.Fatal("HasEngine()=false인 App에서 /api/v1/calc 또는 /api/v1/engine 라우트가 mount되었습니다")
	}
}

// newTestApp — 부트스트랩 환경 없이 router.New 호출에 필요한 최소 의존성만 채운다.
// chi.Walk는 핸들러를 호출하지 않으므로 DB·OCR은 dummy/nil이어도 안전.
func newTestApp(t *testing.T, withEngine bool) *app.App {
	t.Helper()
	db, err := supa.NewClient("http://localhost", "test-key", &supa.ClientOptions{})
	if err != nil {
		t.Fatalf("supa dummy client: %v", err)
	}
	a := &app.App{
		DB:    db,
		OCR:   nil,
		Cfg:   &config.Config{Port: "8080"},
		Gates: middleware.NewGates(),
	}
	if withEngine {
		a.Eng = engine.NewEngineClient("http://localhost:18081")
	}
	return a
}

// ---- TestGuardMatrix — D-110에서 약속한 가드 매트릭스 테스트 ----
// snapshot 테스트가 URL/메서드 변경만 감지하는 한계를 보완. D-108(topsolarOnly)/D-109(baroOnly)/
// adminOnly/write 가드가 라우트별로 올바르게 적용됐는지 stub auth + 합성 요청으로 검증.
//
// 동작:
//   1. NewWithAuth로 stub auth 주입 — X-Test-Tenant/X-Test-Role 헤더로 컨텍스트 직접 설정.
//   2. 각 케이스마다 (a) 모든 가드를 통과하는 컨텍스트로 요청 → 403이면 실패 (handler가 500/400/200 반환은 무관).
//      (b) 각 가드별로 그 가드만 실패하는 컨텍스트 → 403이 아니면 실패.
//
// 실수 시나리오 — 회귀 검출 능력:
//   - /lcs의 topsolarOnly를 baroOnly로 잘못 바꾸면 → topsolar 사용자는 403, baro 사용자는 통과.
//     → 본 테스트의 (a) 조건에서 topsolar 컨텍스트가 403 받음 → 실패 → CI 차단.
//   - POST /companies에서 g.Write를 빼먹으면 → viewer 사용자가 통과 → (b) write 검증 실패.

type guardSet struct {
	write, adminOnly, topsolarOnly, baroOnly bool
}

type guardCase struct {
	method, path string
	g            guardSet
}

// passingCtx — guardSet의 모든 가드를 통과하는 (tenant, role) 쌍.
func passingCtx(g guardSet) (tenant, role string) {
	role = "operator"
	if g.adminOnly {
		role = "admin"
	}
	tenant = middleware.TenantScopeTopsolar
	if g.baroOnly {
		tenant = middleware.TenantScopeBaro
	}
	return
}

type failCase struct {
	tenant, role, gate string
}

// failingCases — 각 가드별로 그 가드만 실패하고 나머지는 통과하는 컨텍스트들.
func failingCases(g guardSet) []failCase {
	pT, pR := passingCtx(g)
	var out []failCase
	if g.write {
		out = append(out, failCase{pT, "viewer", "write"})
	}
	if g.adminOnly {
		out = append(out, failCase{pT, "operator", "adminOnly"})
	}
	if g.topsolarOnly {
		out = append(out, failCase{middleware.TenantScopeBaro, pR, "topsolarOnly"})
	}
	if g.baroOnly {
		out = append(out, failCase{middleware.TenantScopeTopsolar, pR, "baroOnly"})
	}
	return out
}

// stubAuth — X-Test-Tenant/X-Test-Role 헤더를 컨텍스트에 주입하는 테스트용 미들웨어.
// 운영의 AuthMiddleware는 JWT/JWKS/user_profiles 조회를 거치지만, 가드 적용 검증에는 컨텍스트만 필요.
func stubAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tenant := r.Header.Get("X-Test-Tenant")
		if tenant == "" {
			tenant = middleware.TenantScopeTopsolar
		}
		role := r.Header.Get("X-Test-Role")
		if role == "" {
			role = "operator"
		}
		ctx := middleware.SetUserContext(r.Context(), "test-user", role, "test@solarflow.local", tenant, nil)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// fire — 합성 요청을 라우터에 흘려 응답 코드 반환. body는 비워둔다(가드는 핸들러보다 먼저 실행).
func fire(h http.Handler, method, path, tenant, role string) int {
	req := httptest.NewRequest(method, path, nil)
	req.Header.Set("X-Test-Tenant", tenant)
	req.Header.Set("X-Test-Role", role)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code
}

func TestGuardMatrix(t *testing.T) {
	a := newTestApp(t, true)
	h := router.NewWithAuth(a, stubAuth)

	// 보호 가치가 큰 라우트 위주로 표를 유지. snapshot이 222개 전체를 추적하므로,
	// 본 테스트는 "어느 가드가 어디에 적용되어야 하는가"를 명시하는 spec 역할.
	g := func(s guardSet) guardSet { return s }
	matrix := []guardCase{
		// ---- D-108 TopsolarOnly (도메인별 대표) ----
		{"GET", "/api/v1/lcs/", g(guardSet{topsolarOnly: true})},
		{"POST", "/api/v1/lcs/", g(guardSet{topsolarOnly: true, write: true})},
		{"DELETE", "/api/v1/lcs/test-id", g(guardSet{topsolarOnly: true, write: true})},
		{"GET", "/api/v1/tts/", g(guardSet{topsolarOnly: true})},
		{"POST", "/api/v1/tts/", g(guardSet{topsolarOnly: true, write: true})},
		{"GET", "/api/v1/declarations/", g(guardSet{topsolarOnly: true})},
		{"POST", "/api/v1/declarations/", g(guardSet{topsolarOnly: true, write: true})},
		{"GET", "/api/v1/cost-details/", g(guardSet{topsolarOnly: true})},
		{"DELETE", "/api/v1/cost-details/test-id", g(guardSet{topsolarOnly: true, write: true})},
		{"GET", "/api/v1/expenses/", g(guardSet{topsolarOnly: true})},
		{"POST", "/api/v1/expenses/", g(guardSet{topsolarOnly: true, write: true})},
		{"GET", "/api/v1/limit-changes/", g(guardSet{topsolarOnly: true})},
		{"POST", "/api/v1/limit-changes/", g(guardSet{topsolarOnly: true, write: true})},
		{"GET", "/api/v1/price-histories/", g(guardSet{topsolarOnly: true})},
		{"POST", "/api/v1/price-histories/", g(guardSet{topsolarOnly: true, write: true})},
		{"GET", "/api/v1/export/amaranth/inbound", g(guardSet{topsolarOnly: true})},
		{"POST", "/api/v1/export/amaranth/outbound/jobs", g(guardSet{topsolarOnly: true, write: true})},

		// ---- D-108 calc TopsolarOnly ----
		{"POST", "/api/v1/calc/landed-cost", g(guardSet{topsolarOnly: true})},
		{"POST", "/api/v1/calc/lc-fee", g(guardSet{topsolarOnly: true})},
		{"POST", "/api/v1/calc/margin-analysis", g(guardSet{topsolarOnly: true})},
		{"POST", "/api/v1/calc/exchange-compare", g(guardSet{topsolarOnly: true})},
		{"POST", "/api/v1/calc/lc-limit-timeline", g(guardSet{topsolarOnly: true})},
		{"POST", "/api/v1/calc/lc-maturity-alert", g(guardSet{topsolarOnly: true})},
		{"POST", "/api/v1/calc/price-trend", g(guardSet{topsolarOnly: true})},

		// ---- D-109 BaroOnly ----
		{"GET", "/api/v1/partner-prices/", g(guardSet{baroOnly: true})},
		{"POST", "/api/v1/partner-prices/", g(guardSet{baroOnly: true, write: true})},
		{"GET", "/api/v1/baro/incoming/", g(guardSet{baroOnly: true})},
		{"GET", "/api/v1/baro/purchase-history/", g(guardSet{baroOnly: true})},
		{"GET", "/api/v1/baro/credit-board/", g(guardSet{baroOnly: true})},
		{"GET", "/api/v1/baro/dispatch-routes/", g(guardSet{baroOnly: true})},
		{"POST", "/api/v1/baro/dispatch-routes/", g(guardSet{baroOnly: true, write: true})},
		{"GET", "/api/v1/baro/orders/recent", g(guardSet{baroOnly: true})},
		{"POST", "/api/v1/baro/orders/test-id/clone", g(guardSet{baroOnly: true, write: true})},
		{"POST", "/api/v1/partner-activities/", g(guardSet{baroOnly: true, write: true})},
		{"GET", "/api/v1/me/open-followups", g(guardSet{baroOnly: true})},
		{"GET", "/api/v1/partners/test-id/activities", g(guardSet{baroOnly: true})},

		// ---- D-109 mixed (intercompany — 양방향) ----
		{"GET", "/api/v1/intercompany-requests/mine", g(guardSet{baroOnly: true})},
		{"POST", "/api/v1/intercompany-requests/", g(guardSet{baroOnly: true, write: true})},
		{"GET", "/api/v1/intercompany-requests/inbox", g(guardSet{topsolarOnly: true})},
		{"PATCH", "/api/v1/intercompany-requests/test-id/reject", g(guardSet{topsolarOnly: true, write: true})},

		// ---- AdminOnly ----
		{"GET", "/api/v1/users/", g(guardSet{adminOnly: true})},
		{"POST", "/api/v1/users/", g(guardSet{adminOnly: true})},
		{"PUT", "/api/v1/users/test-id/role", g(guardSet{adminOnly: true})},
		{"PUT", "/api/v1/ui-configs/scope/cfg", g(guardSet{adminOnly: true})},
		{"DELETE", "/api/v1/ui-configs/scope/cfg", g(guardSet{adminOnly: true})},

		// ---- Write only (테넌트 가드 없음) ----
		{"POST", "/api/v1/companies/", g(guardSet{write: true})},
		{"PATCH", "/api/v1/companies/test-id/status", g(guardSet{write: true})},
		{"POST", "/api/v1/notes/", g(guardSet{write: true})},
		{"POST", "/api/v1/import/inbound", g(guardSet{write: true})},
		{"POST", "/api/v1/ocr/extract", g(guardSet{write: true})},
		{"POST", "/api/v1/receipt-matches/auto", g(guardSet{write: true})},
	}

	for _, c := range matrix {
		c := c
		t.Run(c.method+" "+c.path, func(t *testing.T) {
			tenant, role := passingCtx(c.g)
			if code := fire(h, c.method, c.path, tenant, role); code == http.StatusForbidden {
				t.Errorf("PASS context (tenant=%s role=%s) → 403; expected guard pass (handler 4xx/5xx OK, but not 403)", tenant, role)
			}
			for _, fc := range failingCases(c.g) {
				if code := fire(h, c.method, c.path, fc.tenant, fc.role); code != http.StatusForbidden {
					t.Errorf("FAIL context (gate=%s tenant=%s role=%s) → %d; expected 403", fc.gate, fc.tenant, fc.role, code)
				}
			}
		})
	}
}

func TestBaroPurchaseHistoryCostRoleGate(t *testing.T) {
	a := newTestApp(t, true)
	h := router.NewWithAuth(a, stubAuth)

	if code := fire(h, "GET", "/api/v1/baro/purchase-history/", middleware.TenantScopeBaro, "operator"); code == http.StatusForbidden {
		t.Fatalf("BARO operator는 구매이력 원가 조회를 통과해야 합니다")
	}
	if code := fire(h, "GET", "/api/v1/baro/purchase-history/", middleware.TenantScopeBaro, "manager"); code != http.StatusForbidden {
		t.Fatalf("BARO manager는 구매이력 원가 조회가 차단돼야 합니다: got %d", code)
	}
	if code := fire(h, "GET", "/api/v1/baro/purchase-history/", middleware.TenantScopeTopsolar, "operator"); code != http.StatusForbidden {
		t.Fatalf("탑솔라 토큰은 BARO 구매이력 조회가 차단돼야 합니다: got %d", code)
	}
}
