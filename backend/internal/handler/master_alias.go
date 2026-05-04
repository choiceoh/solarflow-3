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

// AliasHandler — 법인·품번 alias 학습 사전 API (D-056).
// 비유: "별칭 사전" — 외부 양식의 같은 이름들을 정식 마스터 항목으로 잇는 단어장.
type AliasHandler struct {
	DB *supa.Client
}

func NewAliasHandler(db *supa.Client) *AliasHandler {
	return &AliasHandler{DB: db}
}

// RegisterRoutes — 6개 endpoint 등록 (company / product / partner aliases).
//   GET/POST /api/v1/company-aliases
//   GET/POST /api/v1/product-aliases
//   GET/POST /api/v1/partner-aliases  (D-057)
func (h *AliasHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/company-aliases", func(r chi.Router) {
		r.Get("/", h.ListCompanyAliases)
		r.With(g.Write).Post("/", h.CreateCompanyAlias)
	})
	r.Route("/product-aliases", func(r chi.Router) {
		r.Get("/", h.ListProductAliases)
		r.With(g.Write).Post("/", h.CreateProductAlias)
	})
	r.Route("/partner-aliases", func(r chi.Router) {
		r.Get("/", h.ListPartnerAliases)
		r.With(g.Write).Post("/", h.CreatePartnerAlias)
	})
}

// ListCompanyAliases — GET /api/v1/company-aliases
func (h *AliasHandler) ListCompanyAliases(w http.ResponseWriter, r *http.Request) {
	data, _, err := h.DB.From("company_aliases").
		Select("*", "exact", false).
		Execute()
	if err != nil {
		log.Printf("[법인 alias 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "법인 alias 조회에 실패했습니다")
		return
	}
	var rows []model.CompanyAlias
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[법인 alias 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 처리에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows)
}

// CreateCompanyAlias — POST /api/v1/company-aliases
// 변환기가 [같음] 선택 결과로 호출. 중복(UNIQUE alias_text_normalized)은 409.
func (h *AliasHandler) CreateCompanyAlias(w http.ResponseWriter, r *http.Request) {
	var req model.CreateCompanyAliasRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("company_aliases").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[법인 alias 등록 실패] %v", err)
		// PostgREST UNIQUE 위반 메시지 — 409 로 표면화
		if isUniqueViolation(err) {
			response.RespondError(w, http.StatusConflict, "이미 등록된 alias입니다")
			return
		}
		response.RespondError(w, http.StatusInternalServerError, "법인 alias 등록에 실패했습니다")
		return
	}

	var rows []model.CompanyAlias
	_ = json.Unmarshal(data, &rows)
	if len(rows) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "법인 alias 등록 결과를 확인할 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusCreated, rows[0])
}

// ListProductAliases — GET /api/v1/product-aliases
func (h *AliasHandler) ListProductAliases(w http.ResponseWriter, r *http.Request) {
	data, _, err := h.DB.From("product_aliases").
		Select("*", "exact", false).
		Execute()
	if err != nil {
		log.Printf("[품번 alias 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "품번 alias 조회에 실패했습니다")
		return
	}
	var rows []model.ProductAlias
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[품번 alias 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 처리에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows)
}

// CreateProductAlias — POST /api/v1/product-aliases
func (h *AliasHandler) CreateProductAlias(w http.ResponseWriter, r *http.Request) {
	var req model.CreateProductAliasRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("product_aliases").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[품번 alias 등록 실패] %v", err)
		if isUniqueViolation(err) {
			response.RespondError(w, http.StatusConflict, "이미 등록된 alias입니다")
			return
		}
		response.RespondError(w, http.StatusInternalServerError, "품번 alias 등록에 실패했습니다")
		return
	}

	var rows []model.ProductAlias
	_ = json.Unmarshal(data, &rows)
	if len(rows) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "품번 alias 등록 결과를 확인할 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusCreated, rows[0])
}

// ListPartnerAliases — GET /api/v1/partner-aliases (D-057)
func (h *AliasHandler) ListPartnerAliases(w http.ResponseWriter, r *http.Request) {
	data, _, err := h.DB.From("partner_aliases").
		Select("*", "exact", false).
		Execute()
	if err != nil {
		log.Printf("[거래처 alias 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 alias 조회에 실패했습니다")
		return
	}
	var rows []model.PartnerAlias
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[거래처 alias 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 처리에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows)
}

// CreatePartnerAlias — POST /api/v1/partner-aliases (D-057)
func (h *AliasHandler) CreatePartnerAlias(w http.ResponseWriter, r *http.Request) {
	var req model.CreatePartnerAliasRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("partner_aliases").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[거래처 alias 등록 실패] %v", err)
		if isUniqueViolation(err) {
			response.RespondError(w, http.StatusConflict, "이미 등록된 alias입니다")
			return
		}
		response.RespondError(w, http.StatusInternalServerError, "거래처 alias 등록에 실패했습니다")
		return
	}

	var rows []model.PartnerAlias
	_ = json.Unmarshal(data, &rows)
	if len(rows) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "거래처 alias 등록 결과를 확인할 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusCreated, rows[0])
}

// isUniqueViolation — PostgREST 의 UNIQUE 위반 에러를 휴리스틱으로 식별
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	for _, needle := range []string{"23505", "duplicate key", "unique constraint"} {
		if containsFold(msg, needle) {
			return true
		}
	}
	return false
}

func containsFold(s, sub string) bool {
	if len(sub) == 0 {
		return true
	}
	if len(sub) > len(s) {
		return false
	}
	// 단순 case-insensitive substring (영문/숫자만 대상이라 충분)
	lower := func(b byte) byte {
		if b >= 'A' && b <= 'Z' {
			return b + 32
		}
		return b
	}
	for i := 0; i+len(sub) <= len(s); i++ {
		match := true
		for j := 0; j < len(sub); j++ {
			if lower(s[i+j]) != lower(sub[j]) {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}
