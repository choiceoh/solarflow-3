package feature

import (
	"context"
	"encoding/json"
	"time"

	supa "github.com/supabase-community/supabase-go"
)

// WiringStore — D-120 feature 배선 데이터 영속화 인터페이스 (PR-9 PoC).
//
// Handler 가 supa.Client 를 직접 들고 다니던 패턴을 Store 인터페이스 뒤로 옮긴다.
//   - 운영 코드: SupabaseWiringStore (실제 PostgREST 호출)
//   - 테스트 코드: 각 테스트가 fake/mock 구현 — handler 의 비즈니스 로직(audit 발생,
//     error 처리, 응답 모양) 을 DB 없이 단위 테스트.
//
// PR-9 PoC 가 AdminFeatureWiringHandler 1개에만 적용. 후속 PR 에서 다른 handler
// (Bank/Library/Note/...) 도 동일 패턴으로 점진 전환.
type WiringStore interface {
	// UpsertOverride — tenant_features 테이블에 (tenant, feature_id) 행 upsert.
	UpsertOverride(ctx context.Context, override OverrideRow) error
	// InsertAudit — feature_wiring_audit 한 행 추가 (best-effort 호출자 주의).
	InsertAudit(ctx context.Context, entry AuditEntry) error
	// LoadOverrides — startup 에 한 번 호출, 모든 행을 메모리로 끌어온다.
	LoadOverrides(ctx context.Context) ([]OverrideRow, error)
}

// OverrideRow — tenant_features 한 행.
type OverrideRow struct {
	Tenant    string    `json:"tenant"`
	FeatureID FeatureID `json:"feature_id"`
	Enabled   bool      `json:"enabled"`
	Note      string    `json:"note,omitempty"`
	UpdatedBy string    `json:"updated_by,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

// AuditEntry — feature_wiring_audit 한 행 (변경 내용 + actor).
type AuditEntry struct {
	Actor       string
	Tenant      string
	FeatureID   FeatureID
	BeforeValue bool
	AfterValue  bool
	Note        string
}

// === Supabase 구현 ===

// SupabaseWiringStore — WiringStore 의 PostgREST/Supabase 구현 (운영용).
type SupabaseWiringStore struct {
	DB *supa.Client
}

// NewSupabaseWiringStore — DB nil 이면 nil 반환 (호출자가 fallback 처리해야).
//
// router/handler 측에서 DB 없는 환경 (PoC, 테스트) 은 별도 fake store 를 주입한다.
func NewSupabaseWiringStore(db *supa.Client) *SupabaseWiringStore {
	if db == nil {
		return nil
	}
	return &SupabaseWiringStore{DB: db}
}

// UpsertOverride — supa.Client 의 Upsert 호출. PR-5b 의 인라인 코드를 그대로 옮김.
func (s *SupabaseWiringStore) UpsertOverride(_ context.Context, o OverrideRow) error {
	payload := map[string]any{
		"tenant":     o.Tenant,
		"feature_id": string(o.FeatureID),
		"enabled":    o.Enabled,
		"note":       nullableString(o.Note),
		"updated_by": nullableString(o.UpdatedBy),
		"updated_at": o.UpdatedAt.UTC().Format(time.RFC3339Nano),
	}
	_, _, err := s.DB.From("tenant_features").
		Upsert(payload, "tenant,feature_id", "", "exact").
		Execute()
	return err
}

// InsertAudit — feature_wiring_audit 한 행 추가.
func (s *SupabaseWiringStore) InsertAudit(_ context.Context, e AuditEntry) error {
	payload := map[string]any{
		"actor":        nullableString(e.Actor),
		"axis":         "feature",
		"tenant":       e.Tenant,
		"feature_id":   string(e.FeatureID),
		"before_value": map[string]bool{"enabled": e.BeforeValue},
		"after_value":  map[string]bool{"enabled": e.AfterValue},
		"note":         nullableString(e.Note),
	}
	_, _, err := s.DB.From("feature_wiring_audit").
		Insert(payload, false, "", "", "exact").
		Execute()
	return err
}

// LoadOverrides — startup 시 모든 tenant_features 행을 가져와 resolver 에 적용.
func (s *SupabaseWiringStore) LoadOverrides(_ context.Context) ([]OverrideRow, error) {
	data, _, err := s.DB.From("tenant_features").
		Select("tenant,feature_id,enabled", "exact", false).
		Execute()
	if err != nil {
		return nil, err
	}
	var rows []struct {
		Tenant    string `json:"tenant"`
		FeatureID string `json:"feature_id"`
		Enabled   bool   `json:"enabled"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	out := make([]OverrideRow, len(rows))
	for i, r := range rows {
		out[i] = OverrideRow{
			Tenant:    r.Tenant,
			FeatureID: FeatureID(r.FeatureID),
			Enabled:   r.Enabled,
		}
	}
	return out, nil
}

// nullableString — 빈 문자열을 null 로 보내 PostgREST 가 NULL 컬럼을 그대로 두게 한다.
// PR-5b 의 handler 인라인 헬퍼를 store 로 이동.
func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}
