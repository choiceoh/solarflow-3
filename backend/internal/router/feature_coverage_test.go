package router_test

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/router"
)

// 본 파일은 D-120 강제 메커니즘 두 종을 담는다:
//   1. TestFeatureCoverage         — chi 라우터 트리 ↔ 카탈로그 Paths 일치
//   2. TestMatrixConsistency       — 카탈로그 ↔ harness/FEATURE-WIRING-MATRIX.md 일치
//   3. TestCatalogPathsAreReal     — 카탈로그가 적은 path 가 chi 트리에 실제 존재
//
// 셋 중 하나라도 실패하면 PR 차단. 신규 라우트 추가 시 catalog.go + matrix markdown 동시 갱신을 강제.

// unrestrictedAllowlist — 카탈로그(feature 게이트)에 잡히지 않는 라우트 목록.
// 본 매트릭스 markdown 의 "이 매트릭스에 잡히지 않는 것" 섹션과 일치해야 한다.
var unrestrictedAllowlist = map[string]bool{
	// public 인증 외
	"/health": true,
	// 짧은 만료 토큰 PDF 열람 — 별도 토큰 가드
	"/api/v1/attachments/{id}/file": true,
	// /api/v1/public/* — 인증 미적용 그룹
	"/api/v1/public/login-stats":             true,
	"/api/v1/public/fx/{pair}":               true,
	"/api/v1/public/fx/{pair}/timeseries":    true,
	"/api/v1/public/metals/{symbol}":         true,
	"/api/v1/public/polysilicon":             true,
	"/api/v1/public/scfi":                    true,
	"/api/v1/public/assistant/chat":          true,
}

// TestFeatureCoverage — chi 트리의 모든 라우트가 카탈로그 또는 unrestrictedAllowlist 에 정확히 한 번씩 등장하는가.
//
// 누락 시나리오:
//   - 새 라우트 추가했는데 catalog.go 에 Paths 추가 안 함 → unmapped 에 잡힘
//   - 카탈로그가 적은 Path 인데 chi 에는 없음 → stale 에 잡힘
//   - 같은 path 가 두 feature 에 등장 → catalog_test 의 PathsUnique 가 잡음
func TestFeatureCoverage(t *testing.T) {
	a := newTestApp(t, true)
	r := router.New(a)

	// chi 트리에서 path → 등장 여부
	chiPaths := map[string]bool{}
	walk := func(_, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		chiPaths[route] = true
		return nil
	}
	if err := chi.Walk(r.(chi.Routes), walk); err != nil {
		t.Fatalf("chi.Walk 실패: %v", err)
	}

	// 카탈로그가 owns 한다고 주장하는 path 집합
	catalogPaths := map[string]feature.FeatureID{}
	for id, f := range feature.Catalog {
		for _, p := range f.Paths {
			catalogPaths[p] = id
		}
	}

	// (1) chi 트리에 있지만 카탈로그/allowlist 둘 다 없는 라우트 → unmapped
	var unmapped []string
	for p := range chiPaths {
		if _, inCatalog := catalogPaths[p]; inCatalog {
			continue
		}
		if unrestrictedAllowlist[p] {
			continue
		}
		unmapped = append(unmapped, p)
	}
	sort.Strings(unmapped)
	if len(unmapped) > 0 {
		t.Errorf("D-120 강제: 카탈로그(catalog.go)에도 allowlist(feature_coverage_test.go)에도 없는 라우트 %d개:\n  %s\n→ catalog.go 에 Feature.Paths 추가 또는 unrestrictedAllowlist 갱신",
			len(unmapped), strings.Join(unmapped, "\n  "))
	}

	// (2) 카탈로그가 owns 한다고 주장하지만 chi 에 없는 path → stale
	var stale []string
	for p, id := range catalogPaths {
		if !chiPaths[p] {
			stale = append(stale, string(id)+" → "+p)
		}
	}
	sort.Strings(stale)
	if len(stale) > 0 {
		t.Errorf("D-120 강제: 카탈로그가 적은 path 가 chi 트리에 없음 %d건:\n  %s\n→ 라우트가 사라졌으면 catalog.go 의 Paths 도 정리",
			len(stale), strings.Join(stale, "\n  "))
	}

	// (3) allowlist 에 있지만 chi 트리에 없는 path → stale allowlist
	var staleAllow []string
	for p := range unrestrictedAllowlist {
		if !chiPaths[p] {
			staleAllow = append(staleAllow, p)
		}
	}
	sort.Strings(staleAllow)
	if len(staleAllow) > 0 {
		t.Errorf("unrestrictedAllowlist 에 있는 path 가 chi 트리에 없음 — 갱신 필요:\n  %s",
			strings.Join(staleAllow, "\n  "))
	}
}

// TestCatalogPathsAreReal — 카탈로그의 모든 entry 가 최소 1개 path 를 갖고, /api/v1 prefix 규약 준수.
// catalog package 의 단위 테스트와 중복되지만 router 트리 컨텍스트에서도 한 번 더 가드.
func TestCatalogPathsAreReal(t *testing.T) {
	for id, f := range feature.Catalog {
		if len(f.Paths) == 0 {
			t.Errorf("Feature %q Paths 가 비어있음", id)
		}
	}
}

// TestMatrixConsistency — harness/FEATURE-WIRING-MATRIX.md ↔ catalog.go 의 ID 집합 일치.
//
// 검증:
//  - 매트릭스 표 행에 백틱으로 감싼 모든 feature_id 는 카탈로그에 존재해야 한다(미정의 ID 게재 금지)
//  - 카탈로그의 모든 ID 는 매트릭스에 한 번 이상 등장해야 한다(빠진 ID 없음)
//
// 매트릭스를 갱신하지 않고 카탈로그만 변경한 PR (혹은 그 반대) 은 이 테스트가 잡는다.
func TestMatrixConsistency(t *testing.T) {
	matrixPath := findMatrixPath(t)
	raw, err := os.ReadFile(matrixPath)
	if err != nil {
		t.Fatalf("매트릭스 markdown 읽기 실패 %q: %v", matrixPath, err)
	}
	body := string(raw)

	// markdown 의 백틱 패턴 — `domain.action[.qualifier]` 형태만 채집.
	// 도메인 prefix 화이트리스트로 좁혀 `*_test.go`, `*.md`, `Foo.Bar` 등 파일명/타입명 오인을 방지.
	// 신규 도메인이 추가되면(신규 카탈로그 grouping) 이 정규식의 OR 목록에도 추가한다.
	idPattern := regexp.MustCompile("`((?:master|tx|calc|baro|intercompany|crm|io|ai|sys|engine)\\.[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)?)`")
	mentioned := map[string]bool{}
	for _, m := range idPattern.FindAllStringSubmatch(body, -1) {
		mentioned[m[1]] = true
	}

	// 매트릭스에 나온 ID 가 모두 카탈로그에 있는가
	var ghost []string
	for id := range mentioned {
		if _, ok := feature.Catalog[feature.FeatureID(id)]; !ok {
			ghost = append(ghost, id)
		}
	}
	sort.Strings(ghost)
	if len(ghost) > 0 {
		t.Errorf("매트릭스에 적힌 feature_id 가 카탈로그에 없음(유령 ID) %d건:\n  %s",
			len(ghost), strings.Join(ghost, ", "))
	}

	// 카탈로그의 ID 가 모두 매트릭스에 등장하는가
	var missing []string
	for id := range feature.Catalog {
		if !mentioned[string(id)] {
			missing = append(missing, string(id))
		}
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		t.Errorf("카탈로그 entry 가 매트릭스 markdown 에 없음(D-120 의무 갱신 위반) %d건:\n  %s\n→ harness/FEATURE-WIRING-MATRIX.md 에 행 추가",
			len(missing), strings.Join(missing, "\n  "))
	}
}

// findMatrixPath — 테스트 실행 디렉토리에서 harness/FEATURE-WIRING-MATRIX.md 를 찾는다.
// repo root 가 backend/ 의 부모이거나 worktree 일 때 모두 동작.
func findMatrixPath(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	dir := wd
	for i := 0; i < 8; i++ {
		candidate := filepath.Join(dir, "harness", "FEATURE-WIRING-MATRIX.md")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	t.Fatalf("harness/FEATURE-WIRING-MATRIX.md 를 %q 위쪽에서 찾을 수 없음", wd)
	return ""
}
