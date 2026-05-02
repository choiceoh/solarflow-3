package handler

// 사이트 단위 전역 설정 (system_settings 테이블) CRUD.
// key/value JSONB 패턴 — 첫 사용처는 메뉴 가시성. 후속으로 공지 배너·기본 환율 등.
//
// 라우팅 (router.go에서 등록):
//   GET  /api/v1/system-settings/{key}   (인증 사용자) — 값 조회 (없으면 204)
//   PUT  /api/v1/system-settings/{key}   (admin only) — upsert

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/response"
)

type SystemSettingsHandler struct {
	DB *supa.Client
}

func NewSystemSettingsHandler(db *supa.Client) *SystemSettingsHandler {
	return &SystemSettingsHandler{DB: db}
}

type systemSettingRow struct {
	Key   string                 `json:"key"`
	Value map[string]interface{} `json:"value"`
}

// Get — GET /api/v1/system-settings/{key}
// 값 미존재 시 204 — frontend는 default(빈 객체)로 폴백.
func (h *SystemSettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "key")
	if key == "" {
		response.RespondError(w, http.StatusBadRequest, "key가 누락됐습니다")
		return
	}

	data, _, err := h.DB.From("system_settings").
		Select("key,value", "exact", false).
		Eq("key", key).
		Execute()
	if err != nil {
		log.Printf("[system_settings 조회 실패] key=%s err=%v", key, err)
		response.RespondError(w, http.StatusInternalServerError, "설정 조회에 실패했습니다")
		return
	}

	var rows []systemSettingRow
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[system_settings 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 처리에 실패했습니다")
		return
	}

	if len(rows) == 0 {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	response.RespondJSON(w, http.StatusOK, rows[0].Value)
}

type systemSettingUpsert struct {
	Key       string                 `json:"key"`
	Value     map[string]interface{} `json:"value"`
	UpdatedBy *string                `json:"updated_by,omitempty"`
}

// Upsert — PUT /api/v1/system-settings/{key}
// 본문은 value JSONB 그대로. (key UNIQUE) insert-or-update.
func (h *SystemSettingsHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "key")
	if key == "" {
		response.RespondError(w, http.StatusBadRequest, "key가 누락됐습니다")
		return
	}

	var value map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&value); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 JSON 형식입니다")
		return
	}

	payload := systemSettingUpsert{Key: key, Value: value}
	if userID := middleware.GetUserID(r.Context()); userID != "" {
		payload.UpdatedBy = &userID
	}

	_, _, err := h.DB.From("system_settings").
		Upsert(payload, "key", "minimal", "").
		Execute()
	if err != nil {
		log.Printf("[system_settings 저장 실패] key=%s err=%v", key, err)
		response.RespondError(w, http.StatusInternalServerError, "설정 저장에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, statusOKResponse{Status: "ok"})
}
