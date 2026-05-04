package handler

import (
	"encoding/json"
	"sort"
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

func stringBatches(values []string, batchSize int) [][]string {
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
