package handler

import "testing"

func TestSaleBusinessDateMatches(t *testing.T) {
	cases := []struct {
		name      string
		dateValue string
		month     string
		start     string
		end       string
		want      bool
	}{
		{"기간 안", "2026-05-07", "", "2026-05-01", "2026-05-31", true},
		{"기간 전", "2026-04-30", "", "2026-05-01", "2026-05-31", false},
		{"기간 후", "2026-06-01", "", "2026-05-01", "2026-05-31", false},
		{"월 일치", "2026-05-20", "2026-05", "", "", true},
		{"월 불일치", "2026-06-01", "2026-05", "", "", false},
		{"월과 기간 모두 적용", "2026-05-15", "2026-05", "2026-05-10", "2026-05-20", true},
		{"빈 기준일", "", "", "2026-05-01", "2026-05-31", false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := saleBusinessDateMatches(c.dateValue, c.month, c.start, c.end)
			if got != c.want {
				t.Fatalf("기대=%v 실제=%v", c.want, got)
			}
		})
	}
}
