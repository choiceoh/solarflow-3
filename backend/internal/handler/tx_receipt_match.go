package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/engine"
	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/response"
)

const receiptMatchAmountEpsilon = 0.01

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

// init — D-20260512-090000 feature self-mounting.
// Mount 클로저가 ReceiptMatchHandler 인스턴스를 자체 생성한다. AssistantHandler 의
// WithAlias (Phase 6) 도 별도 인스턴스를 만들 예정 — stateless 라 인스턴스 중복 무해.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDTxReceiptMatch,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewReceiptMatchHandler(d.DB, d.Engine)
			g := d.Gates
			r.Route("/receipt-matches", func(r chi.Router) {
				r.Use(g.Feature(feature.IDTxReceiptMatch))
				r.Get("/", h.List)
				r.With(g.Write).Post("/", h.Create)
				r.With(g.Write).Post("/bulk", h.BulkCreate)
				r.With(g.Write).Post("/complete", h.Complete)
				r.Post("/ai-suggest", h.AISuggest)
				r.With(g.Write).Delete("/{id}", h.Delete)
				r.With(g.Write).Post("/auto", h.AutoMatch)
			})
		},
	})
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

	if _, status, msg := h.validateReceiptMatchBatch(req.ReceiptID, []model.CreateReceiptMatchRequest{req}); msg != "" {
		response.RespondError(w, status, msg)
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

// BulkCreate — POST /api/v1/receipt-matches/bulk — 여러 수금 매칭을 한 번에 등록
// 비유: 체크한 미수금 여러 줄을 한 번에 확정해 중간 실패로 반쪽 매칭이 생기지 않게 한다.
func (h *ReceiptMatchHandler) BulkCreate(w http.ResponseWriter, r *http.Request) {
	var req model.ReceiptMatchBulkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[수금 매칭 일괄 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	payloads := req.ToCreateRequests()
	validation, status, msg := h.validateReceiptMatchBatch(req.ReceiptID, payloads)
	if msg != "" {
		response.RespondError(w, status, msg)
		return
	}
	balanceAmount := receiptMatchBalanceAmount(validation)
	if balanceAmount > 0 && req.BalanceDisposition == "" {
		response.RespondError(w, http.StatusBadRequest, "차액 처리 방법을 선택해주세요")
		return
	}

	data, _, err := h.DB.From("receipt_matches").
		Insert(payloads, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[수금 매칭 일괄 등록 실패] receipt_id=%s, err=%v", req.ReceiptID, err)
		response.RespondError(w, http.StatusInternalServerError, "수금 매칭 일괄 등록에 실패했습니다")
		return
	}

	var created []model.ReceiptMatch
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[수금 매칭 일괄 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	h.enrichReceiptMatches(created)
	result := model.ReceiptMatchBulkResponse{
		Matches:            created,
		BalanceAmount:      balanceAmount,
		BalanceDisposition: req.BalanceDisposition,
		BalanceNote:        req.BalanceNote,
	}
	if balanceAmount <= 0 {
		result.BalanceDisposition = ""
		result.BalanceNote = ""
	}
	response.RespondJSON(w, http.StatusCreated, result)
}

// Complete — POST /api/v1/receipt-matches/complete — 출고/판매 미수 잔액을 한 번에 수금 완료.
// 비유: 판매 행에서 "수금 완료" 도장을 누르면, 잔액만큼 입금 전표와 매칭 전표를 함께 만든다.
func (h *ReceiptMatchHandler) Complete(w http.ResponseWriter, r *http.Request) {
	var req model.CompleteReceiptMatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[수금 완료 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	target, status, msg := h.completeReceiptTarget(req)
	if msg != "" {
		response.RespondError(w, status, msg)
		return
	}

	outstanding := target.TotalAmount - target.MatchedAmount
	if outstanding <= receiptMatchAmountEpsilon {
		response.RespondError(w, http.StatusBadRequest, "이미 수금 완료된 매출입니다")
		return
	}

	receiptDate := strings.TrimSpace(req.ReceiptDate)
	if receiptDate == "" {
		receiptDate = time.Now().Format("2006-01-02")
	}
	memo := receiptMatchStringPtr(req.Memo)
	if memo == nil {
		defaultMemo := "출고/판매 화면 수금완료"
		memo = &defaultMemo
	}
	receiptReq := model.CreateReceiptRequest{
		CustomerID:  target.CustomerID,
		ReceiptDate: receiptDate,
		Amount:      outstanding,
		BankAccount: receiptMatchStringPtr(req.BankAccount),
		Memo:        memo,
	}
	if msg := receiptReq.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	receiptData, _, err := h.DB.From("receipts").
		Insert(receiptReq, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[수금 완료] 수금 전표 생성 실패 customer_id=%s err=%v", target.CustomerID, err)
		response.RespondError(w, http.StatusInternalServerError, "수금 전표 생성에 실패했습니다")
		return
	}
	var receipts []model.Receipt
	if err := json.Unmarshal(receiptData, &receipts); err != nil {
		log.Printf("[수금 완료] 수금 전표 생성 결과 디코딩 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(receipts) == 0 || receipts[0].ReceiptID == "" {
		response.RespondError(w, http.StatusInternalServerError, "수금 전표 생성 결과를 확인할 수 없습니다")
		return
	}
	receipt := receipts[0]

	matchReq := target.MatchRequest
	matchReq.ReceiptID = receipt.ReceiptID
	matchReq.MatchedAmount = outstanding
	if _, status, msg := h.validateReceiptMatchBatch(receipt.ReceiptID, []model.CreateReceiptMatchRequest{matchReq}); msg != "" {
		h.deleteReceiptBestEffort(receipt.ReceiptID)
		response.RespondError(w, status, msg)
		return
	}

	matchData, _, err := h.DB.From("receipt_matches").
		Insert(matchReq, false, "", "", "").
		Execute()
	if err != nil {
		h.deleteReceiptBestEffort(receipt.ReceiptID)
		log.Printf("[수금 완료] 수금 매칭 생성 실패 receipt_id=%s err=%v", receipt.ReceiptID, err)
		response.RespondError(w, http.StatusInternalServerError, "수금 매칭 생성에 실패했습니다")
		return
	}
	var matches []model.ReceiptMatch
	if err := json.Unmarshal(matchData, &matches); err != nil {
		log.Printf("[수금 완료] 수금 매칭 생성 결과 디코딩 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(matches) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "수금 매칭 생성 결과를 확인할 수 없습니다")
		return
	}

	receipt.MatchedTotal = outstanding
	receipt.Remaining = 0
	h.enrichReceiptMatches(matches)
	response.RespondJSON(w, http.StatusCreated, model.CompleteReceiptMatchResponse{
		Receipt:           receipt,
		Match:             matches[0],
		MatchedAmount:     outstanding,
		OutstandingBefore: outstanding,
	})
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
				payloads := make([]model.CreateReceiptMatchRequest, 0, len(best.Items))
				for _, it := range best.Items {
					oid := it.OutboundID
					payloads = append(payloads, model.CreateReceiptMatchRequest{
						ReceiptID:     rec.ReceiptID,
						OutboundID:    &oid,
						MatchedAmount: it.MatchAmount,
					})
				}
				if _, status, msg := h.validateReceiptMatchBatch(rec.ReceiptID, payloads); msg != "" {
					log.Printf("[auto-match] receipt_id=%s 검증 실패 status=%d msg=%s", rec.ReceiptID, status, msg)
					out.NoCandidate++
					continue
				}
				if _, _, err := h.DB.From("receipt_matches").Insert(payloads, false, "", "", "").Execute(); err != nil {
					log.Printf("[auto-match] receipt_id=%s 일괄 INSERT 실패: %v", rec.ReceiptID, err)
					out.NoCandidate++
					continue
				}
				log.Printf("[auto-match] receipt_id=%s 자동 매칭 %d/%d건 (총 %.0f)", rec.ReceiptID, len(payloads), len(best.Items), best.TotalMatched)
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

type receiptAmountRow struct {
	ReceiptID string  `json:"receipt_id"`
	Amount    float64 `json:"amount"`
}

type receiptMatchValidationResult struct {
	ReceiptAmount float64
	Existing      float64
	Requested     float64
}

type receiptMatchAmountOnlyRow struct {
	MatchedAmount float64 `json:"matched_amount"`
}

type receiptMatchTargetAmountRow struct {
	OutboundID    *string `json:"outbound_id"`
	SaleID        *string `json:"sale_id"`
	MatchedAmount float64 `json:"matched_amount"`
}

type receiptCompleteTarget struct {
	CustomerID    string
	TotalAmount   float64
	MatchedAmount float64
	MatchRequest  model.CreateReceiptMatchRequest
}

type receiptMatchSaleRow struct {
	SaleID      string   `json:"sale_id"`
	OutboundID  *string  `json:"outbound_id"`
	CustomerID  string   `json:"customer_id"`
	TotalAmount *float64 `json:"total_amount"`
	Status      string   `json:"status"`
}

func (h *ReceiptMatchHandler) validateReceiptMatchBatch(receiptID string, reqs []model.CreateReceiptMatchRequest) (receiptMatchValidationResult, int, string) {
	result := receiptMatchValidationResult{}
	amount, found, err := h.fetchReceiptAmount(receiptID)
	if err != nil {
		log.Printf("[수금 매칭 검증] receipt 조회 실패 receipt_id=%s err=%v", receiptID, err)
		return result, http.StatusInternalServerError, "수금 정보 확인에 실패했습니다"
	}
	if !found {
		return result, http.StatusNotFound, "수금을 찾을 수 없습니다"
	}
	result.ReceiptAmount = amount

	existing, err := h.sumMatchesByField("receipt_id", receiptID)
	if err != nil {
		log.Printf("[수금 매칭 검증] 기존 매칭 합계 조회 실패 receipt_id=%s err=%v", receiptID, err)
		return result, http.StatusInternalServerError, "기존 매칭 금액 확인에 실패했습니다"
	}
	result.Existing = existing

	requested := 0.0
	targetRequests := map[string]float64{}
	for _, req := range reqs {
		if req.ReceiptID != receiptID {
			return result, http.StatusBadRequest, "모든 매칭의 receipt_id가 같아야 합니다"
		}
		requested += req.MatchedAmount
		key := receiptMatchTargetKey(req)
		if key == "" {
			return result, http.StatusBadRequest, "outbound_id 또는 sale_id 중 하나는 필수 항목입니다"
		}
		targetRequests[key] += req.MatchedAmount
	}
	result.Requested = requested

	if existing+requested > amount+receiptMatchAmountEpsilon {
		return result, http.StatusBadRequest, fmt.Sprintf("매칭 합계가 입금액을 초과합니다 (입금액 %.0f원, 기존 %.0f원, 추가 %.0f원)", amount, existing, requested)
	}

	for key, addAmount := range targetRequests {
		total, matched, err := h.targetSaleAndMatchedAmount(key)
		if err != nil {
			log.Printf("[수금 매칭 검증] 대상 매출 확인 실패 target=%s err=%v", key, err)
			return result, http.StatusInternalServerError, "매칭 대상 매출 확인에 실패했습니다"
		}
		if total <= 0 {
			return result, http.StatusNotFound, "매칭할 매출을 찾을 수 없습니다"
		}
		if matched+addAmount > total+receiptMatchAmountEpsilon {
			return result, http.StatusBadRequest, fmt.Sprintf("매칭 금액이 매출 미수금을 초과합니다 (매출액 %.0f원, 기존 %.0f원, 추가 %.0f원)", total, matched, addAmount)
		}
	}

	return result, 0, ""
}

func receiptMatchBalanceAmount(result receiptMatchValidationResult) float64 {
	balance := result.ReceiptAmount - result.Existing - result.Requested
	if balance <= receiptMatchAmountEpsilon {
		return 0
	}
	return balance
}

func receiptMatchTargetKey(req model.CreateReceiptMatchRequest) string {
	if req.SaleID != nil && *req.SaleID != "" {
		return "sale:" + *req.SaleID
	}
	if req.OutboundID != nil && *req.OutboundID != "" {
		return "outbound:" + *req.OutboundID
	}
	return ""
}

func receiptMatchStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func (h *ReceiptMatchHandler) completeReceiptTarget(req model.CompleteReceiptMatchRequest) (receiptCompleteTarget, int, string) {
	target := receiptCompleteTarget{}
	var (
		rows             []receiptMatchSaleRow
		extraOutboundIDs []string
		err              error
	)

	if saleID := receiptMatchStringPtr(req.SaleID); saleID != nil {
		rows, err = h.salesByField("sale_id", *saleID)
		target.MatchRequest.SaleID = saleID
	} else if outboundID := receiptMatchStringPtr(req.OutboundID); outboundID != nil {
		rows, err = h.salesByField("outbound_id", *outboundID)
		extraOutboundIDs = []string{*outboundID}
		target.MatchRequest.OutboundID = outboundID
	}
	if err != nil {
		log.Printf("[수금 완료] 매출 대상 조회 실패 err=%v", err)
		return target, http.StatusInternalServerError, "매출 대상 확인에 실패했습니다"
	}

	total, matched, err := h.saleTotalAndMatchedAmount(rows, extraOutboundIDs)
	if err != nil {
		log.Printf("[수금 완료] 매출/수금 합계 조회 실패 err=%v", err)
		return target, http.StatusInternalServerError, "매출 미수금 확인에 실패했습니다"
	}
	if total <= 0 {
		return target, http.StatusNotFound, "수금 완료 처리할 매출을 찾을 수 없습니다"
	}

	customerID := ""
	for _, row := range rows {
		if row.Status == "cancelled" || row.TotalAmount == nil || *row.TotalAmount <= 0 {
			continue
		}
		rowCustomerID := strings.TrimSpace(row.CustomerID)
		if rowCustomerID == "" {
			continue
		}
		if customerID == "" {
			customerID = rowCustomerID
			continue
		}
		if customerID != rowCustomerID {
			return target, http.StatusBadRequest, "하나의 수금 완료 처리에는 같은 거래처 매출만 포함할 수 있습니다"
		}
	}
	if customerID == "" {
		return target, http.StatusNotFound, "매출 거래처를 확인할 수 없습니다"
	}

	target.CustomerID = customerID
	target.TotalAmount = total
	target.MatchedAmount = matched
	return target, 0, ""
}

func (h *ReceiptMatchHandler) deleteReceiptBestEffort(receiptID string) {
	if receiptID == "" {
		return
	}
	if _, _, err := h.DB.From("receipts").Delete("", "").Eq("receipt_id", receiptID).Execute(); err != nil {
		log.Printf("[수금 완료] 수금 전표 cleanup 실패 receipt_id=%s err=%v", receiptID, err)
	}
}

func (h *ReceiptMatchHandler) fetchReceiptAmount(receiptID string) (float64, bool, error) {
	data, _, err := h.DB.From("receipts").
		Select("receipt_id, amount", "exact", false).
		Eq("receipt_id", receiptID).
		Execute()
	if err != nil {
		return 0, false, err
	}
	var rows []receiptAmountRow
	if err := json.Unmarshal(data, &rows); err != nil {
		return 0, false, err
	}
	if len(rows) == 0 {
		return 0, false, nil
	}
	return rows[0].Amount, true, nil
}

func (h *ReceiptMatchHandler) sumMatchesByField(field, value string) (float64, error) {
	data, _, err := h.DB.From("receipt_matches").
		Select("matched_amount", "exact", false).
		Eq(field, value).
		Execute()
	if err != nil {
		return 0, err
	}
	var rows []receiptMatchAmountOnlyRow
	if err := json.Unmarshal(data, &rows); err != nil {
		return 0, err
	}
	total := 0.0
	for _, row := range rows {
		total += row.MatchedAmount
	}
	return total, nil
}

func (h *ReceiptMatchHandler) targetSaleAndMatchedAmount(key string) (float64, float64, error) {
	if len(key) > len("outbound:") && key[:len("outbound:")] == "outbound:" {
		outboundID := key[len("outbound:"):]
		rows, err := h.salesByField("outbound_id", outboundID)
		if err != nil {
			return 0, 0, err
		}
		return h.saleTotalAndMatchedAmount(rows, []string{outboundID})
	}
	if len(key) > len("sale:") && key[:len("sale:")] == "sale:" {
		saleID := key[len("sale:"):]
		rows, err := h.salesByField("sale_id", saleID)
		if err != nil {
			return 0, 0, err
		}
		return h.saleTotalAndMatchedAmount(rows, nil)
	}
	return 0, 0, nil
}

func (h *ReceiptMatchHandler) salesByField(field, value string) ([]receiptMatchSaleRow, error) {
	data, _, err := h.DB.From("sales").
		Select("sale_id, outbound_id, customer_id, total_amount, status", "exact", false).
		Eq(field, value).
		Execute()
	if err != nil {
		return nil, err
	}
	var rows []receiptMatchSaleRow
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	return rows, nil
}

func (h *ReceiptMatchHandler) saleTotalAndMatchedAmount(rows []receiptMatchSaleRow, extraOutboundIDs []string) (float64, float64, error) {
	total := 0.0
	saleIDs := make(map[string]bool, len(rows))
	outboundIDs := make(map[string]bool, len(extraOutboundIDs)+len(rows))
	for _, outboundID := range extraOutboundIDs {
		if outboundID != "" {
			outboundIDs[outboundID] = true
		}
	}
	for _, row := range rows {
		if row.Status == "cancelled" || row.TotalAmount == nil {
			continue
		}
		total += *row.TotalAmount
		saleIDs[row.SaleID] = true
		if row.OutboundID != nil && *row.OutboundID != "" {
			outboundIDs[*row.OutboundID] = true
		}
	}
	matched, err := h.sumMatchesForTargets(outboundIDs, saleIDs)
	return total, matched, err
}

func (h *ReceiptMatchHandler) sumMatchesForTargets(outboundIDs map[string]bool, saleIDs map[string]bool) (float64, error) {
	if len(outboundIDs) == 0 && len(saleIDs) == 0 {
		return 0, nil
	}
	data, _, err := h.DB.From("receipt_matches").
		Select("outbound_id, sale_id, matched_amount", "exact", false).
		Execute()
	if err != nil {
		return 0, err
	}
	var rows []receiptMatchTargetAmountRow
	if err := json.Unmarshal(data, &rows); err != nil {
		return 0, err
	}
	total := 0.0
	for _, row := range rows {
		if row.OutboundID != nil && outboundIDs[*row.OutboundID] {
			total += row.MatchedAmount
			continue
		}
		if row.SaleID != nil && saleIDs[*row.SaleID] {
			total += row.MatchedAmount
		}
	}
	return total, nil
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
