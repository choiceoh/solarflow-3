package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// 세션 CRUD 메서드 — AssistantHandler에 부착 (db 주입 중복 회피).
// 모든 메서드는 JWT user_id로 본인 행만 접근/수정.

const maxAssistantSessionsList = 50

// ListSessions — 본인 세션 목록 (요약). messages는 미포함 — 페이로드 절감.
func (h *AssistantHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}

	data, _, err := h.db.From("assistant_sessions").
		Select("id,title,created_at,updated_at", "exact", false).
		Eq("user_id", userID).
		Order("updated_at", &postgrest.OrderOpts{Ascending: false}).
		Limit(maxAssistantSessionsList, "").
		Execute()
	if err != nil {
		log.Printf("[assistant sessions/list] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "세션 목록 조회 실패")
		return
	}

	var sessions []model.AssistantSessionSummary
	if err := json.Unmarshal(data, &sessions); err != nil {
		log.Printf("[assistant sessions/list decode] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 디코딩 실패")
		return
	}
	if sessions == nil {
		sessions = []model.AssistantSessionSummary{}
	}
	response.RespondJSON(w, http.StatusOK, sessions)
}

// CreateSession — 새 세션 생성. body는 선택 (제목·초기 메시지).
func (h *AssistantHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}

	var req model.CreateAssistantSessionRequest
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
			return
		}
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	insertRow := map[string]any{"user_id": userID}
	if req.Title != "" {
		insertRow["title"] = req.Title
	}
	if len(req.Messages) > 0 {
		insertRow["messages"] = req.Messages
	}

	data, _, err := h.db.From("assistant_sessions").
		Insert(insertRow, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[assistant sessions/create] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "세션 생성 실패")
		return
	}

	var created []model.AssistantSession
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		log.Printf("[assistant sessions/create decode] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 디코딩 실패")
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// GetSession — 세션 단건 (메시지 포함).
func (h *AssistantHandler) GetSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}

	data, _, err := h.db.From("assistant_sessions").
		Select("*", "exact", false).
		Eq("id", id).
		Eq("user_id", userID).
		Execute()
	if err != nil {
		log.Printf("[assistant sessions/get] id=%s %v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "세션 조회 실패")
		return
	}

	var rows []model.AssistantSession
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[assistant sessions/get decode] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 디코딩 실패")
		return
	}
	if len(rows) == 0 {
		response.RespondError(w, http.StatusNotFound, "세션을 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows[0])
}

// UpdateSession — 제목 또는 메시지 부분 갱신. user_id 일치 행만 업데이트.
func (h *AssistantHandler) UpdateSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}

	var req model.UpdateAssistantSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	patch := map[string]any{}
	if req.Title != nil {
		patch["title"] = *req.Title
	}
	if req.Messages != nil {
		patch["messages"] = *req.Messages
	}
	if len(patch) == 0 {
		response.RespondError(w, http.StatusBadRequest, "변경할 항목이 없습니다")
		return
	}

	data, _, err := h.db.From("assistant_sessions").
		Update(patch, "", "").
		Eq("id", id).
		Eq("user_id", userID).
		Execute()
	if err != nil {
		log.Printf("[assistant sessions/update] id=%s %v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "세션 수정 실패")
		return
	}

	var rows []model.AssistantSession
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[assistant sessions/update decode] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 디코딩 실패")
		return
	}
	if len(rows) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 세션을 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows[0])
}

// SummarizeTitle — POST /api/v1/assistant/sessions/{id}/summarize-title
// fallback 모델로 첫 user 메시지를 한 줄 제목으로 요약 → title 만 PATCH.
// 실패·미설정 시 슬라이스 fallback 으로 떨어뜨려 항상 200 반환 (사용자에 노출되는 영향 없음).
//
// body 는 선택. {first_user_text} 가 오면 그걸 사용해 DB 조회 1회 절약.
// 없으면 세션 row 의 messages 에서 추출.
func (h *AssistantHandler) SummarizeTitle(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}

	var req struct {
		FirstUserText string `json:"first_user_text,omitempty"`
	}
	if r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	firstUserText := strings.TrimSpace(req.FirstUserText)

	if firstUserText == "" {
		data, _, err := h.db.From("assistant_sessions").
			Select("messages", "exact", false).
			Eq("id", id).
			Eq("user_id", userID).
			Execute()
		if err != nil {
			log.Printf("[assistant sessions/summarize get] %v", err)
			response.RespondError(w, http.StatusInternalServerError, "세션 조회 실패")
			return
		}
		var rows []struct {
			Messages json.RawMessage `json:"messages"`
		}
		if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
			response.RespondError(w, http.StatusNotFound, "세션을 찾을 수 없습니다")
			return
		}
		firstUserText = extractFirstUserText(rows[0].Messages)
	}
	if firstUserText == "" {
		response.RespondError(w, http.StatusBadRequest, "사용자 메시지가 없습니다")
		return
	}

	title := h.summarizeTitleWithFallback(r.Context(), firstUserText)
	if title == "" {
		title = sliceFallbackTitle(firstUserText)
	}

	data, _, err := h.db.From("assistant_sessions").
		Update(map[string]any{"title": title}, "", "").
		Eq("id", id).
		Eq("user_id", userID).
		Execute()
	if err != nil {
		log.Printf("[assistant sessions/summarize update] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "제목 저장 실패")
		return
	}
	var rows []model.AssistantSession
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[assistant sessions/summarize decode] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 디코딩 실패")
		return
	}
	if len(rows) == 0 {
		response.RespondError(w, http.StatusNotFound, "세션을 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows[0])
}

// DeleteSession — 본인 세션만 삭제.
func (h *AssistantHandler) DeleteSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}

	_, _, err := h.db.From("assistant_sessions").
		Delete("", "").
		Eq("id", id).
		Eq("user_id", userID).
		Execute()
	if err != nil {
		log.Printf("[assistant sessions/delete] id=%s %v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "세션 삭제 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"message": "삭제 완료"})
}

