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
