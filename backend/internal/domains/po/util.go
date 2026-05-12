// po/util.go — handler 패키지 utility 의 임시 복사본 (PR-B trade-off).
//
// PR-D 에서 backend/internal/handlerutil 패키지로 분리 후 본 파일 제거.
// 출처:
//  - parseLimitOffset            : backend/internal/handler/tx_outbound.go
//  - monthOf, strPtrOr           : backend/internal/handler/tx_outbound_dashboard.go
//  - summary helpers (5개)        : backend/internal/handler/tx_summary_helpers.go
//
// 본 파일의 함수/타입은 *PO 도메인 한정 dup* — handler 패키지 안 정의를 그대로 복사.
// 행동 보존: source 와 byte-equal 동등.

package po

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

func dateMonth(date *string) string {
	if date == nil || len(*date) < 7 {
		return ""
	}
	return (*date)[:7]
}

func recentMonthCounts(counts map[string]int64, limit int) []summaryMonthPoint {
	if len(counts) == 0 || limit <= 0 {
		return []summaryMonthPoint{}
	}
	months := make([]string, 0, len(counts))
	for month := range counts {
		months = append(months, month)
	}
	sort.Strings(months)
	if len(months) > limit {
		months = months[len(months)-limit:]
	}
	out := make([]summaryMonthPoint, 0, len(months))
	for _, month := range months {
		out = append(out, summaryMonthPoint{Month: month, Count: counts[month]})
	}
	return out
}

// parseLimitOffset — ?limit, ?offset 파싱 + 클램프.
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

// monthOf — 'YYYY-MM-DD' 또는 'YYYY-MM' 등에서 'YYYY-MM' 만 추출. 비유효시 빈 문자열.
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

func strPtrOr(p *string, fallback string) string {
	if p == nil || *p == "" {
		return fallback
	}
	return *p
}

// allowedItemTypes / allowedPaymentTypes — PO 라인 도메인 상수.
// 출처: backend/internal/handler/io_import.go (handler 패키지에 그대로 유지 — dup).
// PR-D 에서 export 후 io_import 가 po.AllowedItemTypes 사용 식으로 통합.
var allowedItemTypes = map[string]bool{
	"main": true, "spare": true,
}

var allowedPaymentTypes = map[string]bool{
	"paid": true, "free": true,
}
