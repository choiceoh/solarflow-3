package handler

import "testing"

// TestShouldAutoInsertPriceHistory — F8 단가이력 자동 등록 게이트.
// PATCH 인라인 편집(메타 상세 셀 클릭)도 PUT과 동일하게 contracted 전환 시 트리거되어야 한다.
// 회귀 방지 — 게이트 조건이 바뀌면 이 테스트가 먼저 깨진다.
func TestShouldAutoInsertPriceHistory(t *testing.T) {
	contracted := "contracted"
	draft := "draft"
	completed := "completed"

	cases := []struct {
		name       string
		reqStatus  *string
		prevStatus string
		want       bool
	}{
		{"draft → contracted: 트리거", &contracted, "draft", true},
		{"draft → contracted (prev 없음): 트리거", &contracted, "", true},
		{"contracted → contracted (재전환): skip", &contracted, "contracted", false},
		{"contracted → completed (다른 상태): skip", &completed, "contracted", false},
		{"draft → draft (변경 없음): skip", &draft, "draft", false},
		{"status 미전송 (PATCH 다른 필드만): skip", nil, "draft", false},
		{"status 미전송 (PATCH 다른 필드만, prev contracted): skip", nil, "contracted", false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := shouldAutoInsertPriceHistory(c.reqStatus, c.prevStatus)
			if got != c.want {
				t.Errorf("기대=%v, 실제=%v", c.want, got)
			}
		})
	}
}
