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
		description: "거래처(partners) 검색. 이름 부분일치 또는 유형(customer/supplier)으로 필터. 거래처 이름만 알 때 partner_id 룩업의 시작점 — search_orders/search_receipts 호출 전에 먼저 호출. 호출 결과는 {rows,count,hint?} 형태.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"keyword": {"type": "string", "description": "거래처 이름 부분일치 — 와일드카드/% 문자 직접 입력 금지(서버가 처리)"},
				"partner_type": {"type": "string", "description": "거래처 유형(주요 값: customer, supplier)"},
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
			return wrapToolResult(data, "거래처가 없습니다. keyword 를 더 짧은 부분 문자열로 줄이거나 partner_type 필터를 빼고 다시 시도하세요.")
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
		description: "P/O(발주) 검색. PO 번호·제조사명·상태·계약일 범위로 필터. manager/viewer 역할은 호출 불가. module 계열 테넌트(topsolar/cable) 만 노출 — baro 는 직수입을 안 함 (그룹사 매입요청으로 대체). 결과의 manufacturer_name 은 view 가 자동 제공 — 추가 search_manufacturers 불필요.",
		allowScopes: []string{middleware.TenantScopeTopsolar, middleware.TenantScopeCable},
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"po_number": {"type": "string", "description": "PO 번호 부분일치 — 와일드카드/% 직접 입력 금지"},
				"manufacturer_keyword": {"type": "string", "description": "제조사 이름(한국어) 부분일치 — 와일드카드/% 직접 입력 금지"},
				"status": {"type": "string", "description": "PO 상태(자유 문자열, 정확일치). 모르면 비워두고 결과로 가용 값 확인"},
				"date_from": {"type": "string", "description": "계약일 from(YYYY-MM-DD). 단일일자면 date_from=date_to 동일값"},
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
			return wrapToolResult(data, "조건에 맞는 P/O 가 없습니다. 날짜 범위를 넓히거나 manufacturer_keyword 를 더 짧게 시도하세요.")
		},
	}
}

// --- create_note (write — 사용자 확인 후 commit) ---

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
		description: "수주(orders) 검색. 수주번호·고객 ID·주문일 범위로 필터. manager/viewer 역할은 호출 불가. 고객 이름만 알면 search_partners 로 partner_id 를 먼저 확보 — 추측한 customer_id 호출 금지. 결과 product_id/customer_id 는 UUID — 사람이 읽는 이름이 필요하면 search_products / search_partners 후속 호출.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"order_number": {"type": "string", "description": "수주번호 부분일치 — 와일드카드/% 직접 입력 금지"},
				"customer_id": {"type": "string", "description": "고객 partner_id 정확일치(UUID). 모르면 search_partners 먼저"},
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
			return wrapToolResult(data, "조건에 맞는 수주가 없습니다. 날짜 범위를 넓히거나 customer_id 필터를 빼고 다시 시도하세요.")
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
		description: "출고/판매(outbounds) 검색. 수주ID·품목ID·상태·출고일 범위로 필터. manager/viewer 역할은 호출 불가. order_id/product_id 는 UUID — 모르면 search_orders / search_products 로 먼저 확보. 결과 ID 들의 이름이 필요하면 후속 호출.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"order_id": {"type": "string", "description": "수주 ID 정확일치(UUID)"},
				"product_id": {"type": "string", "description": "품목 ID 정확일치(UUID)"},
				"status": {"type": "string", "description": "출고 상태(자유 문자열, 정확일치). 모르면 비워두고 결과로 가용 값 확인"},
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
			return wrapToolResult(data, "조건에 맞는 출고 내역이 없습니다. 날짜 범위를 넓히거나 status·order_id 필터를 빼고 다시 시도하세요.")
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
		description: "수금(receipts) 검색. 거래처 ID·수금일 범위로 필터. 미수금 권한이 있는 admin/operator/executive 만 호출 가능. partner_id 모르면 search_partners 먼저 — 추측한 ID 호출 금지.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"partner_id": {"type": "string", "description": "거래처 partner_id 정확일치(UUID)"},
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
			return wrapToolResult(data, "조건에 맞는 수금 내역이 없습니다. 날짜 범위를 넓히거나 partner_id 필터를 빼고 다시 시도하세요.")
		},
	}
}

// --- create_partner (write — 사용자 확인 후 commit) ---

type searchProductsInput struct {
	Keyword        string `json:"keyword,omitempty"`
	ManufacturerID string `json:"manufacturer_id,omitempty"`
	Limit          int    `json:"limit,omitempty"`
}

func toolSearchProducts() assistantTool {
	return assistantTool{
		name:        "search_products",
		description: "품목(products) 검색. product_code/product_name 부분일치 또는 제조사 ID로 필터. ID·스펙 조회용 — 모든 역할 호출 가능. 제조사 이름만 알 때는 search_manufacturers 로 manufacturer_id 먼저 확보.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"additionalProperties": false,
			"properties":{
				"keyword":{"type":"string","description":"product_code·product_name 부분일치 — 와일드카드/% 직접 입력 금지"},
				"manufacturer_id":{"type":"string","description":"제조사 ID 정확일치(UUID)"},
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
			return wrapToolResult(data, "조건에 맞는 품목이 없습니다. keyword 를 더 짧게 시도하거나 manufacturer_id 필터를 빼세요.")
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
		description: "제조사(manufacturers) 검색. name_kr/name_en/short_name 부분일치. 모든 역할 호출 가능. manufacturer_id 룩업 시작점 — search_products/search_purchase_orders 호출 전에 사용.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"additionalProperties": false,
			"properties":{
				"keyword":{"type":"string","description":"제조사 이름 부분일치(한국어/영어/약칭) — 와일드카드/% 직접 입력 금지"},
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
			return wrapToolResult(data, "조건에 맞는 제조사가 없습니다. keyword 를 더 짧게(2~3글자) 시도하세요.")
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
		description: "법인(companies) 검색. company_name/company_code 부분일치. 모든 역할 호출 가능. company_id 룩업 — search_construction_sites 등에서 필요.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"additionalProperties": false,
			"properties":{
				"keyword":{"type":"string","description":"법인명/코드 부분일치 — 와일드카드/% 직접 입력 금지"},
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
			return wrapToolResult(data, "조건에 맞는 법인이 없습니다. keyword 를 더 짧게 시도하세요.")
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
		description: "창고(warehouses) 검색. 코드·이름·위치 부분일치. create_outbound의 warehouse_id 룩업용. 모든 역할 호출 가능.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"additionalProperties": false,
			"properties":{
				"keyword":{"type":"string","description":"warehouse_code/name/location 부분일치 — 와일드카드/% 직접 입력 금지"},
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
			return wrapToolResult(data, "조건에 맞는 창고가 없습니다. keyword 를 더 짧게 시도하세요.")
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
			"additionalProperties": false,
			"properties":{
				"keyword":{"type":"string","description":"name/location 부분일치 — 와일드카드/% 직접 입력 금지"},
				"company_id":{"type":"string","description":"법인 ID 정확일치(UUID)"},
				"site_type":{"type":"string","enum":["own","epc"],"description":"own=자가/관계사 발전소, epc=시공 외주 현장"},
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
			return wrapToolResult(data, "조건에 맞는 현장이 없습니다. keyword/site_type/company_id 필터 중 하나를 빼고 다시 시도하세요.")
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
		description: "L/C(신용장, lc_records) 검색. LC번호·PO·은행·개설일 범위로 필터. module 계열 테넌트(topsolar/cable) admin/operator/executive 만 호출 가능. baro 테넌트엔 노출 안 됨. po_id 모르면 search_purchase_orders 먼저.",
		allowScopes: []string{middleware.TenantScopeTopsolar, middleware.TenantScopeCable},
		inputSchema: json.RawMessage(`{
			"type":"object",
			"additionalProperties": false,
			"properties":{
				"lc_number":{"type":"string","description":"LC 번호 부분일치 — 와일드카드/% 직접 입력 금지"},
				"po_id":{"type":"string","description":"PO ID 정확일치(UUID)"},
				"bank_id":{"type":"string","description":"은행 ID 정확일치(UUID)"},
				"date_from":{"type":"string","description":"개설일 from(YYYY-MM-DD)"},
				"date_to":{"type":"string","description":"개설일 to(YYYY-MM-DD)"},
				"limit":{"type":"integer","description":"기본 20, 최대 50"}
			}
		}`),
		allow: func(ctx context.Context) bool {
			return roleIn(ctx, "admin", "operator", "executive") &&
				tenantIs(ctx, middleware.TenantScopeTopsolar, middleware.TenantScopeCable)
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
			return wrapToolResult(data, "조건에 맞는 L/C 가 없습니다. 날짜 범위를 넓히거나 po_id/bank_id 필터를 빼고 다시 시도하세요.")
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
		description: "B/L 입고(bl_shipments) 검색. BL번호·PO·제조사·ETA 범위로 필터. admin/operator/executive 만 호출 가능. module 계열 테넌트(topsolar/cable) 만 노출 — baro 의 입고 정보는 sanitized 보드(/baro/incoming) 에서만 조회 가능. po_id/manufacturer_id 모르면 각각 search_purchase_orders/search_manufacturers 먼저.",
		allowScopes: []string{middleware.TenantScopeTopsolar, middleware.TenantScopeCable},
		inputSchema: json.RawMessage(`{
			"type":"object",
			"additionalProperties": false,
			"properties":{
				"bl_number":{"type":"string","description":"BL 번호 부분일치 — 와일드카드/% 직접 입력 금지"},
				"po_id":{"type":"string","description":"PO ID 정확일치(UUID)"},
				"manufacturer_id":{"type":"string","description":"제조사 ID 정확일치(UUID)"},
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
			return wrapToolResult(data, "조건에 맞는 B/L 이 없습니다. ETA 날짜 범위를 넓히거나 po_id/manufacturer_id 필터를 빼고 다시 시도하세요.")
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
		description: "면장(declarations, 통관 신고필증) 검색. 신고번호·BL·신고일 범위로 필터. module 계열 테넌트(topsolar/cable) admin/operator/executive 만 호출 가능. baro 테넌트엔 노출 안 됨. bl_id 모르면 search_bl 먼저.",
		allowScopes: []string{middleware.TenantScopeTopsolar, middleware.TenantScopeCable},
		inputSchema: json.RawMessage(`{
			"type":"object",
			"additionalProperties": false,
			"properties":{
				"declaration_number":{"type":"string","description":"신고번호 부분일치 — 와일드카드/% 직접 입력 금지"},
				"bl_id":{"type":"string","description":"BL ID 정확일치(UUID)"},
				"date_from":{"type":"string","description":"신고일 from(YYYY-MM-DD)"},
				"date_to":{"type":"string","description":"신고일 to(YYYY-MM-DD)"},
				"limit":{"type":"integer","description":"기본 20, 최대 50"}
			}
		}`),
		allow: func(ctx context.Context) bool {
			return roleIn(ctx, "admin", "operator", "executive") &&
				tenantIs(ctx, middleware.TenantScopeTopsolar, middleware.TenantScopeCable)
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
			return wrapToolResult(data, "조건에 맞는 면장이 없습니다. 날짜 범위를 넓히거나 bl_id 필터를 빼고 다시 시도하세요.")
		},
	}
}

// --- search_partner_activities ---

type searchPartnerActivitiesInput struct {
	PartnerID string `json:"partner_id"`
	Kind      string `json:"kind,omitempty"`
	OpenOnly  bool   `json:"open_followups_only,omitempty"`
	Limit     int    `json:"limit,omitempty"`
}

func toolSearchPartnerActivities() assistantTool {
	return assistantTool{
		name:        "search_partner_activities",
		description: "거래처 활동 로그 (partner_activities) — 통화·방문·메일·메모 + 후속(follow-up) 추적. partner_id 필수 — search_partners 로 먼저 룩업. baro 의 채권 보드 (list_baro_credit_board) 와 짝 — 외상이 비정상이거나 미수가 길면 이 도구로 최근 접촉 이력 확인. 모든 테넌트 사용 가능.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"required": ["partner_id"],
			"properties": {
				"partner_id":           {"type": "string", "description": "거래처 ID (UUID). 필수"},
				"kind":                 {"type": "string", "description": "활동 유형 (call/visit/email/memo). 비우면 전체"},
				"open_followups_only":  {"type": "boolean", "description": "true 면 후속 미처리(follow_up_required=true AND follow_up_done=false)만"},
				"limit":                {"type": "integer", "description": "최대 결과 수, 기본 30, 최대 100"}
			}
		}`),
		allow: func(ctx context.Context) bool { return middleware.GetUserID(ctx) != "" },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args searchPartnerActivitiesInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			args.PartnerID = strings.TrimSpace(args.PartnerID)
			if args.PartnerID == "" {
				return "", fmt.Errorf("partner_id 는 필수입니다 — search_partners 로 먼저 ID 를 조회하세요")
			}
			limit := clampLimit(args.Limit, 30, 100)
			q := db.From("partner_activities").
				Select("*", "exact", false).
				Eq("partner_id", args.PartnerID)
			if kind := strings.TrimSpace(args.Kind); kind != "" {
				q = q.Eq("kind", kind)
			}
			if args.OpenOnly {
				q = q.Eq("follow_up_required", "true").Eq("follow_up_done", "false")
			}
			data, _, err := q.
				Order("created_at", &postgrest.OrderOpts{Ascending: false}).
				Limit(limit, "").
				Execute()
			if err != nil {
				return "", fmt.Errorf("활동 로그 조회 실패: %w", err)
			}
			return wrapToolResult(data, "활동 기록이 없습니다. partner_id 가 정확한지 확인하거나 영업이 아직 접촉 이력을 입력하지 않았을 수 있습니다.")
		},
	}
}

// ===== 수주·출고 update/delete =====

