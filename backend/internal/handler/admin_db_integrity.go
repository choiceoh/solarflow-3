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

// DBIntegrityHandler — 운영자 전용 DB 정합성 검증 (D-064 PR 37/38).
//
// PR 38: PostgREST count 호출을 제거하고 v_integrity_check view 단일 SELECT 으로 교체.
// 마이그레이션 076 의 view 가 50+ 검증 (산식/누계/orphan/외화/시점/UNIQUE/ERP 본질) 통합.
type DBIntegrityHandler struct {
	DB *supa.Client
}

func NewDBIntegrityHandler(db *supa.Client) *DBIntegrityHandler {
	return &DBIntegrityHandler{DB: db}
}

func (h *DBIntegrityHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.With(g.AdminOnly).Get("/admin/db-integrity", h.Run)
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

// Run — v_integrity_check SELECT 한 번 + 결과 집계.
func (h *DBIntegrityHandler) Run(w http.ResponseWriter, r *http.Request) {
	data, _, err := h.DB.From("v_integrity_check").Select("*", "exact", false).
		Range(0, 999, "").Execute() // 1000행 cap (검증은 50+ 정도라 충분)
	if err != nil {
		log.Printf("[정합성] view 조회 실패: %v", err)
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
