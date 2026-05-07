package handler

import (
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/response"
	"solarflow-backend/internal/tenant"
)

// AdminFeatureWiringHandler — 테넌트 × feature 매트릭스 read API (PR-5a).
//
// PR-5b 후속에서 PUT 토글 + DB override 로딩이 추가될 예정.
// 현재는 read-only — resolver.IsEnabled 가 catalog default + in-memory override 만 반영.
type AdminFeatureWiringHandler struct {
	Resolver *feature.Resolver
}

// NewAdminFeatureWiringHandler — handler 생성자. resolver nil 이면 catalog default 만.
func NewAdminFeatureWiringHandler(resolver *feature.Resolver) *AdminFeatureWiringHandler {
	if resolver == nil {
		resolver = feature.NewResolver(nil)
	}
	return &AdminFeatureWiringHandler{Resolver: resolver}
}

// AdminTenantSummary — 매트릭스 응답의 테넌트 메타 항목.
type AdminTenantSummary struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	IsDefault   bool   `json:"is_default,omitempty"`
}

// AdminFeatureSummary — 매트릭스 응답의 feature 한 행.
type AdminFeatureSummary struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
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

// RegisterRoutes — /api/v1/admin/feature-wiring 등록 (admin 전용).
func (h *AdminFeatureWiringHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/admin/feature-wiring", func(r chi.Router) {
		r.Use(g.AdminOnly)
		r.Get("/", h.GetMatrix)
	})
}
