package handler

// 운영자(또는 admin)가 사이트 전역 UI 기본값을 설정하는 라우트.
//
// 저장 위치: system_settings 테이블의 key='ui_defaults.{tenant}' 행 1개.
//   value 형태:
//   {
//     "tables": {
//       "sale-list": { "order": ["id","customer","amount"], "widths": {"customer": 220} },
//       ...
//     },
//     "kpi": {
//       "sale-summary": { "hidden": ["issue_rate"] },
//       ...
//     }
//   }
//
// 라우팅:
//   GET  /api/v1/ui-defaults/{tenant}   (인증 사용자) — 모든 사용자가 자기 테넌트 default 를 읽음
//   PUT  /api/v1/ui-defaults/{tenant}   (admin + operator, 자기 테넌트만) — 운영자가 default 를 설정
//
// 개인 설정과의 관계: 이 default 는 사용자가 자기 localStorage 에 한 번도 컬럼/KPI 를
// 만지지 않았을 때만 적용된다(개인 > 운영자). 프론트 hook 이 이 우선순위를 강제한다.

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/response"
	"solarflow-backend/internal/tenant"
)

type UIDefaultsHandler struct {
	DB *supa.Client
}

func NewUIDefaultsHandler(db *supa.Client) *UIDefaultsHandler {
	return &UIDefaultsHandler{DB: db}
}

// init — feature.IDSysUIDefaults 로 자체 마운트.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDSysUIDefaults,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewUIDefaultsHandler(d.DB)
			g := d.Gates
			r.Route("/ui-defaults", func(r chi.Router) {
				r.Get("/{tenant}", h.Get)
				// Write = admin + operator. 단, 자기 테넌트만 쓸 수 있게 핸들러 안에서 추가 검증.
				r.With(g.Write).Put("/{tenant}", h.Upsert)
			})
		},
	})
}

type uiDefaultsRow struct {
	Key   string                 `json:"key"`
	Value map[string]interface{} `json:"value"`
}

const uiDefaultsKeyPrefix = "ui_defaults."

func uiDefaultsKey(t string) string { return uiDefaultsKeyPrefix + t }

// validateTenantParam — URL 의 {tenant} 가 카탈로그에 등록된 테넌트인지 확인.
func validateTenantParam(t string) error {
	if t == "" {
		return fmt.Errorf("tenant 가 비어 있습니다")
	}
	if !tenant.Known(t) {
		return fmt.Errorf("알 수 없는 tenant: %s", t)
	}
	return nil
}

// Get — GET /api/v1/ui-defaults/{tenant}
//
// 인증된 모든 사용자가 자기 호스트 테넌트의 default 를 읽는다(부트스트랩 1회 fetch).
// 다른 테넌트도 읽을 수는 있지만 admin/operator 가 아닌 일반 사용자는 자기 테넌트 외 호출이
// 의미 없고, 캐시도 따로 안 되므로 막지 않는다(메뉴 가시성 키와 동일한 정책).
func (h *UIDefaultsHandler) Get(w http.ResponseWriter, r *http.Request) {
	t := strings.ToLower(chi.URLParam(r, "tenant"))
	if err := validateTenantParam(t); err != nil {
		response.RespondError(w, http.StatusBadRequest, err.Error())
		return
	}

	data, _, err := h.DB.From("system_settings").
		Select("key,value", "exact", false).
		Eq("key", uiDefaultsKey(t)).
		Execute()
	if err != nil {
		log.Printf("[ui_defaults 조회 실패] tenant=%s err=%v", t, err)
		response.RespondError(w, http.StatusInternalServerError, "UI 기본값 조회에 실패했습니다")
		return
	}

	var rows []uiDefaultsRow
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[ui_defaults 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 처리에 실패했습니다")
		return
	}

	if len(rows) == 0 {
		// 빈 default — 프론트가 { tables: {}, kpi: {} } 로 처리하도록 빈 객체 반환.
		response.RespondJSON(w, http.StatusOK, map[string]interface{}{
			"tables": map[string]interface{}{},
			"kpi":    map[string]interface{}{},
		})
		return
	}
	response.RespondJSON(w, http.StatusOK, rows[0].Value)
}

type uiDefaultsUpsert struct {
	Key       string                 `json:"key"`
	Value     map[string]interface{} `json:"value"`
	UpdatedBy *string                `json:"updated_by,omitempty"`
}

// Upsert — PUT /api/v1/ui-defaults/{tenant}
//
// 권한: g.Write (admin + operator). 추가로 자기 테넌트만 쓸 수 있게 핸들러에서 검증.
// admin 은 cross-tenant 변경을 위해 예외.
func (h *UIDefaultsHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	t := strings.ToLower(chi.URLParam(r, "tenant"))
	if err := validateTenantParam(t); err != nil {
		response.RespondError(w, http.StatusBadRequest, err.Error())
		return
	}

	role := middleware.GetUserRole(r.Context())
	userTenant := middleware.GetTenantScope(r.Context())
	if role != "admin" && t != userTenant {
		response.RespondError(w, http.StatusForbidden, "본인 테넌트의 UI 기본값만 변경할 수 있습니다")
		return
	}

	var value map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&value); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 JSON 형식입니다")
		return
	}
	// shape 가드 — tables/kpi 가 객체가 아니면 거절.
	if v, ok := value["tables"]; ok {
		if _, ok := v.(map[string]interface{}); !ok {
			response.RespondError(w, http.StatusBadRequest, "tables 는 객체여야 합니다")
			return
		}
	}
	if v, ok := value["kpi"]; ok {
		if _, ok := v.(map[string]interface{}); !ok {
			response.RespondError(w, http.StatusBadRequest, "kpi 는 객체여야 합니다")
			return
		}
	}

	payload := uiDefaultsUpsert{Key: uiDefaultsKey(t), Value: value}
	if userID := middleware.GetUserID(r.Context()); userID != "" {
		payload.UpdatedBy = &userID
	}

	_, _, err := h.DB.From("system_settings").
		Upsert(payload, "key", "minimal", "").
		Execute()
	if err != nil {
		log.Printf("[ui_defaults 저장 실패] tenant=%s err=%v", t, err)
		response.RespondError(w, http.StatusInternalServerError, "UI 기본값 저장에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, statusOKResponse{Status: "ok"})
}
