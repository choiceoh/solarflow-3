package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// ReceiptHandler — 수금(receipts) 관련 API를 처리하는 핸들러
// 비유: "수금 전표함" — 고객 입금 내역을 관리
type ReceiptHandler struct {
	DB *supa.Client
}

// NewReceiptHandler — ReceiptHandler 생성자
func NewReceiptHandler(db *supa.Client) *ReceiptHandler {
	return &ReceiptHandler{DB: db}
}

// List — GET /api/v1/receipts — 수금 목록 조회
// 비유: 수금 전표함에서 전체 입금 내역을 꺼내 보여주는 것
func (h *ReceiptHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("receipts").
		Select("*", "exact", false)

	// 비유: ?customer_id=xxx — 특정 고객의 수금만 필터
	if custID := r.URL.Query().Get("customer_id"); custID != "" {
		query = query.Eq("customer_id", custID)
	}
	if month := r.URL.Query().Get("month"); month != "" {
		query = query.Gte("receipt_date", month+"-01").Lt("receipt_date", nextMonthString(month))
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[수금 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "수금 목록 조회에 실패했습니다")
		return
	}

	var receipts []model.Receipt
	if err := json.Unmarshal(data, &receipts); err != nil {
		log.Printf("[수금 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	h.enrichReceipts(receipts)
	response.RespondJSON(w, http.StatusOK, receipts)
}

// GetByID — GET /api/v1/receipts/{id} — 수금 상세 조회
// 비유: 특정 수금 전표를 꺼내 자세히 보는 것
func (h *ReceiptHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("receipts").
		Select("*", "exact", false).
		Eq("receipt_id", id).
		Execute()
	if err != nil {
		log.Printf("[수금 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "수금 조회에 실패했습니다")
		return
	}

	var receipts []model.Receipt
	if err := json.Unmarshal(data, &receipts); err != nil {
		log.Printf("[수금 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(receipts) == 0 {
		response.RespondError(w, http.StatusNotFound, "수금을 찾을 수 없습니다")
		return
	}

	h.enrichReceipts(receipts)
	response.RespondJSON(w, http.StatusOK, receipts[0])
}

type receiptPartnerRow struct {
	PartnerID   string `json:"partner_id"`
	PartnerName string `json:"partner_name"`
}

type receiptMatchSumRow struct {
	ReceiptID     string  `json:"receipt_id"`
	MatchedAmount float64 `json:"matched_amount"`
}

func (h *ReceiptHandler) enrichReceipts(receipts []model.Receipt) {
	if len(receipts) == 0 {
		return
	}

	var partners []receiptPartnerRow
	if data, _, err := h.DB.From("partners").Select("partner_id, partner_name", "exact", false).Execute(); err == nil {
		if err := json.Unmarshal(data, &partners); err != nil {
			log.Printf("[수금 enrich] partners 디코딩 실패 — 거래처명 비표시: %v", err)
		}
	} else {
		log.Printf("[수금 enrich] partners 조회 실패 — 거래처명 비표시: %v", err)
	}
	partnerMap := make(map[string]string, len(partners))
	for _, p := range partners {
		partnerMap[p.PartnerID] = p.PartnerName
	}

	var matches []receiptMatchSumRow
	if data, _, err := h.DB.From("receipt_matches").Select("receipt_id, matched_amount", "exact", false).Execute(); err == nil {
		if err := json.Unmarshal(data, &matches); err != nil {
			log.Printf("[수금 enrich] receipt_matches 디코딩 실패 — 매칭 합계 0으로 표시: %v", err)
		}
	} else {
		log.Printf("[수금 enrich] receipt_matches 조회 실패 — 매칭 합계 0으로 표시: %v", err)
	}
	matchMap := make(map[string]float64, len(matches))
	for _, m := range matches {
		matchMap[m.ReceiptID] += m.MatchedAmount
	}

	for i := range receipts {
		if name, ok := partnerMap[receipts[i].CustomerID]; ok {
			receipts[i].CustomerName = &name
		}
		receipts[i].MatchedTotal = matchMap[receipts[i].ReceiptID]
		receipts[i].Remaining = receipts[i].Amount - receipts[i].MatchedTotal
		if receipts[i].Remaining < 0 {
			receipts[i].Remaining = 0
		}
	}
}

func nextMonthString(month string) string {
	parsed, err := time.Parse("2006-01", month)
	if err != nil {
		return month
	}
	return parsed.AddDate(0, 1, 0).Format("2006-01-02")
}

// Create — POST /api/v1/receipts — 수금 등록
// 비유: 새 수금 전표를 작성하여 전표함에 보관하는 것
func (h *ReceiptHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateReceiptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[수금 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("receipts").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[수금 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "수금 등록에 실패했습니다")
		return
	}

	var created []model.Receipt
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[수금 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "수금 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/receipts/{id} — 수금 수정
// 비유: 기존 수금 전표의 내용을 수정하는 것
func (h *ReceiptHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateReceiptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[수금 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("receipts").
		Update(req, "", "").
		Eq("receipt_id", id).
		Execute()
	if err != nil {
		log.Printf("[수금 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "수금 수정에 실패했습니다")
		return
	}

	var updated []model.Receipt
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[수금 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 수금을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/receipts/{id} — 수금 삭제
// 비유: 수금 전표를 파기하는 것 — 연결된 매칭(receipt_matches)을 먼저 정리
func (h *ReceiptHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// 매칭 먼저 삭제 (FK 제약)
	if _, _, derr := h.DB.From("receipt_matches").
		Delete("", "").
		Eq("receipt_id", id).
		Execute(); derr != nil {
		log.Printf("[수금 삭제] receipt_matches cascade 실패 receipt_id=%s err=%v", id, derr)
	}

	_, _, err := h.DB.From("receipts").
		Delete("", "").
		Eq("receipt_id", id).
		Execute()
	if err != nil {
		log.Printf("[수금 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "수금 삭제에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}
