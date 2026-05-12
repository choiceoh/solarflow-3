package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/response"
)

// BankHandler — 은행(banks) 관련 API를 처리하는 핸들러
// 비유: "은행 한도 관리 캐비넷" — LC 한도, 수수료율 관리
type BankHandler struct {
	DB *supa.Client
}

// NewBankHandler — BankHandler 생성자
func NewBankHandler(db *supa.Client) *BankHandler {
	return &BankHandler{DB: db}
}

// init — D-20260512-090000 feature self-mounting 파일럿.
// BankHandler 라우트 (/banks, /banking/dashboard) 를 mount 레지스트리에 등록한다.
// 본 init() 가 routes.go 의 (h *BankHandler) RegisterRoutes 메서드와 router.go 의
// handler.NewBankHandler(...).RegisterRoutes(...) 호출 한 줄을 *대체* 한다.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDMasterBank,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewBankHandler(d.DB)
			g := d.Gates
			r.Route("/banks", func(r chi.Router) {
				r.Get("/", h.List)
				r.Get("/{id}", h.GetByID)
				r.With(g.Write).Post("/", h.Create)
				r.With(g.Write).Put("/{id}", h.Update)
				// 비유: PUT 과 PATCH 같은 핸들러 — UpdateBankRequest 의 모든 필드가 optional
				// (포인터 + omitempty) 이라 부분 업데이트로 그대로 동작. 메타 GUI 의 inline
				// 편집 (셀 클릭 → PATCH /api/v1/banks/{id} { 한 필드 } ) 가 이 라우트로.
				r.With(g.Write).Patch("/{id}", h.Update)
				r.With(g.Write).Patch("/{id}/status", h.ToggleStatus)
				r.With(g.Write).Delete("/{id}", h.Delete)
			})
			// BankingPage 4개 insight 의 client-side 집계를 SQL 한 round-trip 으로 대체.
			// banks + lc_records + limit_changes 합본이라 /banks 가 아닌 별도 prefix.
			r.Get("/banking/dashboard", h.BankingDashboard)
		},
	})
}

// List — GET /api/v1/banks — 은행 목록 조회 (법인 정보 포함)
// 비유: 캐비넷에서 전체 은행 거래 현황을 꺼내 보여주는 것
func (h *BankHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("banks").
		Select("*, companies(company_name, company_code)", "exact", false)

	// 비유: ?company_id=xxx — 특정 법인의 은행만 필터
	if compID := r.URL.Query().Get("company_id"); compID != "" && compID != "all" {
		query = query.Eq("company_id", compID)
	}

	limit, offset := parseLimitOffset(r, 100, 1000)
	data, count, err := query.Range(offset, offset+limit-1, "").Execute()
	if err != nil {
		log.Printf("[은행 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "은행 목록 조회에 실패했습니다")
		return
	}

	var banks []model.BankWithCompany
	if err := json.Unmarshal(data, &banks); err != nil {
		log.Printf("[은행 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, banks)
}

// GetByID — GET /api/v1/banks/{id} — 은행 상세 조회
// 비유: 캐비넷에서 특정 은행 거래 카드를 찾아 보여주는 것
func (h *BankHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("banks").
		Select("*, companies(company_name, company_code)", "exact", false).
		Eq("bank_id", id).
		Execute()
	if err != nil {
		log.Printf("[은행 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "은행 조회에 실패했습니다")
		return
	}

	var banks []model.BankWithCompany
	if err := json.Unmarshal(data, &banks); err != nil {
		log.Printf("[은행 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(banks) == 0 {
		response.RespondError(w, http.StatusNotFound, "은행을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, banks[0])
}

// Create — POST /api/v1/banks — 은행 등록
// 비유: 새 은행 거래 카드를 만들어 캐비넷에 추가하는 것
func (h *BankHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateBankRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[은행 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 접수 창구에서 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("banks").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[은행 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "은행 등록에 실패했습니다")
		return
	}

	var created []model.Bank
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[은행 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "은행 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT/PATCH /api/v1/banks/{id} — 은행 수정 (부분 업데이트도 지원)
// 비유: 기존 은행 거래 카드의 정보를 수정하는 것 — 비어 있는 항목은 그대로 두고
// 적은 항목만 갱신 (UpdateBankRequest 의 모든 필드가 optional 이라 가능).
// PATCH 는 메타 GUI 의 inline 편집 (셀 클릭 → 단일 필드 저장) 진입점.
func (h *BankHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateBankRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[은행 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("banks").
		Update(req, "", "").
		Eq("bank_id", id).
		Execute()
	if err != nil {
		log.Printf("[은행 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "은행 수정에 실패했습니다")
		return
	}

	var updated []model.Bank
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[은행 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 은행을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/banks/{id} — 은행 삭제
// 비유: 은행 거래 카드를 캐비넷에서 완전히 제거하는 것
func (h *BankHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	_, _, err := h.DB.From("banks").
		Delete("", "").
		Eq("bank_id", id).
		Execute()
	if err != nil {
		log.Printf("[은행 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "은행 삭제에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, struct{ Status string `json:"status"` }{Status: "deleted"})
}

// ToggleStatus — PATCH /api/v1/banks/{id}/status — 은행 활성/비활성
func (h *BankHandler) ToggleStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req model.ToggleStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	_, _, err := h.DB.From("banks").Update(req, "", "").Eq("bank_id", id).Execute()
	if err != nil {
		log.Printf("[은행 상태 변경 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "은행 상태 변경에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, struct{ Status string `json:"status"` }{Status: "ok"})
}
