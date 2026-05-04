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
//
// allowScopes — 빈 슬라이스(nil) 면 모든 테넌트에 노출. 값이 있으면 해당 테넌트만 catalog 에 포함.
// 도메인이 명확히 분리된 도구(예: LC·BL·면장은 수입 테넌트만)에 사용. role 기반 allow 와 AND 조건.
type assistantTool struct {
	name        string
	description string
	inputSchema json.RawMessage
	allow       func(ctx context.Context) bool
	allowScopes []string
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
		// 금융·물류 (일부 module 계열 전용)
		toolSearchLC(),
		toolSearchBL(),
		toolSearchDeclarations(),
		// 메타 config — 화면/폼/상세 단건 조회 (admin only)
		toolReadUIConfig(),
	}
}

// tenantIs — 현재 사용자의 테넌트 스코프 매칭.
func tenantIs(ctx context.Context, scopes ...string) bool {
	current := middleware.GetTenantScope(ctx)
	for _, scope := range scopes {
		if current == scope {
			return true
		}
	}
	return false
}

func availableAssistantTools(ctx context.Context) []assistantTool {
	all := assistantToolCatalog()
	out := make([]assistantTool, 0, len(all))
	for _, t := range all {
		if !t.allow(ctx) {
			continue
		}
		if len(t.allowScopes) > 0 && !tenantIs(ctx, t.allowScopes...) {
			continue
		}
		out = append(out, t)
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

// wrapToolResult — 도구 결과를 {rows, count, hint?} JSON 으로 감싸 LLM 가독성을 높인다.
// rowsJSON 은 PostgREST 가 반환한 JSON 배열을 그대로 받는다 (nil/빈 입력은 [] 로 정규화).
// count=0 이면 emptyHint 를 hint 필드로 덧붙여, 모델이 빈 결과를 정확히 해석하고 다음 행동을 결정하도록 한다.
// emptyHint 가 비어있으면 표준 안내문 사용.
func wrapToolResult(rowsJSON []byte, emptyHint string) (string, error) {
	// PostgREST 는 드물게 'null' (literal) 을 반환할 수 있어 [] 로 정규화 — 모델이 빈 배열과 구분하지 못해 추측하는 것을 차단.
	if len(rowsJSON) == 0 || string(rowsJSON) == "null" {
		rowsJSON = []byte("[]")
	}
	var rows []json.RawMessage
	if err := json.Unmarshal(rowsJSON, &rows); err != nil {
		return "", fmt.Errorf("도구 결과 파싱 실패: %w", err)
	}
	out := map[string]any{
		"rows":  json.RawMessage(rowsJSON),
		"count": len(rows),
	}
	if len(rows) == 0 {
		hint := emptyHint
		if hint == "" {
			hint = "조건에 맞는 데이터가 없습니다. 필터를 완화하거나 다른 도구로 ID/코드를 먼저 확인하세요."
		}
		out["hint"] = hint
	}
	b, err := json.Marshal(out)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
