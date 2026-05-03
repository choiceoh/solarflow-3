package handler

import "testing"

// parseAuditFrom — `from` 쿼리 파라미터의 입력 형식 검증.
// PostgREST `.Gte`에 자유 문자열을 그대로 흘려보내는 것을 막기 위한 안전선.

func TestParseAuditFrom_AcceptsISODate(t *testing.T) {
	got, ok := parseAuditFrom("2026-05-03")
	if !ok || got != "2026-05-03" {
		t.Fatalf("ISO date should pass: got=%q ok=%v", got, ok)
	}
}

func TestParseAuditFrom_AcceptsRFC3339(t *testing.T) {
	in := "2026-05-03T10:30:00Z"
	got, ok := parseAuditFrom(in)
	if !ok || got != in {
		t.Fatalf("RFC3339 should pass: got=%q ok=%v", got, ok)
	}
}

func TestParseAuditFrom_RejectsGarbage(t *testing.T) {
	cases := []string{
		"",
		"yesterday",
		"2026/05/03",
		"05-03-2026",
		"2026-13-01",            // 잘못된 월
		"2026-05-32",            // 잘못된 일
		"' OR 1=1 --",           // SQL/PostgREST 인젝션 시도
		"2026-05-03;DROP TABLE", // 세미콜론 끼워넣기
	}
	for _, in := range cases {
		if _, ok := parseAuditFrom(in); ok {
			t.Errorf("input %q should be rejected", in)
		}
	}
}
