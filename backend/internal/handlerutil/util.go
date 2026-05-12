// Package handlerutil — handler/도메인 공통 utility.
//
// PR-D1a 에서 분리: 이전엔 backend/internal/handler 패키지 안 정의 +
// PR-B/C 의 4 도메인 (po/bl/lc/tt) 의 util.go 안 dup. 본 패키지로 통합.
//
// 출처:
//   - backend/internal/handler/tx_summary_helpers.go
//   - backend/internal/handler/tx_outbound.go (parseLimitOffset)
//   - backend/internal/handler/tx_outbound_dashboard.go (monthOf, strPtrOr)
//
// 도메인/handler 어디서든 import 후 handlerutil.X 식으로 호출.
package handlerutil

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"

	postgrest "github.com/supabase-community/postgrest-go"
)

// SummaryChunkSize / SummaryMaxPages — FetchAllSummaryRows 의 page 크기와 최대 회수.
// 도메인이 override 필요하면 자기 wrapper 함수에 hard-code.
const (
	SummaryChunkSize = 1000
	SummaryMaxPages  = 500
)

// SummaryMonthPoint — 월별 집계 데이터 포인트. summary 응답에 일관 형식으로 들어간다.
type SummaryMonthPoint struct {
	Month  string  `json:"month"`
	Count  int64   `json:"count,omitempty"`
	Amount float64 `json:"amount,omitempty"`
}

// FetchAllSummaryRows — generic page-loop. factory 가 매 page 의 query 빌드.
func FetchAllSummaryRows[T any](factory func() *postgrest.FilterBuilder) ([]T, int64, error) {
	rows := make([]T, 0, SummaryChunkSize)
	var total int64
	for page := 0; page < SummaryMaxPages; page++ {
		offset := page * SummaryChunkSize
		data, count, err := factory().Range(offset, offset+SummaryChunkSize-1, "").Execute()
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

// IncrementCount — counts[key]++ 인데 key 정리 (trim, 빈값 → "unknown").
func IncrementCount(counts map[string]int64, key string) {
	key = strings.TrimSpace(key)
	if key == "" {
		key = "unknown"
	}
	counts[key]++
}

// DistinctCount — set 크기.
func DistinctCount(values map[string]struct{}) int64 {
	return int64(len(values))
}

// UniqueNonEmpty — 문자열 슬라이스에서 빈 값과 중복 제거 (입력 순서 보존).
// IN(...) 필터에 들어갈 ID 집합 만들 때.
func UniqueNonEmpty(values []string) []string {
	if len(values) == 0 {
		return values
	}
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, v := range values {
		if v == "" {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

// DateMonth — *string 형 date 에서 'YYYY-MM' 추출.
func DateMonth(date *string) string {
	if date == nil || len(*date) < 7 {
		return ""
	}
	return (*date)[:7]
}

// MonthOf — string 형 date 에서 'YYYY-MM' 추출 + 형식 검증.
func MonthOf(date string) string {
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

// RecentMonthCounts — counts 맵에서 최근 limit 개월 count 추출 (월 정렬).
func RecentMonthCounts(counts map[string]int64, limit int) []SummaryMonthPoint {
	if len(counts) == 0 || limit <= 0 {
		return []SummaryMonthPoint{}
	}
	months := make([]string, 0, len(counts))
	for month := range counts {
		months = append(months, month)
	}
	sort.Strings(months)
	if len(months) > limit {
		months = months[len(months)-limit:]
	}
	out := make([]SummaryMonthPoint, 0, len(months))
	for _, month := range months {
		out = append(out, SummaryMonthPoint{Month: month, Count: counts[month]})
	}
	return out
}

// RecentMonthAmounts — RecentMonthCounts 의 amount 버전.
func RecentMonthAmounts(amounts map[string]float64, limit int) []SummaryMonthPoint {
	if len(amounts) == 0 || limit <= 0 {
		return []SummaryMonthPoint{}
	}
	months := make([]string, 0, len(amounts))
	for month := range amounts {
		months = append(months, month)
	}
	sort.Strings(months)
	if len(months) > limit {
		months = months[len(months)-limit:]
	}
	out := make([]SummaryMonthPoint, 0, len(months))
	for _, month := range months {
		out = append(out, SummaryMonthPoint{Month: month, Amount: amounts[month]})
	}
	return out
}

// StringBatches — 큰 string slice 를 batchSize 단위로 분할 (IN(...) batch 용).
func StringBatches(values []string, batchSize int) [][]string {
	if batchSize <= 0 || len(values) == 0 {
		return nil
	}
	out := make([][]string, 0, (len(values)+batchSize-1)/batchSize)
	for start := 0; start < len(values); start += batchSize {
		end := start + batchSize
		if end > len(values) {
			end = len(values)
		}
		out = append(out, values[start:end])
	}
	return out
}

// ParseLimitOffset — ?limit, ?offset query 파라미터 파싱 + 클램프.
func ParseLimitOffset(r *http.Request, defaultLimit, maxLimit int) (limit, offset int) {
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

// StrPtrOr — *string 이 nil 이거나 빈 문자열이면 fallback, 아니면 dereference.
func StrPtrOr(p *string, fallback string) string {
	if p == nil || *p == "" {
		return fallback
	}
	return *p
}
