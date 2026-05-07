package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/response"
)

// DBIntegrityHandler — 운영자 전용 DB 정합성 검증 (D-064 PR 37/38/39).
//
// PR 38: VIEW v_integrity_check (50+ 검증 UNION ALL).
// PR 39: VIEW 가 5초+ → PostgREST 3초 timeout. MATERIALIZED VIEW + REFRESH RPC 로 전환.
//   - GET /admin/db-integrity → mv_integrity_check SELECT (즉시)
//   - POST /admin/db-integrity/refresh → refresh_integrity_check() RPC (5~10초)
type DBIntegrityHandler struct {
	DB *supa.Client
}

func NewDBIntegrityHandler(db *supa.Client) *DBIntegrityHandler {
	return &DBIntegrityHandler{DB: db}
}

func (h *DBIntegrityHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.With(g.AdminOnly).Get("/admin/db-integrity", h.Run)
	r.With(g.AdminOnly).Post("/admin/db-integrity/refresh", h.Refresh)
}

// IntegrityCheck — view v_integrity_check 의 한 행.
type IntegrityCheck struct {
	Name        string  `json:"name"`
	Category    string  `json:"category"`
	Severity    string  `json:"severity"` // 'high' | 'med' | 'low'
	Description string  `json:"description"`
	Hint        string  `json:"hint"`
	Baseline    float64 `json:"baseline"`
	Actual      float64 `json:"actual"`
	Tolerance   float64 `json:"tolerance"`
	Status      string  `json:"status"` // 'pass' | 'fail'
}

type IntegrityResponse struct {
	Checks      []IntegrityCheck `json:"checks"`
	Summary     IntegritySummary `json:"summary"`
	GeneratedAt string           `json:"generated_at"`
}

type IntegritySummary struct {
	HighFails  int `json:"high_fails"`
	MedFails   int `json:"med_fails"`
	LowFails   int `json:"low_fails"`
	TotalFails int `json:"total_fails"`
	Total      int `json:"total"`
}

// Run — mv_integrity_check (MATERIALIZED VIEW) SELECT — 즉시 응답.
// 갱신은 Refresh 가 별도 (POST /admin/db-integrity/refresh).
func (h *DBIntegrityHandler) Run(w http.ResponseWriter, r *http.Request) {
	data, _, err := h.DB.From("mv_integrity_check").Select("*", "exact", false).
		Range(0, 999, "").Execute()
	if err != nil {
		log.Printf("[정합성] mv_integrity_check 조회 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "정합성 view 조회 실패")
		return
	}

	var checks []IntegrityCheck
	if err := json.Unmarshal(data, &checks); err != nil {
		log.Printf("[정합성] view 디코딩 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}

	summary := IntegritySummary{Total: len(checks)}
	for _, c := range checks {
		if c.Status == "fail" {
			summary.TotalFails++
			switch c.Severity {
			case "high":
				summary.HighFails++
			case "med":
				summary.MedFails++
			case "low":
				summary.LowFails++
			}
		}
	}

	response.RespondJSON(w, http.StatusOK, IntegrityResponse{
		Checks:      checks,
		Summary:     summary,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

// Refresh — REFRESH MATERIALIZED VIEW CONCURRENTLY mv_integrity_check 호출.
// SECURITY DEFINER 함수라 PostgREST timeout 우회. 5~10초 소요 가능.
// supabase-go 의 Rpc 는 응답 body string 만 반환 (에러는 다음 SELECT 가 catch).
func (h *DBIntegrityHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	respBody := h.DB.Rpc("refresh_integrity_check", "exact", nil)
	log.Printf("[정합성] refresh RPC 응답 length=%d", len(respBody))
	// 갱신 후 새 결과 즉시 반환 (Run 과 동일 흐름)
	h.Run(w, r)
}
