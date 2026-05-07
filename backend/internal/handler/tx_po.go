package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	postgrest "github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/dbrpc"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// poSortable — server-side 정렬 허용 컬럼 (BL 패턴과 동일).
// purchase_orders_ext 뷰의 컬럼만 허용 — 사용자가 임의 컬럼명 보내도 무시.
var poSortable = map[string]struct{}{
	"po_number":     {},
	"contract_date": {},
	"contract_type": {},
	"status":        {},
	"total_mw":      {},
	"total_qty":     {},
	"created_at":    {},
}

// POHandler — 발주/계약(purchase_orders) 관련 API를 처리하는 핸들러
// 비유: "발주 계약 관리실" — 제조사별 계약서를 관리하는 방
type POHandler struct {
	DB *supa.Client
}

func sanitizePOSearchTerm(q string) string {
	q = strings.TrimSpace(q)
	if q == "" {
		return ""
	}
	replacer := strings.NewReplacer(",", " ", "(", " ", ")", " ", ".", " ", "*", " ", "\"", " ")
	return strings.TrimSpace(replacer.Replace(q))
}

type deletePurchaseOrderRPCRequest struct {
	POID string `json:"p_po_id"`
}

type poStatusUpdate struct {
	Status string `json:"status"`
}

// NewPOHandler — POHandler 생성자
func NewPOHandler(db *supa.Client) *POHandler {
	return &POHandler{DB: db}
}

func (h *POHandler) applyPOFilters(r *http.Request, query *postgrest.FilterBuilder) *postgrest.FilterBuilder {
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

	// 비유: ?contract_type=spot — 계약 유형(spot/annual_frame/half_year_frame) 필터
	if ct := r.URL.Query().Get("contract_type"); ct != "" {
		query = query.Eq("contract_type", ct)
	}
	switch r.URL.Query().Get("quick_filter") {
	case "active_only":
		query = query.Not("status", "in", "(completed,cancelled)")
	case "missing_number":
		query = query.Is("po_number", "null")
	case "changed_contract":
		query = query.Not("parent_po_id", "is", "null")
	}
	// 기간 — contract_date 범위 (양끝 포함, ISO date YYYY-MM-DD).
	// frontend ProcurementPage 의 date_range filter 서버 위임 (이전엔 page 안 client filter).
	if from := r.URL.Query().Get("contract_date_from"); from != "" {
		query = query.Gte("contract_date", from)
	}
	if to := r.URL.Query().Get("contract_date_to"); to != "" {
		query = query.Lte("contract_date", to)
	}
	// 검색 — po_number/manufacturer_name/payment_terms/memo ilike. parent_po_id 와 같은 구조 필드는 제외.
	if q := sanitizePOSearchTerm(r.URL.Query().Get("q")); q != "" {
		clauses := []string{
			fmt.Sprintf("po_number.ilike.*%s*", q),
			fmt.Sprintf("manufacturer_name.ilike.*%s*", q),
			fmt.Sprintf("payment_terms.ilike.*%s*", q),
			fmt.Sprintf("memo.ilike.*%s*", q),
		}
		query = query.Or(strings.Join(clauses, ","), "")
	}
	return query
}

func parsePOSort(r *http.Request) (column string, ascending bool) {
	column = "contract_date"
	ascending = false
	if raw := r.URL.Query().Get("sort"); raw != "" {
		if _, ok := poSortable[raw]; ok {
			column = raw
		}
	}
	if r.URL.Query().Get("order") == "asc" {
		ascending = true
	}
	return column, ascending
}

// List — GET /api/v1/pos — 발주 목록 조회 (법인/제조사 정보 포함)
// 비유: 계약 관리실에서 전체 계약서 목록을 꺼내 보여주는 것
// PO 입고현황은 D-061 패턴에 따라 프론트에서 소규모 합산한다.
func (h *POHandler) List(w http.ResponseWriter, r *http.Request) {
	// purchase_orders_ext: manufacturer_name(name_kr alias) 포함 뷰
	query := h.DB.From("purchase_orders_ext").Select("*", "exact", false)
	query = h.applyPOFilters(r, query)

	sortCol, asc := parsePOSort(r)
	query = query.Order(sortCol, &postgrest.OrderOpts{Ascending: asc})

	limit, offset := parseLimitOffset(r, 100, 1000)
	data, count, err := query.Range(offset, offset+limit-1, "").Execute()
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

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, orders)
}

type poSummaryRow struct {
	POID         string   `json:"po_id"`
	Status       string   `json:"status"`
	ContractType string   `json:"contract_type"`
	ContractDate *string  `json:"contract_date"`
	TotalMW      *float64 `json:"total_mw"`
}

type POSummary struct {
	Total          int64               `json:"total"`
	ActiveCount    int64               `json:"active_count"`
	ShippingCount  int64               `json:"shipping_count"`
	TotalMW        float64             `json:"total_mw"`
	ByStatus       map[string]int64    `json:"by_status"`
	ByContractType map[string]int64    `json:"by_contract_type"`
	MonthlyCount   []summaryMonthPoint `json:"monthly_count"`
}

// Summary — GET /api/v1/pos/summary — P/O KPI 카드용 전체 집계.
// 비유: 계약서 원본을 전부 들고 오지 않고, 총권수·상태·MW 숫자만 계산해 주는 회계표.
func (h *POHandler) Summary(w http.ResponseWriter, r *http.Request) {
	rows, total, err := fetchAllSummaryRows[poSummaryRow](func() *postgrest.FilterBuilder {
		q := h.DB.From("purchase_orders_ext").
			Select("po_id,status,contract_type,contract_date,total_mw", "exact", false)
		return h.applyPOFilters(r, q)
	})
	if err != nil {
		log.Printf("[발주 요약 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "발주 요약 조회에 실패했습니다")
		return
	}

	byStatus := map[string]int64{}
	byContractType := map[string]int64{}
	monthly := map[string]int64{}
	summary := POSummary{
		Total:          total,
		ByStatus:       byStatus,
		ByContractType: byContractType,
	}
	if total == 0 {
		summary.Total = int64(len(rows))
	}
	for _, row := range rows {
		incrementCount(byStatus, row.Status)
		incrementCount(byContractType, row.ContractType)
		if row.Status != "completed" && row.Status != "cancelled" {
			summary.ActiveCount++
		}
		if row.Status == "shipping" || row.Status == "in_progress" {
			summary.ShippingCount++
		}
		if row.TotalMW != nil {
			summary.TotalMW += *row.TotalMW
		}
		if month := dateMonth(row.ContractDate); month != "" {
			monthly[month]++
		}
	}
	summary.MonthlyCount = recentMonthCounts(monthly, 6)
	response.RespondJSON(w, http.StatusOK, summary)
}

// GetByID — GET /api/v1/pos/{id} — 발주 상세 조회 (라인아이템, LC, TT 포함)
// 비유: 계약서를 펼쳐서 품목 명세, LC 서류, TT 송금 내역까지 모두 보여주는 것
// PO 입고현황은 D-061 패턴에 따라 프론트에서 소규모 합산한다.
func (h *POHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// 비유: 계약서 본문 조회 (purchase_orders_ext 뷰 = manufacturer_name 포함)
	poData, _, err := h.DB.From("purchase_orders_ext").
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
	if msg := validateNestedPOLines(req.LineItems); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	// 비유: 계약서 본문과 품목 명세표를 같은 봉투에 넣어 DB 함수로 접수한다.
	data, err := dbrpc.Call(r.Context(), "sf_create_purchase_order_with_lines", model.CreatePurchaseOrderWithLinesRPCRequest{
		PO:    model.NewPurchaseOrderInsert(req),
		Lines: req.LineItems,
	})
	if err != nil {
		log.Printf("[발주 등록 실패] req=%+v err=%v", req, err)
		response.RespondError(w, dbrpc.StatusCode(err, http.StatusInternalServerError), "발주 등록에 실패했습니다")
		return
	}

	var created model.PurchaseOrder
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[발주 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if created.POID == "" {
		response.RespondError(w, http.StatusInternalServerError, "발주 등록 결과를 확인할 수 없습니다")
		return
	}

	writeAuditLog(h.DB, r, "purchase_orders", created.POID, "create", nil, auditRawFromValue(struct {
		PO    model.PurchaseOrder         `json:"po"`
		Lines []model.CreatePOLineRequest `json:"lines,omitempty"`
	}{PO: created, Lines: req.LineItems}), "")
	response.RespondJSON(w, http.StatusCreated, created)
}

func validateNestedPOLines(lines []model.CreatePOLineRequest) string {
	for i, line := range lines {
		n := i + 1
		if line.ProductID == "" {
			return strconv.Itoa(n) + "번 라인의 product_id는 필수 항목입니다"
		}
		if line.Quantity <= 0 {
			return strconv.Itoa(n) + "번 라인의 quantity는 양수여야 합니다"
		}
		if line.UnitPriceUSD != nil && *line.UnitPriceUSD <= 0 {
			return strconv.Itoa(n) + "번 라인의 unit_price_usd는 양수여야 합니다"
		}
		if line.UnitPriceUSDWp != nil && *line.UnitPriceUSDWp <= 0 {
			return strconv.Itoa(n) + "번 라인의 unit_price_usd_wp는 양수여야 합니다"
		}
		if line.TotalAmountUSD != nil && *line.TotalAmountUSD <= 0 {
			return strconv.Itoa(n) + "번 라인의 total_amount_usd는 양수여야 합니다"
		}
		if line.ItemType != nil && !allowedItemTypes[*line.ItemType] {
			return strconv.Itoa(n) + "번 라인의 item_type은 main/spare 중 하나여야 합니다"
		}
		if line.PaymentType != nil && !allowedPaymentTypes[*line.PaymentType] {
			return strconv.Itoa(n) + "번 라인의 payment_type은 paid/free 중 하나여야 합니다"
		}
	}
	return ""
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

	oldSnapshot, _, oldErr := auditSnapshot(h.DB, "purchase_orders", "po_id", id)
	if oldErr != nil {
		log.Printf("[발주 수정 전 감사 스냅샷 조회 실패] id=%s err=%v", id, oldErr)
	}

	// F8: status 전환 감지를 위해 기존 상태 조회
	var prevStatus string
	{
		prev, _, perr := h.DB.From("purchase_orders").Select("status", "exact", false).Eq("po_id", id).Execute()
		if perr != nil {
			log.Printf("[발주 기존 상태 조회 실패] po_id=%s err=%v", id, perr)
			response.RespondError(w, http.StatusInternalServerError, "발주 기존 상태 조회에 실패했습니다")
			return
		}
		var rows []struct {
			Status string `json:"status"`
		}
		if err := json.Unmarshal(prev, &rows); err != nil {
			log.Printf("[발주 기존 상태 디코딩 실패] po_id=%s err=%v", id, err)
			response.RespondError(w, http.StatusInternalServerError, "발주 기존 상태 처리에 실패했습니다")
			return
		}
		if len(rows) > 0 {
			prevStatus = rows[0].Status
		}
	}

	data, _, err := h.DB.From("purchase_orders").
		Update(req, "", "").
		Eq("po_id", id).
		Execute()
	if err != nil {
		log.Printf("[발주 수정 실패] id=%s req=%+v err=%v", id, req, err)
		response.RespondError(w, http.StatusInternalServerError, "발주 수정에 실패했습니다")
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

	// F8: draft → contracted 전환 시 단가이력 자동 등록.
	// PUT/PATCH 모두 본 핸들러로 들어오므로 메타 인라인 편집 (PATCH /pos/:id { status: 'contracted' })
	// 도 동일하게 트리거된다.
	if shouldAutoInsertPriceHistory(req.Status, prevStatus) {
		h.autoInsertPriceHistory(id, updated[0])
	}

	auditEntityByRouteID(h.DB, r, "purchase_orders", "po_id", "update", oldSnapshot, auditRawFromValue(updated[0]), "")
	response.RespondJSON(w, http.StatusOK, updated[0])
}

// shouldAutoInsertPriceHistory — 단가이력 자동 등록 게이트.
// 비유: contracted로 새로 전환됐을 때만 기록. 이미 contracted였거나 다른 상태로 가는 경우는 skip.
// pure 함수 — DB 의존 없이 단위테스트로 회귀 방지 (PUT/PATCH 양쪽 동일하게 동작 보장).
func shouldAutoInsertPriceHistory(reqStatus *string, prevStatus string) bool {
	if reqStatus == nil {
		return false
	}
	return *reqStatus == "contracted" && prevStatus != "contracted"
}

// F8: PO status가 contracted로 전환될 때 각 발주품목의 단가이력 자동 등록
// 비유: 계약이 확정되면 단가 변동 장부에 자동으로 기록
func (h *POHandler) autoInsertPriceHistory(poID string, po model.PurchaseOrder) {
	// 발주품목 조회
	linesData, _, err := h.DB.From("po_line_items").
		Select("*, products(spec_wp)", "exact", false).
		Eq("po_id", poID).
		Execute()
	if err != nil {
		log.Printf("[단가이력 자동등록: 발주품목 조회 실패] po_id=%s err=%v", poID, err)
		return
	}
	var lines []struct {
		ProductID      string   `json:"product_id"`
		UnitPriceUSD   *float64 `json:"unit_price_usd"`
		UnitPriceUSDWp *float64 `json:"unit_price_usd_wp"`
		Products       *struct {
			SpecWP *float64 `json:"spec_wp"`
		} `json:"products"`
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
	// 원계약(parent_po_id) 있으면 "계약변경", 없으면 "최초계약"
	reasonStr := "최초계약"
	if po.ParentPOID != nil && *po.ParentPOID != "" {
		reasonStr = "계약변경"
	}
	reason := reasonStr

	for _, l := range lines {
		newPrice, ok := priceHistoryUSDWp(l.UnitPriceUSD, l.UnitPriceUSDWp, productSpecWP(l.Products))
		if !ok {
			continue
		}
		// 동일 (product_id, related_po_id) 이미 존재하면 skip (idempotency)
		exists, _, eerr := h.DB.From("price_histories").
			Select("price_history_id", "exact", false).
			Eq("product_id", l.ProductID).
			Eq("related_po_id", poID).
			Execute()
		if eerr != nil {
			log.Printf("[단가이력 자동등록: 기존 이력 조회 실패] po_id=%s product_id=%s err=%v", poID, l.ProductID, eerr)
			continue
		}
		var existRows []struct {
			ID string `json:"price_history_id"`
		}
		if err := json.Unmarshal(exists, &existRows); err != nil {
			log.Printf("[단가이력 자동등록: 기존 이력 디코딩 실패] po_id=%s product_id=%s err=%v", poID, l.ProductID, err)
			continue
		}
		if len(existRows) > 0 {
			continue
		}

		row := model.CreatePriceHistoryRequest{
			ProductID:      l.ProductID,
			ManufacturerID: po.ManufacturerID,
			CompanyID:      po.CompanyID,
			ChangeDate:     *changeDate,
			NewPrice:       newPrice,
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

func productSpecWP(product *struct {
	SpecWP *float64 `json:"spec_wp"`
}) *float64 {
	if product == nil {
		return nil
	}
	return product.SpecWP
}

func priceHistoryUSDWp(unitPriceUSD, unitPriceUSDWp, specWP *float64) (float64, bool) {
	if unitPriceUSDWp != nil && *unitPriceUSDWp > 0 {
		return *unitPriceUSDWp, true
	}
	if unitPriceUSD != nil && *unitPriceUSD > 0 && specWP != nil && *specWP > 0 {
		return *unitPriceUSD / *specWP, true
	}
	return 0, false
}

// Delete — DELETE /api/v1/pos/{id} — 발주 취소 처리
// 운영 데이터 보존: 실제 삭제 대신 status=cancelled로 남겨 감사 추적 가능하게 한다.
func (h *POHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	oldSnapshot, _, oldErr := auditSnapshot(h.DB, "purchase_orders", "po_id", id)
	if oldErr != nil {
		log.Printf("[발주 취소 전 감사 스냅샷 조회 실패] id=%s err=%v", id, oldErr)
	}

	if err := callRPC(h.DB, "sf_delete_purchase_order", deletePurchaseOrderRPCRequest{POID: id}); err != nil {
		log.Printf("[발주 트랜잭션 취소 실패] id=%s, err=%v", id, err)
		if isRPCNotFound(err) {
			response.RespondError(w, http.StatusNotFound, "발주를 찾을 수 없습니다")
			return
		}
		response.RespondError(w, http.StatusInternalServerError, "발주 취소에 실패했습니다")
		return
	}

	newSnapshot, _, snapErr := auditSnapshot(h.DB, "purchase_orders", "po_id", id)
	if snapErr != nil {
		log.Printf("[발주 취소 후 감사 스냅샷 조회 실패] id=%s err=%v", id, snapErr)
	}
	auditEntityByRouteID(h.DB, r, "purchase_orders", "po_id", "delete", oldSnapshot, newSnapshot, "soft_cancel")
	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "cancelled"})
}
