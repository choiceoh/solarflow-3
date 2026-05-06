package handler

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// TestNoLargeRangeRegression — D-064 PR 36 회귀 방지 가드.
//
// 배경: PostgREST Cloud 의 db-max-rows=1000 cap 으로 인해 단일 Range(0, 99999) 호출은
// 첫 1000 행만 응답한다. 이로 인해 SaleListItem.outbound_date 다수가 NULL 되어
// SalesAnalysisPage 가 "매출 날짜 없음" 을 표시하는 회귀가 두 번 발생.
//
//   2026-05-05  처음 fix (fetchAllFromTable 헬퍼)
//   2026-05-06  perf 변경 중 회귀 — 단일 Range 로 복귀
//   2026-05-06  PR 35/36 재 fix + 본 가드
//
// 이 테스트는 internal/handler 패키지의 어떤 .go 파일에서도 Range(0, 1000) 이상의
// 단일 호출을 검출해 회귀를 빌드 타임에 차단한다. 청크 페이지네이션 헬퍼
// fetchAllFromTable 을 사용하거나 적절한 limit/offset 처리를 사용해야 한다.
func TestNoLargeRangeRegression(t *testing.T) {
	// Range(0, N) 패턴에서 N >= 1000 검출.
	re := regexp.MustCompile(`Range\(\s*0\s*,\s*(\d+)\s*,`)

	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("glob: %v", err)
	}

	var offenders []string
	for _, f := range files {
		// 자기 자신과 헬퍼 정의 파일은 검사 제외
		base := filepath.Base(f)
		if base == "paginated_fetch.go" || base == "paginated_fetch_guard_test.go" {
			continue
		}
		// _test.go 도 일단 제외 (테스트 픽스처가 큰 Range 쓰는 경우 허용)
		if strings.HasSuffix(base, "_test.go") {
			continue
		}

		body, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		text := string(body)
		for _, m := range re.FindAllStringSubmatch(text, -1) {
			endStr := m[1]
			// strconv 없이 길이로 단순 판단: 4자리 이상이면 1000+
			if len(endStr) >= 4 {
				// 줄 번호 추정 (디버깅용)
				idx := strings.Index(text, m[0])
				lineNo := strings.Count(text[:idx], "\n") + 1
				offenders = append(offenders, f+":"+itoa(lineNo)+" Range(0, "+endStr+")")
			}
		}
	}

	if len(offenders) > 0 {
		t.Errorf("D-064 PR 36 회귀: 단일 Range 로 PostgREST 1000건 cap 우회 시도 검출.\n"+
			"fetchAllFromTable 헬퍼를 사용하거나 적절한 페이지네이션 사용:\n  %s",
			strings.Join(offenders, "\n  "))
	}
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var b []byte
	neg := i < 0
	if neg {
		i = -i
	}
	for i > 0 {
		b = append([]byte{byte('0' + i%10)}, b...)
		i /= 10
	}
	if neg {
		b = append([]byte{'-'}, b...)
	}
	return string(b)
}
