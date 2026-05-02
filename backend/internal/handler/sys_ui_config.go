package handler

// Phase 3: 운영자 GUI 메타 편집기의 영구 저장소 — ui_configs 테이블 CRUD.
// frontend useResolvedConfig가 default(코드 import) vs override(이 테이블)를 우선순위로 선택.
//
// 라우팅 (router.go에서 등록):
//   GET    /api/v1/ui-configs                          (인증 사용자) — 모든 override 목록
//   GET    /api/v1/ui-configs/{scope}/{config_id}      (인증 사용자) — 단건 조회 (없으면 204)
//   PUT    /api/v1/ui-configs/{scope}/{config_id}      (admin only) — upsert
//   DELETE /api/v1/ui-configs/{scope}/{config_id}      (admin only) — override 제거 (default로 폴백)

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/response"
)

type UIConfigHandler struct {
	DB *supa.Client
}

func NewUIConfigHandler(db *supa.Client) *UIConfigHandler {
	return &UIConfigHandler{DB: db}
}

// validScope — DB CHECK 제약과 동일
func validScope(s string) bool {
	return s == "screen" || s == "form" || s == "detail"
}

type uiConfigRow struct {
	ID        string                 `json:"id"`
	Scope     string                 `json:"scope"`
	ConfigID  string                 `json:"config_id"`
	Config    map[string]interface{} `json:"config"`
	UpdatedAt string                 `json:"updated_at"`
	UpdatedBy *string                `json:"updated_by"`
}

// List — GET /api/v1/ui-configs
// 운영자 편집기의 좌측 목록에서 "어떤 config가 override 활성인지" 표시용.
func (h *UIConfigHandler) List(w http.ResponseWriter, r *http.Request) {
	data, _, err := h.DB.From("ui_configs").
		Select("scope,config_id,updated_at,updated_by", "exact", false).
		Execute()
	if err != nil {
		log.Printf("[ui_configs 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "UI Config 목록 조회에 실패했습니다")
		return
	}

	type listRow struct {
		Scope     string  `json:"scope"`
		ConfigID  string  `json:"config_id"`
		UpdatedAt string  `json:"updated_at"`
		UpdatedBy *string `json:"updated_by"`
	}
	var rows []listRow
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[ui_configs 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows)
}

// GetByScopeID — GET /api/v1/ui-configs/{scope}/{config_id}
// 단건 조회. override 없으면 204 No Content (frontend는 default로 폴백).
func (h *UIConfigHandler) GetByScopeID(w http.ResponseWriter, r *http.Request) {
	scope := chi.URLParam(r, "scope")
	configID := chi.URLParam(r, "config_id")

	if !validScope(scope) {
		response.RespondError(w, http.StatusBadRequest, "잘못된 scope 값입니다 (screen|form|detail)")
		return
	}

	data, _, err := h.DB.From("ui_configs").
		Select("*", "exact", false).
		Eq("scope", scope).
		Eq("config_id", configID).
		Execute()
	if err != nil {
		log.Printf("[ui_config 조회 실패] scope=%s id=%s err=%v", scope, configID, err)
		response.RespondError(w, http.StatusInternalServerError, "UI Config 조회에 실패했습니다")
		return
	}

	var rows []uiConfigRow
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[ui_config 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(rows) == 0 {
		// override 미존재 — default로 폴백하라는 신호
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// config jsonb를 그대로 본문에 (운영자가 편집할 객체)
	response.RespondJSON(w, http.StatusOK, rows[0].Config)
}

// Upsert — PUT /api/v1/ui-configs/{scope}/{config_id}
// 본문은 메타 config 객체. (scope, config_id) UNIQUE 제약으로 insert-or-update.
func (h *UIConfigHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	scope := chi.URLParam(r, "scope")
	configID := chi.URLParam(r, "config_id")

	if !validScope(scope) {
		response.RespondError(w, http.StatusBadRequest, "잘못된 scope 값입니다 (screen|form|detail)")
		return
	}

	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 JSON 형식입니다")
		return
	}

	// 본문의 id 필드가 URL의 config_id와 일치해야 함 (오적용 방지)
	if bodyID, ok := body["id"].(string); ok && bodyID != configID {
		response.RespondError(w, http.StatusBadRequest, "본문의 id가 URL의 config_id와 일치하지 않습니다")
		return
	}

	payload := map[string]interface{}{
		"scope":     scope,
		"config_id": configID,
		"config":    body,
	}

	_, _, err := h.DB.From("ui_configs").
		Upsert(payload, "scope,config_id", "minimal", "").
		Execute()
	if err != nil {
		log.Printf("[ui_config upsert 실패] scope=%s id=%s err=%v", scope, configID, err)
		response.RespondError(w, http.StatusInternalServerError, "UI Config 저장에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "ok"})
}

// Delete — DELETE /api/v1/ui-configs/{scope}/{config_id}
// override 행 제거 → frontend는 default로 폴백.
func (h *UIConfigHandler) Delete(w http.ResponseWriter, r *http.Request) {
	scope := chi.URLParam(r, "scope")
	configID := chi.URLParam(r, "config_id")

	if !validScope(scope) {
		response.RespondError(w, http.StatusBadRequest, "잘못된 scope 값입니다 (screen|form|detail)")
		return
	}

	_, _, err := h.DB.From("ui_configs").
		Delete("", "").
		Eq("scope", scope).
		Eq("config_id", configID).
		Execute()
	if err != nil {
		log.Printf("[ui_config 삭제 실패] scope=%s id=%s err=%v", scope, configID, err)
		response.RespondError(w, http.StatusInternalServerError, "UI Config 삭제에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}
