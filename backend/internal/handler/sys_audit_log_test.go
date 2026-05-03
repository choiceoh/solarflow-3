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

func TestValidAuditIdentifier_AcceptsCommonShapes(t *testing.T) {
	cases := []string{
		"po-2604-jko",                          // 운영 PO id
		"e51d1a6e-5a87-4d80-9c7e-3fbc3a8a9d00", // UUID v4
		"abc123",                               // 단순 영숫자
		"user_42",                              // 언더스코어
		"A",                                    // 1자
	}
	for _, in := range cases {
		if !validAuditIdentifier(in) {
			t.Errorf("input %q should be accepted", in)
		}
	}
}

func TestValidAuditIdentifier_RejectsHostileInput(t *testing.T) {
	cases := []string{
		"",                       // 빈 문자열
		"contains space",         // 공백
		"semi;colon",             // 세미콜론
		"' OR 1=1",               // SQL/PostgREST 인젝션
		"path/traversal",         // 슬래시
		"a.b",                    // 점 (PostgREST 관계 문법)
		"퍼센트%",                  // 멀티바이트
		string(make([]byte, 65)), // 64자 초과 (NUL bytes — 길이만 검사)
	}
	for _, in := range cases {
		if validAuditIdentifier(in) {
			t.Errorf("input %q should be rejected", in)
		}
	}
}
