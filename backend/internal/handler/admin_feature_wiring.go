package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"time"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/response"
	"solarflow-backend/internal/tenant"
)

// AdminFeatureWiringHandler — 테넌트 × feature 매트릭스 read + 토글 (PR-5a/5b).
//
// PR-5a: GetMatrix (read-only) — resolver default + in-memory override 반영.
// PR-5b: SetEnabled (PUT) — DB 에 (tenant, feature) override 저장 + audit 행 + resolver
//        in-memory 캐시 갱신. 운영 startup 시 DB 에서 한 번 로드해 둔다 (app 패키지).
type AdminFeatureWiringHandler struct {
	DB       *supa.Client
	Resolver *feature.Resolver
}

// NewAdminFeatureWiringHandler — handler 생성자.
//
// db nil 이면 PUT 경로가 503 으로 막힌다 (테스트/PoC 용 read-only 만 쓸 때 허용).
// resolver nil 이면 catalog default 만 사용하는 새 resolver 를 만든다.
func NewAdminFeatureWiringHandler(db *supa.Client, resolver *feature.Resolver) *AdminFeatureWiringHandler {
	if resolver == nil {
		resolver = feature.NewResolver(nil)
	}
	return &AdminFeatureWiringHandler{DB: db, Resolver: resolver}
}

// AdminTenantSummary — 매트릭스 응답의 테넌트 메타 항목.
type AdminTenantSummary struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	IsDefault   bool   `json:"is_default,omitempty"`
}

// AdminFeatureSummary — 매트릭스 응답의 feature 한 행.
type AdminFeatureSummary struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	// Enabled — tenant_id → 그 테넌트가 이 feature 를 사용할 수 있는지.
	Enabled map[string]bool `json:"enabled"`
	// DefaultTenants — catalog 정의상 default 활성 테넌트 (정렬). UI 가 default 와 override 를 구분할 때 참고.
	DefaultTenants []string `json:"default_tenants"`
}

// AdminFeatureMatrixResponse — GET /admin/feature-wiring 응답.
type AdminFeatureMatrixResponse struct {
	Tenants  []AdminTenantSummary  `json:"tenants"`
	Features []AdminFeatureSummary `json:"features"`
}

// GetMatrix — 모든 테넌트 × 모든 feature 의 활성 상태를 반환.
//
// 응답은 admin UI 의 매트릭스 view (행=feature, 열=tenant, 셀=enabled) 에 1:1 매핑.
// pack 정의(frontend) + 이 응답을 합치면 pack 활성 상태 도출 가능.
func (h *AdminFeatureWiringHandler) GetMatrix(w http.ResponseWriter, _ *http.Request) {
	allTenants := tenant.All()
	tenantSummaries := make([]AdminTenantSummary, len(allTenants))
	for i, t := range allTenants {
		tenantSummaries[i] = AdminTenantSummary{
			ID:          string(t.ID),
			DisplayName: t.DisplayName,
			IsDefault:   t.IsDefault,
		}
	}

	// feature_id 정렬 — 응답이 안정적이어야 diff 가 작다.
	featureIDs := feature.AllIDs()
	sort.Slice(featureIDs, func(i, j int) bool { return featureIDs[i] < featureIDs[j] })

	features := make([]AdminFeatureSummary, len(featureIDs))
	for i, id := range featureIDs {
		f, _ := feature.Get(id)
		enabled := make(map[string]bool, len(allTenants))
		for _, t := range allTenants {
			enabled[string(t.ID)] = h.Resolver.IsEnabled(string(t.ID), id)
		}
		defaults := append([]string(nil), f.DefaultTenants...)
		sort.Strings(defaults)
		features[i] = AdminFeatureSummary{
			ID:             string(id),
			Name:           f.Name,
			Description:    f.Description,
			Enabled:        enabled,
			DefaultTenants: defaults,
		}
	}

	response.RespondJSON(w, http.StatusOK, AdminFeatureMatrixResponse{
		Tenants:  tenantSummaries,
		Features: features,
	})
}

// setEnabledRequest — PUT body. note 는 admin 이 토글 이유를 한 줄 적는 칸.
type setEnabledRequest struct {
	Enabled bool   `json:"enabled"`
	Note    string `json:"note,omitempty"`
}

// SetEnabledResponse — PUT 결과. UI 가 매트릭스 셀을 즉시 반영하도록 갱신된 상태를 그대로 돌려준다.
type SetEnabledResponse struct {
	Tenant    string `json:"tenant"`
	FeatureID string `json:"feature_id"`
	Enabled   bool   `json:"enabled"`
	UpdatedAt string `json:"updated_at"`
	UpdatedBy string `json:"updated_by,omitempty"`
}

// 검증 에러 — handler 가 404 매핑.
var (
	errUnknownTenant  = errors.New("미등록 tenant")
	errUnknownFeature = errors.New("미등록 feature_id")
)

// validateSetEnabled — DB 호출 없이 검증만. 단위 테스트가 가능하도록 분리.
func (h *AdminFeatureWiringHandler) validateSetEnabled(tenantID, featureID string) error {
	if !tenant.Known(tenantID) {
		return errUnknownTenant
	}
	if !h.Resolver.Knows(feature.FeatureID(featureID)) {
		return errUnknownFeature
	}
	return nil
}

// SetEnabled — PUT /admin/feature-wiring/{tenant_id}/{feature_id}.
//
// 동작:
//  1. tenant_id / feature_id 검증 — registry / catalog 에 있어야 함
//  2. before 값 캡처 (audit 용)
//  3. tenant_features upsert
//  4. feature_wiring_audit 행 추가 (실패해도 main 흐름 막지 않음)
//  5. resolver in-memory cache 갱신
//  6. 갱신된 상태 응답
func (h *AdminFeatureWiringHandler) SetEnabled(w http.ResponseWriter, r *http.Request) {
	tenantID := chi.URLParam(r, "tenantID")
	featureID := chi.URLParam(r, "featureID")

	if err := h.validateSetEnabled(tenantID, featureID); err != nil {
		response.RespondError(w, http.StatusNotFound, err.Error())
		return
	}

	var req setEnabledRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "요청 본문 파싱 실패")
		return
	}

	if h.DB == nil {
		response.RespondError(w, http.StatusServiceUnavailable, "DB 미연결 — 토글 사용 불가")
		return
	}

	actor := middleware.GetUserEmail(r.Context())
	now := time.Now().UTC()
	beforeEnabled := h.Resolver.IsEnabled(tenantID, feature.FeatureID(featureID))

	upsertPayload := map[string]any{
		"tenant":     tenantID,
		"feature_id": featureID,
		"enabled":    req.Enabled,
		"note":       nullableString(req.Note),
		"updated_by": nullableString(actor),
		"updated_at": now.Format(time.RFC3339Nano),
	}
	if _, _, err := h.DB.From("tenant_features").
		Upsert(upsertPayload, "tenant,feature_id", "", "exact").
		Execute(); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "tenant_features 저장 실패")
		return
	}

	// audit 는 best-effort — 실패해도 본 작업은 성공으로 본다.
	auditPayload := map[string]any{
		"actor":        nullableString(actor),
		"axis":         "feature",
		"tenant":       tenantID,
		"feature_id":   featureID,
		"before_value": map[string]bool{"enabled": beforeEnabled},
		"after_value":  map[string]bool{"enabled": req.Enabled},
		"note":         nullableString(req.Note),
	}
	_, _, _ = h.DB.From("feature_wiring_audit").
		Insert(auditPayload, false, "", "", "exact").
		Execute()

	// in-memory cache 갱신 — 다음 IsEnabled 호출부터 새 값 반영.
	h.Resolver.SetOverride(tenantID, feature.FeatureID(featureID), req.Enabled)

	response.RespondJSON(w, http.StatusOK, SetEnabledResponse{
		Tenant:    tenantID,
		FeatureID: featureID,
		Enabled:   req.Enabled,
		UpdatedAt: now.Format(time.RFC3339),
		UpdatedBy: actor,
	})
}

// nullableString — 빈 문자열을 null 로 보내 PostgREST 가 NULL 컬럼을 그대로 두게 한다.
// 빈 문자열을 그대로 보내면 text 컬럼에 빈 문자열이 들어가 audit 로그 가독성이 떨어진다.
func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// RegisterRoutes — /api/v1/admin/feature-wiring 등록 (admin 전용).
func (h *AdminFeatureWiringHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/admin/feature-wiring", func(r chi.Router) {
		r.Use(g.AdminOnly)
		r.Get("/", h.GetMatrix)
		r.Put("/{tenantID}/{featureID}", h.SetEnabled)
	})
}
