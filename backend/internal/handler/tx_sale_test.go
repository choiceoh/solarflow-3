package handler

import (
	"fmt"
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

func TestChunkSaleIDs(t *testing.T) {
	ids := make([]string, 0, 250)
	for i := 0; i < 250; i++ {
		ids = append(ids, fmt.Sprintf("id-%d", i))
	}

	cases := []struct {
		name     string
		ids      []string
		size     int
		wantLens []int
	}{
		{"빈 입력", nil, 100, nil},
		{"size 0", ids, 0, nil},
		{"size 음수", ids, -1, nil},
		{"분할 없음 (size 이하)", ids[:50], 200, []int{50}},
		{"정확히 나뉨", ids[:200], 100, []int{100, 100}},
		{"나머지 있음", ids, 200, []int{200, 50}},
		{"전체보다 큰 size", ids[:10], 200, []int{10}},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := chunkSaleIDs(c.ids, c.size)
			if len(got) != len(c.wantLens) {
				t.Fatalf("청크 개수 기대=%d 실제=%d", len(c.wantLens), len(got))
			}
			total := 0
			for i, chunk := range got {
				if len(chunk) != c.wantLens[i] {
					t.Fatalf("청크 %d 크기 기대=%d 실제=%d", i, c.wantLens[i], len(chunk))
				}
				total += len(chunk)
			}
			if c.size > 0 && total != len(c.ids) {
				t.Fatalf("합계 기대=%d 실제=%d (입력 누락)", len(c.ids), total)
			}
		})
	}
}
