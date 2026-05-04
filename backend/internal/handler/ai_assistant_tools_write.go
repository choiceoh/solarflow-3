package handler

// AI assistant — 쓰기 제안 도구 모음 (실제 DB 반영은 ConfirmProposal에서).
// 등록은 ai_assistant_tools.go의 assistantToolCatalog에서.

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
)

func toolCreateNote() assistantTool {
	return assistantTool{
		name: "create_note",
		description: "메모(note)를 작성합니다. 즉시 저장되지 않고 '제안'이 생성되며, 사용자가 UI 카드에서 [저장]을 눌러야 실제 DB에 들어갑니다. [거부] 시 폐기. 호출 후에는 사용자에게 작성 의도를 한 번 더 확인받으세요. linked_table에는 purchase_orders / bl_shipments / outbounds / orders / declarations 만 사용 가능.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
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

func toolCreatePartner() assistantTool {
	return assistantTool{
		name: "create_partner",
		description: "거래처(partners) 신규 등록. 즉시 저장되지 않고 '제안'이 생성되며, 사용자가 UI 카드에서 [저장]을 눌러야 실제 DB에 들어갑니다. partner_type은 customer / supplier 등.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
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
			"additionalProperties": false,
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
			"additionalProperties": false,
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
			"additionalProperties": false,
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
			"additionalProperties": false,
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
			"additionalProperties": false,
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
			"additionalProperties": false,
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
			"additionalProperties":false,
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
			"additionalProperties":false,
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
			"additionalProperties":false,
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
			"additionalProperties":false,
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
			"additionalProperties": false,
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
