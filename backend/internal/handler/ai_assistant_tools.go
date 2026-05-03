package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
)

// assistantTool — LLM에 노출하는 도구 정의.
// 모든 도구는 조회 전용이며, 실행 결과를 LLM 에 회신하고 클라이언트 UI 에 tool-invocation 으로 가시화한다.
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
		// 메타 config — 화면/폼/상세 단건 조회 (admin only)
		toolReadUIConfig(),
	}
}

// tenantIs — 현재 사용자의 테넌트 스코프 매칭.
func tenantIs(ctx context.Context, scope string) bool {
	return middleware.GetTenantScope(ctx) == scope
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
