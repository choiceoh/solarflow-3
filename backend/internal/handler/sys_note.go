package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// NoteHandler — 메모(notes) 관련 API를 처리하는 핸들러
// 비유: "포스트잇 관리함" — 개인 메모 + 업무 데이터 연결 메모 관리
type NoteHandler struct {
	DB *supa.Client
}

// NewNoteHandler — NoteHandler 생성자
func NewNoteHandler(db *supa.Client) *NoteHandler {
	return &NoteHandler{DB: db}
}

// List — GET /api/v1/notes — 본인 메모 목록 조회
// 비유: 내 포스트잇함에서 메모를 꺼내 보여주는 것
func (h *NoteHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}

	query := h.DB.From("notes").
		Select("*", "exact", false).
		Eq("user_id", userID)

	// linked_table + linked_id 필터 (선택)
	if lt := r.URL.Query().Get("linked_table"); lt != "" {
		query = query.Eq("linked_table", lt)
	}
	if lid := r.URL.Query().Get("linked_id"); lid != "" {
		query = query.Eq("linked_id", lid)
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[메모 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "메모 목록 조회에 실패했습니다")
		return
	}

	var notes []model.Note
	if err := json.Unmarshal(data, &notes); err != nil {
		log.Printf("[메모 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, notes)
}

// Create — POST /api/v1/notes — 메모 생성
// 비유: 새 포스트잇을 작성하여 관리함에 보관
func (h *NoteHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}

	var req model.CreateNoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[메모 생성 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// JWT uid로 user_id 강제 설정 (보안: 클라이언트 body보다 JWT 우선)
	req.UserID = userID

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("notes").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[메모 생성 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "메모 생성에 실패했습니다")
		return
	}

	var created []model.Note
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[메모 생성 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "메모 생성 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/notes/{id} — 메모 수정 (본인만)
// 비유: 내 포스트잇만 수정할 수 있음 (남의 것 금지)
func (h *NoteHandler) Update(w http.ResponseWriter, r *http.Request) {
	noteID := chi.URLParam(r, "id")
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}

	// 소유권 확인
	if err := h.checkOwnership(noteID, userID); err != nil {
		response.RespondError(w, http.StatusForbidden, "본인의 메모만 수정할 수 있습니다")
		return
	}

	var req model.UpdateNoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[메모 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("notes").
		Update(req, "", "").
		Eq("note_id", noteID).
		Execute()
	if err != nil {
		log.Printf("[메모 수정 실패] id=%s, err=%v", noteID, err)
		response.RespondError(w, http.StatusInternalServerError, "메모 수정에 실패했습니다")
		return
	}

	var updated []model.Note
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[메모 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 메모를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/notes/{id} — 메모 삭제 (본인만)
// 비유: 내 포스트잇만 떼어낼 수 있음
func (h *NoteHandler) Delete(w http.ResponseWriter, r *http.Request) {
	noteID := chi.URLParam(r, "id")
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}

	// 소유권 확인
	if err := h.checkOwnership(noteID, userID); err != nil {
		response.RespondError(w, http.StatusForbidden, "본인의 메모만 삭제할 수 있습니다")
		return
	}

	_, _, err := h.DB.From("notes").
		Delete("", "").
		Eq("note_id", noteID).
		Execute()
	if err != nil {
		log.Printf("[메모 삭제 실패] id=%s, err=%v", noteID, err)
		response.RespondError(w, http.StatusInternalServerError, "메모 삭제에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, map[string]string{"message": "삭제 완료"})
}

// checkOwnership — 메모 소유권 확인 (본인 메모인지 검사)
func (h *NoteHandler) checkOwnership(noteID, userID string) error {
	data, _, err := h.DB.From("notes").
		Select("user_id", "exact", false).
		Eq("note_id", noteID).
		Execute()
	if err != nil {
		return err
	}

	var notes []struct {
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal(data, &notes); err != nil {
		return err
	}

	if len(notes) == 0 {
		return err
	}

	if notes[0].UserID != userID {
		return &ownershipError{}
	}

	return nil
}

type ownershipError struct{}

func (e *ownershipError) Error() string { return "본인의 메모가 아닙니다" }
