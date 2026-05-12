package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/dbrpc"
	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/response"
)

// BaroCreditCheckHandler — D-136 한도 초과 사전 체크 (PR5.5b).
//
// 비유: "출고 전 신용 조회" — 출고/수주 생성하기 전에 거래처 한도/연체 상태를 묻고
// 영업·결재가 결정. 본 endpoint 는 정보 제공만 — 실제 출고 차단은 별도 PR5.5b' 에서
// outbound 핸들러에 통합 (큰 변경이라 본 PR 분리).
//
// 응답 status:
//   - "ok"          : 한도 여유 + 연체 60일 미만 — 정상 진행
//   - "warn_aging"  : 연체 60일 이상 — 결재 권고
//   - "over_limit"  : 한도 초과 또는 연체 90일 이상 — 결재 강제
type BaroCreditCheckHandler struct {
	DB *supa.Client
}

func NewBaroCreditCheckHandler(db *supa.Client) *BaroCreditCheckHandler {
	return &BaroCreditCheckHandler{DB: db}
}

// init — D-20260512-090000 feature self-mounting.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDBaroCreditCheck,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewBaroCreditCheckHandler(d.DB)
			g := d.Gates
			r.Route("/baro/credit-check", func(r chi.Router) {
				r.Use(g.Feature(feature.IDBaroCreditCheck))
				r.Get("/", h.Get)
			})
		},
	})
}

type CreditCheckResponse struct {
	Status            string   `json:"status"` // ok | warn_aging | over_limit
	Message           string   `json:"message"`
	PartnerID         string   `json:"partner_id"`
	OutstandingKrw    *float64 `json:"outstanding_krw"`
	CreditLimitKrw    *float64 `json:"credit_limit_krw"`
	UtilizationPct    *float64 `json:"utilization_pct"`
	OldestUnpaidDays  *int     `json:"oldest_unpaid_days"`
	ProjectedTotalKrw *float64 `json:"projected_total_krw,omitempty"` // outstanding + amount
	WouldExceed       bool     `json:"would_exceed"`
}

// Get — GET /api/v1/baro/credit-check?partner_id=X&amount=Y
func (h *BaroCreditCheckHandler) Get(w http.ResponseWriter, r *http.Request) {
	partnerID := r.URL.Query().Get("partner_id")
	if partnerID == "" {
		response.RespondError(w, http.StatusBadRequest, "partner_id는 필수입니다")
		return
	}
	var amount float64
	if amtStr := r.URL.Query().Get("amount"); amtStr != "" {
		if a, err := strconv.ParseFloat(amtStr, 64); err == nil && a >= 0 {
			amount = a
		}
	}

	body, err := dbrpc.Call(r.Context(), "baro_credit_board", map[string]interface{}{})
	if err != nil {
		log.Printf("[credit-check RPC 실패] partner=%s, err=%v", partnerID, err)
		response.RespondError(w, http.StatusInternalServerError, "한도 조회 실패")
		return
	}
	var rows []struct {
		PartnerID        string   `json:"partner_id"`
		OutstandingKrw   *float64 `json:"outstanding_krw"`
		CreditLimitKrw   *float64 `json:"credit_limit_krw"`
		UtilizationPct   *float64 `json:"utilization_pct"`
		OldestUnpaidDays *int     `json:"oldest_unpaid_days"`
	}
	if err := json.Unmarshal(body, &rows); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}

	resp := CreditCheckResponse{
		Status:    "ok",
		Message:   "한도 여유 있음",
		PartnerID: partnerID,
	}
	for _, row := range rows {
		if row.PartnerID == partnerID {
			resp.OutstandingKrw = row.OutstandingKrw
			resp.CreditLimitKrw = row.CreditLimitKrw
			resp.UtilizationPct = row.UtilizationPct
			resp.OldestUnpaidDays = row.OldestUnpaidDays
			break
		}
	}

	// 분류
	days := 0
	if resp.OldestUnpaidDays != nil {
		days = *resp.OldestUnpaidDays
	}
	outstanding := 0.0
	if resp.OutstandingKrw != nil {
		outstanding = *resp.OutstandingKrw
	}
	limit := 0.0
	hasLimit := false
	if resp.CreditLimitKrw != nil {
		limit = *resp.CreditLimitKrw
		hasLimit = true
	}
	projected := outstanding + amount
	if amount > 0 {
		resp.ProjectedTotalKrw = &projected
	}

	switch {
	case hasLimit && projected > limit:
		resp.Status = "over_limit"
		resp.WouldExceed = true
		resp.Message = "신규 거래 시 한도 초과 — 결재 강제"
	case days >= 90:
		resp.Status = "over_limit"
		resp.Message = "90일 이상 연체 — 결재 강제 + 회수 우선"
	case days >= 60:
		resp.Status = "warn_aging"
		resp.Message = "60일 이상 연체 — 결재 권고"
	case hasLimit && resp.UtilizationPct != nil && *resp.UtilizationPct >= 80:
		resp.Status = "warn_aging"
		resp.Message = "한도 사용률 80% 이상 — 주의"
	default:
		resp.Status = "ok"
		resp.Message = "한도 여유 있음 + 연체 정상"
	}

	response.RespondJSON(w, http.StatusOK, resp)
}
