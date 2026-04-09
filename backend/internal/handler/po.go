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

// POHandler — 발주/계약(purchase_orders) 관련 API를 처리하는 핸들러
// 비유: "발주 계약 관리실" — 제조사별 계약서를 관리하는 방
type POHandler struct {
	DB *supa.Client
}

// NewPOHandler — POHandler 생성자
func NewPOHandler(db *supa.Client) *POHandler {
	return &POHandler{DB: db}
}

// List — GET /api/v1/pos — 발주 목록 조회 (법인/제조사 정보 포함)
// 비유: 계약 관리실에서 전체 계약서 목록을 꺼내 보여주는 것
// TODO: Rust 계산엔진 연동 — PO 입고현황 집계 (계약량 vs LC개설 vs 선적 vs 입고)
func (h *POHandler) List(w http.ResponseWriter, r *http.Request) {
	// 평탄 응답: PostgREST FK 모호성으로 인한 unmarshal 실패 방지 (B/L과 동일 패턴)
	query := h.DB.From("purchase_orders").Select("*", "exact", false)

	// 비유: ?company_id=xxx — 특정 법인의 계약만 필터
	if compID := r.URL.Query().Get("company_id"); compID != "" && compID != "all" {
		query = query.Eq("company_id", compID)
	}

	// 비유: ?manufacturer_id=xxx — 특정 제조사의 계약만 필터
	if mfgID := r.URL.Query().Get("manufacturer_id"); mfgID != "" {
		query = query.Eq("manufacturer_id", mfgID)
	}

	// 비유: ?status=contracted — 특정 상태의 계약만 필터
	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq("status", status)
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[발주 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "발주 목록 조회에 실패했습니다")
		return
	}

	var orders []model.PurchaseOrder
	if err := json.Unmarshal(data, &orders); err != nil {
		log.Printf("[발주 목록 디코딩 실패] %v / raw=%s", err, string(data))
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, orders)
}

// GetByID — GET /api/v1/pos/{id} — 발주 상세 조회 (라인아이템, LC, TT 포함)
// 비유: 계약서를 펼쳐서 품목 명세, LC 서류, TT 송금 내역까지 모두 보여주는 것
// TODO: Rust 계산엔진 연동 — PO 입고현황 집계 (계약량 vs LC개설 vs 선적 vs 입고)
func (h *POHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// 비유: 계약서 본문 조회 (평탄 — 임베드 없음)
	poData, _, err := h.DB.From("purchase_orders").
		Select("*", "exact", false).
		Eq("po_id", id).
		Execute()
	if err != nil {
		log.Printf("[발주 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "발주 조회에 실패했습니다")
		return
	}

	var orders []model.PurchaseOrder
	if err := json.Unmarshal(poData, &orders); err != nil {
		log.Printf("[발주 상세 디코딩 실패] %v / raw=%s", err, string(poData))
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(orders) == 0 {
		response.RespondError(w, http.StatusNotFound, "발주를 찾을 수 없습니다")
		return
	}

	// 비유: 계약서에 첨부된 품목 명세 조회
	lineData, _, err := h.DB.From("po_line_items").
		Select("*, products(product_code, product_name, spec_wp, module_width_mm, module_height_mm)", "exact", false).
		Eq("po_id", id).
		Execute()
	if err != nil {
		log.Printf("[발주 라인아이템 조회 실패] po_id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 조회에 실패했습니다")
		return
	}

	var lines []model.POLineWithProduct
	if err := json.Unmarshal(lineData, &lines); err != nil {
		log.Printf("[발주 라인아이템 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 데이터 처리에 실패했습니다")
		return
	}

	// 비유: 계약서에 첨부된 LC 개설 내역 조회
	lcData, _, err := h.DB.From("lc_records").
		Select("*, banks(bank_name)", "exact", false).
		Eq("po_id", id).
		Execute()
	if err != nil {
		log.Printf("[발주 LC 조회 실패] po_id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "LC 조회에 실패했습니다")
		return
	}

	var lcs []model.LCRecordSummary
	if err := json.Unmarshal(lcData, &lcs); err != nil {
		log.Printf("[발주 LC 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "LC 데이터 처리에 실패했습니다")
		return
	}

	// 비유: 계약서에 첨부된 TT 송금 내역 조회
	ttData, _, err := h.DB.From("tt_remittances").
		Select("*", "exact", false).
		Eq("po_id", id).
		Execute()
	if err != nil {
		log.Printf("[발주 TT 조회 실패] po_id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "TT 조회에 실패했습니다")
		return
	}

	var tts []model.TTSummary
	if err := json.Unmarshal(ttData, &tts); err != nil {
		log.Printf("[발주 TT 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "TT 데이터 처리에 실패했습니다")
		return
	}

	// 비유: 계약서 + 품목 + LC + TT를 한 묶음으로 포장 (평탄 본문)
	detail := struct {
		model.PurchaseOrder
		LineItems     []model.POLineWithProduct `json:"line_items"`
		LCRecords     []model.LCRecordSummary   `json:"lc_records"`
		TTRemittances []model.TTSummary         `json:"tt_remittances"`
	}{
		PurchaseOrder: orders[0],
		LineItems:     lines,
		LCRecords:     lcs,
		TTRemittances: tts,
	}

	response.RespondJSON(w, http.StatusOK, detail)
}

// Create — POST /api/v1/pos — 발주 등록
// 비유: 새 계약서를 작성하여 관리실에 보관하는 것
func (h *POHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreatePurchaseOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[발주 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 접수 창구에서 계약서 필수 항목 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("purchase_orders").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[발주 등록 실패] req=%+v err=%v", req, err)
		response.RespondError(w, http.StatusInternalServerError, "발주 등록 실패: "+err.Error())
		return
	}

	var created []model.PurchaseOrder
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[발주 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "발주 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/pos/{id} — 발주 수정
// 비유: 기존 계약서의 내용을 수정하는 것
func (h *POHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdatePurchaseOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[발주 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	// F8: status 전환 감지를 위해 기존 상태 조회
	var prevStatus string
	{
		prev, _, perr := h.DB.From("purchase_orders").Select("status", "exact", false).Eq("po_id", id).Execute()
		if perr == nil {
			var rows []struct {
				Status string `json:"status"`
			}
			if json.Unmarshal(prev, &rows) == nil && len(rows) > 0 {
				prevStatus = rows[0].Status
			}
		}
	}

	data, _, err := h.DB.From("purchase_orders").
		Update(req, "", "").
		Eq("po_id", id).
		Execute()
	if err != nil {
		log.Printf("[발주 수정 실패] id=%s req=%+v err=%v", id, req, err)
		response.RespondError(w, http.StatusInternalServerError, "발주 수정 실패: "+err.Error())
		return
	}

	var updated []model.PurchaseOrder
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[발주 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 발주를 찾을 수 없습니다")
		return
	}

	// F8: draft → contracted 전환 시 단가이력 자동 등록
	if req.Status != nil && *req.Status == "contracted" && prevStatus != "contracted" {
		h.autoInsertPriceHistory(id, updated[0])
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// F8: PO status가 contracted로 전환될 때 각 발주품목의 단가이력 자동 등록
// 비유: 계약이 확정되면 단가 변동 장부에 자동으로 기록
func (h *POHandler) autoInsertPriceHistory(poID string, po model.PurchaseOrder) {
	// 발주품목 조회
	linesData, _, err := h.DB.From("po_line_items").
		Select("*", "exact", false).
		Eq("po_id", poID).
		Execute()
	if err != nil {
		log.Printf("[단가이력 자동등록: 발주품목 조회 실패] po_id=%s err=%v", poID, err)
		return
	}
	var lines []struct {
		ProductID    string   `json:"product_id"`
		UnitPriceUSD *float64 `json:"unit_price_usd"`
	}
	if err := json.Unmarshal(linesData, &lines); err != nil {
		log.Printf("[단가이력 자동등록: 발주품목 디코딩 실패] %v", err)
		return
	}

	changeDate := po.ContractDate
	if changeDate == nil || *changeDate == "" {
		// fallback — 기존 row 사용 불가 시 skip
		log.Printf("[단가이력 자동등록: contract_date 없음] po_id=%s", poID)
		return
	}
	reason := "PO 계약완료 자동등록"

	for _, l := range lines {
		if l.UnitPriceUSD == nil || *l.UnitPriceUSD <= 0 {
			continue
		}
		// 동일 (product_id, related_po_id) 이미 존재하면 skip (idempotency)
		exists, _, eerr := h.DB.From("price_histories").
			Select("price_history_id", "exact", false).
			Eq("product_id", l.ProductID).
			Eq("related_po_id", poID).
			Execute()
		if eerr == nil {
			var existRows []struct {
				ID string `json:"price_history_id"`
			}
			if json.Unmarshal(exists, &existRows) == nil && len(existRows) > 0 {
				continue
			}
		}

		row := model.CreatePriceHistoryRequest{
			ProductID:      l.ProductID,
			ManufacturerID: po.ManufacturerID,
			CompanyID:      po.CompanyID,
			ChangeDate:     *changeDate,
			NewPrice:       *l.UnitPriceUSD,
			Reason:         &reason,
			RelatedPOID:    &poID,
		}
		_, _, ierr := h.DB.From("price_histories").Insert(row, false, "", "", "").Execute()
		if ierr != nil {
			log.Printf("[단가이력 자동등록 실패] product_id=%s err=%v", l.ProductID, ierr)
		}
	}
	log.Printf("[단가이력 자동등록 완료] po_id=%s lines=%d", poID, len(lines))
}

// Delete — DELETE /api/v1/pos/{id} — 발주 삭제
// 비유: 발주 서류를 파기하는 것 — 연결된 라인아이템도 함께 삭제
func (h *POHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// 라인아이템 먼저 삭제 (FK 제약)
	_, _, _ = h.DB.From("po_line_items").
		Delete("", "").
		Eq("po_id", id).
		Execute()

	// PO 본체 삭제
	_, _, err := h.DB.From("purchase_orders").
		Delete("", "").
		Eq("po_id", id).
		Execute()
	if err != nil {
		log.Printf("[발주 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "발주 삭제에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}
