package handler

// AI 어시스턴트 — baro 테넌트 전용 검색 도구.
// 모든 도구 allowScopes=["baro"] — module 계열(topsolar/cable) 사용자에게는 catalog 에서 사라진다.
// baro 화면 핸들러(baro_*.go) 와 동일한 컬럼·필터 규약을 따른다 — 한 곳이 바뀌면 두 곳을 함께 갱신.

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/dbrpc"
	"solarflow-backend/internal/middleware"
)

// ─── list_baro_credit_board ───────────────────────────────────────────────────

func toolBaroCreditBoard() assistantTool {
	return assistantTool{
		name:        "list_baro_credit_board",
		description: "바로(주) 채권 보드 — 활성 customer/both 거래처별 누적매출/입금/미수잔액·한도(credit_limit_krw)·한도사용률·최장미수일(payment_days). DB RPC `baro_credit_board` 호출. 입력 인자 없음 — 항상 전체 행 반환. 그룹내 거래는 집계 제외 (의도적). admin/operator 만.",
		allowScopes: []string{middleware.TenantScopeBaro},
		inputSchema: json.RawMessage(`{"type": "object", "additionalProperties": false, "properties": {}}`),
		allow:       func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, _ *supa.Client, _ json.RawMessage) (string, error) {
			body, err := dbrpc.Call(ctx, "baro_credit_board", map[string]interface{}{})
			if err != nil {
				return "", fmt.Errorf("채권 보드 RPC 호출 실패: %w", err)
			}
			return wrapToolResult(body, "채권 보드에 행이 없습니다. 활성 거래처가 있는지 확인하세요.")
		},
	}
}

// ─── list_baro_dispatch_routes ────────────────────────────────────────────────

type baroDispatchInput struct {
	From   string `json:"from,omitempty"`
	To     string `json:"to,omitempty"`
	Status string `json:"status,omitempty"`
	Limit  int    `json:"limit,omitempty"`
}

func toolBaroDispatchRoutes() assistantTool {
	return assistantTool{
		name:        "list_baro_dispatch_routes",
		description: "바로(주) 배차 슬롯 (dispatch_routes) 검색. 일자 범위(from/to)·상태(planned/dispatched/completed/cancelled) 필터. 결과는 route_date 내림차순. 차량별 출고 라인은 list_baro_dispatch_outbounds 별도 호출. admin/operator 만.",
		allowScopes: []string{middleware.TenantScopeBaro},
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"from":   {"type": "string", "description": "route_date from(YYYY-MM-DD). 비우면 제한 없음"},
				"to":     {"type": "string", "description": "route_date to(YYYY-MM-DD). 비우면 제한 없음"},
				"status": {"type": "string", "description": "배차 상태(planned/dispatched/completed/cancelled). 비우면 전체"},
				"limit":  {"type": "integer", "description": "최대 결과 수, 기본 30, 최대 100"}
			}
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args baroDispatchInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 30, 100)
			q := db.From("dispatch_routes").Select("*", "exact", false)
			if from := strings.TrimSpace(args.From); from != "" {
				q = q.Gte("route_date", from)
			}
			if to := strings.TrimSpace(args.To); to != "" {
				q = q.Lte("route_date", to)
			}
			if status := strings.TrimSpace(args.Status); status != "" {
				q = q.Eq("status", status)
			}
			data, _, err := q.
				Order("route_date", &postgrest.OrderOpts{Ascending: false}).
				Order("created_at", &postgrest.OrderOpts{Ascending: false}).
				Limit(limit, "").
				Execute()
			if err != nil {
				return "", fmt.Errorf("배차 목록 조회 실패: %w", err)
			}
			return wrapToolResult(data, "조건에 맞는 배차가 없습니다. 날짜 범위를 넓히거나 status 필터를 빼고 다시 시도하세요.")
		},
	}
}

// ─── search_baro_partner_prices ───────────────────────────────────────────────

type baroPartnerPriceInput struct {
	PartnerID string `json:"partner_id,omitempty"`
	ProductID string `json:"product_id,omitempty"`
	Limit     int    `json:"limit,omitempty"`
}

func toolBaroPartnerPrices() assistantTool {
	return assistantTool{
		name:        "search_baro_partner_prices",
		description: "바로(주) 거래처×품번 단가표 (partner_price_book) 목록 검색. partner_id/product_id 로 필터. 결과는 effective_from 내림차순 — 같은 거래처·품번 행이 여러 개면 시간대별 단가 이력. 특정 시점의 유효 단가 1건이 필요하면 lookup_baro_partner_price 사용. admin/operator 만.",
		allowScopes: []string{middleware.TenantScopeBaro},
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"partner_id": {"type": "string", "description": "거래처 ID (UUID). search_partners 로 먼저 룩업"},
				"product_id": {"type": "string", "description": "품번 ID (UUID). search_products 로 먼저 룩업"},
				"limit":      {"type": "integer", "description": "최대 결과 수, 기본 30, 최대 100"}
			}
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args baroPartnerPriceInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 30, 100)
			q := db.From("partner_price_book").Select("*", "exact", false)
			if pid := strings.TrimSpace(args.PartnerID); pid != "" {
				q = q.Eq("partner_id", pid)
			}
			if prod := strings.TrimSpace(args.ProductID); prod != "" {
				q = q.Eq("product_id", prod)
			}
			data, _, err := q.
				Order("partner_id", &postgrest.OrderOpts{Ascending: true}).
				Order("product_id", &postgrest.OrderOpts{Ascending: true}).
				Order("effective_from", &postgrest.OrderOpts{Ascending: false}).
				Limit(limit, "").
				Execute()
			if err != nil {
				return "", fmt.Errorf("단가표 조회 실패: %w", err)
			}
			return wrapToolResult(data, "단가표 행이 없습니다. partner_id/product_id 가 정확한지, 또는 거래처·품번에 단가가 등록되어 있는지 확인하세요.")
		},
	}
}

// ─── lookup_baro_partner_price ────────────────────────────────────────────────

type baroPriceLookupInput struct {
	PartnerID string `json:"partner_id"`
	ProductID string `json:"product_id"`
	On        string `json:"on,omitempty"`
}

func toolBaroPartnerPriceLookup() assistantTool {
	return assistantTool{
		name:        "lookup_baro_partner_price",
		description: "바로(주) 특정 시점의 유효 단가 1건 룩업. effective_from <= on AND (effective_to IS NULL OR effective_to >= on) 의 가장 최근 effective_from 행. on 미지정 시 오늘 기준. 수주 입력 시 prefill 의 정본. admin/operator 만.",
		allowScopes: []string{middleware.TenantScopeBaro},
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"required": ["partner_id", "product_id"],
			"properties": {
				"partner_id": {"type": "string", "description": "거래처 ID (UUID). 필수"},
				"product_id": {"type": "string", "description": "품번 ID (UUID). 필수"},
				"on":         {"type": "string", "description": "기준일(YYYY-MM-DD). 비우면 오늘"}
			}
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args baroPriceLookupInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			args.PartnerID = strings.TrimSpace(args.PartnerID)
			args.ProductID = strings.TrimSpace(args.ProductID)
			if args.PartnerID == "" || args.ProductID == "" {
				return "", fmt.Errorf("partner_id 와 product_id 는 필수입니다")
			}
			on := strings.TrimSpace(args.On)
			if on == "" {
				on = time.Now().Format("2006-01-02")
			}
			data, _, err := db.From("partner_price_book").
				Select("*", "exact", false).
				Eq("partner_id", args.PartnerID).
				Eq("product_id", args.ProductID).
				Lte("effective_from", on).
				Or("effective_to.is.null,effective_to.gte."+on, "").
				Order("effective_from", &postgrest.OrderOpts{Ascending: false}).
				Limit(1, "").
				Execute()
			if err != nil {
				return "", fmt.Errorf("단가 룩업 실패: %w", err)
			}
			return wrapToolResult(data, fmt.Sprintf("기준일(%s) 에 유효한 단가가 없습니다. search_baro_partner_prices 로 등록된 단가표 자체가 있는지 먼저 확인하세요.", on))
		},
	}
}

// ─── search_baro_incoming ─────────────────────────────────────────────────────

type baroIncomingInput struct {
	Status    string `json:"status,omitempty"`
	CompanyID string `json:"company_id,omitempty"`
	Limit     int    `json:"limit,omitempty"`
}

func toolBaroIncoming() assistantTool {
	return assistantTool{
		name:        "search_baro_incoming",
		description: "바로(주) 입고예정 보드 (bl_shipments) — 금액·환율·원가 컬럼은 select 자체에서 제외 (D-116 sanitized). bl_number/eta/etd/actual_arrival/status/inbound_type/manufacturer_id/company_id/warehouse_id 만 조회. status 미지정 시 scheduled/shipping/arrived/customs 만. 전직급 조회 가능.",
		allowScopes: []string{middleware.TenantScopeBaro},
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"status":     {"type": "string", "description": "입고 상태 (scheduled/shipping/arrived/customs/completed). 비우면 활성 4 상태 모두"},
				"company_id": {"type": "string", "description": "회사 ID. 'all' 또는 비우면 전체"},
				"limit":      {"type": "integer", "description": "최대 결과 수, 기본 30, 최대 100"}
			}
		}`),
		allow: func(ctx context.Context) bool { return middleware.GetUserID(ctx) != "" },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args baroIncomingInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			limit := clampLimit(args.Limit, 30, 100)
			// sanitized 컬럼만 select — 금액·환율·원가는 의도적으로 빠져 있음.
			q := db.From("bl_shipments").
				Select("bl_id,bl_number,company_id,manufacturer_id,inbound_type,etd,eta,actual_arrival,port,warehouse_id,status", "exact", false).
				Eq("is_sandbox", "false")
			if status := strings.TrimSpace(args.Status); status != "" {
				q = q.Eq("status", status)
			} else {
				q = q.In("status", []string{"scheduled", "shipping", "arrived", "customs"})
			}
			if cid := strings.TrimSpace(args.CompanyID); cid != "" && cid != "all" {
				q = q.Eq("company_id", cid)
			}
			data, _, err := q.
				Order("eta", &postgrest.OrderOpts{Ascending: true}).
				Limit(limit, "").
				Execute()
			if err != nil {
				return "", fmt.Errorf("입고예정 조회 실패: %w", err)
			}
			return wrapToolResult(data, "입고예정 행이 없습니다. status 필터를 빼거나 company_id 를 'all' 로 하세요.")
		},
	}
}

// ─── search_baro_purchase_history ─────────────────────────────────────────────

type baroPurchaseHistoryInput struct {
	Status      string `json:"status,omitempty"`
	InboundType string `json:"inbound_type,omitempty"`
	From        string `json:"from,omitempty"`
	To          string `json:"to,omitempty"`
	Limit       int    `json:"limit,omitempty"`
}

func toolBaroPurchaseHistory() assistantTool {
	return assistantTool{
		name:        "search_baro_purchase_history",
		description: "바로(주) 자체 매입 이력 (bl_shipments where company=BR). 단가·환율 포함 (D-117). actual_arrival 내림차순. status/inbound_type/날짜범위 필터. admin/operator/executive 만 — viewer 는 호출 불가.",
		allowScopes: []string{middleware.TenantScopeBaro},
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"status":       {"type": "string", "description": "BL 상태 (completed/erp_done 등). 비우면 전체"},
				"inbound_type": {"type": "string", "description": "입고 유형 (group_internal/domestic 등). 비우면 전체"},
				"from":         {"type": "string", "description": "actual_arrival from(YYYY-MM-DD)"},
				"to":           {"type": "string", "description": "actual_arrival to(YYYY-MM-DD)"},
				"limit":        {"type": "integer", "description": "최대 결과 수, 기본 30, 최대 100"}
			}
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator", "executive") },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args baroPurchaseHistoryInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			baroCompanyID, err := lookupBaroCompanyID(db)
			if err != nil {
				return "", err
			}
			if baroCompanyID == "" {
				return wrapToolResult([]byte("[]"), "BR(바로) 법인 마스터가 미등록 — 관리자에게 companies 테이블에 company_code='BR' 행이 있는지 확인 요청하세요.")
			}
			limit := clampLimit(args.Limit, 30, 100)
			q := db.From("bl_shipments").
				Select("bl_id,bl_number,po_id,company_id,manufacturer_id,inbound_type,currency,exchange_rate,etd,eta,actual_arrival,port,warehouse_id,status,payment_terms,incoterms,counterpart_company_id", "exact", false).
				Eq("company_id", baroCompanyID)
			if status := strings.TrimSpace(args.Status); status != "" {
				q = q.Eq("status", status)
			}
			if it := strings.TrimSpace(args.InboundType); it != "" {
				q = q.Eq("inbound_type", it)
			}
			if from := strings.TrimSpace(args.From); from != "" {
				q = q.Gte("actual_arrival", from)
			}
			if to := strings.TrimSpace(args.To); to != "" {
				q = q.Lte("actual_arrival", to)
			}
			data, _, err := q.
				Order("actual_arrival", &postgrest.OrderOpts{Ascending: false}).
				Limit(limit, "").
				Execute()
			if err != nil {
				return "", fmt.Errorf("매입 이력 조회 실패: %w", err)
			}
			return wrapToolResult(data, "매입 이력이 없습니다. 날짜 범위를 넓히거나 status/inbound_type 필터를 빼고 다시 시도하세요. 라인별 단가가 필요하면 결과의 bl_id 로 search_bl 류 도구는 baro 에 없으니 운영자에게 화면(/baro/purchase-history) 에서 직접 확인 요청.")
		},
	}
}

// lookupBaroCompanyID — companies 테이블에서 company_code='BR' 행의 ID 단건 조회. baro 도구가 자체 매입 이력을
// 스코프할 때 사용. 호출 빈도가 낮아 캐싱 안 함 (호출당 한 쿼리).
func lookupBaroCompanyID(db *supa.Client) (string, error) {
	data, _, err := db.From("companies").
		Select("company_id", "exact", false).
		Eq("company_code", "BR").
		Limit(1, "").
		Execute()
	if err != nil {
		return "", fmt.Errorf("BR 법인 룩업 실패: %w", err)
	}
	var rows []struct {
		CompanyID string `json:"company_id"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return "", fmt.Errorf("BR 법인 응답 디코딩 실패: %w", err)
	}
	if len(rows) == 0 {
		return "", nil
	}
	return rows[0].CompanyID, nil
}
