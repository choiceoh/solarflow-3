package handler

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// 회귀 가드 컬렉션 (D-064 PR 37 Layer 3).
//
// 발견된 회귀 패턴을 빌드 타임에 차단. 매 회귀마다 명명된 test 추가.
// 이렇게 하면 "PR 36 회귀가 또 일어나면 X test 가 빨간색" 즉시 인지.
//
// 가이드라인:
//   - 새 회귀 발견 시: 이 파일에 TestNo<RegressionName> 함수 추가
//   - false positive 시: skip 패턴을 명확히 (해당 파일/함수만)
//   - 자기 자신과 _test.go 는 검사 제외 (가드 정의 자체는 허용)

// scanHandlerFiles — internal/handler/*.go 파일 (test/guard 제외) 순회.
func scanHandlerFiles(t *testing.T, fn func(filePath, content string)) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("glob: %v", err)
	}
	for _, f := range files {
		base := filepath.Base(f)
		// 가드 정의 파일과 헬퍼는 검사 제외
		if base == "paginated_fetch.go" ||
			base == "paginated_fetch_guard_test.go" ||
			base == "regression_guards_test.go" {
			continue
		}
		if strings.HasSuffix(base, "_test.go") {
			continue
		}
		body, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		fn(f, string(body))
	}
}

// findLineNo — content 내 substring 위치 → 줄 번호.
func findLineNo(content, sub string) int {
	idx := strings.Index(content, sub)
	if idx < 0 {
		return 0
	}
	return strings.Count(content[:idx], "\n") + 1
}

// ============================================================
// G1. 단일 Range(0, N) 1000+ 호출 차단 (PR 36 의 TestNoLargeRangeRegression 와 보완)
// ============================================================
// 위 PR 36 의 가드가 정의된 paginated_fetch_guard_test.go 와 중복되는 케이스라 여기선 안 만들고
// 추가 가드만 정의.

// G2 (Select * on large table) 는 false positive 많아 제거.
//   - 단일 행 ID 조회 (Eq 필터 있음) 는 정상
//   - export 핸들러 (모든 컬럼 필요) 는 정상
//   - 더 정교한 휴리스틱 필요 (Eq 필터 부재 + Range 큰 범위 동시) — 향후 작업.

// ============================================================
// G3. enrichSales / enrichOutbounds 등 enrich 함수에서 단일 호출이 헬퍼 미사용 차단
// 회귀 패턴: enrich 함수가 .From().Select().Range(0, N) 직접 호출 (헬퍼 우회)
// ============================================================
func TestEnrichFunctionsUseHelper(t *testing.T) {
	// enrichXxx 함수 정의 + 단일 .Range(0, ...) 호출 같이 있으면 의심
	// 단순 휴리스틱: 함수 안에서 큰 Range 가 보이는지
	enrichPattern := regexp.MustCompile(
		`func\s*\([^)]+\)\s+enrich\w+\s*\([^)]*\)\s*[^{]*\{`,
	)
	bigRange := regexp.MustCompile(`\.Range\(\s*0\s*,\s*(\d{4,})\s*,`)

	scanHandlerFiles(t, func(f, content string) {
		for _, mFunc := range enrichPattern.FindAllStringIndex(content, -1) {
			// 함수 시작부터 다음 함수 또는 EOF 까지 — 단순 closing brace 매칭은 정확하지 않으나
			// 휴리스틱 — 다음 "\nfunc " 까지
			start := mFunc[0]
			rest := content[mFunc[1]:]
			endIdx := strings.Index(rest, "\nfunc ")
			if endIdx < 0 {
				endIdx = len(rest)
			}
			body := rest[:endIdx]
			for _, mRange := range bigRange.FindAllStringSubmatch(body, -1) {
				if len(mRange[1]) >= 4 { // 1000+
					lineNo := findLineNo(content, mRange[0])
					if lineNo == 0 {
						lineNo = findLineNo(content[start:], mRange[0])
					}
					t.Errorf("D-064 PR 37 G3 회귀: %s 의 enrich 함수에서 단일 Range(0, %s) 사용. fetchAllFromTable 헬퍼 사용 필수.",
						f, mRange[1])
				}
			}
		}
	})
}

// ============================================================
// G4. Range(0, 999) (정확히 999 개) 차단 — off-by-one 의도 인지 검증
// 회귀 패턴: 실수로 999 적었는데 1000행 cap 으로 정상 동작하는 것처럼 보이지만
//   실제로는 990 개만 응답되어 누락. 명시적 cap 의도면 PostgRESTMaxRows 상수 사용.
// ============================================================
func TestNoMagicNumberInRange(t *testing.T) {
	// .Range(N, M) 에서 M = 999 또는 1000 같은 magic number 검출 (cap 의도면 상수 써야)
	pat := regexp.MustCompile(`\.Range\(\s*\d+\s*,\s*(999|1000|9999|99999)\s*,`)

	scanHandlerFiles(t, func(f, content string) {
		for _, m := range pat.FindAllStringSubmatch(content, -1) {
			lineNo := findLineNo(content, m[0])
			t.Errorf("D-064 PR 37 G4: %s:%d Range 에 magic number %s. PostgRESTMaxRows 상수 또는 명시적 청크 페이지 사용.",
				f, lineNo, m[1])
		}
	})
}
