// Package middleware — Prometheus HTTP 메트릭 수집 미들웨어.
// /metrics 엔드포인트는 main 에서 별도 listener (127.0.0.1:9180) 로 분리해 노출한다.
package middleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// httpDuration / httpRequests — chi RoutePattern 기반 라벨링.
// path 라벨에 raw URL 을 넣으면 ID 별로 cardinality 폭발 → RoutePattern (예: /api/v1/outbounds/{id}) 로 정규화.
var (
	httpDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "HTTP 요청 처리 시간(초). path 라벨은 chi RoutePattern (id 등 정규화).",
		Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
	}, []string{"method", "path", "status"})

	httpRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "처리한 HTTP 요청 수.",
	}, []string{"method", "path", "status"})
)

// Metrics — 처리 시간 + 카운트 기록. RequestLog 이후(inner)에 위치시켜 statusCapturer 가
// 먼저 status 를 기록한 뒤 본 미들웨어가 추가 capturer 로 한 번 더 잡는다.
// chi.RouteContext().RoutePattern() 은 핸들러 dispatch 후 채워지므로 next.ServeHTTP 이후에 읽는다.
func Metrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		mc := &metricsCapturer{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(mc, r)

		pattern := chi.RouteContext(r.Context()).RoutePattern()
		if pattern == "" {
			pattern = "unmatched"
		}
		status := strconv.Itoa(mc.status)
		elapsed := time.Since(start).Seconds()
		httpDuration.WithLabelValues(r.Method, pattern, status).Observe(elapsed)
		httpRequests.WithLabelValues(r.Method, pattern, status).Inc()
	})
}

type metricsCapturer struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (m *metricsCapturer) WriteHeader(code int) {
	if !m.wroteHeader {
		m.status = code
		m.wroteHeader = true
	}
	m.ResponseWriter.WriteHeader(code)
}

func (m *metricsCapturer) Flush() {
	if f, ok := m.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
