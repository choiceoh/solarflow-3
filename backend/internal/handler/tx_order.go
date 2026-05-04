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
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

const (
	orderDefaultLimit = 100
	orderMaxLimit     = 1000
)

var orderSortable = map[string]struct{}{
	"order_date":          {},
	"order_number":        {},
	"site_name":           {},
	"quantity":            {},
	"capacity_kw":         {},
	"unit_price_wp":       {},
	"status":              {},
	"management_category": {},
	"created_at":          {},
}

// OrderHandler — 수주(orders) 관련 API를 처리하는 핸들러
// 비유: "수주 관리실" — 고객별 판매 주문서를 관리
type OrderHandler struct {
	DB *supa.Client
}

// NewOrderHandler — OrderHandler 생성자
func NewOrderHandler(db *supa.Client) *OrderHandler {
	return &OrderHandler{DB: db}
}

// idsByName — partners/products 이름 ilike 매칭으로 id 후보 끌어와 주문 q 검색에 사용.
func (h *OrderHandler) idsByName(table, idCol, nameCol, q string) ([]string, error) {
	data, _, err := h.DB.From(table).
		Select(idCol, "exact", false).
		Ilike(nameCol, "*"+q+"*").
		Execute()
	if err != nil {
		return nil, err
	}
	var rows []map[string]any
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		if v, ok := row[idCol].(string); ok {
			ids = append(ids, v)
		}
	}
	return ids, nil
}

func sanitizeOrderSearchTerm(q string) string {
	q = strings.TrimSpace(q)
	if q == "" {
		return ""
	}
	replacer := strings.NewReplacer(",", " ", "(", " ", ")", " ", ".", " ", "*", " ", "\"", " ")
	return strings.TrimSpace(replacer.Replace(q))
}

// applyOrderFilters — List/Summary 가 공유하는 필터 로직.
func (h *OrderHandler) applyOrderFilters(r *http.Request, query *postgrest.FilterBuilder) (*postgrest.FilterBuilder, bool, error) {
	if compID := r.URL.Query().Get("company_id"); compID != "" && compID != "all" {
		query = query.Eq("company_id", compID)
	}
	if custID := r.URL.Query().Get("customer_id"); custID != "" {
		query = query.Eq("customer_id", custID)
	}
	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq("status", status)
	}
	if prodID := r.URL.Query().Get("product_id"); prodID != "" {
		query = query.Eq("product_id", prodID)
	}
	if mgmtCat := r.URL.Query().Get("management_category"); mgmtCat != "" {
		query = query.Eq("management_category", mgmtCat)
	}
	if source := r.URL.Query().Get("fulfillment_source"); source != "" {
		query = query.Eq("fulfillment_source", source)
	}

	if q := sanitizeOrderSearchTerm(r.URL.Query().Get("q")); q != "" {
		clauses := []string{
			fmt.Sprintf("order_number.ilike.*%s*", q),
			fmt.Sprintf("site_name.ilike.*%s*", q),
		}
		// 거래처 이름 → customer_id 후보
		if ids, err := h.idsByName("partners", "partner_id", "partner_name", q); err == nil && len(ids) > 0 {
			clauses = append(clauses, fmt.Sprintf("customer_id.in.(%s)", strings.Join(ids, ",")))
		}
		// 품번/품명 → product_id 후보
		if ids, err := h.idsByName("products", "product_id", "product_code", q); err == nil && len(ids) > 0 {
			clauses = append(clauses, fmt.Sprintf("product_id.in.(%s)", strings.Join(ids, ",")))
		}
		if ids, err := h.idsByName("products", "product_id", "product_name", q); err == nil && len(ids) > 0 {
			clauses = append(clauses, fmt.Sprintf("product_id.in.(%s)", strings.Join(ids, ",")))
		}
		query = query.Or(strings.Join(clauses, ","), "")
	}

	return query, true, nil
}

func parseOrderSort(r *http.Request) (column string, ascending bool) {
	column = "order_date"
	ascending = false
	if raw := r.URL.Query().Get("sort"); raw != "" {
		if _, ok := orderSortable[raw]; ok {
			column = raw
		}
	}
	if r.URL.Query().Get("order") == "asc" {
		ascending = true
	}
	return column, ascending
}

// List — GET /api/v1/orders — 수주 목록 조회 (서버사이드 페이지·검색·정렬).
// q 검색 대상: order_number, site_name, 거래처(partner_name), 품번/품명(product_code/name).
func (h *OrderHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("orders").Select("*", "exact", false)
	query, ok, err := h.applyOrderFilters(r, query)
	if err != nil {
		log.Printf("[수주 목록 필터 처리 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "수주 목록 필터 처리에 실패했습니다")
		return
	}
	if !ok {
		w.Header().Set("X-Total-Count", "0")
		response.RespondJSON(w, http.StatusOK, []model.Order{})
		return
	}

	sortCol, asc := parseOrderSort(r)
	query = query.Order(sortCol, &postgrest.OrderOpts{Ascending: asc})

	limit, offset := parseLimitOffset(r, orderDefaultLimit, orderMaxLimit)
	query = query.Range(offset, offset+limit-1, "")

	data, count, err := query.Execute()
	if err != nil {
		log.Printf("[수주 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "수주 목록 조회에 실패했습니다")
		return
	}

	var orders []model.Order
	if err := json.Unmarshal(data, &orders); err != nil {
		log.Printf("[수주 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	h.enrichOrders(orders)

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, orders)
}

// OrderSummary — 수주 KPI 카드 응답.
type OrderSummary struct {
	Total           int64 `json:"total"`
	ReceivedCount   int64 `json:"received_count"`
	PartialCount    int64 `json:"partial_count"`
	CompletedCount  int64 `json:"completed_count"`
	CancelledCount  int64 `json:"cancelled_count"`
}

// Summary — GET /api/v1/orders/summary — 수주 status 별 카운트 집계.
func (h *OrderHandler) Summary(w http.ResponseWriter, r *http.Request) {
	totalQ := h.DB.From("orders").Select("order_id", "exact", true)
	totalQ, ok, err := h.applyOrderFilters(r, totalQ)
	if err != nil {
		log.Printf("[수주 요약 필터 처리 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "수주 요약 필터 처리에 실패했습니다")
		return
	}
	if !ok {
		response.RespondJSON(w, http.StatusOK, OrderSummary{})
		return
	}
	summary := OrderSummary{}
	if _, count, err := totalQ.Range(0, 0, "").Execute(); err == nil {
		summary.Total = count
	}
	for _, st := range []struct {
		key    string
		target *int64
	}{
		{"received", &summary.ReceivedCount},
		{"partial", &summary.PartialCount},
		{"completed", &summary.CompletedCount},
		{"cancelled", &summary.CancelledCount},
	} {
		q := h.DB.From("orders").Select("order_id", "exact", true)
		q, ok2, err := h.applyOrderFilters(r, q)
		if err != nil || !ok2 {
			continue
		}
		q = q.Eq("status", st.key)
		if _, c, err := q.Range(0, 0, "").Execute(); err == nil {
			*st.target = c
		}
	}
	response.RespondJSON(w, http.StatusOK, summary)
}

// GetByID — GET /api/v1/orders/{id} — 수주 상세 조회
// 비유: 특정 주문서를 꺼내 자세히 보는 것
func (h *OrderHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("orders").
		Select("*", "exact", false).
		Eq("order_id", id).
		Execute()
	if err != nil {
		log.Printf("[수주 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "수주 조회에 실패했습니다")
		return
	}

	var orders []model.Order
	if err := json.Unmarshal(data, &orders); err != nil {
		log.Printf("[수주 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(orders) == 0 {
		response.RespondError(w, http.StatusNotFound, "수주를 찾을 수 없습니다")
		return
	}
	h.enrichOrders(orders)

	response.RespondJSON(w, http.StatusOK, orders[0])
}

type orderPartnerSummary struct {
	PartnerID   string `json:"partner_id"`
	PartnerName string `json:"partner_name"`
}

type orderCompanySummary struct {
	CompanyID   string `json:"company_id"`
	CompanyName string `json:"company_name"`
}

type orderProductSummary struct {
	ProductID      string  `json:"product_id"`
	ProductCode    string  `json:"product_code"`
	ProductName    string  `json:"product_name"`
	ManufacturerID string  `json:"manufacturer_id"`
	SpecWP         int     `json:"spec_wp"`
	WattageKW      float64 `json:"wattage_kw"`
}

type orderManufacturerSummary struct {
	ManufacturerID string  `json:"manufacturer_id"`
	NameKR         string  `json:"name_kr"`
	ShortName      *string `json:"short_name"`
}

func (h *OrderHandler) enrichOrders(orders []model.Order) {
	if len(orders) == 0 {
		return
	}

	companyIDs := make([]string, 0)
	customerIDs := make([]string, 0)
	productIDs := make([]string, 0)
	seenCompanies := map[string]bool{}
	seenCustomers := map[string]bool{}
	seenProducts := map[string]bool{}
	for _, order := range orders {
		if order.CompanyID != "" && !seenCompanies[order.CompanyID] {
			companyIDs = append(companyIDs, order.CompanyID)
			seenCompanies[order.CompanyID] = true
		}
		if order.CustomerID != "" && !seenCustomers[order.CustomerID] {
			customerIDs = append(customerIDs, order.CustomerID)
			seenCustomers[order.CustomerID] = true
		}
		if order.ProductID != "" && !seenProducts[order.ProductID] {
			productIDs = append(productIDs, order.ProductID)
			seenProducts[order.ProductID] = true
		}
	}

	companyMap := map[string]orderCompanySummary{}
	if len(companyIDs) > 0 {
		if data, _, err := h.DB.From("companies").
			Select("company_id, company_name", "exact", false).
			In("company_id", companyIDs).
			Execute(); err == nil {
			var companies []orderCompanySummary
			if err := json.Unmarshal(data, &companies); err == nil {
				for _, company := range companies {
					companyMap[company.CompanyID] = company
				}
			}
		} else {
			log.Printf("[수주 표시명 보강: 법인 조회 실패] %v", err)
		}
	}

	partnerMap := map[string]orderPartnerSummary{}
	if len(customerIDs) > 0 {
		if data, _, err := h.DB.From("partners").
			Select("partner_id, partner_name", "exact", false).
			In("partner_id", customerIDs).
			Execute(); err == nil {
			var partners []orderPartnerSummary
			if err := json.Unmarshal(data, &partners); err == nil {
				for _, partner := range partners {
					partnerMap[partner.PartnerID] = partner
				}
			}
		} else {
			log.Printf("[수주 표시명 보강: 거래처 조회 실패] %v", err)
		}
	}

	productMap := map[string]orderProductSummary{}
	manufacturerIDs := make([]string, 0)
	seenManufacturers := map[string]bool{}
	if len(productIDs) > 0 {
		if data, _, err := h.DB.From("products").
			Select("product_id, product_code, product_name, manufacturer_id, spec_wp, wattage_kw", "exact", false).
			In("product_id", productIDs).
			Execute(); err == nil {
			var products []orderProductSummary
			if err := json.Unmarshal(data, &products); err == nil {
				for _, product := range products {
					productMap[product.ProductID] = product
					if product.ManufacturerID != "" && !seenManufacturers[product.ManufacturerID] {
						manufacturerIDs = append(manufacturerIDs, product.ManufacturerID)
						seenManufacturers[product.ManufacturerID] = true
					}
				}
			}
		} else {
			log.Printf("[수주 표시명 보강: 품목 조회 실패] %v", err)
		}
	}

	manufacturerMap := map[string]orderManufacturerSummary{}
	if len(manufacturerIDs) > 0 {
		if data, _, err := h.DB.From("manufacturers").
			Select("manufacturer_id, name_kr, short_name", "exact", false).
			In("manufacturer_id", manufacturerIDs).
			Execute(); err == nil {
			var manufacturers []orderManufacturerSummary
			if err := json.Unmarshal(data, &manufacturers); err == nil {
				for _, manufacturer := range manufacturers {
					manufacturerMap[manufacturer.ManufacturerID] = manufacturer
				}
			}
		} else {
			log.Printf("[수주 표시명 보강: 제조사 조회 실패] %v", err)
		}
	}

	for i := range orders {
		if company, ok := companyMap[orders[i].CompanyID]; ok {
			orders[i].CompanyName = &company.CompanyName
		}
		if partner, ok := partnerMap[orders[i].CustomerID]; ok {
			orders[i].CustomerName = &partner.PartnerName
		}
		if product, ok := productMap[orders[i].ProductID]; ok {
			orders[i].ProductCode = &product.ProductCode
			orders[i].ProductName = &product.ProductName
			orders[i].SpecWp = &product.SpecWP
			orders[i].WattageKw = &product.WattageKW
			if manufacturer, ok := manufacturerMap[product.ManufacturerID]; ok {
				name := manufacturer.NameKR
				if manufacturer.ShortName != nil && *manufacturer.ShortName != "" {
					name = *manufacturer.ShortName
				}
				orders[i].ManufacturerName = &name
			}
		}
	}
}

// Create — POST /api/v1/orders — 수주 등록
// 비유: 새 주문서를 작성하여 관리실에 보관하는 것
func (h *OrderHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[수주 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: management_category 미입력이면 기본값 "sale" 설정
	if req.ManagementCategory == "" {
		req.ManagementCategory = "sale"
	}
	// 비유: fulfillment_source 미입력이면 기본값 "stock" 설정
	if req.FulfillmentSource == "" {
		req.FulfillmentSource = "stock"
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("orders").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[수주 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "수주 등록에 실패했습니다")
		return
	}

	var created []model.Order
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[수주 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "수주 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/orders/{id} — 수주 수정
// 비유: 기존 주문서의 내용을 수정하는 것
func (h *OrderHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[수주 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("orders").
		Update(req, "", "").
		Eq("order_id", id).
		Execute()
	if err != nil {
		log.Printf("[수주 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "수주 수정에 실패했습니다")
		return
	}

	var updated []model.Order
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[수주 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 수주를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// RecentByPartner — GET /api/v1/baro/orders/recent?partner_id=&limit=5
// BARO Phase 1: 거래처별 최근 수주를 반환 (빠른 재발주 카드용)
// 비유: 거래처를 클릭하면 "이전에 같은 분에게 보낸 주문서" 묶음을 꺼내 보여주는 것
func (h *OrderHandler) RecentByPartner(w http.ResponseWriter, r *http.Request) {
	partnerID := r.URL.Query().Get("partner_id")
	if partnerID == "" {
		response.RespondError(w, http.StatusBadRequest, "partner_id는 필수 항목입니다")
		return
	}
	limit := 5
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 && v <= 50 {
			limit = v
		}
	}

	data, _, err := h.DB.From("orders").
		Select("*", "exact", false).
		Eq("customer_id", partnerID).
		Order("order_date", &postgrest.OrderOpts{Ascending: false}).
		Limit(limit, "").
		Execute()
	if err != nil {
		log.Printf("[BARO 최근 수주 조회 실패] partner=%s err=%v", partnerID, err)
		response.RespondError(w, http.StatusInternalServerError, "최근 수주 조회에 실패했습니다")
		return
	}

	var orders []model.Order
	if err := json.Unmarshal(data, &orders); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	h.enrichOrders(orders)
	response.RespondJSON(w, http.StatusOK, orders)
}

// CloneOrderRequest — POST /api/v1/baro/orders/{id}/clone 본문
// 같은 거래처/품목/수량/단가/현장으로 새 수주 draft를 만든다.
type CloneOrderRequest struct {
	OrderDate *string `json:"order_date,omitempty"`
	SiteID    *string `json:"site_id,omitempty"`
	Quantity  *int    `json:"quantity,omitempty"`
	Memo      *string `json:"memo,omitempty"`
}

// Clone — POST /api/v1/baro/orders/{id}/clone
// BARO Phase 1: 기존 수주를 복제해 status=received(접수)로 새 수주 1건 생성.
// 비유: 같은 거래처가 같은 모델을 또 시켰을 때 옛 주문서를 그대로 베껴 새 주문서를 만드는 것.
func (h *OrderHandler) Clone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body CloneOrderRequest
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
			return
		}
	}

	// 1) 원본 수주 조회
	data, _, err := h.DB.From("orders").
		Select("*", "exact", false).
		Eq("order_id", id).
		Execute()
	if err != nil {
		log.Printf("[BARO 수주 복제 — 원본 조회 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "원본 수주 조회에 실패했습니다")
		return
	}
	var src []model.Order
	if err := json.Unmarshal(data, &src); err != nil || len(src) == 0 {
		response.RespondError(w, http.StatusNotFound, "원본 수주를 찾을 수 없습니다")
		return
	}
	o := src[0]

	// 2) 새 수주 등록 요청 구성 — 출고/매출/수금 이력은 복제하지 않는다
	newOrderDate := time.Now().Format("2006-01-02")
	if body.OrderDate != nil && *body.OrderDate != "" {
		newOrderDate = *body.OrderDate
	}
	newQty := o.Quantity
	if body.Quantity != nil && *body.Quantity > 0 {
		newQty = *body.Quantity
	}
	siteID := o.SiteID
	if body.SiteID != nil {
		// 빈 문자열이면 unset
		if *body.SiteID == "" {
			siteID = nil
		} else {
			s := *body.SiteID
			siteID = &s
		}
	}
	memo := o.Memo
	if body.Memo != nil {
		s := *body.Memo
		memo = &s
	}

	req := model.CreateOrderRequest{
		CompanyID:          o.CompanyID,
		CustomerID:         o.CustomerID,
		OrderDate:          newOrderDate,
		ReceiptMethod:      o.ReceiptMethod,
		ProductID:          o.ProductID,
		Quantity:           newQty,
		CapacityKw:         o.CapacityKw,
		UnitPriceWp:        o.UnitPriceWp,
		SiteID:             siteID,
		SiteName:           o.SiteName,
		SiteAddress:        o.SiteAddress,
		SiteContact:        o.SiteContact,
		SitePhone:          o.SitePhone,
		PaymentTerms:       o.PaymentTerms,
		DepositRate:        o.DepositRate,
		DeliveryDue:        o.DeliveryDue,
		Status:             "received",
		ManagementCategory: o.ManagementCategory,
		FulfillmentSource:  o.FulfillmentSource,
		SpareQty:           o.SpareQty,
		Memo:               memo,
	}
	if req.ManagementCategory == "" {
		req.ManagementCategory = "sale"
	}
	if req.FulfillmentSource == "" {
		req.FulfillmentSource = "stock"
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	created, _, err := h.DB.From("orders").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[BARO 수주 복제 — 등록 실패] src=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "복제 수주 등록에 실패했습니다")
		return
	}
	var out []model.Order
	if err := json.Unmarshal(created, &out); err != nil || len(out) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "복제 결과를 확인할 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusCreated, out[0])
}

// Delete — DELETE /api/v1/orders/{id} — 수주 삭제
// 비유: 수주 주문서를 파기하는 것 — 연결된 출고가 있으면 DB FK 제약으로 막힘
func (h *OrderHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	_, _, err := h.DB.From("orders").
		Delete("", "").
		Eq("order_id", id).
		Execute()
	if err != nil {
		log.Printf("[수주 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "수주 삭제에 실패했습니다 (연결된 출고가 있으면 먼저 삭제해야 합니다)")
		return
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}
