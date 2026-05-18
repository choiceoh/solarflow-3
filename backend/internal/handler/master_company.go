package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/handlerutil"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/response"
)

// CompanyHandler — 법인(companies) 관련 API를 처리하는 핸들러
// 비유: "법인 관리실" — 탑솔라, 디원, 화신 정보를 관리하는 방
type CompanyHandler struct {
	DB          *supa.Client
	BaroCompany *middleware.BaroCompanyResolver
}

// NewCompanyHandler — CompanyHandler 생성자
func NewCompanyHandler(db *supa.Client) *CompanyHandler {
	return &CompanyHandler{DB: db}
}

// init — D-20260512-090000 feature self-mounting.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDMasterCompany,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewCompanyHandler(d.DB)
			h.BaroCompany = d.BaroCompany
			g := d.Gates
			r.Route("/companies", func(r chi.Router) {
				r.Get("/", h.List)
				r.Get("/{id}", h.GetByID)
				r.With(g.Write).Post("/", h.Create)
				r.With(g.Write).Put("/{id}", h.Update)
				// 메타 GUI inline 편집 진입점 — UpdateCompanyRequest 가 pointer + omitempty
				r.With(g.Write).Patch("/{id}", h.Update)
				r.With(g.Write).Patch("/{id}/status", h.ToggleStatus)
				r.With(g.Write).Delete("/{id}", h.Delete)
			})
		},
	})
}

// List — GET /api/v1/companies — 법인 목록 조회
// 비유: 법인 관리실에서 전체 명함첩을 꺼내 보여주는 것
func (h *CompanyHandler) List(w http.ResponseWriter, r *http.Request) {
	limit, offset := handlerutil.ParseLimitOffset(r, 100, 1000)
	query := h.DB.From("companies").
		Select("*", "exact", false)

	// BARO 격리 (D-108): BARO 토큰일 때는 회사 선택기에 BR(바로) 법인만 보이게 한다.
	// 직접 SELECT 응답에서 module 회사들이 제외되면 프론트 드롭다운에서도 자동으로 안 보임 +
	// 자기 화면에 module 회사가 노출되지 않음. 룩업 실패 시 빈 결과 — fail-closed.
	if middleware.GetTenantScope(r.Context()) == middleware.TenantScopeBaro {
		if h.BaroCompany == nil {
			log.Printf("[BARO 회사 마스터 격리] BaroCompany resolver 미주입")
			response.RespondJSON(w, http.StatusOK, []model.Company{})
			return
		}
		baroID, err := h.BaroCompany.Resolve()
		if err != nil {
			log.Printf("[BARO 회사 마스터 격리] BR 법인 룩업 실패: %v", err)
			response.RespondJSON(w, http.StatusOK, []model.Company{})
			return
		}
		query = query.Eq("company_id", baroID)
	}

	data, count, err := query.
		Range(offset, offset+limit-1, "").
		Execute()
	if err != nil {
		log.Printf("[법인 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "법인 목록 조회에 실패했습니다")
		return
	}

	var companies []model.Company
	if err := json.Unmarshal(data, &companies); err != nil {
		log.Printf("[법인 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, companies)
}

// GetByID — GET /api/v1/companies/{id} — 법인 상세 조회
// 비유: 명함첩에서 특정 법인 카드를 찾아 보여주는 것
func (h *CompanyHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("companies").
		Select("*", "exact", false).
		Eq("company_id", id).
		Execute()
	if err != nil {
		log.Printf("[법인 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "법인 조회에 실패했습니다")
		return
	}

	var companies []model.Company
	if err := json.Unmarshal(data, &companies); err != nil {
		log.Printf("[법인 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(companies) == 0 {
		response.RespondError(w, http.StatusNotFound, "법인을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, companies[0])
}

// Create — POST /api/v1/companies — 법인 등록
// 비유: 새 법인 명함을 만들어 명함첩에 추가하는 것
func (h *CompanyHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateCompanyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[법인 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 접수 창구에서 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("companies").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[법인 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "법인 등록에 실패했습니다")
		return
	}

	var created []model.Company
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[법인 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "법인 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/companies/{id} — 법인 수정
// 비유: 기존 명함의 정보를 수정하는 것
func (h *CompanyHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateCompanyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[법인 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("companies").
		Update(req, "", "").
		Eq("company_id", id).
		Execute()
	if err != nil {
		log.Printf("[법인 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "법인 수정에 실패했습니다")
		return
	}

	var updated []model.Company
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[법인 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 법인을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/companies/{id} — 법인 삭제
// 비유: 명함첩에서 명함을 완전히 제거하는 것
func (h *CompanyHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, _, err := h.DB.From("companies").
		Delete("", "").
		Eq("company_id", id).
		Execute()
	if err != nil {
		log.Printf("[법인 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "법인 삭제에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}

// ToggleStatus — PATCH /api/v1/companies/{id}/status — 법인 활성/비활성 토글
// 비유: 명함에 "활동중/휴면" 도장을 찍는 것
func (h *CompanyHandler) ToggleStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// 비유: 공통 토글 구조체로 요청을 받음
	var req model.ToggleStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[법인 상태 변경 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("companies").
		Update(req, "", "").
		Eq("company_id", id).
		Execute()
	if err != nil {
		log.Printf("[법인 상태 변경 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "법인 상태 변경에 실패했습니다")
		return
	}

	var toggled []model.Company
	if err := json.Unmarshal(data, &toggled); err != nil {
		log.Printf("[법인 상태 변경 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(toggled) == 0 {
		response.RespondError(w, http.StatusNotFound, "상태를 변경할 법인을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, toggled[0])
}
