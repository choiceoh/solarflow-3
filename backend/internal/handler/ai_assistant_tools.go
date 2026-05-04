package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
)

// assistantTool — LLM에 노출하는 도구 정의.
// kind="read" 는 즉시 실행 후 결과를 LLM 에 회신하고 클라이언트 UI 에 tool-invocation 으로 가시화.
// kind="propose" 는 proposalStore 에 stash 후 사용자 승인 단계로 위임 — 클라이언트 UI 에는 data part 로 proposal 객체만 흘려보냄.
// allow(ctx)로 역할 기반 노출/차단을 결정하고, execute는 결과 JSON 문자열을 반환.
//
// allowScopes — 빈 슬라이스(nil) 면 모든 테넌트에 노출. 값이 있으면 해당 테넌트만 catalog 에 포함.
// 도메인이 명확히 분리된 도구(예: LC·BL·면장은 수입 테넌트만)에 사용. role 기반 allow 와 AND 조건.
type assistantTool struct {
	name        string
	description string
	inputSchema json.RawMessage
	kind        string // "read" | "propose"
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
// kind 는 카탈로그 한 곳에서 일괄 부여 — 개별 tool*() 함수가 자기 분류를 신경 쓸 필요 없음.
func assistantToolCatalog() []assistantTool {
	reads := []assistantTool{
		// 마스터 룩업
		toolSearchProducts(),
		toolSearchManufacturers(),
		toolSearchCompanies(),
		toolSearchWarehouses(),
		toolSearchConstructionSites(),
		// 거래·관계
		toolSearchPartners(),
		toolSearchPartnerActivities(),
		toolSearchPurchaseOrders(),
		toolSearchOrders(),
		toolSearchOutbound(),
		toolSearchReceipts(),
		// 금융·물류 (일부 module 계열 전용)
		toolSearchLC(),
		toolSearchBL(),
		toolSearchDeclarations(),
		// baro 테넌트 전용 (allowScopes=[baro])
		toolBaroCreditBoard(),
		toolBaroDispatchRoutes(),
		toolBaroPartnerPrices(),
		toolBaroPartnerPriceLookup(),
		toolBaroIncoming(),
		toolBaroPurchaseHistory(),
		toolBaroGroupPurchaseRequests(),
		// 메타 config — 화면/폼/상세 단건 조회 (admin only)
		toolReadUIConfig(),
		// 도메인 지식 — 한국 태양광 산업 일반 사전 (정적 마크다운 슬라이스)
		toolGetSolarDomainKnowledge(),
		// 도메인 지식 그래프 (graphify-style) — 키워드 검색 / 노드 설명 / 최단 경로
		toolSolarQuery(),
		toolSolarExplain(),
		toolSolarPath(),
		// 외부 웹 (admin/operator/executive 한정)
		toolWebSearch(),
		toolFetchURL(),
	}
	proposes := []assistantTool{
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
		// 대량 수정 — 외부 시트 데이터로 빈 칸 채우기 등 200건+ 케이스
		toolBulkUpdateOutbound(),
		toolBulkUpdateOrder(),
		// 메타 config — 화면/폼/상세 통째 교체 제안 (admin only)
		toolProposeUIConfigUpdate(),
	}
	out := make([]assistantTool, 0, len(reads)+len(proposes))
	for _, t := range reads {
		t.kind = "read"
		out = append(out, t)
	}
	for _, t := range proposes {
		t.kind = "propose"
		out = append(out, t)
	}
	return out
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
