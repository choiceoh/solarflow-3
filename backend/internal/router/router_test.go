package router_test

import (
	"flag"
	"fmt"
	"net/http"
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
