package handler

import "testing"

func TestParseBankAccountFreeText(t *testing.T) {
	cases := []struct {
		in       string
		wantBank string
		wantNum  string
	}{
		{"신한 110-000-000000", "신한", "110-000-000000"},
		{"신한은행 110-000-000000", "신한은행", "110-000-000000"},
		{"국민 000000-00-000000", "국민", "000000-00-000000"},
		{"  하나  123-456789  ", "하나", "123-456789"},
		{"우리은행: 1002-123-456789", "우리은행", "1002-123-456789"},
		{"신한은행(법인) 110-000-000000", "신한은행", "110-000-000000"},

		// 파싱 실패 — bank_name 없음
		{"110-000-000000", "", ""},
		// 파싱 실패 — 숫자 시퀀스 너무 짧음 (3자리)
		{"신한 123", "", ""},
		// 빈 문자열
		{"", "", ""},
		// 공백만
		{"   ", "", ""},
		// 숫자가 전혀 없음
		{"신한은행", "", ""},
	}
	for _, c := range cases {
		gotBank, gotNum := parseBankAccountFreeText(c.in)
		if gotBank != c.wantBank || gotNum != c.wantNum {
			t.Errorf("parseBankAccountFreeText(%q) = (%q, %q), want (%q, %q)",
				c.in, gotBank, gotNum, c.wantBank, c.wantNum)
		}
	}
}

func TestNormalizeAccountNumber(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"110-000-000000", "110000000000"},
		{"110 000 000000", "110000000000"},
		{"110-000 000000", "110000000000"},
		{"", ""},
		{"abc", ""},
		{"110abc000-000000", "110000000000"},
	}
	for _, c := range cases {
		got := normalizeAccountNumber(c.in)
		if got != c.want {
			t.Errorf("normalizeAccountNumber(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
