package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
)

// assistantTool — LLM에 노출하는 읽기 전용 DB 조회 도구.
// allow(ctx)로 역할 기반 노출/차단을 결정하고, execute는 결과 JSON 문자열을 반환.
type assistantTool struct {
	name        string
	description string
	inputSchema json.RawMessage
	allow       func(ctx context.Context) bool
	execute     func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error)
}

func roleIn(ctx context.Context, allowed ...string) bool {
	role := middleware.GetUserRole(ctx)
	for _, r := range allowed {
		if r == role {
			return true
		}
	}
	return false
}

// assistantToolCatalog — 등록 순서가 곧 LLM 노출 순서.
func assistantToolCatalog() []assistantTool {
	return []assistantTool{
		toolSearchPartners(),
		toolSearchPurchaseOrders(),
		toolSearchOrders(),
		toolSearchOutbound(),
		toolSearchReceipts(),
		toolCreateNote(),
		toolCreatePartner(),
	}
}

func availableAssistantTools(ctx context.Context) []assistantTool {
	all := assistantToolCatalog()
	out := make([]assistantTool, 0, len(all))
	for _, t := range all {
		if t.allow(ctx) {
			out = append(out, t)
		}
	}
	return out
}

func dispatchAssistantTool(ctx context.Context, db *supa.Client, name string, input json.RawMessage) (string, error) {
	for _, t := range availableAssistantTools(ctx) {
		if t.name == name {
			log.Printf("[assistant tool] role=%s name=%s input=%s",
				middleware.GetUserRole(ctx), name, truncate(string(input), 200))
			out, err := t.execute(ctx, db, input)
			if err != nil {
				log.Printf("[assistant tool] role=%s name=%s error=%v",
					middleware.GetUserRole(ctx), name, err)
			}
			return out, err
		}
	}
	return "", fmt.Errorf("도구를 찾을 수 없거나 권한이 없습니다: %s", name)
}

// 안전한 limit 정규화 — 음수/0/과도값 차단.
func clampLimit(v, def, max int) int {
	if v <= 0 {
		return def
	}
	if v > max {
		return max
	}
	return v
}

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

// --- create_note (write — 사용자 확인 후 commit) ---

func toolCreateNote() assistantTool {
	return assistantTool{
		name: "create_note",
		description: "메모(note)를 작성합니다. 즉시 저장되지 않고 '제안'이 생성되며, 사용자가 UI 카드에서 [저장]을 눌러야 실제 DB에 들어갑니다. [거부] 시 폐기. 호출 후에는 사용자에게 작성 의도를 한 번 더 확인받으세요. linked_table에는 purchase_orders / bl_shipments / outbounds / orders / declarations 만 사용 가능.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"content": {"type": "string", "description": "메모 본문(필수, 2000자 이내)"},
				"linked_table": {"type": "string", "description": "연결 대상 테이블 (purchase_orders / bl_shipments / outbounds / orders / declarations)"},
				"linked_id": {"type": "string", "description": "연결 대상 행의 id (linked_table 지정 시 필수)"}
			},
			"required": ["content"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			userID := middleware.GetUserID(ctx)
			if userID == "" {
				return "", fmt.Errorf("인증 정보 없음")
			}

			var args model.CreateNoteRequest
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			// 클라이언트 입력의 user_id는 무시하고 JWT에서 강제 주입
			args.UserID = userID

			if msg := args.Validate(); msg != "" {
				return "", fmt.Errorf("검증 실패: %s", msg)
			}

			payload, err := json.Marshal(args)
			if err != nil {
				return "", fmt.Errorf("페이로드 직렬화 실패: %w", err)
			}

			id := uuid.NewString()
			summary := buildCreateNoteSummary(args)
			now := time.Now()
			p := &assistantProposal{
				ID:        id,
				UserID:    userID,
				Kind:      "create_note",
				Summary:   summary,
				Payload:   payload,
				CreatedAt: now,
				ExpiresAt: now.Add(proposalTTL),
			}
			globalProposalStore.put(p)

			if c := proposalCollectorFrom(ctx); c != nil {
				c.add(proposalSummary{
					ID: id, Kind: p.Kind, Summary: summary, Payload: payload,
				})
			}

			log.Printf("[assistant write/propose] role=%s user=%s kind=create_note id=%s",
				middleware.GetUserRole(ctx), userID, id)

			return fmt.Sprintf(
				"메모 작성 제안이 생성되었습니다(id=%s, 30분 내 확인 필요). 사용자가 우측 카드에서 [저장]을 눌러야 실제로 저장됩니다. 사용자에게 작성 내용을 한 번 더 확인해달라고 안내하세요.",
				id,
			), nil
		},
	}
}

// --- search_orders ---

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

// --- create_partner (write — 사용자 확인 후 commit) ---

func toolCreatePartner() assistantTool {
	return assistantTool{
		name: "create_partner",
		description: "거래처(partners) 신규 등록. 즉시 저장되지 않고 '제안'이 생성되며, 사용자가 UI 카드에서 [저장]을 눌러야 실제 DB에 들어갑니다. partner_type은 customer / supplier 등.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"partner_name": {"type": "string", "description": "거래처명(필수, 100자 이내)"},
				"partner_type": {"type": "string", "description": "거래처 유형(필수, 예: customer, supplier)"},
				"erp_code": {"type": "string", "description": "ERP 코드"},
				"payment_terms": {"type": "string", "description": "결제 조건"},
				"contact_name": {"type": "string", "description": "담당자 이름"},
				"contact_phone": {"type": "string", "description": "담당자 전화"},
				"contact_email": {"type": "string", "description": "담당자 이메일"}
			},
			"required": ["partner_name", "partner_type"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			userID := middleware.GetUserID(ctx)
			if userID == "" {
				return "", fmt.Errorf("인증 정보 없음")
			}

			var args model.CreatePartnerRequest
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}
			if msg := args.Validate(); msg != "" {
				return "", fmt.Errorf("검증 실패: %s", msg)
			}

			payload, err := json.Marshal(args)
			if err != nil {
				return "", fmt.Errorf("페이로드 직렬화 실패: %w", err)
			}

			id := uuid.NewString()
			summary := fmt.Sprintf("거래처 등록: %s (%s)", args.PartnerName, args.PartnerType)
			now := time.Now()
			p := &assistantProposal{
				ID:        id,
				UserID:    userID,
				Kind:      "create_partner",
				Summary:   summary,
				Payload:   payload,
				CreatedAt: now,
				ExpiresAt: now.Add(proposalTTL),
			}
			globalProposalStore.put(p)

			if c := proposalCollectorFrom(ctx); c != nil {
				c.add(proposalSummary{
					ID: id, Kind: p.Kind, Summary: summary, Payload: payload,
				})
			}

			log.Printf("[assistant write/propose] role=%s user=%s kind=create_partner id=%s",
				middleware.GetUserRole(ctx), userID, id)

			return fmt.Sprintf(
				"거래처 등록 제안이 생성되었습니다(id=%s, 30분 내 확인 필요). 사용자가 우측 카드에서 [저장]을 눌러야 실제로 등록됩니다. 사용자에게 거래처명·유형·연락처 등을 한 번 더 확인해달라고 안내하세요.",
				id,
			), nil
		},
	}
}

func buildCreateNoteSummary(req model.CreateNoteRequest) string {
	body := strings.TrimSpace(req.Content)
	if len([]rune(body)) > 80 {
		body = string([]rune(body)[:80]) + "…"
	}
	if req.LinkedTable != nil && *req.LinkedTable != "" && req.LinkedID != nil && *req.LinkedID != "" {
		return fmt.Sprintf("메모 작성: %q (연결: %s/%s)", body, *req.LinkedTable, *req.LinkedID)
	}
	return fmt.Sprintf("메모 작성: %q", body)
}
