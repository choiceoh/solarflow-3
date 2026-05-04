package handler

// AI assistant — 대량 수정 제안 도구.
//
// 단일 update_* 가 200~300건을 일일이 호출하기 어려우니, 한 번의 제안 안에 여러 행을
// 묶어 사용자가 [저장] 한 번 누르면 일괄 적용. 외부 시트(fetch_url) 데이터로 ERP 빈 칸을
// 채우는 케이스가 주 사용처.
//
// 동작:
//   - LLM 이 updates: [{outbound_id|order_id, ...변경필드}, ...] 로 호출
//   - 단일 propose 와 동일하게 globalProposalStore 에 stash 후 사용자 승인 대기
//   - ConfirmProposal 에서 row-by-row 로 적용. 행 단위 실패는 다른 행에 영향 없음 —
//     결과는 {ok_count, failed_count, failed:[{id,error}]} 로 회신
//   - 한 호출 최대 200행 (스키마 maxItems). 200행 초과는 LLM 이 여러 번 호출

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	supa "github.com/supabase-community/supabase-go"
)

// bulkUpdateMaxRows — 한 제안에 묶을 수 있는 최대 행수. UI 검토 가독성과 LLM 토큰
// 한계를 동시에 고려한 값. 초과 요청은 LLM 이 분할 호출하도록 도구 description 에 명시.
const bulkUpdateMaxRows = 200

// outboundUpdateProps — update_outbound / bulk_update_outbound items 가 공유하는 필드 정의.
// 새 필드 추가 시 본 상수 한 곳만 수정. additionalProperties:false 와 함께 사용해 LLM
// 추측 키 호출 차단 (도구 별로 required 만 다르게 부여 — 단일은 outbound_id 필수, bulk
// items 도 outbound_id 필수).
const outboundUpdateProps = `"outbound_id":{"type":"string"},
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
"memo":{"type":"string"}`

// orderUpdateProps — update_order / bulk_update_order items 가 공유하는 필드 정의.
const orderUpdateProps = `"order_id":{"type":"string"},
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
"memo":{"type":"string"}`

// --- bulk_update_outbound ---

type bulkUpdateOutboundInput struct {
	Updates []updateOutboundToolInput `json:"updates"`
	Summary string                    `json:"summary"`
}

func toolBulkUpdateOutbound() assistantTool {
	return assistantTool{
		name: "bulk_update_outbound",
		description: "출고(outbounds) 일괄 수정 — 여러 건을 한 번의 제안으로 묶음. 사용자는 카드에서 [저장] 한 번 누르면 전부 row-by-row 적용 (실패한 행만 보고). 각 항목은 outbound_id 필수 + 변경할 필드. 최대 200건 — 초과 시 분할 호출. summary 는 한 줄 요약(예: '출고 152건 site_address 채움'). 외부 시트 fetch_url 결과로 빈 칸 채울 때 사용.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"additionalProperties":false,
			"properties":{
				"updates":{
					"type":"array",
					"minItems":1,
					"maxItems":200,
					"items":{
						"type":"object",
						"additionalProperties":false,
						"properties":{` + outboundUpdateProps + `},
						"required":["outbound_id"]
					}
				},
				"summary":{"type":"string","description":"사용자 카드에 표시될 한 줄 한국어 요약"}
			},
			"required":["updates","summary"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args bulkUpdateOutboundInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			if len(args.Updates) == 0 {
				return "", fmt.Errorf("updates 는 최소 1건 필요합니다")
			}
			if len(args.Updates) > bulkUpdateMaxRows {
				return "", fmt.Errorf("한 호출 최대 %d건 — %d건은 분할해서 호출하세요", bulkUpdateMaxRows, len(args.Updates))
			}
			args.Summary = strings.TrimSpace(args.Summary)
			if args.Summary == "" {
				return "", fmt.Errorf("summary 는 필수입니다 (사용자 카드 표시용)")
			}
			// 행 단위 사전 검증 — propose 단계에서 잘못된 행 발견 시 호출 자체 거절.
			// (Confirm 시 다시 검증하지만, 잘못된 제안을 사용자에게 보여주지 않기 위해 미리 컷.)
			for i, u := range args.Updates {
				if strings.TrimSpace(u.OutboundID) == "" {
					return "", fmt.Errorf("updates[%d].outbound_id 는 필수입니다", i)
				}
				u.BLItems = nil
				if msg := u.UpdateOutboundRequest.Validate(); msg != "" {
					return "", fmt.Errorf("updates[%d] 검증 실패: %s", i, msg)
				}
			}
			summary := fmt.Sprintf("%s (총 %d건)", args.Summary, len(args.Updates))
			id, err := proposeWrite(ctx, "bulk_update_outbound", summary, args)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("출고 일괄 수정 제안 생성됨(id=%s, %d건). 사용자 [저장] 시 row-by-row 반영 — 실패한 행만 별도 보고.", id, len(args.Updates)), nil
		},
	}
}

// --- bulk_update_order ---

type bulkUpdateOrderInput struct {
	Updates []updateOrderToolInput `json:"updates"`
	Summary string                 `json:"summary"`
}

func toolBulkUpdateOrder() assistantTool {
	return assistantTool{
		name: "bulk_update_order",
		description: "수주(orders) 일괄 수정 — 여러 건을 한 번의 제안으로 묶음. 사용자는 카드에서 [저장] 한 번 누르면 전부 row-by-row 적용. 각 항목은 order_id 필수 + 변경할 필드. 최대 200건. summary 는 한 줄 요약(예: '수주 87건 unit_price_wp 입력'). 외부 시트의 단가 정보로 ERP 빈 칸 채울 때 사용.",
		inputSchema: json.RawMessage(`{
			"type":"object",
			"additionalProperties":false,
			"properties":{
				"updates":{
					"type":"array",
					"minItems":1,
					"maxItems":200,
					"items":{
						"type":"object",
						"additionalProperties":false,
						"properties":{` + orderUpdateProps + `},
						"required":["order_id"]
					}
				},
				"summary":{"type":"string","description":"사용자 카드에 표시될 한 줄 한국어 요약"}
			},
			"required":["updates","summary"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args bulkUpdateOrderInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			if len(args.Updates) == 0 {
				return "", fmt.Errorf("updates 는 최소 1건 필요합니다")
			}
			if len(args.Updates) > bulkUpdateMaxRows {
				return "", fmt.Errorf("한 호출 최대 %d건 — %d건은 분할해서 호출하세요", bulkUpdateMaxRows, len(args.Updates))
			}
			args.Summary = strings.TrimSpace(args.Summary)
			if args.Summary == "" {
				return "", fmt.Errorf("summary 는 필수입니다 (사용자 카드 표시용)")
			}
			for i, u := range args.Updates {
				if strings.TrimSpace(u.OrderID) == "" {
					return "", fmt.Errorf("updates[%d].order_id 는 필수입니다", i)
				}
				if msg := u.UpdateOrderRequest.Validate(); msg != "" {
					return "", fmt.Errorf("updates[%d] 검증 실패: %s", i, msg)
				}
			}
			summary := fmt.Sprintf("%s (총 %d건)", args.Summary, len(args.Updates))
			id, err := proposeWrite(ctx, "bulk_update_order", summary, args)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("수주 일괄 수정 제안 생성됨(id=%s, %d건). 사용자 [저장] 시 row-by-row 반영 — 실패한 행만 별도 보고.", id, len(args.Updates)), nil
		},
	}
}
