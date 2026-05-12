package handler

import (
	"reflect"
	"sort"
	"testing"
)

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

// 회귀 가드: erp_closed + 날짜 + 수금 필터를 동시에 걸면 같은 sale_id 컬럼에
// .In() 을 여러 번 호출하면서 마지막 호출만 살아남았다 (postgrest-go params map 덮어쓰기).
// 후보 리스트들의 교집합을 한 번에 적용하도록 변경됐고 이 테스트가 그 의미를 고정한다.
func TestIntersectSaleIDLists(t *testing.T) {
	cases := []struct {
		name  string
		lists [][]string
		want  []string
	}{
		{"빈 입력", nil, nil},
		{"단일 리스트 통과", [][]string{{"a", "b", "c"}}, []string{"a", "b", "c"}},
		{"두 리스트 교집합", [][]string{{"a", "b", "c"}, {"b", "c", "d"}}, []string{"b", "c"}},
		{"세 리스트 교집합", [][]string{{"a", "b", "c"}, {"b", "c", "d"}, {"c", "d", "e"}}, []string{"c"}},
		{"교집합 없음", [][]string{{"a", "b"}, {"c", "d"}}, nil},
		{"빈 리스트 포함", [][]string{{"a", "b"}, {}}, nil},
		{"중복 ID", [][]string{{"a", "a", "b"}, {"a", "b", "b"}}, []string{"a", "b"}},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := intersectSaleIDLists(c.lists)
			sort.Strings(got)
			want := append([]string(nil), c.want...)
			sort.Strings(want)
			if len(got) == 0 && len(want) == 0 {
				return
			}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("기대=%v 실제=%v", want, got)
			}
		})
	}
}
