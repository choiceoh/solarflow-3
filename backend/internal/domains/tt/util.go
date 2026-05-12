// tt/util.go — handler 패키지 utility 의 임시 복사본 (PR-C2 dup, PR-D 정리).
// LC 의 util.go 와 동일 (TT 는 audit 사용 안 함).

package tt

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"

	postgrest "github.com/supabase-community/postgrest-go"
)

const (
	summaryChunkSize = 1000
	summaryMaxPages  = 500
)

type summaryMonthPoint struct {
	Month  string  `json:"month"`
	Count  int64   `json:"count,omitempty"`
	Amount float64 `json:"amount,omitempty"`
}

func fetchAllSummaryRows[T any](factory func() *postgrest.FilterBuilder) ([]T, int64, error) {
	rows := make([]T, 0, summaryChunkSize)
	var total int64
	for page := 0; page < summaryMaxPages; page++ {
		offset := page * summaryChunkSize
		data, count, err := factory().Range(offset, offset+summaryChunkSize-1, "").Execute()
		if err != nil {
			return nil, 0, err
		}
		if page == 0 {
			total = count
		}
		var chunk []T
		if err := json.Unmarshal(data, &chunk); err != nil {
			return nil, 0, err
		}
		if len(chunk) == 0 {
			break
		}
		rows = append(rows, chunk...)
		if total > 0 && int64(len(rows)) >= total {
			break
		}
	}
	return rows, total, nil
}

func incrementCount(counts map[string]int64, key string) {
	key = strings.TrimSpace(key)
	if key == "" {
		key = "unknown"
	}
	counts[key]++
}

func distinctCount(values map[string]struct{}) int64 {
	return int64(len(values))
}

func dateMonth(date *string) string {
	if date == nil || len(*date) < 7 {
		return ""
	}
	return (*date)[:7]
}

func recentMonthAmounts(amounts map[string]float64, limit int) []summaryMonthPoint {
	if len(amounts) == 0 || limit <= 0 {
		return []summaryMonthPoint{}
	}
	months := make([]string, 0, len(amounts))
	for month := range amounts {
		months = append(months, month)
	}
	sort.Strings(months)
	if len(months) > limit {
		months = months[len(months)-limit:]
	}
	out := make([]summaryMonthPoint, 0, len(months))
	for _, month := range months {
		out = append(out, summaryMonthPoint{Month: month, Amount: amounts[month]})
	}
	return out
}

func parseLimitOffset(r *http.Request, defaultLimit, maxLimit int) (limit, offset int) {
	limit = defaultLimit
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			limit = v
		}
	}
	if limit > maxLimit {
		limit = maxLimit
	}
	if raw := r.URL.Query().Get("offset"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v >= 0 {
			offset = v
		}
	}
	return limit, offset
}

func monthOf(date string) string {
	if len(date) < 7 {
		return ""
	}
	m := date[:7]
	if len(m) != 7 || m[4] != '-' {
		return ""
	}
	for i, c := range m {
		if i == 4 {
			continue
		}
		if c < '0' || c > '9' {
			return ""
		}
	}
	return m
}
