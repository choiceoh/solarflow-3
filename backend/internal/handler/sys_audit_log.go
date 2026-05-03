package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

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

// List — GET /api/v1/audit-logs
// Query params: entity_type, entity_id, action, user_id, from(ISO date), limit(default 500, max 5000)
func (h *AuditLogHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("audit_logs").
		Select("*", "exact", false)

	if entityType := r.URL.Query().Get("entity_type"); entityType != "" {
		query = query.Eq("entity_type", entityType)
	}
	if entityID := r.URL.Query().Get("entity_id"); entityID != "" {
		query = query.Eq("entity_id", entityID)
	}
	if action := r.URL.Query().Get("action"); action != "" {
		query = query.Eq("action", action)
	}
	if userID := r.URL.Query().Get("user_id"); userID != "" {
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
	query = query.Order("created_at", &postgrest.OrderOpts{Ascending: false}).Limit(limit, "")

	data, _, err := query.Execute()
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

	response.RespondJSON(w, http.StatusOK, logs)
}

type auditLogInsert struct {
	EntityType    string           `json:"entity_type"`
	EntityID      string           `json:"entity_id"`
	Action        string           `json:"action"`
	UserID        *string          `json:"user_id,omitempty"`
	UserEmail     *string          `json:"user_email,omitempty"`
	RequestMethod string           `json:"request_method"`
	RequestPath   string           `json:"request_path"`
	OldData       *json.RawMessage `json:"old_data,omitempty"`
	NewData       *json.RawMessage `json:"new_data,omitempty"`
	Note          *string          `json:"note,omitempty"`
}

func ptrIfNotEmpty(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func auditSnapshot(db *supa.Client, table string, idColumn string, id string) (*json.RawMessage, bool, error) {
	data, _, err := db.From(table).
		Select("*", "exact", false).
		Eq(idColumn, id).
		Execute()
	if err != nil {
		return nil, false, err
	}

	var rows []json.RawMessage
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, false, err
	}
	if len(rows) == 0 {
		return nil, false, nil
	}
	row := rows[0]
	return &row, true, nil
}

func auditRawFromValue(value interface{}) *json.RawMessage {
	data, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	raw := json.RawMessage(data)
	return &raw
}

func writeAuditLog(db *supa.Client, r *http.Request, entityType string, entityID string, action string, oldData *json.RawMessage, newData *json.RawMessage, note string) {
	if db == nil || r == nil || entityType == "" || entityID == "" || action == "" {
		return
	}

	row := auditLogInsert{
		EntityType:    entityType,
		EntityID:      entityID,
		Action:        action,
		UserID:        ptrIfNotEmpty(middleware.GetUserID(r.Context())),
		UserEmail:     ptrIfNotEmpty(middleware.GetUserEmail(r.Context())),
		RequestMethod: r.Method,
		RequestPath:   r.URL.Path,
		OldData:       oldData,
		NewData:       newData,
		Note:          ptrIfNotEmpty(note),
	}

	if _, _, err := db.From("audit_logs").Insert(row, false, "", "", "minimal").Execute(); err != nil {
		log.Printf("[감사 로그 기록 실패] entity=%s id=%s action=%s err=%v", entityType, entityID, action, err)
	}
}

func auditEntityByRouteID(db *supa.Client, r *http.Request, table string, idColumn string, action string, oldData *json.RawMessage, newData *json.RawMessage, note string) {
	writeAuditLog(db, r, table, chi.URLParam(r, "id"), action, oldData, newData, note)
}
