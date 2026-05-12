// bl/util.go — handler 패키지 utility 의 임시 복사본 (PR-B 와 동일 trade-off).
// PR-D 에서 backend/internal/handlerutil 분리 후 본 파일 제거.
// 출처:
//  - parseLimitOffset : backend/internal/handler/tx_outbound.go
//  - monthOf          : backend/internal/handler/tx_outbound_dashboard.go

package bl

import (
	"net/http"
	"strconv"
)

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
