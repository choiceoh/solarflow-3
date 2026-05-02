package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// DeclarationHandler — 수입신고(면장) 관련 API를 처리하는 핸들러
// 비유: "세관 신고 서류함" — 수입신고 면장을 관리
type DeclarationHandler struct {
	DB *supa.Client
}

type deleteDeclarationRPCRequest struct {
	DeclarationID string `json:"p_declaration_id"`
}

// NewDeclarationHandler — DeclarationHandler 생성자
func NewDeclarationHandler(db *supa.Client) *DeclarationHandler {
	return &DeclarationHandler{DB: db}
}

// List — GET /api/v1/declarations — 면장 목록 조회
// 비유: 세관 서류함에서 전체 면장을 꺼내 보여주는 것
func (h *DeclarationHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("import_declarations").
		Select("*", "exact", false)

	// 비유: ?bl_id=xxx — 특정 B/L의 면장만 필터
	if blID := r.URL.Query().Get("bl_id"); blID != "" {
		query = query.Eq("bl_id", blID)
	}

	// 비유: ?company_id=xxx — 특정 법인의 면장만 필터
	if compID := r.URL.Query().Get("company_id"); compID != "" && compID != "all" {
		query = query.Eq("company_id", compID)
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[면장 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "면장 목록 조회에 실패했습니다")
		return
	}

	var declarations []model.ImportDeclaration
	if err := json.Unmarshal(data, &declarations); err != nil {
		log.Printf("[면장 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, declarations)
}

// GetByID — GET /api/v1/declarations/{id} — 면장 상세 조회
// 비유: 특정 면장을 꺼내 자세히 보는 것
func (h *DeclarationHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("import_declarations").
		Select("*", "exact", false).
		Eq("declaration_id", id).
		Execute()
	if err != nil {
		log.Printf("[면장 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "면장 조회에 실패했습니다")
		return
	}

	var declarations []model.ImportDeclaration
	if err := json.Unmarshal(data, &declarations); err != nil {
		log.Printf("[면장 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(declarations) == 0 {
		response.RespondError(w, http.StatusNotFound, "면장을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, declarations[0])
}

// Create — POST /api/v1/declarations — 면장 등록
// 비유: 새 수입신고 면장을 작성하여 서류함에 보관하는 것
func (h *DeclarationHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateDeclarationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[면장 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("import_declarations").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[면장 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "면장 등록에 실패했습니다")
		return
	}

	var created []model.ImportDeclaration
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[면장 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "면장 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/declarations/{id} — 면장 수정
// 비유: 기존 면장의 내용을 수정하는 것
func (h *DeclarationHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateDeclarationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[면장 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("import_declarations").
		Update(req, "", "").
		Eq("declaration_id", id).
		Execute()
	if err != nil {
		log.Printf("[면장 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "면장 수정에 실패했습니다")
		return
	}

	var updated []model.ImportDeclaration
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[면장 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 면장을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/declarations/{id} — 면장 삭제
// 비유: 면장 서류를 파기 — 연결된 원가 라인을 먼저 삭제
func (h *DeclarationHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	if err := callRPC(h.DB, "sf_delete_declaration", deleteDeclarationRPCRequest{DeclarationID: id}); err != nil {
		log.Printf("[면장 트랜잭션 삭제 실패] id=%s, err=%v", id, err)
		if isRPCNotFound(err) {
			response.RespondError(w, http.StatusNotFound, "면장을 찾을 수 없습니다")
			return
		}
		response.RespondError(w, http.StatusInternalServerError, "면장 삭제에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}
