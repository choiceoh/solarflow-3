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

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

const (
	blDefaultLimit = 100
	blMaxLimit     = 1000
)

var blSortable = map[string]struct{}{
	"bl_number":      {},
	"etd":            {},
	"eta":            {},
	"actual_arrival": {},
	"status":         {},
	"inbound_type":   {},
	"created_at":     {},
}

// BLHandler — B/L(입고/선적) 관련 API를 처리하는 핸들러
// 비유: "선적 서류 관리실" — 수입/국내/그룹 내 입고 서류를 관리
type BLHandler struct {
	DB *supa.Client
}

// NewBLHandler — BLHandler 생성자
func NewBLHandler(db *supa.Client) *BLHandler {
	return &BLHandler{DB: db}
}

func sanitizeBLSearchTerm(q string) string {
	q = strings.TrimSpace(q)
	if q == "" {
		return ""
	}
	replacer := strings.NewReplacer(",", " ", "(", " ", ")", " ", ".", " ", "*", " ", "\"", " ")
	return strings.TrimSpace(replacer.Replace(q))
}

func (h *BLHandler) applyBLFilters(r *http.Request, query *postgrest.FilterBuilder) *postgrest.FilterBuilder {
	if poID := r.URL.Query().Get("po_id"); poID != "" {
		query = query.Eq("po_id", poID)
	}
	if lcID := r.URL.Query().Get("lc_id"); lcID != "" {
		query = query.Eq("lc_id", lcID)
	}
	if compID := r.URL.Query().Get("company_id"); compID != "" && compID != "all" {
		query = query.Eq("company_id", compID)
	}
	if mfgID := r.URL.Query().Get("manufacturer_id"); mfgID != "" {
		query = query.Eq("manufacturer_id", mfgID)
	}
	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq("status", status)
	}
	if inboundType := r.URL.Query().Get("inbound_type"); inboundType != "" {
		query = query.Eq("inbound_type", inboundType)
	}
	if q := sanitizeBLSearchTerm(r.URL.Query().Get("q")); q != "" {
		clauses := []string{
			fmt.Sprintf("bl_number.ilike.*%s*", q),
			fmt.Sprintf("invoice_number.ilike.*%s*", q),
			fmt.Sprintf("declaration_number.ilike.*%s*", q),
			fmt.Sprintf("port.ilike.*%s*", q),
			fmt.Sprintf("forwarder.ilike.*%s*", q),
		}
		query = query.Or(strings.Join(clauses, ","), "")
	}
	return query
}

func parseBLSort(r *http.Request) (column string, ascending bool) {
	column = "eta"
	ascending = false
	if raw := r.URL.Query().Get("sort"); raw != "" {
		if _, ok := blSortable[raw]; ok {
			column = raw
		}
	}
	if r.URL.Query().Get("order") == "asc" {
		ascending = true
	}
	return column, ascending
}

// List — GET /api/v1/bls — B/L 목록 조회 (서버사이드 페이지·검색·정렬).
func (h *BLHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("bl_shipments").Select("*", "exact", false)
	query = h.applyBLFilters(r, query)

	sortCol, asc := parseBLSort(r)
	query = query.Order(sortCol, &postgrest.OrderOpts{Ascending: asc})

	limit, offset := parseLimitOffset(r, blDefaultLimit, blMaxLimit)
	query = query.Range(offset, offset+limit-1, "")

	data, count, err := query.Execute()
	if err != nil {
		log.Printf("[B/L 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "B/L 목록 조회에 실패했습니다")
		return
	}

	var shipments []model.BLShipment
	if err := json.Unmarshal(data, &shipments); err != nil {
		log.Printf("[B/L 목록 디코딩 실패] %v / raw=%s", err, string(data))
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, shipments)
}

// BLSummary — KPI 카드용 집계.
type BLSummary struct {
	Total          int64 `json:"total"`
	ShippingCount  int64 `json:"shipping_count"`
	ArrivedCount   int64 `json:"arrived_count"`
	ClearedCount   int64 `json:"cleared_count"`
	CancelledCount int64 `json:"cancelled_count"`
}

// Summary — GET /api/v1/bls/summary — status 별 카운트.
func (h *BLHandler) Summary(w http.ResponseWriter, r *http.Request) {
	q := h.DB.From("bl_shipments").Select("bl_id", "exact", true)
	q = h.applyBLFilters(r, q)
	summary := BLSummary{}
	if _, c, err := q.Range(0, 0, "").Execute(); err == nil {
		summary.Total = c
	}
	for _, st := range []struct {
		key    string
		target *int64
	}{
		{"shipping", &summary.ShippingCount},
		{"arrived", &summary.ArrivedCount},
		{"cleared", &summary.ClearedCount},
		{"cancelled", &summary.CancelledCount},
	} {
		sub := h.DB.From("bl_shipments").Select("bl_id", "exact", true)
		sub = h.applyBLFilters(r, sub).Eq("status", st.key)
		if _, c, err := sub.Range(0, 0, "").Execute(); err == nil {
			*st.target = c
		}
	}
	response.RespondJSON(w, http.StatusOK, summary)
}

// GetByID — GET /api/v1/bls/{id} — B/L 상세 조회 (라인아이템 포함)
// 비유: 선적 서류를 펼쳐서 화물 명세까지 모두 보여주는 것
// 주의: 목록과 동일하게 PostgREST 임베드(companies/manufacturers/warehouses)는
// FK 모호성(company_id ↔ counterpart_company_id) 때문에 단일 객체 대신 배열을
// 반환할 수 있어 unmarshal 실패의 원인이 됨. 임베드 제거하고 평탄 반환.
// 마스터 이름이 필요하면 화면에서 별도 API로 룩업.
// Rust 재고 집계는 /api/v1/calc/inventory 프록시가 담당한다.
func (h *BLHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// 비유: 선적 서류 본문 조회 (평탄 — 임베드 없음)
	blData, _, err := h.DB.From("bl_shipments").
		Select("*", "exact", false).
		Eq("bl_id", id).
		Execute()
	if err != nil {
		log.Printf("[B/L 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "B/L 조회에 실패했습니다")
		return
	}

	var shipments []model.BLShipment
	if err := json.Unmarshal(blData, &shipments); err != nil {
		log.Printf("[B/L 상세 디코딩 실패] %v / raw=%s", err, string(blData))
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(shipments) == 0 {
		response.RespondError(w, http.StatusNotFound, "B/L을 찾을 수 없습니다")
		return
	}

	// PO번호/LC번호 별도 조회 (company FK 모호성으로 임베드 불가 — 단일 쿼리로 대체)
	var poNumber, lcNumber *string
	if shipments[0].POID != nil {
		poData, _, perr := h.DB.From("purchase_orders").
			Select("po_number", "exact", false).
			Eq("po_id", *shipments[0].POID).
			Execute()
		if perr == nil {
			var pos []struct {
				PONumber *string `json:"po_number"`
			}
			if err := json.Unmarshal(poData, &pos); err != nil {
				log.Printf("[B/L 상세] PO번호 디코딩 실패 po_id=%s err=%v — po_number 비표시", *shipments[0].POID, err)
			} else if len(pos) > 0 {
				poNumber = pos[0].PONumber
			}
		}
	}
	if shipments[0].LCID != nil {
		lcData, _, lerr := h.DB.From("lc_records").
			Select("lc_number", "exact", false).
			Eq("lc_id", *shipments[0].LCID).
			Execute()
		if lerr == nil {
			var lcs []struct {
				LCNumber *string `json:"lc_number"`
			}
			if err := json.Unmarshal(lcData, &lcs); err != nil {
				log.Printf("[B/L 상세] LC번호 디코딩 실패 lc_id=%s err=%v — lc_number 비표시", *shipments[0].LCID, err)
			} else if len(lcs) > 0 {
				lcNumber = lcs[0].LCNumber
			}
		}
	}

	// 비유: 선적 서류에 첨부된 화물 명세 조회 (products 임베드 — 단일 FK라 모호성 없음)
	lineData, _, err := h.DB.From("bl_line_items").
		Select("*, products(product_code, product_name, spec_wp, module_width_mm, module_height_mm)", "exact", false).
		Eq("bl_id", id).
		Execute()
	if err != nil {
		log.Printf("[B/L 라인아이템 조회 실패] bl_id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 조회에 실패했습니다")
		return
	}

	var lines []model.BLLineWithProduct
	if err := json.Unmarshal(lineData, &lines); err != nil {
		log.Printf("[B/L 라인아이템 디코딩 실패] %v / raw=%s", err, string(lineData))
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 데이터 처리에 실패했습니다")
		return
	}

	// 비유: 선적 서류 + 화물 명세를 한 묶음으로 포장 (평탄 본문 + 라인)
	detail := struct {
		model.BLShipment
		PONumber  *string                   `json:"po_number"`
		LCNumber  *string                   `json:"lc_number"`
		LineItems []model.BLLineWithProduct `json:"line_items"`
	}{
		BLShipment: shipments[0],
		PONumber:   poNumber,
		LCNumber:   lcNumber,
		LineItems:  lines,
	}

	response.RespondJSON(w, http.StatusOK, detail)
}

// Create — POST /api/v1/bls — B/L 등록
// 비유: 새 선적 서류를 작성하여 관리실에 보관하는 것
func (h *BLHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateBLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[B/L 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 접수 창구에서 선적 서류 필수 항목 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("bl_shipments").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[B/L 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "B/L 등록에 실패했습니다")
		return
	}

	var created []model.BLShipment
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[B/L 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "B/L 등록 결과를 확인할 수 없습니다")
		return
	}

	// R1-4: PO 연결된 B/L이면 PO 상태 자동 전환 (draft/contracted → shipping)
	if req.POID != nil && *req.POID != "" {
		h.syncPOStatus(*req.POID)
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// syncPOStatus — BL 등록/수정/상태변경 시 PO 상태를 자동 전환 (R1-4)
//   - 해당 PO에 BL이 1건 이상 → shipping
//   - 해당 PO의 모든 BL 수량 합 >= PO total_qty → completed
//
// 주의: 실패는 로그만 남기고 무시 (본 요청 성공에 영향 없음).
func (h *BLHandler) syncPOStatus(poID string) {
	// PO 현재 상태 조회
	poData, _, err := h.DB.From("purchase_orders").
		Select("po_id, status, total_qty", "exact", false).
		Eq("po_id", poID).
		Execute()
	if err != nil {
		log.Printf("[PO 상태 동기화] 조회 실패 po_id=%s err=%v", poID, err)
		return
	}
	var pos []struct {
		POID     string `json:"po_id"`
		Status   string `json:"status"`
		TotalQty *int   `json:"total_qty"`
	}
	if err := json.Unmarshal(poData, &pos); err != nil || len(pos) == 0 {
		return
	}
	current := pos[0]

	// 해당 PO의 모든 BL + 라인 집계
	blData, _, err := h.DB.From("bl_shipments").
		Select("bl_id, status", "exact", false).
		Eq("po_id", poID).
		Execute()
	if err != nil {
		log.Printf("[PO 상태 동기화] BL 조회 실패 po_id=%s err=%v", poID, err)
		return
	}
	var bls []struct {
		BLID   string `json:"bl_id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(blData, &bls); err != nil {
		return
	}
	if len(bls) == 0 {
		// BL 0건: draft/contracted 유지
		return
	}

	// 목표 상태 결정
	// - BL 1건 이상 있으면 → in_progress (shipping 대체)
	// - 전량 입고 완료 시에도 in_progress 유지 → 사용자 수동으로 completed 처리
	targetStatus := current.Status
	if current.Status != "completed" {
		targetStatus = "in_progress"
	}

	if targetStatus == current.Status {
		return
	}
	// completed 상태를 BL sync로 역전시키지 않음
	if current.Status == "completed" {
		return
	}
	update := map[string]string{"status": targetStatus}
	_, _, uerr := h.DB.From("purchase_orders").
		Update(update, "", "").
		Eq("po_id", poID).
		Execute()
	if uerr != nil {
		log.Printf("[PO 상태 동기화] 업데이트 실패 po_id=%s target=%s err=%v", poID, targetStatus, uerr)
		return
	}
	log.Printf("[PO 상태 동기화] po_id=%s %s → %s", poID, current.Status, targetStatus)
}

// Update — PUT /api/v1/bls/{id} — B/L 수정
// 비유: 기존 선적 서류의 내용을 수정하는 것
func (h *BLHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateBLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[B/L 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	// R3: 입고완료/erp_done 전환 시 면장환율(exchange_rate) NULL 가드 — 해외직수입(USD)만
	if req.Status != nil && (*req.Status == "completed" || *req.Status == "erp_done") {
		curData, _, cerr := h.DB.From("bl_shipments").
			Select("currency, exchange_rate, inbound_type", "exact", false).
			Eq("bl_id", id).
			Execute()
		if cerr == nil {
			var curRows []struct {
				Currency     *string  `json:"currency"`
				ExchangeRate *float64 `json:"exchange_rate"`
				InboundType  *string  `json:"inbound_type"`
			}
			if uerr := json.Unmarshal(curData, &curRows); uerr == nil && len(curRows) > 0 {
				cur := curRows[0]
				isUSD := (cur.Currency != nil && *cur.Currency == "USD") || (cur.InboundType != nil && *cur.InboundType == "import")
				newEx := cur.ExchangeRate
				if req.ExchangeRate != nil {
					newEx = req.ExchangeRate
				}
				if isUSD && (newEx == nil || *newEx <= 0) {
					response.RespondError(w, http.StatusBadRequest, "면장환율을 입력해야 입고완료로 전환할 수 있습니다")
					return
				}
			}
		}
	}

	data, _, err := h.DB.From("bl_shipments").
		Update(req, "", "").
		Eq("bl_id", id).
		Execute()
	if err != nil {
		log.Printf("[B/L 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "B/L 수정에 실패했습니다")
		return
	}

	var updated []model.BLShipment
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[B/L 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	// R1-4: PO 연결된 B/L 상태 변경 시 PO 자동 전환 (shipping → completed 등)
	if len(updated) > 0 && updated[0].POID != nil && *updated[0].POID != "" {
		h.syncPOStatus(*updated[0].POID)
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 B/L을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/bls/{id} — B/L 삭제
// 비유: 선적 서류를 파기하는 것 — 연결된 라인아이템도 함께 삭제
func (h *BLHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// 라인아이템 먼저 삭제 (FK 제약 때문에 본체보다 선행)
	// 해당 B/L에 라인아이템이 없어도 에러 아님
	_, _, err := h.DB.From("bl_line_items").
		Delete("", "").
		Eq("bl_id", id).
		Execute()
	if err != nil {
		log.Printf("[B/L 라인아이템 삭제 실패] bl_id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 삭제에 실패했습니다")
		return
	}

	// B/L 본체 삭제
	// Delete("", "") — returning="" 이므로 삭제된 행을 반환하지 않음
	_, _, err = h.DB.From("bl_shipments").
		Delete("", "").
		Eq("bl_id", id).
		Execute()
	if err != nil {
		log.Printf("[B/L 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "B/L 삭제에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}
