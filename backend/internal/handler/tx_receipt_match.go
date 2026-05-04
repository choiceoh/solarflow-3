package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/engine"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// ReceiptMatchHandler — 수금 매칭(receipt_matches) 관련 API를 처리하는 핸들러
// 비유: "수금-출고 매칭 대장" — 어떤 입금이 어떤 출고에 얼마만큼 매칭되었는지 관리
// Rust 수금 추천/미수금 총괄은 /api/v1/calc/receipt-match-suggest, /outstanding-list 프록시가 담당한다.
type ReceiptMatchHandler struct {
	DB     *supa.Client
	Engine *engine.EngineClient // auto-match에서만 사용 (없으면 503)
}

// NewReceiptMatchHandler — ReceiptMatchHandler 생성자
func NewReceiptMatchHandler(db *supa.Client, engineClient ...*engine.EngineClient) *ReceiptMatchHandler {
	var ec *engine.EngineClient
	if len(engineClient) > 0 {
		ec = engineClient[0]
	}
	return &ReceiptMatchHandler{DB: db, Engine: ec}
}

// List — GET /api/v1/receipt-matches — 수금 매칭 목록 조회
// 비유: 매칭 대장에서 전체 매칭 내역을 꺼내 보여주는 것
func (h *ReceiptMatchHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("receipt_matches").
		Select("*", "exact", false)

	// 비유: ?receipt_id=xxx — 특정 수금의 매칭만 필터
	if recID := r.URL.Query().Get("receipt_id"); recID != "" {
		query = query.Eq("receipt_id", recID)
	}

	limit, offset := parseLimitOffset(r, 100, 1000)
	data, count, err := query.Range(offset, offset+limit-1, "").Execute()
	if err != nil {
		log.Printf("[수금 매칭 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "수금 매칭 목록 조회에 실패했습니다")
		return
	}

	var matches []model.ReceiptMatch
	if err := json.Unmarshal(data, &matches); err != nil {
		log.Printf("[수금 매칭 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	h.enrichReceiptMatches(matches)
	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, matches)
}

type receiptMatchOutboundRow struct {
	OutboundID   string  `json:"outbound_id"`
	OutboundDate string  `json:"outbound_date"`
	SiteName     *string `json:"site_name"`
	ProductID    string  `json:"product_id"`
}

type receiptMatchProductRow struct {
	ProductID   string `json:"product_id"`
	ProductName string `json:"product_name"`
}

func (h *ReceiptMatchHandler) enrichReceiptMatches(matches []model.ReceiptMatch) {
	if len(matches) == 0 {
		return
	}

	var outbounds []receiptMatchOutboundRow
	if data, _, err := h.DB.From("outbounds").Select("outbound_id, outbound_date, site_name, product_id", "exact", false).Execute(); err == nil {
		if err := json.Unmarshal(data, &outbounds); err != nil {
			log.Printf("[수금매칭 enrich] outbounds 디코딩 실패 — 출고/현장 비표시: %v", err)
		}
	} else {
		log.Printf("[수금매칭 enrich] outbounds 조회 실패 — 출고/현장 비표시: %v", err)
	}
	var products []receiptMatchProductRow
	if data, _, err := h.DB.From("products").Select("product_id, product_name", "exact", false).Execute(); err == nil {
		if err := json.Unmarshal(data, &products); err != nil {
			log.Printf("[수금매칭 enrich] products 디코딩 실패 — 품목명 비표시: %v", err)
		}
	} else {
		log.Printf("[수금매칭 enrich] products 조회 실패 — 품목명 비표시: %v", err)
	}

	productMap := make(map[string]string, len(products))
	for _, p := range products {
		productMap[p.ProductID] = p.ProductName
	}
	outboundMap := make(map[string]receiptMatchOutboundRow, len(outbounds))
	for _, outbound := range outbounds {
		outboundMap[outbound.OutboundID] = outbound
	}

	for i := range matches {
		if matches[i].OutboundID == nil {
			continue
		}
		outbound, ok := outboundMap[*matches[i].OutboundID]
		if !ok {
			continue
		}
		matches[i].OutboundDate = &outbound.OutboundDate
		matches[i].SiteName = outbound.SiteName
		if name, ok := productMap[outbound.ProductID]; ok {
			matches[i].ProductName = &name
		}
	}
}

// Create — POST /api/v1/receipt-matches — 수금 매칭 등록
// 비유: 새 매칭 기록을 대장에 추가하는 것
func (h *ReceiptMatchHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateReceiptMatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[수금 매칭 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("receipt_matches").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[수금 매칭 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "수금 매칭 등록에 실패했습니다")
		return
	}

	var created []model.ReceiptMatch
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[수금 매칭 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "수금 매칭 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Delete — DELETE /api/v1/receipt-matches/{id} — 수금 매칭 삭제
// 비유: 매칭 대장에서 특정 매칭 기록을 제거하는 것
func (h *ReceiptMatchHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	_, _, err := h.DB.From("receipt_matches").
		Delete("", "").
		Eq("match_id", id).
		Execute()
	if err != nil {
		log.Printf("[수금 매칭 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "수금 매칭 삭제에 실패했습니다")
		return
	}

	result := struct {
		Status string `json:"status"`
	}{
		Status: "deleted",
	}

	response.RespondJSON(w, http.StatusOK, result)
}

// === 일괄 자동 매칭 (A+B 통합) ===
// 미매칭 수금 전체를 스캔, Rust 엔진의 receipt-match-suggest를 호출해 분류:
//  - 자동 매칭(B): match_type="exact" + remainder=0 → DB에 receipt_matches INSERT
//  - 검토 대기(A): 그 외 후보 있음 → suggestions로 반환 (사용자가 기존 매칭 패널에서 결정)
//  - 후보 없음: 카운트만 반환
//
// dry_run=true면 INSERT 없이 미리보기만.

type autoMatchRequest struct {
	CompanyID string `json:"company_id"`
	DryRun    bool   `json:"dry_run,omitempty"`
}

type autoMatchedItem struct {
	ReceiptID    string   `json:"receipt_id"`
	CustomerID   string   `json:"customer_id"`
	CustomerName string   `json:"customer_name"`
	ReceiptDate  string   `json:"receipt_date"`
	Amount       float64  `json:"amount"`
	OutboundIDs  []string `json:"outbound_ids"`
	TotalMatched float64  `json:"total_matched"`
}

type autoMatchCandidate struct {
	OutboundID  string  `json:"outbound_id"`
	MatchAmount float64 `json:"match_amount"`
}

type autoMatchSuggestion struct {
	ReceiptID    string               `json:"receipt_id"`
	CustomerID   string               `json:"customer_id"`
	CustomerName string               `json:"customer_name"`
	ReceiptDate  string               `json:"receipt_date"`
	Amount       float64              `json:"amount"`
	Remaining    float64              `json:"remaining"`
	MatchType    string               `json:"match_type"`
	Candidates   []autoMatchCandidate `json:"candidates"`
	TotalSuggest float64              `json:"total_suggest"`
	Difference   float64              `json:"difference"`
}

type autoMatchResponse struct {
	AutoMatched []autoMatchedItem     `json:"auto_matched"`
	Suggestions []autoMatchSuggestion `json:"suggestions"`
	NoCandidate int                   `json:"no_candidate"`
	DryRun      bool                  `json:"dry_run"`
}

// Rust 엔진 receipt-match-suggest 응답 미러 (frontend useMatching.ts와 동일)
type calcSuggestItem struct {
	OutboundID  string  `json:"outbound_id"`
	MatchAmount float64 `json:"match_amount"`
}
type calcSuggestEntry struct {
	MatchType    string            `json:"match_type"`
	Items        []calcSuggestItem `json:"items"`
	TotalMatched float64           `json:"total_matched"`
	Remainder    float64           `json:"remainder"`
}
type calcSuggestResponse struct {
	ReceiptAmount   float64            `json:"receipt_amount"`
	Suggestions     []calcSuggestEntry `json:"suggestions"`
	UnmatchedAmount float64            `json:"unmatched_amount"`
}

// AutoMatch — POST /api/v1/receipt-matches/auto
func (h *ReceiptMatchHandler) AutoMatch(w http.ResponseWriter, r *http.Request) {
	if h.Engine == nil {
		engineUnavailableResponse(w)
		return
	}

	var req autoMatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if req.CompanyID == "" {
		response.RespondError(w, http.StatusBadRequest, "company_id는 필수 항목입니다")
		return
	}

	// 미매칭 수금 후보 (전체 receipts → enrich → matched_total < amount 만 필터)
	receipts, err := h.fetchUnmatchedReceipts()
	if err != nil {
		log.Printf("[auto-match] 수금 조회 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "수금 목록 조회에 실패했습니다")
		return
	}

	out := autoMatchResponse{
		AutoMatched: []autoMatchedItem{},
		Suggestions: []autoMatchSuggestion{},
		DryRun:      req.DryRun,
	}

	for _, rec := range receipts {
		remaining := rec.Amount - rec.MatchedTotal
		if remaining <= 0 {
			continue
		}

		body, _ := json.Marshal(map[string]interface{}{
			"company_id":     req.CompanyID,
			"customer_id":    rec.CustomerID,
			"receipt_amount": remaining,
		})
		raw, status, callErr := h.Engine.CallCalcRaw("receipt-match-suggest", body)
		if callErr != nil || status >= 400 {
			log.Printf("[auto-match] receipt_id=%s 엔진 호출 실패 status=%d err=%v", rec.ReceiptID, status, callErr)
			out.NoCandidate++
			continue
		}
		var resp calcSuggestResponse
		if err := json.Unmarshal(raw, &resp); err != nil {
			log.Printf("[auto-match] receipt_id=%s 응답 파싱 실패: %v", rec.ReceiptID, err)
			out.NoCandidate++
			continue
		}
		if len(resp.Suggestions) == 0 || len(resp.Suggestions[0].Items) == 0 {
			out.NoCandidate++
			continue
		}
		best := resp.Suggestions[0]

		customerName := ""
		if rec.CustomerName != nil {
			customerName = *rec.CustomerName
		}

		// 자동 매칭 조건: exact + remainder == 0 (잔액 없이 정확 합치)
		if best.MatchType == "exact" && best.Remainder == 0 {
			ids := make([]string, 0, len(best.Items))
			for _, it := range best.Items {
				ids = append(ids, it.OutboundID)
			}

			if !req.DryRun {
				inserted := 0
				for _, it := range best.Items {
					oid := it.OutboundID
					payload := model.CreateReceiptMatchRequest{
						ReceiptID:     rec.ReceiptID,
						OutboundID:    &oid,
						MatchedAmount: it.MatchAmount,
					}
					if _, _, err := h.DB.From("receipt_matches").Insert(payload, false, "", "", "").Execute(); err != nil {
						log.Printf("[auto-match] receipt_id=%s outbound_id=%s INSERT 실패: %v", rec.ReceiptID, it.OutboundID, err)
						continue
					}
					inserted++
				}
				log.Printf("[auto-match] receipt_id=%s 자동 매칭 %d/%d건 (총 %.0f)", rec.ReceiptID, inserted, len(best.Items), best.TotalMatched)
			}

			out.AutoMatched = append(out.AutoMatched, autoMatchedItem{
				ReceiptID:    rec.ReceiptID,
				CustomerID:   rec.CustomerID,
				CustomerName: customerName,
				ReceiptDate:  rec.ReceiptDate,
				Amount:       rec.Amount,
				OutboundIDs:  ids,
				TotalMatched: best.TotalMatched,
			})
			continue
		}

		// 검토 대기 (A)
		cands := make([]autoMatchCandidate, 0, len(best.Items))
		for _, it := range best.Items {
			cands = append(cands, autoMatchCandidate{OutboundID: it.OutboundID, MatchAmount: it.MatchAmount})
		}
		out.Suggestions = append(out.Suggestions, autoMatchSuggestion{
			ReceiptID:    rec.ReceiptID,
			CustomerID:   rec.CustomerID,
			CustomerName: customerName,
			ReceiptDate:  rec.ReceiptDate,
			Amount:       rec.Amount,
			Remaining:    remaining,
			MatchType:    best.MatchType,
			Candidates:   cands,
			TotalSuggest: best.TotalMatched,
			Difference:   best.Remainder,
		})
	}

	response.RespondJSON(w, http.StatusOK, out)
}

// 미매칭 수금 (matched_total < amount) 만 반환. enrichReceipts와 동일 로직 일부 재사용.
func (h *ReceiptMatchHandler) fetchUnmatchedReceipts() ([]model.Receipt, error) {
	data, _, err := h.DB.From("receipts").Select("*", "exact", false).Execute()
	if err != nil {
		return nil, err
	}
	var receipts []model.Receipt
	if err := json.Unmarshal(data, &receipts); err != nil {
		return nil, err
	}

	// 거래처명·매칭합계 enrich
	var partners []receiptPartnerRow
	if pdata, _, perr := h.DB.From("partners").Select("partner_id, partner_name", "exact", false).Execute(); perr == nil {
		_ = json.Unmarshal(pdata, &partners)
	}
	partnerMap := make(map[string]string, len(partners))
	for _, p := range partners {
		partnerMap[p.PartnerID] = p.PartnerName
	}

	var matches []receiptMatchSumRow
	if mdata, _, merr := h.DB.From("receipt_matches").Select("receipt_id, matched_amount", "exact", false).Execute(); merr == nil {
		_ = json.Unmarshal(mdata, &matches)
	}
	matchMap := make(map[string]float64, len(matches))
	for _, m := range matches {
		matchMap[m.ReceiptID] += m.MatchedAmount
	}

	out := make([]model.Receipt, 0, len(receipts))
	for i := range receipts {
		if name, ok := partnerMap[receipts[i].CustomerID]; ok {
			receipts[i].CustomerName = &name
		}
		receipts[i].MatchedTotal = matchMap[receipts[i].ReceiptID]
		if receipts[i].MatchedTotal < receipts[i].Amount {
			out = append(out, receipts[i])
		}
	}
	return out, nil
}
