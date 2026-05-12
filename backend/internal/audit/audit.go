// Package audit — 감사 로그 (audit_logs) 기록 helper.
//
// PR-D1 에서 분리: 이전엔 backend/internal/handler/sys_audit_log.go 안 정의 +
// PR-B/C2 의 po/lc 의 audit.go 안 dup. 본 패키지로 통합.
//
// middleware 패키지 의존 — middleware 가 audit 의존 X (cycle 없음).
package audit

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
)

// LogInsert — audit_logs 테이블 insert 페이로드 형식.
type LogInsert struct {
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

// PtrIfNotEmpty — empty string → nil, else &value.
func PtrIfNotEmpty(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

// Snapshot — table 의 row (id 로 조회) 를 json.RawMessage 로 dump. 변경 전/후 비교용.
func Snapshot(db *supa.Client, table string, idColumn string, id string) (*json.RawMessage, bool, error) {
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

// RawFromValue — Go value → *json.RawMessage 변환.
func RawFromValue(value interface{}) *json.RawMessage {
	data, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	raw := json.RawMessage(data)
	return &raw
}

// WriteLog — audit_logs 에 한 행 insert. 실패 시 log only (요청 자체 차단 X).
func WriteLog(db *supa.Client, r *http.Request, entityType string, entityID string, action string, oldData *json.RawMessage, newData *json.RawMessage, note string) {
	if db == nil || r == nil || entityType == "" || entityID == "" || action == "" {
		return
	}
	row := LogInsert{
		EntityType:    entityType,
		EntityID:      entityID,
		Action:        action,
		UserID:        PtrIfNotEmpty(middleware.GetUserID(r.Context())),
		UserEmail:     PtrIfNotEmpty(middleware.GetUserEmail(r.Context())),
		RequestMethod: r.Method,
		RequestPath:   r.URL.Path,
		OldData:       oldData,
		NewData:       newData,
		Note:          PtrIfNotEmpty(note),
	}
	if _, _, err := db.From("audit_logs").Insert(row, false, "", "", "minimal").Execute(); err != nil {
		log.Printf("[감사 로그 기록 실패] entity=%s id=%s action=%s err=%v", entityType, entityID, action, err)
	}
}

// EntityByRouteID — chi.URLParam(r, "id") 를 entity ID 로 사용하는 WriteLog 래퍼.
func EntityByRouteID(db *supa.Client, r *http.Request, table string, idColumn string, action string, oldData *json.RawMessage, newData *json.RawMessage, note string) {
	WriteLog(db, r, table, chi.URLParam(r, "id"), action, oldData, newData, note)
}
