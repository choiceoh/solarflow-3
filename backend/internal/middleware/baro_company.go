package middleware

import (
	"encoding/json"
	"errors"
	"log"
	"sync"
	"sync/atomic"

	supa "github.com/supabase-community/supabase-go"
)

// BaroCompanyResolver — BARO 직원이 볼 수 있는 유일한 법인(company_code='BR') 의 UUID 를
// 한 번 룩업해 캐싱한다.
//
// 사용처: outbound/sale/receipt 등 ERP 공통 핸들러가 BARO 토큰일 때 company_id 쿼리를 무시하고
// 이 ID 로 강제 필터링한다 (D-108 격리 강화). 패키지가 한 곳이라 동일 ID 가 여러 핸들러에서
// 중복 SELECT 되지 않는다.
//
// 운영 중 회사 마스터의 company_code='BR' 행이 바뀌는 일은 거의 없으므로 process-level
// 캐시면 충분 — 마이그레이션으로 BR 행이 추가/삭제되면 Go 재시작이 같이 일어남.
type BaroCompanyResolver struct {
	db     *supa.Client
	once   sync.Once
	cached atomic.Value // string, 룩업 성공 시 한 번만 set.
	err    atomic.Value // error, 룩업 실패 시 set (재시도 가능).
}

// NewBaroCompanyResolver — *supa.Client 를 받아 resolver 인스턴스 생성.
// 보통 mount.Deps 에서 한 번 만들고 핸들러들이 공유한다.
func NewBaroCompanyResolver(db *supa.Client) *BaroCompanyResolver {
	return &BaroCompanyResolver{db: db}
}

// ErrBaroCompanyNotRegistered — BR 행이 companies 테이블에 없을 때.
// 운영 직전 시드 누락 정도가 아니면 거의 발생하지 않지만, 발생하면 BARO 사용자는 격리상 빈
// 결과를 받게 된다 (fail-closed).
var ErrBaroCompanyNotRegistered = errors.New("BR(바로) 법인 마스터가 companies 테이블에 등록되지 않음 (company_code='BR' 누락)")

// Resolve — BR 법인 UUID 반환. 첫 호출에서만 DB 룩업, 이후 캐시.
//
// 룩업 자체가 실패하면 (네트워크/스키마 문제) 캐시하지 않고 매번 재시도 — DB 가 잠시 끊긴
// 상황에서 BARO 사용자가 영구히 빈 결과를 보는 사태를 피한다. 행 자체가 없는 경우만
// ErrBaroCompanyNotRegistered 로 영구 캐시.
func (r *BaroCompanyResolver) Resolve() (string, error) {
	if v, ok := r.cached.Load().(string); ok && v != "" {
		return v, nil
	}
	if e, ok := r.err.Load().(error); ok && errors.Is(e, ErrBaroCompanyNotRegistered) {
		return "", e
	}
	id, err := lookupBaroCompanyID(r.db)
	if err != nil {
		log.Printf("[BARO 법인 룩업 실패] %v", err)
		return "", err
	}
	if id == "" {
		r.err.Store(ErrBaroCompanyNotRegistered)
		return "", ErrBaroCompanyNotRegistered
	}
	r.cached.Store(id)
	return id, nil
}

// lookupBaroCompanyID — companies.company_code='BR' 행의 company_id 를 SELECT.
// BR 행이 없으면 빈 문자열 반환 (호출자가 nil 검사).
func lookupBaroCompanyID(db *supa.Client) (string, error) {
	data, _, err := db.From("companies").
		Select("company_id", "exact", false).
		Eq("company_code", "BR").
		Limit(1, "").
		Execute()
	if err != nil {
		return "", err
	}
	var rows []struct {
		CompanyID string `json:"company_id"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return "", err
	}
	if len(rows) == 0 {
		return "", nil
	}
	return rows[0].CompanyID, nil
}
