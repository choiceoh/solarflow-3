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
		// 마스터 룩업
		toolSearchProducts(),
		toolSearchManufacturers(),
		toolSearchCompanies(),
		toolSearchWarehouses(),
		toolSearchConstructionSites(),
		// 거래·관계
		toolSearchPartners(),
		toolSearchPurchaseOrders(),
		toolSearchOrders(),
		toolSearchOutbound(),
		toolSearchReceipts(),
		// 금융·물류 (일부 topsolar 전용)
		toolSearchLC(),
		toolSearchBL(),
		toolSearchDeclarations(),
		// 쓰기 — 메모
		toolCreateNote(),
		toolUpdateNote(),
		toolDeleteNote(),
		// 쓰기 — 거래처
		toolCreatePartner(),
		toolUpdatePartner(),
		// 쓰기 — 거래
		toolCreateOrder(),
		toolUpdateOrder(),
		toolDeleteOrder(),
		toolCreateOutbound(),
		toolUpdateOutbound(),
		toolDeleteOutbound(),
		toolCreateReceipt(),
		toolCreateDeclaration(),
	}
}

// tenantIs — 현재 사용자의 테넌트 스코프 매칭.
func tenantIs(ctx context.Context, scope string) bool {
	return middleware.GetTenantScope(ctx) == scope
}

// fetchNoteOwner — notes 테이블에서 user_id를 꺼내 owner 검증용.
// 존재하지 않으면 ("", false, err==nil) — 호출 측이 not found 처리.
func fetchNoteOwner(db *supa.Client, noteID string) (string, bool, error) {
	type row struct {
		UserID string `json:"user_id"`
	}
	data, _, err := db.From("notes").
		Select("user_id", "exact", false).
		Eq("note_id", noteID).
		Execute()
	if err != nil {
		return "", false, err
	}
	var rows []row
	if err := json.Unmarshal(data, &rows); err != nil {
		return "", false, err
	}
	if len(rows) == 0 {
		return "", false, nil
	}
	return rows[0].UserID, true, nil
}

// fetchNoteContentSnippet — 삭제/수정 제안 카드에 보여줄 본문 일부(80자).
func fetchNoteContentSnippet(db *supa.Client, noteID string) (string, bool, error) {
	type row struct {
		Content string `json:"content"`
	}
	data, _, err := db.From("notes").
		Select("content", "exact", false).
		Eq("note_id", noteID).
		Execute()
	if err != nil {
		return "", false, err
	}
	var rows []row
	if err := json.Unmarshal(data, &rows); err != nil {
		return "", false, err
	}
	if len(rows) == 0 {
		return "", false, nil
	}
	c := rows[0].Content
	r := []rune(c)
	if len(r) > 80 {
		c = string(r[:80]) + "…"
	}
	return c, true, nil
}

// proposeWrite — 공통 제안 등록 헬퍼. 페이로드 직렬화 + store put + collector add + 로그.
func proposeWrite(ctx context.Context, kind, summary string, args interface{}) (string, error) {
	userID := middleware.GetUserID(ctx)
	if userID == "" {
		return "", fmt.Errorf("인증 정보 없음")
	}
	payload, err := json.Marshal(args)
	if err != nil {
		return "", fmt.Errorf("페이로드 직렬화 실패: %w", err)
	}
	id := uuid.NewString()
	now := time.Now()
	p := &assistantProposal{
		ID:        id,
		UserID:    userID,
		Kind:      kind,
		Summary:   summary,
		Payload:   payload,
		CreatedAt: now,
		ExpiresAt: now.Add(proposalTTL),
	}
	globalProposalStore.put(p)
	if c := proposalCollectorFrom(ctx); c != nil {
		c.add(proposalSummary{ID: id, Kind: kind, Summary: summary, Payload: payload})
	}
	log.Printf("[assistant write/propose] role=%s user=%s kind=%s id=%s",
		middleware.GetUserRole(ctx), userID, kind, id)
	return id, nil
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

// --- update_note (write — 본인 메모만) ---

type updateNoteToolInput struct {
	NoteID      string  `json:"note_id"`
	Content     *string `json:"content,omitempty"`
	LinkedTable *string `json:"linked_table,omitempty"`
	LinkedID    *string `json:"linked_id,omitempty"`
}

func toolUpdateNote() assistantTool {
	return assistantTool{
		name:        "update_note",
		description: "기존 메모 수정. 본인이 작성한 메모만 가능. content / linked_table+linked_id 중 변경할 필드만 지정.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"note_id": {"type": "string", "description": "수정할 메모의 note_id (필수)"},
				"content": {"type": "string", "description": "새 본문(2000자 이내)"},
				"linked_table": {"type": "string", "description": "연결 대상 테이블 변경 (purchase_orders / bl_shipments / outbounds / orders / declarations)"},
				"linked_id": {"type": "string", "description": "연결 대상 행 id 변경 (linked_table 지정 시 필수)"}
			},
			"required": ["note_id"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			userID := middleware.GetUserID(ctx)
			if userID == "" {
				return "", fmt.Errorf("인증 정보 없음")
			}
			var args updateNoteToolInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			if strings.TrimSpace(args.NoteID) == "" {
				return "", fmt.Errorf("note_id는 필수입니다")
			}
			owner, ok, err := fetchNoteOwner(db, args.NoteID)
			if err != nil {
				return "", fmt.Errorf("메모 조회 실패: %w", err)
			}
			if !ok {
				return "", fmt.Errorf("note_id=%s 메모를 찾을 수 없습니다", args.NoteID)
			}
			if owner != userID {
				return "", fmt.Errorf("본인이 작성한 메모만 수정할 수 있습니다")
			}

			// model의 UpdateNoteRequest 검증 재사용
			req := model.UpdateNoteRequest{
				Content:     args.Content,
				LinkedTable: args.LinkedTable,
				LinkedID:    args.LinkedID,
			}
			if msg := req.Validate(); msg != "" {
				return "", fmt.Errorf("검증 실패: %s", msg)
			}

			snippet, _, _ := fetchNoteContentSnippet(db, args.NoteID)
			summary := fmt.Sprintf("메모 수정: id=%s (현재: %q)", args.NoteID, snippet)

			id, err := proposeWrite(ctx, "update_note", summary, args)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("메모 수정 제안 생성됨(id=%s). 사용자가 [저장]을 눌러야 반영됩니다.", id), nil
		},
	}
}

// --- delete_note (write — 본인 메모만) ---

type deleteNoteToolInput struct {
	NoteID string `json:"note_id"`
}

func toolDeleteNote() assistantTool {
	return assistantTool{
		name:        "delete_note",
		description: "메모 삭제. 본인이 작성한 메모만 가능.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"note_id": {"type": "string", "description": "삭제할 메모의 note_id"}
			},
			"required": ["note_id"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			userID := middleware.GetUserID(ctx)
			if userID == "" {
				return "", fmt.Errorf("인증 정보 없음")
			}
			var args deleteNoteToolInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			if strings.TrimSpace(args.NoteID) == "" {
				return "", fmt.Errorf("note_id는 필수입니다")
			}
			owner, ok, err := fetchNoteOwner(db, args.NoteID)
			if err != nil {
				return "", fmt.Errorf("메모 조회 실패: %w", err)
			}
			if !ok {
				return "", fmt.Errorf("note_id=%s 메모를 찾을 수 없습니다", args.NoteID)
			}
			if owner != userID {
				return "", fmt.Errorf("본인이 작성한 메모만 삭제할 수 있습니다")
			}

			snippet, _, _ := fetchNoteContentSnippet(db, args.NoteID)
			summary := fmt.Sprintf("메모 삭제: id=%s (%q)", args.NoteID, snippet)

			id, err := proposeWrite(ctx, "delete_note", summary, args)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("메모 삭제 제안 생성됨(id=%s). 사용자가 [저장]을 눌러야 실제로 삭제됩니다.", id), nil
		},
	}
}

// --- update_partner (write) ---

type updatePartnerToolInput struct {
	PartnerID string `json:"partner_id"`
	model.UpdatePartnerRequest
}

func toolUpdatePartner() assistantTool {
	return assistantTool{
		name:        "update_partner",
		description: "거래처 정보 수정. partner_id 필수. 변경할 필드만 지정.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"partner_id": {"type": "string"},
				"partner_name": {"type": "string", "description": "100자 이내"},
				"partner_type": {"type": "string", "description": "supplier / customer / both 중 하나"},
				"erp_code": {"type": "string"},
				"payment_terms": {"type": "string"},
				"contact_name": {"type": "string"},
				"contact_phone": {"type": "string"},
				"contact_email": {"type": "string"},
				"credit_limit_krw": {"type": "number"},
				"credit_payment_days": {"type": "integer"}
			},
			"required": ["partner_id"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args updatePartnerToolInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			if strings.TrimSpace(args.PartnerID) == "" {
				return "", fmt.Errorf("partner_id는 필수입니다")
			}
			if msg := args.UpdatePartnerRequest.Validate(); msg != "" {
				return "", fmt.Errorf("검증 실패: %s", msg)
			}
			summary := fmt.Sprintf("거래처 수정: partner_id=%s", args.PartnerID)
			if args.PartnerName != nil {
				summary += fmt.Sprintf(", 이름→%s", *args.PartnerName)
			}
			id, err := proposeWrite(ctx, "update_partner", summary, args)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("거래처 수정 제안 생성됨(id=%s). [저장] 클릭 시 반영.", id), nil
		},
	}
}

// --- create_order (수주 등록) ---

func toolCreateOrder() assistantTool {
	return assistantTool{
		name:        "create_order",
		description: "수주(orders) 신규 등록. 필수: company_id, customer_id, order_date, receipt_method, product_id, quantity, unit_price_wp, status. receipt_method∈{purchase_order,phone,email,other}, status∈{received,partial,completed,cancelled}.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"order_number": {"type": "string"},
				"company_id": {"type": "string"},
				"customer_id": {"type": "string"},
				"order_date": {"type": "string", "description": "YYYY-MM-DD"},
				"receipt_method": {"type": "string"},
				"product_id": {"type": "string"},
				"quantity": {"type": "integer"},
				"capacity_kw": {"type": "number"},
				"unit_price_wp": {"type": "number"},
				"site_id": {"type": "string"},
				"site_name": {"type": "string"},
				"site_address": {"type": "string"},
				"site_contact": {"type": "string"},
				"site_phone": {"type": "string"},
				"payment_terms": {"type": "string"},
				"deposit_rate": {"type": "number"},
				"delivery_due": {"type": "string"},
				"status": {"type": "string"},
				"management_category": {"type": "string"},
				"fulfillment_source": {"type": "string"},
				"spare_qty": {"type": "integer"},
				"memo": {"type": "string"},
				"bl_id": {"type": "string"}
			},
			"required": ["company_id", "customer_id", "order_date", "receipt_method", "product_id", "quantity", "unit_price_wp", "status"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args model.CreateOrderRequest
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			if msg := args.Validate(); msg != "" {
				return "", fmt.Errorf("검증 실패: %s", msg)
			}
			summary := fmt.Sprintf(
				"수주 등록: customer=%s, product=%s, qty=%d, unit_price_wp=%.2f, date=%s, status=%s",
				args.CustomerID, args.ProductID, args.Quantity, args.UnitPriceWp, args.OrderDate, args.Status,
			)
			id, err := proposeWrite(ctx, "create_order", summary, args)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("수주 등록 제안 생성됨(id=%s). 사용자가 회사/고객/품목/수량/단가를 한 번 더 확인 후 [저장] 클릭 시 반영됩니다.", id), nil
		},
	}
}

// --- create_outbound (출고 등록) ---
// BLItems(B/L 라인 할당)는 v1에서 미지원 — 단순 출고 1건만.

type createOutboundToolInput struct {
	OutboundDate    string   `json:"outbound_date"`
	CompanyID       string   `json:"company_id"`
	ProductID       string   `json:"product_id"`
	Quantity        int      `json:"quantity"`
	CapacityKw      *float64 `json:"capacity_kw,omitempty"`
	WarehouseID     string   `json:"warehouse_id"`
	UsageCategory   string   `json:"usage_category"`
	OrderID         *string  `json:"order_id,omitempty"`
	SiteName        *string  `json:"site_name,omitempty"`
	SiteAddress     *string  `json:"site_address,omitempty"`
	SpareQty        *int     `json:"spare_qty,omitempty"`
	GroupTrade      *bool    `json:"group_trade,omitempty"`
	TargetCompanyID *string  `json:"target_company_id,omitempty"`
	ErpOutboundNo   *string  `json:"erp_outbound_no,omitempty"`
	Status          string   `json:"status,omitempty"`
	Memo            *string  `json:"memo,omitempty"`
	BLID            *string  `json:"bl_id,omitempty"`
}

func toolCreateOutbound() assistantTool {
	return assistantTool{
		name:        "create_outbound",
		description: "출고/판매 1건 등록. B/L 라인 할당(bl_items)은 미지원 — 필요 시 출고 메뉴에서 직접 입력 안내. 필수: outbound_date, company_id, product_id, quantity, warehouse_id, usage_category. usage_category∈{sale,sale_spare,construction,construction_damage,repowering,maintenance,disposal,transfer,adjustment,other}.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"outbound_date": {"type": "string"},
				"company_id": {"type": "string"},
				"product_id": {"type": "string"},
				"quantity": {"type": "integer"},
				"capacity_kw": {"type": "number"},
				"warehouse_id": {"type": "string"},
				"usage_category": {"type": "string"},
				"order_id": {"type": "string"},
				"site_name": {"type": "string"},
				"site_address": {"type": "string"},
				"spare_qty": {"type": "integer"},
				"group_trade": {"type": "boolean"},
				"target_company_id": {"type": "string"},
				"erp_outbound_no": {"type": "string"},
				"status": {"type": "string"},
				"memo": {"type": "string"},
				"bl_id": {"type": "string"}
			},
			"required": ["outbound_date", "company_id", "product_id", "quantity", "warehouse_id", "usage_category"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args createOutboundToolInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			req := model.CreateOutboundRequest{
				OutboundDate:    args.OutboundDate,
				CompanyID:       args.CompanyID,
				ProductID:       args.ProductID,
				Quantity:        args.Quantity,
				CapacityKw:      args.CapacityKw,
				WarehouseID:     args.WarehouseID,
				UsageCategory:   args.UsageCategory,
				OrderID:         args.OrderID,
				SiteName:        args.SiteName,
				SiteAddress:     args.SiteAddress,
				SpareQty:        args.SpareQty,
				GroupTrade:      args.GroupTrade,
				TargetCompanyID: args.TargetCompanyID,
				ErpOutboundNo:   args.ErpOutboundNo,
				Status:          args.Status,
				Memo:            args.Memo,
				BLID:            args.BLID,
			}
			if msg := req.Validate(); msg != "" {
				return "", fmt.Errorf("검증 실패: %s", msg)
			}
			summary := fmt.Sprintf(
				"출고 등록: date=%s, product=%s, qty=%d, warehouse=%s, usage=%s",
				args.OutboundDate, args.ProductID, args.Quantity, args.WarehouseID, args.UsageCategory,
			)
			id, err := proposeWrite(ctx, "create_outbound", summary, args)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("출고 등록 제안 생성됨(id=%s). 재고에 영향이 있으니 품목·수량·창고를 한 번 더 확인 후 [저장] 클릭 바랍니다.", id), nil
		},
	}
}

// --- create_receipt (수금 입력) ---

func toolCreateReceipt() assistantTool {
	return assistantTool{
		name:        "create_receipt",
		description: "수금(receipts) 입력. 필수: customer_id, receipt_date, amount(>0).",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"customer_id": {"type": "string"},
				"receipt_date": {"type": "string", "description": "YYYY-MM-DD"},
				"amount": {"type": "number", "description": "양수, KRW"},
				"bank_account": {"type": "string"},
				"memo": {"type": "string"}
			},
			"required": ["customer_id", "receipt_date", "amount"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args model.CreateReceiptRequest
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			if msg := args.Validate(); msg != "" {
				return "", fmt.Errorf("검증 실패: %s", msg)
			}
			summary := fmt.Sprintf(
				"수금 등록: customer=%s, date=%s, amount=%.0f KRW",
				args.CustomerID, args.ReceiptDate, args.Amount,
			)
			id, err := proposeWrite(ctx, "create_receipt", summary, args)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("수금 등록 제안 생성됨(id=%s). 거래처·금액·일자 확인 후 [저장] 클릭.", id), nil
		},
	}
}

// ===== 마스터 룩업 =====

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
		description: "창고(warehouses) 검색. 코드·이름·위치 부분일치. create_outbound의 warehouse_id 룩업용. 모든 역할 호출 가능.",
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

type updateOrderToolInput struct {
	OrderID string `json:"order_id"`
	model.UpdateOrderRequest
}

func toolUpdateOrder() assistantTool {
	return assistantTool{
		name:        "update_order",
		description: "수주(orders) 수정. order_id 필수, 변경할 필드만 지정. 단가·수량·상태 등.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"properties":{
				"order_id":{"type":"string"},
				"order_number":{"type":"string"},
				"company_id":{"type":"string"},
				"customer_id":{"type":"string"},
				"order_date":{"type":"string"},
				"receipt_method":{"type":"string"},
				"product_id":{"type":"string"},
				"quantity":{"type":"integer"},
				"capacity_kw":{"type":"number"},
				"unit_price_wp":{"type":"number"},
				"site_id":{"type":"string"},
				"site_name":{"type":"string"},
				"payment_terms":{"type":"string"},
				"deposit_rate":{"type":"number"},
				"delivery_due":{"type":"string"},
				"status":{"type":"string"},
				"memo":{"type":"string"}
			},
			"required":["order_id"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args updateOrderToolInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			if strings.TrimSpace(args.OrderID) == "" {
				return "", fmt.Errorf("order_id는 필수입니다")
			}
			if msg := args.UpdateOrderRequest.Validate(); msg != "" {
				return "", fmt.Errorf("검증 실패: %s", msg)
			}
			summary := fmt.Sprintf("수주 수정: order_id=%s", args.OrderID)
			if args.Status != nil {
				summary += fmt.Sprintf(", status→%s", *args.Status)
			}
			if args.Quantity != nil {
				summary += fmt.Sprintf(", qty→%d", *args.Quantity)
			}
			if args.UnitPriceWp != nil {
				summary += fmt.Sprintf(", unit_price_wp→%.2f", *args.UnitPriceWp)
			}
			id, err := proposeWrite(ctx, "update_order", summary, args)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("수주 수정 제안 생성됨(id=%s). [저장] 클릭 시 반영.", id), nil
		},
	}
}

type deleteOrderToolInput struct {
	OrderID string `json:"order_id"`
}

func toolDeleteOrder() assistantTool {
	return assistantTool{
		name:        "delete_order",
		description: "수주(orders) 삭제. 출고 연결 등 FK가 있으면 DB가 거절할 수 있음.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"properties":{"order_id":{"type":"string"}},
			"required":["order_id"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args deleteOrderToolInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			if strings.TrimSpace(args.OrderID) == "" {
				return "", fmt.Errorf("order_id는 필수입니다")
			}
			summary := fmt.Sprintf("수주 삭제: order_id=%s", args.OrderID)
			id, err := proposeWrite(ctx, "delete_order", summary, args)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("수주 삭제 제안 생성됨(id=%s). 사용자가 [저장]을 눌러야 실제로 삭제됩니다.", id), nil
		},
	}
}

type updateOutboundToolInput struct {
	OutboundID string `json:"outbound_id"`
	model.UpdateOutboundRequest
}

func toolUpdateOutbound() assistantTool {
	return assistantTool{
		name:        "update_outbound",
		description: "출고(outbounds) 수정. outbound_id 필수, 변경할 필드만 지정. bl_items 라인 할당은 미지원.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"properties":{
				"outbound_id":{"type":"string"},
				"outbound_date":{"type":"string"},
				"company_id":{"type":"string"},
				"product_id":{"type":"string"},
				"quantity":{"type":"integer"},
				"capacity_kw":{"type":"number"},
				"warehouse_id":{"type":"string"},
				"usage_category":{"type":"string"},
				"order_id":{"type":"string"},
				"site_name":{"type":"string"},
				"status":{"type":"string"},
				"memo":{"type":"string"}
			},
			"required":["outbound_id"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args updateOutboundToolInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			if strings.TrimSpace(args.OutboundID) == "" {
				return "", fmt.Errorf("outbound_id는 필수입니다")
			}
			// BLItems은 v1 미지원 — 비워둠
			args.BLItems = nil
			if msg := args.UpdateOutboundRequest.Validate(); msg != "" {
				return "", fmt.Errorf("검증 실패: %s", msg)
			}
			summary := fmt.Sprintf("출고 수정: outbound_id=%s", args.OutboundID)
			if args.Status != nil {
				summary += fmt.Sprintf(", status→%s", *args.Status)
			}
			if args.Quantity != nil {
				summary += fmt.Sprintf(", qty→%d", *args.Quantity)
			}
			id, err := proposeWrite(ctx, "update_outbound", summary, args)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("출고 수정 제안 생성됨(id=%s). 재고에 영향이 있으니 한 번 더 확인 후 [저장] 클릭.", id), nil
		},
	}
}

type deleteOutboundToolInput struct {
	OutboundID string `json:"outbound_id"`
}

func toolDeleteOutbound() assistantTool {
	return assistantTool{
		name:        "delete_outbound",
		description: "출고(outbounds) 삭제. 재고 환원 영향 있음.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"properties":{"outbound_id":{"type":"string"}},
			"required":["outbound_id"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args deleteOutboundToolInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			if strings.TrimSpace(args.OutboundID) == "" {
				return "", fmt.Errorf("outbound_id는 필수입니다")
			}
			summary := fmt.Sprintf("출고 삭제: outbound_id=%s (재고 환원)", args.OutboundID)
			id, err := proposeWrite(ctx, "delete_outbound", summary, args)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("출고 삭제 제안 생성됨(id=%s). 사용자가 [저장]을 눌러야 실제로 삭제됩니다.", id), nil
		},
	}
}

// --- create_declaration (면장 등록, 탑솔라 전용) ---
// OCR 결과(원문 또는 customs_declaration 파싱 필드)에서 추출한 값을 사용자가 검토 후 등록할 때 사용.

func toolCreateDeclaration() assistantTool {
	return assistantTool{
		name:        "create_declaration",
		description: "면장(declarations, 수입신고필증) 등록. OCR 결과의 declaration_number/날짜·hs_code·관세사 등을 사용자가 검토한 뒤 호출. 탑솔라 admin/operator 만 호출 가능. 필수: declaration_number, bl_id, company_id, declaration_date.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"declaration_number": {"type": "string", "description": "신고번호 (30자 이내)"},
				"bl_id": {"type": "string", "description": "연결할 B/L 의 bl_id"},
				"company_id": {"type": "string", "description": "법인 ID"},
				"declaration_date": {"type": "string", "description": "신고일 YYYY-MM-DD"},
				"arrival_date": {"type": "string", "description": "입항일 YYYY-MM-DD (선택)"},
				"release_date": {"type": "string", "description": "반출일 YYYY-MM-DD (선택)"},
				"hs_code": {"type": "string"},
				"customs_office": {"type": "string"},
				"port": {"type": "string"},
				"memo": {"type": "string"}
			},
			"required": ["declaration_number", "bl_id", "company_id", "declaration_date"]
		}`),
		allow: func(ctx context.Context) bool {
			return roleIn(ctx, "admin", "operator") && tenantIs(ctx, middleware.TenantScopeTopsolar)
		},
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args model.CreateDeclarationRequest
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			if msg := args.Validate(); msg != "" {
				return "", fmt.Errorf("검증 실패: %s", msg)
			}
			summary := fmt.Sprintf(
				"면장 등록: %s, bl_id=%s, date=%s",
				args.DeclarationNumber, args.BLID, args.DeclarationDate,
			)
			id, err := proposeWrite(ctx, "create_declaration", summary, args)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("면장 등록 제안 생성됨(id=%s). 신고번호·BL·일자가 OCR 원문과 일치하는지 한 번 더 확인 후 [저장] 클릭.", id), nil
		},
	}
}
