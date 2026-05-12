package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	postgrest "github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/handlerutil"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/mount"
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

// init — D-20260512-090000 feature self-mounting.
// main merge: /admin/db-anomalies/ignores (ListIgnores) 신규 라우트 통합.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDSysDBIntegrity,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewDBIntegrityHandler(d.DB)
			g := d.Gates
			r.With(g.AdminOnly).Get("/admin/db-integrity", h.Run)
			r.With(g.AdminOnly).Post("/admin/db-integrity/refresh", h.Refresh)
			// PR 091: 개별 row 수준 이상치 검사 (v_db_anomalies + anomaly_ignores).
			r.With(g.AdminOnly).Get("/admin/db-anomalies", h.Anomalies)
			r.With(g.AdminOnly).Get("/admin/db-anomalies/ignores", h.ListIgnores)
			r.With(g.AdminOnly).Post("/admin/db-anomalies/ignore", h.IgnoreAnomaly)
			r.With(g.AdminOnly).Delete("/admin/db-anomalies/ignore/{ignoreID}", h.UnignoreAnomaly)
		},
	})
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
		Range(0, handlerutil.PostgRESTMaxRows-1, "").Execute()
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

// ============================================================
// PR 091: 개별 row 수준 이상치 (v_db_anomalies)
// ============================================================

// postgRESTErrorMessage — supabase-go 의 Rpc/Execute 는 HTTP 상태와 무관하게 body 를
// 그대로 string 으로 반환한다. PostgREST 에러는
//
//	{"code":"57014","message":"canceling statement due to statement timeout",...}
//
// 형태의 객체로 오므로, 배열로 unmarshal 시도하기 전에 에러 객체인지 먼저 판별해
// 사용자에게 의미 있는 메시지를 노출한다.
func postgRESTErrorMessage(body string) string {
	if len(body) == 0 || body[0] != '{' {
		return ""
	}
	var e struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal([]byte(body), &e); err != nil {
		return ""
	}
	if e.Code == "" && e.Message == "" {
		return ""
	}
	if e.Message != "" {
		return e.Message
	}
	return e.Code
}

// AnomalyRow — list_db_anomalies() RPC 의 한 행.
type AnomalyRow struct {
	RuleName    string          `json:"rule_name"`
	Severity    string          `json:"severity"` // 'high' | 'med' | 'low'
	Category    string          `json:"category"`
	TableName   string          `json:"table_name"`
	RowPK       string          `json:"row_pk"`
	RowLabel    string          `json:"row_label"`
	Description string          `json:"description"`
	Detail      json.RawMessage `json:"detail"`
}

type AnomalyResponse struct {
	Anomalies   []AnomalyRow   `json:"anomalies"`
	Summary     AnomalySummary `json:"summary"`
	GeneratedAt string         `json:"generated_at"`
}

type AnomalySummary struct {
	High  int `json:"high"`
	Med   int `json:"med"`
	Low   int `json:"low"`
	Total int `json:"total"`
}

// Anomalies — GET /admin/db-anomalies — list_db_anomalies() RPC 호출.
// 무시 목록(anomaly_ignores) 자동 제외, severity 순으로 정렬됨.
//
// count 인자는 빈 문자열로 둔다. RPC 결과는 페이지네이션이 없어 count 가 의미 없고,
// "exact" 를 넘기면 PostgREST 가 함수 호출을 count() 윈도우로 다시 감싸 같은 함수가
// 두 번 실행돼 statement_timeout (~15s) 에 걸린다 — 14.5초 후 57014 → 핸들러 디코딩 실패.
func (h *DBIntegrityHandler) Anomalies(w http.ResponseWriter, r *http.Request) {
	respBody := h.DB.Rpc("list_db_anomalies", "", nil)
	if respBody == "" {
		log.Printf("[이상치] list_db_anomalies RPC 빈 응답")
		response.RespondError(w, http.StatusInternalServerError, "이상치 조회 실패")
		return
	}

	if msg := postgRESTErrorMessage(respBody); msg != "" {
		log.Printf("[이상치] PostgREST 에러 응답: %s", respBody)
		response.RespondError(w, http.StatusInternalServerError, "이상치 조회 실패: "+msg)
		return
	}

	var rows []AnomalyRow
	if err := json.Unmarshal([]byte(respBody), &rows); err != nil {
		log.Printf("[이상치] RPC 응답 디코딩 실패: %v body=%s", err, respBody)
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}

	summary := AnomalySummary{Total: len(rows)}
	for _, a := range rows {
		switch a.Severity {
		case "high":
			summary.High++
		case "med":
			summary.Med++
		case "low":
			summary.Low++
		}
	}

	response.RespondJSON(w, http.StatusOK, AnomalyResponse{
		Anomalies:   rows,
		Summary:     summary,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

// IgnoreAnomalyRequest — POST /admin/db-anomalies/ignore body.
type IgnoreAnomalyRequest struct {
	TableName string `json:"table_name"`
	RowPK     string `json:"row_pk"`
	RuleName  string `json:"rule_name"`
	Reason    string `json:"reason,omitempty"`
}

// IgnoreAnomaly — 운영자가 "정상" 으로 표시한 row 를 anomaly_ignores 에 등록.
// 다음 조회부터 v_db_anomalies 에서 자동 제외 (false positive 알람 피로증 방지).
func (h *DBIntegrityHandler) IgnoreAnomaly(w http.ResponseWriter, r *http.Request) {
	var req IgnoreAnomalyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "요청 본문 파싱 실패")
		return
	}
	if req.TableName == "" || req.RowPK == "" || req.RuleName == "" {
		response.RespondError(w, http.StatusBadRequest, "table_name, row_pk, rule_name 필수")
		return
	}

	userID := middleware.GetUserID(r.Context())
	payload := map[string]any{
		"table_name": req.TableName,
		"row_pk":     req.RowPK,
		"rule_name":  req.RuleName,
	}
	if req.Reason != "" {
		payload["reason"] = req.Reason
	}
	if userID != "" {
		payload["ignored_by"] = userID
	}

	_, _, err := h.DB.From("anomaly_ignores").Insert(payload, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[이상치] ignore 등록 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "무시 등록 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// UnignoreAnomaly — DELETE /admin/db-anomalies/ignore/{ignoreID} — 무시 해제.
func (h *DBIntegrityHandler) UnignoreAnomaly(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "ignoreID")
	if id == "" {
		response.RespondError(w, http.StatusBadRequest, "ignoreID 누락")
		return
	}
	_, _, err := h.DB.From("anomaly_ignores").Delete("", "").Eq("ignore_id", id).Execute()
	if err != nil {
		log.Printf("[이상치] ignore 삭제 실패 id=%s: %v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "무시 해제 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// IgnoreEntry — anomaly_ignores 한 행 (UI 해제 목록용).
type IgnoreEntry struct {
	IgnoreID  int64  `json:"ignore_id"`
	TableName string `json:"table_name"`
	RowPK     string `json:"row_pk"`
	RuleName  string `json:"rule_name"`
	Reason    string `json:"reason,omitempty"`
	IgnoredBy string `json:"ignored_by,omitempty"`
	IgnoredAt string `json:"ignored_at"`
}

type IgnoreListResponse struct {
	Ignores []IgnoreEntry `json:"ignores"`
	Total   int           `json:"total"`
}

// ListIgnores — GET /admin/db-anomalies/ignores — 무시 등록된 row 목록.
// 운영자가 "정상" 으로 잘못 표시했을 때 해제할 수 있게 노출.
func (h *DBIntegrityHandler) ListIgnores(w http.ResponseWriter, r *http.Request) {
	data, _, err := h.DB.From("anomaly_ignores").
		Select("ignore_id,table_name,row_pk,rule_name,reason,ignored_by,ignored_at", "exact", false).
		Order("ignored_at", &postgrest.OrderOpts{Ascending: false}).
		Range(0, handlerutil.PostgRESTMaxRows-1, "").
		Execute()
	if err != nil {
		log.Printf("[이상치] ignore 목록 조회 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "무시 목록 조회 실패")
		return
	}
	var rows []IgnoreEntry
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[이상치] ignore 목록 디코딩 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, IgnoreListResponse{Ignores: rows, Total: len(rows)})
}
