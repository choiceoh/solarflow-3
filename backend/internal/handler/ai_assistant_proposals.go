package handler

import (
	"context"
	"encoding/json"
	"sync"
	"time"
)

// assistantProposal — 어시스턴트가 작성한 쓰기 제안.
// 실제 DB 반영은 사용자가 UI에서 [저장] 클릭 시에만 일어난다(거부 시 폐기).
// in-memory 저장소만 사용 — 프로세스 재시작 시 미확인 제안은 사라진다(허용).
type assistantProposal struct {
	ID        string
	UserID    string // 소유자(=제안 발생 시 JWT user_id). 다른 사용자는 확인/거부 불가.
	Kind      string // "create_note" 등
	Summary   string // 사용자에게 카드로 표시할 한 줄 요약
	Payload   json.RawMessage
	CreatedAt time.Time
	ExpiresAt time.Time
}

type proposalSummary struct {
	ID      string          `json:"id"`
	Kind    string          `json:"kind"`
	Summary string          `json:"summary"`
	Payload json.RawMessage `json:"payload"`
}

type proposalStore struct {
	mu    sync.Mutex
	items map[string]*assistantProposal
}

var globalProposalStore = &proposalStore{items: map[string]*assistantProposal{}}

const proposalTTL = 30 * time.Minute

func (s *proposalStore) put(p *assistantProposal) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.items[p.ID] = p
	now := time.Now()
	for id, item := range s.items {
		if now.After(item.ExpiresAt) {
			delete(s.items, id)
		}
	}
}

// take — id로 제안을 꺼내고 동시에 삭제. 일회성(중복 확인/거부 방지).
// userID 불일치 또는 만료 시 false. 만료된 항목은 그 자리에서 삭제.
func (s *proposalStore) take(id, userID string) (*assistantProposal, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.items[id]
	if !ok {
		return nil, false
	}
	if time.Now().After(p.ExpiresAt) {
		delete(s.items, id)
		return nil, false
	}
	if p.UserID != userID {
		return nil, false
	}
	delete(s.items, id)
	return p, true
}

// --- per-request collector ---
// chat 응답에 "이번 요청에서 생성된 제안"을 함께 돌려주기 위한 context 기반 수집기.

type proposalCollectorKey struct{}

type proposalCollector struct {
	mu    sync.Mutex
	items []proposalSummary
}

func withProposalCollector(ctx context.Context) (context.Context, *proposalCollector) {
	c := &proposalCollector{}
	return context.WithValue(ctx, proposalCollectorKey{}, c), c
}

func proposalCollectorFrom(ctx context.Context) *proposalCollector {
	c, _ := ctx.Value(proposalCollectorKey{}).(*proposalCollector)
	return c
}

func (c *proposalCollector) add(p proposalSummary) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items = append(c.items, p)
}

func (c *proposalCollector) snapshot() []proposalSummary {
	if c == nil {
		return nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]proposalSummary, len(c.items))
	copy(out, c.items)
	return out
}
