package baro

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/response"
)

// baroOutboundDefaultWindowDays — BARO 가 보는 출고 기본 윈도우.
// 창고팀 피킹/배송 작업은 최근 며칠 안에 끝나므로 옛 데이터까지 노출할 이유가 없음.
// ?days=N (1~90) 으로 클라이언트가 늘려서 볼 수 있다.
const (
	baroOutboundDefaultWindowDays = 7
	baroOutboundMaxWindowDays     = 90
)

// BaroOutboundHandler — BARO 전용 sanitized 출고 보드 API.
//
// 탑솔라/디원/화신이 등록한 출고를 BARO 창고팀이 같이 보고 피킹·배송·검수 준비를
// 진행할 수 있게 한다. D-039(그룹내거래) + D-116(sanitized) 패턴.
//
// 가격(unit_price_wp/supply/vat/total) · 메모 · 외부 양식 원본(source_payload) 는
// SELECT 화이트리스트에서 제외되어 응답에 절대 포함되지 않는다 — column-level masking.
type BaroOutboundHandler struct {
	DB *supa.Client
}

func NewBaroOutboundHandler(db *supa.Client) *BaroOutboundHandler {
	return &BaroOutboundHandler{DB: db}
}

func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDBaroOutbound,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewBaroOutboundHandler(d.DB)
			g := d.Gates
			r.Route("/baro/outbounds", func(r chi.Router) {
				r.Use(g.Feature(feature.IDBaroOutbound))
				r.Get("/", h.List)
			})
		},
	})
}

// baroOutboundRow — outbounds_with_meta 뷰에서 sanitized 컬럼만 SELECT.
// 가격 컬럼(unit_price_wp/supply_amount/vat_amount/total_amount) · memo · source_payload
// 는 화이트리스트에 없어 BARO 응답으로 절대 새지 않는다.
type baroOutboundRow struct {
	OutboundID            string  `json:"outbound_id"`
	OutboundDate          string  `json:"outbound_date"`
	CompanyID             string  `json:"company_id"`
	ProductID             string  `json:"product_id"`
	ProductCode           *string `json:"product_code"`
	ProductName           *string `json:"product_name"`
	Quantity              int     `json:"quantity"`
	CapacityKw            float64 `json:"capacity_kw"`
	WarehouseID           *string `json:"warehouse_id"`
	WarehouseName         *string `json:"warehouse_name"`
	UsageCategory         string  `json:"usage_category"`
	SiteName              *string `json:"site_name"`
	SiteAddress           *string `json:"site_address"`
	SpareQty              *int    `json:"spare_qty"`
	OrderNumber           *string `json:"order_number"`
	GroupTrade            *bool   `json:"group_trade"`
	TargetCompanyID       *string `json:"target_company_id"`
	TargetCompanyName     *string `json:"target_company_name"`
	ErpOutboundNo         *string `json:"erp_outbound_no"`
	Status                string  `json:"status"`
	TxStatementReady      bool    `json:"tx_statement_ready"`
	InspectionRequestSent bool    `json:"inspection_request_sent"`
	ApprovalRequested     bool    `json:"approval_requested"`
	TaxInvoiceIssued      bool    `json:"tax_invoice_issued"`
}

type baroOutboundCompanyRow struct {
	CompanyID   string `json:"company_id"`
	CompanyName string `json:"company_name"`
}

type baroOutboundProductSpecRow struct {
	ProductID string `json:"product_id"`
	SpecWP    *int   `json:"spec_wp"`
}

// List — GET /api/v1/baro/outbounds — BARO 가 보는 sanitized 출고 보드.
//
// 쿼리:
//   - scope=all : 취소된 행도 포함. 기본은 active + cancel_pending 만.
//   - company_id : 출고 법인(탑솔라/디원/화신) 필터.
//   - usage_category : sale/sale_spare/construction/... 필터.
//   - days : 출고일 윈도우 (기본 7, 최대 90). 창고 작업 관점에서 오래된 출고는
//     의미 없으므로 기본 1주일만 노출.
func (h *BaroOutboundHandler) List(w http.ResponseWriter, r *http.Request) {
	// customer_id 는 outbounds 컬럼이 아님 (sale 또는 order 를 거쳐 도달). BARO 보드는 거래처 대신
	// site_name/site_address 를 노출 — 창고팀 피킹/배송 작업은 현장명 기준이라 충분. 거래처 join
	// 이 필요하면 sales.outbound_id → partners.customer_id 별도 룩업으로 후속 PR.
	const cols = "outbound_id, outbound_date, company_id, product_id, product_code, product_name, " +
		"quantity, capacity_kw, warehouse_id, warehouse_name, usage_category, " +
		"site_name, site_address, spare_qty, order_number, group_trade, target_company_id, " +
		"target_company_name, erp_outbound_no, status, " +
		"tx_statement_ready, inspection_request_sent, approval_requested, tax_invoice_issued"

	query := h.DB.From("outbounds_with_meta").Select(cols, "exact", false)

	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq("status", status)
	} else if r.URL.Query().Get("scope") != "all" {
		query = query.In("status", []string{"active", "cancel_pending"})
	}
	if companyID := r.URL.Query().Get("company_id"); companyID != "" && companyID != "all" {
		query = query.Eq("company_id", companyID)
	}
	if usage := r.URL.Query().Get("usage_category"); usage != "" && usage != "all" {
		query = query.Eq("usage_category", usage)
	}
	// 기본 7일 윈도우 (창고 작업이 최근 건만 의미 있음). ?days=14 처럼 넘기면 14일까지.
	// 1~90 범위로 클램프 — 잘못된 입력이나 무제한 조회 차단.
	windowDays := baroOutboundDefaultWindowDays
	if raw := r.URL.Query().Get("days"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 1 && n <= baroOutboundMaxWindowDays {
			windowDays = n
		}
	}
	since := time.Now().AddDate(0, 0, -windowDays).Format("2006-01-02")
	query = query.Gte("outbound_date", since)

	rawData, _, err := query.
		Order("outbound_date", &postgrest.OrderOpts{Ascending: false}).
		Order("created_at", &postgrest.OrderOpts{Ascending: false}).
		Execute()
	if err != nil {
		log.Printf("[BARO 출고 보드 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "출고 보드 조회에 실패했습니다")
		return
	}
	var rows []baroOutboundRow
	if err := json.Unmarshal(rawData, &rows); err != nil {
		log.Printf("[BARO 출고 보드 디코딩 실패] %v / raw=%s", err, string(rawData))
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(rows) == 0 {
		response.RespondJSON(w, http.StatusOK, []BaroOutboundItem{})
		return
	}

	companyNames := h.baroOutboundCompanyNames()
	productSpecs := h.baroOutboundProductSpecs(rows)

	items := make([]BaroOutboundItem, 0, len(rows))
	for _, row := range rows {
		item := BaroOutboundItem{
			OutboundID:            row.OutboundID,
			OutboundDate:          row.OutboundDate,
			CompanyID:             row.CompanyID,
			CompanyName:           stringPtrFromMap(companyNames, row.CompanyID),
			ProductID:             row.ProductID,
			ProductCode:           row.ProductCode,
			ProductName:           row.ProductName,
			Quantity:              row.Quantity,
			CapacityKW:            row.CapacityKw,
			WarehouseID:           row.WarehouseID,
			WarehouseName:         row.WarehouseName,
			UsageCategory:         row.UsageCategory,
			SiteName:              row.SiteName,
			SiteAddress:           row.SiteAddress,
			SpareQty:              row.SpareQty,
			OrderNumber:           row.OrderNumber,
			GroupTrade:            row.GroupTrade,
			TargetCompanyID:       row.TargetCompanyID,
			TargetCompanyName:     row.TargetCompanyName,
			ErpOutboundNo:         row.ErpOutboundNo,
			Status:                row.Status,
			TxStatementReady:      row.TxStatementReady,
			InspectionRequestSent: row.InspectionRequestSent,
			ApprovalRequested:     row.ApprovalRequested,
			TaxInvoiceIssued:      row.TaxInvoiceIssued,
		}
		if spec, ok := productSpecs[row.ProductID]; ok {
			item.SpecWP = spec
		}
		items = append(items, item)
	}

	response.RespondJSON(w, http.StatusOK, items)
}

// baroOutboundCompanyNames — companies 전체 룩업. 응답에 노출하는 법인은 보통 5개
// 미만이라 전체 SELECT 가 부분 IN 보다 단순/싸다.
func (h *BaroOutboundHandler) baroOutboundCompanyNames() map[string]string {
	data, _, err := h.DB.From("companies").
		Select("company_id, company_name", "exact", false).
		Execute()
	if err != nil {
		log.Printf("[BARO 출고 법인 룩업 실패] %v", err)
		return map[string]string{}
	}
	var rows []baroOutboundCompanyRow
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[BARO 출고 법인 룩업 디코딩 실패] %v", err)
		return map[string]string{}
	}
	out := make(map[string]string, len(rows))
	for _, row := range rows {
		out[row.CompanyID] = row.CompanyName
	}
	return out
}

// baroOutboundProductSpecs — 응답에 등장하는 product_id 의 spec_wp 룩업.
// outbounds_with_meta 뷰가 product_code/name 은 join 하지만 spec_wp 는 누락이라 별도 SELECT.
func (h *BaroOutboundHandler) baroOutboundProductSpecs(rows []baroOutboundRow) map[string]*int {
	idSet := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		idSet[row.ProductID] = struct{}{}
	}
	if len(idSet) == 0 {
		return map[string]*int{}
	}
	ids := make([]string, 0, len(idSet))
	for id := range idSet {
		ids = append(ids, id)
	}
	data, _, err := h.DB.From("products").
		Select("product_id, spec_wp", "exact", false).
		In("product_id", ids).
		Execute()
	if err != nil {
		log.Printf("[BARO 출고 품번 spec_wp 룩업 실패] %v", err)
		return map[string]*int{}
	}
	var products []baroOutboundProductSpecRow
	if err := json.Unmarshal(data, &products); err != nil {
		log.Printf("[BARO 출고 품번 spec_wp 룩업 디코딩 실패] %v", err)
		return map[string]*int{}
	}
	out := make(map[string]*int, len(products))
	for _, p := range products {
		out[p.ProductID] = p.SpecWP
	}
	return out
}
