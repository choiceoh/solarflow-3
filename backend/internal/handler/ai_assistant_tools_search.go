package handler

// AI assistant — 읽기 전용 검색·룩업 도구 모음 (LLM이 호출).
// 등록은 ai_assistant_tools.go의 assistantToolCatalog에서.

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
)

// --- search_partners ---

type searchPartnersInput struct {
	Keyword     string `json:"keyword,omitempty"`
	PartnerType string `json:"partner_type,omitempty"`
	Limit       int    `json:"limit,omitempty"`
}

func toolSearchPartners() assistantTool {
	return assistantTool{
		name:        "search_partners",
		description: "거래처(partners) 검색. 이름 부분일치(ilike) 또는 거래처 유형으로 필터. 결과는 JSON 배열.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"keyword": {"type": "string", "description": "거래처 이름 부분일치"},
				"partner_type": {"type": "string", "description": "거래처 유형(예: customer, supplier)"},
				"limit": {"type": "integer", "description": "최대 결과 수, 기본 20, 최대 50"}
			}
		}`),
		allow: func(ctx context.Context) bool { return middleware.GetUserID(ctx) != "" },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args searchPartnersInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 20, 50)

			q := db.From("partners").
				Select("partner_id,partner_name,partner_type,contact_name,is_active", "exact", false)
			if kw := strings.TrimSpace(args.Keyword); kw != "" {
				q = q.Ilike("partner_name", "%"+kw+"%")
			}
			if pt := strings.TrimSpace(args.PartnerType); pt != "" {
				q = q.Eq("partner_type", pt)
			}
			q = q.Order("partner_name", &postgrest.OrderOpts{Ascending: true}).Limit(limit, "")

			data, _, err := q.Execute()
			if err != nil {
				return "", fmt.Errorf("거래처 조회 실패: %w", err)
			}
			return string(data), nil
		},
	}
}

// --- search_purchase_orders ---

type searchPurchaseOrdersInput struct {
	PONumber            string `json:"po_number,omitempty"`
	ManufacturerKeyword string `json:"manufacturer_keyword,omitempty"`
	Status              string `json:"status,omitempty"`
	DateFrom            string `json:"date_from,omitempty"`
	DateTo              string `json:"date_to,omitempty"`
	Limit               int    `json:"limit,omitempty"`
}

func toolSearchPurchaseOrders() assistantTool {
	return assistantTool{
		name:        "search_purchase_orders",
		description: "P/O(발주) 검색. PO 번호·제조사명·상태·계약일 범위로 필터. manager/viewer 역할은 호출 불가.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"po_number": {"type": "string", "description": "PO 번호 부분일치"},
				"manufacturer_keyword": {"type": "string", "description": "제조사 이름(한국어) 부분일치"},
				"status": {"type": "string", "description": "PO 상태"},
				"date_from": {"type": "string", "description": "계약일 from(YYYY-MM-DD)"},
				"date_to": {"type": "string", "description": "계약일 to(YYYY-MM-DD)"},
				"limit": {"type": "integer", "description": "최대 결과 수, 기본 20, 최대 50"}
			}
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator", "executive") },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args searchPurchaseOrdersInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 20, 50)

			q := db.From("purchase_orders_ext").
				Select("po_id,po_number,manufacturer_name,contract_date,contract_type,status,total_qty,total_mw", "exact", false)
			if v := strings.TrimSpace(args.PONumber); v != "" {
				q = q.Ilike("po_number", "%"+v+"%")
			}
			if v := strings.TrimSpace(args.ManufacturerKeyword); v != "" {
				q = q.Ilike("manufacturer_name", "%"+v+"%")
			}
			if v := strings.TrimSpace(args.Status); v != "" {
				q = q.Eq("status", v)
			}
			if v := strings.TrimSpace(args.DateFrom); v != "" {
				q = q.Gte("contract_date", v)
			}
			if v := strings.TrimSpace(args.DateTo); v != "" {
				q = q.Lte("contract_date", v)
			}
			q = q.Order("contract_date", &postgrest.OrderOpts{Ascending: false}).Limit(limit, "")

			data, _, err := q.Execute()
			if err != nil {
				return "", fmt.Errorf("P/O 조회 실패: %w", err)
			}
			return string(data), nil
		},
	}
}

// --- orders 조회 ---

type searchOrdersInput struct {
	OrderNumber string `json:"order_number,omitempty"`
	CustomerID  string `json:"customer_id,omitempty"`
	DateFrom    string `json:"date_from,omitempty"`
	DateTo      string `json:"date_to,omitempty"`
	Limit       int    `json:"limit,omitempty"`
}

func toolSearchOrders() assistantTool {
	return assistantTool{
		name:        "search_orders",
		description: "수주(orders) 검색. 수주번호·고객 ID·주문일 범위로 필터. manager/viewer 역할은 호출 불가. 고객 이름이 필요하면 search_partners로 partner_id를 먼저 찾으세요.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"order_number": {"type": "string", "description": "수주번호 부분일치"},
				"customer_id": {"type": "string", "description": "고객 partner_id 정확일치"},
				"date_from": {"type": "string", "description": "주문일 from(YYYY-MM-DD)"},
				"date_to": {"type": "string", "description": "주문일 to(YYYY-MM-DD)"},
				"limit": {"type": "integer", "description": "최대 결과 수, 기본 20, 최대 50"}
			}
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator", "executive") },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args searchOrdersInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 20, 50)
			q := db.From("orders").Select(
				"order_id,order_number,order_date,company_id,customer_id,product_id,quantity,capacity_kw,unit_price_wp,site_name,delivery_due",
				"exact", false,
			)
			if v := strings.TrimSpace(args.OrderNumber); v != "" {
				q = q.Ilike("order_number", "%"+v+"%")
			}
			if v := strings.TrimSpace(args.CustomerID); v != "" {
				q = q.Eq("customer_id", v)
			}
			if v := strings.TrimSpace(args.DateFrom); v != "" {
				q = q.Gte("order_date", v)
			}
			if v := strings.TrimSpace(args.DateTo); v != "" {
				q = q.Lte("order_date", v)
			}
			q = q.Order("order_date", &postgrest.OrderOpts{Ascending: false}).Limit(limit, "")

			data, _, err := q.Execute()
			if err != nil {
				return "", fmt.Errorf("수주 조회 실패: %w", err)
			}
			return string(data), nil
		},
	}
}

// --- search_outbound ---

type searchOutboundInput struct {
	OrderID   string `json:"order_id,omitempty"`
	ProductID string `json:"product_id,omitempty"`
	Status    string `json:"status,omitempty"`
	DateFrom  string `json:"date_from,omitempty"`
	DateTo    string `json:"date_to,omitempty"`
	Limit     int    `json:"limit,omitempty"`
}

func toolSearchOutbound() assistantTool {
	return assistantTool{
		name:        "search_outbound",
		description: "출고/판매(outbounds) 검색. 수주ID·품목ID·상태·출고일 범위로 필터. manager/viewer 역할은 호출 불가.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"order_id": {"type": "string", "description": "수주 ID 정확일치"},
				"product_id": {"type": "string", "description": "품목 ID 정확일치"},
				"status": {"type": "string", "description": "출고 상태"},
				"date_from": {"type": "string", "description": "출고일 from(YYYY-MM-DD)"},
				"date_to": {"type": "string", "description": "출고일 to(YYYY-MM-DD)"},
				"limit": {"type": "integer", "description": "최대 결과 수, 기본 20, 최대 50"}
			}
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator", "executive") },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args searchOutboundInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 20, 50)
			q := db.From("outbounds").Select(
				"outbound_id,outbound_date,company_id,product_id,quantity,capacity_kw,site_name,order_id,status",
				"exact", false,
			)
			if v := strings.TrimSpace(args.OrderID); v != "" {
				q = q.Eq("order_id", v)
			}
			if v := strings.TrimSpace(args.ProductID); v != "" {
				q = q.Eq("product_id", v)
			}
			if v := strings.TrimSpace(args.Status); v != "" {
				q = q.Eq("status", v)
			}
			if v := strings.TrimSpace(args.DateFrom); v != "" {
				q = q.Gte("outbound_date", v)
			}
			if v := strings.TrimSpace(args.DateTo); v != "" {
				q = q.Lte("outbound_date", v)
			}
			q = q.Order("outbound_date", &postgrest.OrderOpts{Ascending: false}).Limit(limit, "")

			data, _, err := q.Execute()
			if err != nil {
				return "", fmt.Errorf("출고 조회 실패: %w", err)
			}
			return string(data), nil
		},
	}
}

// --- search_receipts ---

type searchReceiptsInput struct {
	PartnerID string `json:"partner_id,omitempty"`
	DateFrom  string `json:"date_from,omitempty"`
	DateTo    string `json:"date_to,omitempty"`
	Limit     int    `json:"limit,omitempty"`
}

func toolSearchReceipts() assistantTool {
	return assistantTool{
		name:        "search_receipts",
		description: "수금(receipts) 검색. 거래처 ID·수금일 범위로 필터. 미수금 권한이 있는 admin/operator/executive 만 호출 가능.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"partner_id": {"type": "string", "description": "거래처 partner_id 정확일치"},
				"date_from": {"type": "string", "description": "수금일 from(YYYY-MM-DD)"},
				"date_to": {"type": "string", "description": "수금일 to(YYYY-MM-DD)"},
				"limit": {"type": "integer", "description": "최대 결과 수, 기본 20, 최대 50"}
			}
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator", "executive") },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args searchReceiptsInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 20, 50)
			q := db.From("receipts").Select("*", "exact", false)
			if v := strings.TrimSpace(args.PartnerID); v != "" {
				q = q.Eq("partner_id", v)
			}
			if v := strings.TrimSpace(args.DateFrom); v != "" {
				q = q.Gte("receipt_date", v)
			}
			if v := strings.TrimSpace(args.DateTo); v != "" {
				q = q.Lte("receipt_date", v)
			}
			q = q.Order("receipt_date", &postgrest.OrderOpts{Ascending: false}).Limit(limit, "")

			data, _, err := q.Execute()
			if err != nil {
				return "", fmt.Errorf("수금 조회 실패: %w", err)
			}
			return string(data), nil
		},
	}
}

// --- products 조회 ---

type searchProductsInput struct {
	Keyword        string `json:"keyword,omitempty"`
	ManufacturerID string `json:"manufacturer_id,omitempty"`
	Limit          int    `json:"limit,omitempty"`
}

func toolSearchProducts() assistantTool {
	return assistantTool{
		name:        "search_products",
		description: "품목(products) 검색. product_code/product_name 부분일치 또는 제조사 ID로 필터. ID·스펙 조회용 — 모든 역할 호출 가능.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"properties":{
				"keyword":{"type":"string","description":"product_code·product_name 부분일치"},
				"manufacturer_id":{"type":"string","description":"제조사 ID 정확일치"},
				"limit":{"type":"integer","description":"기본 20, 최대 50"}
			}
		}`),
		allow: func(ctx context.Context) bool { return middleware.GetUserID(ctx) != "" },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args searchProductsInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 20, 50)
			q := db.From("products").Select(
				"product_id,product_code,product_name,manufacturer_id,spec_wp,wattage_kw,module_width_mm,module_height_mm",
				"exact", false,
			)
			if v := strings.TrimSpace(args.Keyword); v != "" {
				q = q.Or(fmt.Sprintf("product_code.ilike.%%%s%%,product_name.ilike.%%%s%%", v, v), "")
			}
			if v := strings.TrimSpace(args.ManufacturerID); v != "" {
				q = q.Eq("manufacturer_id", v)
			}
			q = q.Order("product_code", &postgrest.OrderOpts{Ascending: true}).Limit(limit, "")
			data, _, err := q.Execute()
			if err != nil {
				return "", fmt.Errorf("품목 조회 실패: %w", err)
			}
			return string(data), nil
		},
	}
}

type searchManufacturersInput struct {
	Keyword string `json:"keyword,omitempty"`
	Limit   int    `json:"limit,omitempty"`
}

func toolSearchManufacturers() assistantTool {
	return assistantTool{
		name:        "search_manufacturers",
		description: "제조사(manufacturers) 검색. name_kr/name_en/short_name 부분일치. 모든 역할 호출 가능.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"properties":{
				"keyword":{"type":"string","description":"제조사 이름 부분일치(한국어/영어/약칭)"},
				"limit":{"type":"integer","description":"기본 20, 최대 50"}
			}
		}`),
		allow: func(ctx context.Context) bool { return middleware.GetUserID(ctx) != "" },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args searchManufacturersInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 20, 50)
			q := db.From("manufacturers").Select(
				"manufacturer_id,name_kr,name_en,short_name,country,domestic_foreign,is_active",
				"exact", false,
			)
			if v := strings.TrimSpace(args.Keyword); v != "" {
				q = q.Or(fmt.Sprintf("name_kr.ilike.%%%s%%,name_en.ilike.%%%s%%,short_name.ilike.%%%s%%", v, v, v), "")
			}
			q = q.Order("priority_rank", &postgrest.OrderOpts{Ascending: true}).Limit(limit, "")
			data, _, err := q.Execute()
			if err != nil {
				return "", fmt.Errorf("제조사 조회 실패: %w", err)
			}
			return string(data), nil
		},
	}
}

type searchCompaniesInput struct {
	Keyword string `json:"keyword,omitempty"`
	Limit   int    `json:"limit,omitempty"`
}

func toolSearchCompanies() assistantTool {
	return assistantTool{
		name:        "search_companies",
		description: "법인(companies) 검색. company_name/company_code 부분일치. 모든 역할 호출 가능.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"properties":{
				"keyword":{"type":"string","description":"법인명/코드 부분일치"},
				"limit":{"type":"integer","description":"기본 20, 최대 50"}
			}
		}`),
		allow: func(ctx context.Context) bool { return middleware.GetUserID(ctx) != "" },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args searchCompaniesInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 20, 50)
			q := db.From("companies").Select("company_id,company_name,company_code,is_active", "exact", false)
			if v := strings.TrimSpace(args.Keyword); v != "" {
				q = q.Or(fmt.Sprintf("company_name.ilike.%%%s%%,company_code.ilike.%%%s%%", v, v), "")
			}
			q = q.Order("company_code", &postgrest.OrderOpts{Ascending: true}).Limit(limit, "")
			data, _, err := q.Execute()
			if err != nil {
				return "", fmt.Errorf("법인 조회 실패: %w", err)
			}
			return string(data), nil
		},
	}
}

type searchWarehousesInput struct {
	Keyword string `json:"keyword,omitempty"`
	Limit   int    `json:"limit,omitempty"`
}

func toolSearchWarehouses() assistantTool {
	return assistantTool{
		name:        "search_warehouses",
		description: "창고(warehouses) 검색. 코드·이름·위치 부분일치. 창고 ID 확인용. 모든 역할 호출 가능.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"properties":{
				"keyword":{"type":"string","description":"warehouse_code/name/location 부분일치"},
				"limit":{"type":"integer","description":"기본 20, 최대 50"}
			}
		}`),
		allow: func(ctx context.Context) bool { return middleware.GetUserID(ctx) != "" },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args searchWarehousesInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 20, 50)
			q := db.From("warehouses").Select("warehouse_id,warehouse_code,warehouse_name,warehouse_type,location_code,location_name,is_active", "exact", false)
			if v := strings.TrimSpace(args.Keyword); v != "" {
				q = q.Or(fmt.Sprintf("warehouse_code.ilike.%%%s%%,warehouse_name.ilike.%%%s%%,location_name.ilike.%%%s%%", v, v, v), "")
			}
			q = q.Order("warehouse_code", &postgrest.OrderOpts{Ascending: true}).Limit(limit, "")
			data, _, err := q.Execute()
			if err != nil {
				return "", fmt.Errorf("창고 조회 실패: %w", err)
			}
			return string(data), nil
		},
	}
}

type searchSitesInput struct {
	Keyword   string `json:"keyword,omitempty"`
	CompanyID string `json:"company_id,omitempty"`
	SiteType  string `json:"site_type,omitempty"`
	Limit     int    `json:"limit,omitempty"`
}

func toolSearchConstructionSites() assistantTool {
	return assistantTool{
		name:        "search_construction_sites",
		description: "발전소·시공현장(construction_sites) 검색. 이름·지명 부분일치, 법인·유형(own/epc) 필터. 수주의 site_id 룩업용. 모든 역할 호출 가능.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"properties":{
				"keyword":{"type":"string","description":"name/location 부분일치"},
				"company_id":{"type":"string","description":"법인 ID 정확일치"},
				"site_type":{"type":"string","description":"own / epc"},
				"limit":{"type":"integer","description":"기본 20, 최대 50"}
			}
		}`),
		allow: func(ctx context.Context) bool { return middleware.GetUserID(ctx) != "" },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args searchSitesInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 20, 50)
			q := db.From("construction_sites").Select("site_id,company_id,name,location,site_type,capacity_mw,started_at,completed_at,is_active", "exact", false)
			if v := strings.TrimSpace(args.Keyword); v != "" {
				q = q.Or(fmt.Sprintf("name.ilike.%%%s%%,location.ilike.%%%s%%", v, v), "")
			}
			if v := strings.TrimSpace(args.CompanyID); v != "" {
				q = q.Eq("company_id", v)
			}
			if v := strings.TrimSpace(args.SiteType); v != "" {
				q = q.Eq("site_type", v)
			}
			q = q.Order("name", &postgrest.OrderOpts{Ascending: true}).Limit(limit, "")
			data, _, err := q.Execute()
			if err != nil {
				return "", fmt.Errorf("현장 조회 실패: %w", err)
			}
			return string(data), nil
		},
	}
}

// ===== 금융·물류 조회 =====

type searchLCInput struct {
	LCNumber string `json:"lc_number,omitempty"`
	POID     string `json:"po_id,omitempty"`
	BankID   string `json:"bank_id,omitempty"`
	DateFrom string `json:"date_from,omitempty"`
	DateTo   string `json:"date_to,omitempty"`
	Limit    int    `json:"limit,omitempty"`
}

func toolSearchLC() assistantTool {
	return assistantTool{
		name:        "search_lc",
		description: "L/C(신용장, lc_records) 검색. LC번호·PO·은행·개설일 범위로 필터. 탑솔라 테넌트 admin/operator/executive 만 호출 가능.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"properties":{
				"lc_number":{"type":"string","description":"LC 번호 부분일치"},
				"po_id":{"type":"string","description":"PO ID 정확일치"},
				"bank_id":{"type":"string","description":"은행 ID 정확일치"},
				"date_from":{"type":"string","description":"개설일 from(YYYY-MM-DD)"},
				"date_to":{"type":"string","description":"개설일 to(YYYY-MM-DD)"},
				"limit":{"type":"integer","description":"기본 20, 최대 50"}
			}
		}`),
		allow: func(ctx context.Context) bool {
			return roleIn(ctx, "admin", "operator", "executive") && tenantIs(ctx, middleware.TenantScopeTopsolar)
		},
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args searchLCInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 20, 50)
			q := db.From("lc_records").Select("lc_id,po_id,lc_number,bank_id,company_id,open_date,amount_usd,target_qty,target_mw,usance_days,maturity_date", "exact", false)
			if v := strings.TrimSpace(args.LCNumber); v != "" {
				q = q.Ilike("lc_number", "%"+v+"%")
			}
			if v := strings.TrimSpace(args.POID); v != "" {
				q = q.Eq("po_id", v)
			}
			if v := strings.TrimSpace(args.BankID); v != "" {
				q = q.Eq("bank_id", v)
			}
			if v := strings.TrimSpace(args.DateFrom); v != "" {
				q = q.Gte("open_date", v)
			}
			if v := strings.TrimSpace(args.DateTo); v != "" {
				q = q.Lte("open_date", v)
			}
			q = q.Order("open_date", &postgrest.OrderOpts{Ascending: false}).Limit(limit, "")
			data, _, err := q.Execute()
			if err != nil {
				return "", fmt.Errorf("LC 조회 실패: %w", err)
			}
			return string(data), nil
		},
	}
}

type searchBLInput struct {
	BLNumber       string `json:"bl_number,omitempty"`
	POID           string `json:"po_id,omitempty"`
	ManufacturerID string `json:"manufacturer_id,omitempty"`
	DateFrom       string `json:"date_from,omitempty"`
	DateTo         string `json:"date_to,omitempty"`
	Limit          int    `json:"limit,omitempty"`
}

func toolSearchBL() assistantTool {
	return assistantTool{
		name:        "search_bl",
		description: "B/L 입고(bl_shipments) 검색. BL번호·PO·제조사·ETA 범위로 필터. admin/operator/executive 만 호출 가능.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"properties":{
				"bl_number":{"type":"string","description":"BL 번호 부분일치"},
				"po_id":{"type":"string","description":"PO ID 정확일치"},
				"manufacturer_id":{"type":"string","description":"제조사 ID 정확일치"},
				"date_from":{"type":"string","description":"ETA from(YYYY-MM-DD)"},
				"date_to":{"type":"string","description":"ETA to(YYYY-MM-DD)"},
				"limit":{"type":"integer","description":"기본 20, 최대 50"}
			}
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator", "executive") },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args searchBLInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 20, 50)
			q := db.From("bl_shipments").Select("bl_id,bl_number,po_id,lc_id,company_id,manufacturer_id,inbound_type,currency,etd,eta,actual_arrival", "exact", false)
			if v := strings.TrimSpace(args.BLNumber); v != "" {
				q = q.Ilike("bl_number", "%"+v+"%")
			}
			if v := strings.TrimSpace(args.POID); v != "" {
				q = q.Eq("po_id", v)
			}
			if v := strings.TrimSpace(args.ManufacturerID); v != "" {
				q = q.Eq("manufacturer_id", v)
			}
			if v := strings.TrimSpace(args.DateFrom); v != "" {
				q = q.Gte("eta", v)
			}
			if v := strings.TrimSpace(args.DateTo); v != "" {
				q = q.Lte("eta", v)
			}
			q = q.Order("eta", &postgrest.OrderOpts{Ascending: false}).Limit(limit, "")
			data, _, err := q.Execute()
			if err != nil {
				return "", fmt.Errorf("B/L 조회 실패: %w", err)
			}
			return string(data), nil
		},
	}
}

type searchDeclarationsInput struct {
	DeclarationNumber string `json:"declaration_number,omitempty"`
	BLID              string `json:"bl_id,omitempty"`
	DateFrom          string `json:"date_from,omitempty"`
	DateTo            string `json:"date_to,omitempty"`
	Limit             int    `json:"limit,omitempty"`
}

func toolSearchDeclarations() assistantTool {
	return assistantTool{
		name:        "search_declarations",
		description: "면장(declarations, 통관 신고필증) 검색. 신고번호·BL·신고일 범위로 필터. 탑솔라 테넌트 admin/operator/executive 만 호출 가능.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"properties":{
				"declaration_number":{"type":"string","description":"신고번호 부분일치"},
				"bl_id":{"type":"string","description":"BL ID 정확일치"},
				"date_from":{"type":"string","description":"신고일 from(YYYY-MM-DD)"},
				"date_to":{"type":"string","description":"신고일 to(YYYY-MM-DD)"},
				"limit":{"type":"integer","description":"기본 20, 최대 50"}
			}
		}`),
		allow: func(ctx context.Context) bool {
			return roleIn(ctx, "admin", "operator", "executive") && tenantIs(ctx, middleware.TenantScopeTopsolar)
		},
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args searchDeclarationsInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 20, 50)
			q := db.From("declarations").Select("*", "exact", false)
			if v := strings.TrimSpace(args.DeclarationNumber); v != "" {
				q = q.Ilike("declaration_number", "%"+v+"%")
			}
			if v := strings.TrimSpace(args.BLID); v != "" {
				q = q.Eq("bl_id", v)
			}
			if v := strings.TrimSpace(args.DateFrom); v != "" {
				q = q.Gte("declaration_date", v)
			}
			if v := strings.TrimSpace(args.DateTo); v != "" {
				q = q.Lte("declaration_date", v)
			}
			q = q.Order("declaration_date", &postgrest.OrderOpts{Ascending: false}).Limit(limit, "")
			data, _, err := q.Execute()
			if err != nil {
				return "", fmt.Errorf("면장 조회 실패: %w", err)
			}
			return string(data), nil
		},
	}
}

// ===== 수주·출고 update/delete =====
