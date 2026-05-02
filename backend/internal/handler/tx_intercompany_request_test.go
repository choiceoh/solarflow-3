package handler

import (
	"strings"
	"testing"
)

// TestValidateIntercompanyTransition — 그룹내 매입요청 상태 머신 명세 검증.
// 회귀 위험: 새 상태 도입 시 머신 명세를 코드 한 곳(intercompanyAllowedTransitions)에서만 갱신.
func TestValidateIntercompanyTransition(t *testing.T) {
	cases := []struct {
		name            string
		current, target string
		wantErrContains string // "" = 통과 기대
	}{
		// 허용 전이 4건
		{"pending → cancelled (BARO 취소)", "pending", "cancelled", ""},
		{"pending → rejected (탑솔라 거부)", "pending", "rejected", ""},
		{"pending → shipped (탑솔라 출고연결)", "pending", "shipped", ""},
		{"shipped → received (BARO 입고확인)", "shipped", "received", ""},

		// 잘못된 전이
		{"pending → received (출고 건너뛰기)", "pending", "received", "허용되지 않습니다"},
		{"shipped → cancelled (출고 후 취소)", "shipped", "cancelled", "허용되지 않습니다"},
		{"shipped → rejected (출고 후 거부)", "shipped", "rejected", "허용되지 않습니다"},
		{"shipped → shipped (중복)", "shipped", "shipped", "허용되지 않습니다"},

		// 종결 상태에서 전이 시도
		{"cancelled → anything", "cancelled", "pending", "종결 상태이거나 미정의"},
		{"rejected → anything", "rejected", "shipped", "종결 상태이거나 미정의"},
		{"received → anything", "received", "cancelled", "종결 상태이거나 미정의"},

		// 미정의 상태
		{"unknown → pending", "unknown", "pending", "종결 상태이거나 미정의"},
		{"빈 current", "", "pending", "종결 상태이거나 미정의"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := validateIntercompanyTransition(c.current, c.target)
			if c.wantErrContains == "" {
				if err != nil {
					t.Errorf("통과 기대, 에러: %v", err)
				}
			} else {
				if err == nil {
					t.Errorf("에러 기대(%q), 실제: nil", c.wantErrContains)
				} else if !strings.Contains(err.Error(), c.wantErrContains) {
					t.Errorf("에러 메시지에 %q 포함 기대, 실제: %v", c.wantErrContains, err)
				}
			}
		})
	}
}
