// lc/audit.go — audit log helper 임시 복사본 (PR-C2 dup, PR-D 정리).
// 출처: backend/internal/handler/sys_audit_log.go (PO 의 audit.go 와 동일).

package lc

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
)

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
