package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/response"
)

// 허용된 entity_type — 운영 entity만 조회 가능. PostgREST `Eq`에 임의 문자열을 흘리는 것을 막고,
// 미래에 새 entity가 audit_logs에 들어올 때 의도적인 추가만 노출되도록 한다.
// 모든 audit 호출처(tx_po/tx_lc/tx_outbound/tx_sale 등)와 정합성 유지.
var allowedAuditEntityTypes = map[string]struct{}{
	"purchase_orders":       {},
	"lcs":                   {},
	"bls":                   {},
	"tts":                   {},
	"price_histories":       {},
	"orders":                {},
	"outbounds":             {},
	"sales":                 {},
	"receipts":              {},
	"receipt_matches":       {},
	"declarations":          {},
	"cost_details":          {},
	"expenses":              {},
	"partners":              {},
	"banks":                 {},
	"warehouses":            {},
	"manufacturers":         {},
	"products":              {},
	"companies":             {},
	"intercompany_requests": {},
}

// entity_id / user_id 안전선 — UUID v4 형태이거나 영숫자/하이픈/언더스코어만(legacy id 호환).
// 길이는 1..64로 제한. PostgREST의 Eq에 자유 문자열이 흐르는 표면을 좁힘.
var auditIdentifierRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func validAuditIdentifier(s string) bool {
	return auditIdentifierRe.MatchString(s)
}

// audit_logs.action — 운영 핸들러가 쓰는 값만 허용.
var allowedAuditActions = map[string]struct{}{
	"create": {},
	"update": {},
	"delete": {},
}

// 허용되는 from 입력 형식 — Postgres timestamp 필터 안전선.
// 자유 문자열을 그대로 PostgREST에 넘기면 .Gte 안에서 파싱 오류 또는 의도치 않은
// 비교가 발생할 수 있으므로 ISO 8601 date / datetime 두 형태만 통과시킨다.
var auditFromFormats = []string{
	"2006-01-02",
	time.RFC3339,
}

func parseAuditFrom(s string) (string, bool) {
	for _, layout := range auditFromFormats {
		if _, err := time.Parse(layout, s); err == nil {
			return s, true
		}
	}
	return "", false
}

// AuditLogHandler — 감사 로그 조회 API
// 비유: 운영 장부를 펼쳐서 누가 어떤 전표를 만졌는지 확인하는 창구
type AuditLogHandler struct {
	DB *supa.Client
}

func NewAuditLogHandler(db *supa.Client) *AuditLogHandler {
	return &AuditLogHandler{DB: db}
}

// init — D-20260512-090000 feature self-mounting.
// routes.go 의 원래 메서드 시그니처가 `g middleware.Gates` 를 `_` 로 받아 사용하지 않았지만,
// 본 init() 에서도 동일하게 g 미사용 — read-only audit 라우트라 가드 불필요.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDSysAuditLog,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewAuditLogHandler(d.DB)
			r.Route("/audit-logs", func(r chi.Router) {
				r.Get("/", h.List)
			})
		},
	})
}

// List — GET /api/v1/audit-logs
// Query params: entity_type, entity_id, action, user_id, from(ISO date), limit(default 500, max 5000)
func (h *AuditLogHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("audit_logs").
		Select("*", "exact", false)

	if entityType := r.URL.Query().Get("entity_type"); entityType != "" {
		if _, ok := allowedAuditEntityTypes[entityType]; !ok {
			response.RespondError(w, http.StatusBadRequest, "entity_type 파라미터가 허용되지 않은 값입니다")
			return
		}
		query = query.Eq("entity_type", entityType)
	}
	if entityID := r.URL.Query().Get("entity_id"); entityID != "" {
		if !validAuditIdentifier(entityID) {
			response.RespondError(w, http.StatusBadRequest, "entity_id는 64자 이내의 영숫자/하이픈/언더스코어만 허용됩니다")
			return
		}
		query = query.Eq("entity_id", entityID)
	}
	if action := r.URL.Query().Get("action"); action != "" {
		if _, ok := allowedAuditActions[action]; !ok {
			response.RespondError(w, http.StatusBadRequest, "action 파라미터는 create/update/delete 중 하나여야 합니다")
			return
		}
		query = query.Eq("action", action)
	}
	if userID := r.URL.Query().Get("user_id"); userID != "" {
		if !validAuditIdentifier(userID) {
			response.RespondError(w, http.StatusBadRequest, "user_id는 64자 이내의 영숫자/하이픈/언더스코어만 허용됩니다")
			return
		}
		query = query.Eq("user_id", userID)
	}
	if from := r.URL.Query().Get("from"); from != "" {
		valid, ok := parseAuditFrom(from)
		if !ok {
			response.RespondError(w, http.StatusBadRequest, "from 파라미터는 YYYY-MM-DD 또는 RFC3339 형식이어야 합니다")
			return
		}
		query = query.Gte("created_at", valid)
	}

	const (
		defaultLimit = 500
		maxLimit     = 5000
	)
	limit := defaultLimit
	if v := r.URL.Query().Get("limit"); v != "" {
		parsed, err := strconv.Atoi(v)
		if err != nil || parsed <= 0 {
			response.RespondError(w, http.StatusBadRequest, "limit 파라미터는 양의 정수여야 합니다")
			return
		}
		if parsed > maxLimit {
			parsed = maxLimit
		}
		limit = parsed
	}
	offset := 0
	if v := r.URL.Query().Get("offset"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed >= 0 {
			offset = parsed
		}
	}
	query = query.Order("created_at", &postgrest.OrderOpts{Ascending: false}).Range(offset, offset+limit-1, "")

	data, count, err := query.Execute()
	if err != nil {
		log.Printf("[감사 로그 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "감사 로그 조회에 실패했습니다")
		return
	}

	var logs []model.AuditLog
	if err := json.Unmarshal(data, &logs); err != nil {
		log.Printf("[감사 로그 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "감사 로그 데이터 처리에 실패했습니다")
		return
	}

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, logs)
}
