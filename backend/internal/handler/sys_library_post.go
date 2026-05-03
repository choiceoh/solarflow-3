package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// LibraryPostHandler — 자료실 게시글 API를 처리한다.
type LibraryPostHandler struct {
	DB *supa.Client
}

func NewLibraryPostHandler(db *supa.Client) *LibraryPostHandler {
	return &LibraryPostHandler{DB: db}
}

// List — GET /api/v1/library-posts
func (h *LibraryPostHandler) List(w http.ResponseWriter, r *http.Request) {
	data, _, err := h.DB.From("library_posts").
		Select("*", "exact", false).
		Order("created_at", &postgrest.OrderOpts{Ascending: false}).
		Execute()
	if err != nil {
		log.Printf("[자료실 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "자료실 목록 조회에 실패했습니다")
		return
	}

	var posts []model.LibraryPost
	if err := json.Unmarshal(data, &posts); err != nil {
		log.Printf("[자료실 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, posts)
}

// GetByID — GET /api/v1/library-posts/{id}
func (h *LibraryPostHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !validUUID(id) {
		response.RespondError(w, http.StatusBadRequest, "자료실 글 ID가 올바르지 않습니다")
		return
	}

	data, _, err := h.DB.From("library_posts").
		Select("*", "exact", false).
		Eq("post_id", id).
		Execute()
	if err != nil {
		log.Printf("[자료실 상세 조회 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "자료실 글 조회에 실패했습니다")
		return
	}

	var posts []model.LibraryPost
	if err := json.Unmarshal(data, &posts); err != nil {
		log.Printf("[자료실 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(posts) == 0 {
		response.RespondError(w, http.StatusNotFound, "자료실 글을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, posts[0])
}

// Create — POST /api/v1/library-posts
func (h *LibraryPostHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}

	var req model.CreateLibraryPostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[자료실 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	req.Normalize()
	req.CreatedBy = &userID
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("library_posts").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[자료실 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "자료실 글 등록에 실패했습니다")
		return
	}

	var created []model.LibraryPost
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		log.Printf("[자료실 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "자료실 글 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT/PATCH /api/v1/library-posts/{id}
func (h *LibraryPostHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !validUUID(id) {
		response.RespondError(w, http.StatusBadRequest, "자료실 글 ID가 올바르지 않습니다")
		return
	}

	var req model.UpdateLibraryPostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[자료실 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	req.Normalize()
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("library_posts").
		Update(req, "", "").
		Eq("post_id", id).
		Execute()
	if err != nil {
		log.Printf("[자료실 수정 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "자료실 글 수정에 실패했습니다")
		return
	}

	var updated []model.LibraryPost
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[자료실 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 자료실 글을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/library-posts/{id}
func (h *LibraryPostHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !validUUID(id) {
		response.RespondError(w, http.StatusBadRequest, "자료실 글 ID가 올바르지 않습니다")
		return
	}

	files := h.listAttachments(id)
	_, _, err := h.DB.From("library_posts").
		Delete("", "").
		Eq("post_id", id).
		Execute()
	if err != nil {
		log.Printf("[자료실 삭제 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "자료실 글 삭제에 실패했습니다")
		return
	}

	if _, _, err := h.DB.From("document_files").
		Delete("", "").
		Eq("entity_type", "library_posts").
		Eq("entity_id", id).
		Execute(); err != nil {
		log.Printf("[자료실 첨부 메타데이터 삭제 실패] post_id=%s err=%v", id, err)
	}
	for _, file := range files {
		path, err := safeStoredPath(file.StoredPath)
		if err != nil {
			log.Printf("[자료실 첨부 삭제 경로 검증 실패] file_id=%s err=%v", file.FileID, err)
			continue
		}
		removeStoredFile(path)
	}

	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *LibraryPostHandler) listAttachments(postID string) []model.DocumentFile {
	data, _, err := h.DB.From("document_files").
		Select("*", "exact", false).
		Eq("entity_type", "library_posts").
		Eq("entity_id", postID).
		Execute()
	if err != nil {
		log.Printf("[자료실 첨부 목록 조회 실패] post_id=%s err=%v", postID, err)
		return nil
	}
	var files []model.DocumentFile
	if err := json.Unmarshal(data, &files); err != nil {
		log.Printf("[자료실 첨부 목록 디코딩 실패] post_id=%s err=%v", postID, err)
		return nil
	}
	return files
}

func validUUID(value string) bool {
	_, err := uuid.Parse(value)
	return err == nil
}
