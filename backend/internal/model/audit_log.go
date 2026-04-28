package model

import "encoding/json"

// AuditLog — 운영 데이터 변경 감사 기록
// 비유: 중요한 서류철 옆에 붙는 출입 장부 — 누가 언제 어떤 서류를 바꿨는지 남김
type AuditLog struct {
	AuditID       string           `json:"audit_id"`
	EntityType    string           `json:"entity_type"`
	EntityID      string           `json:"entity_id"`
	Action        string           `json:"action"`
	UserID        *string          `json:"user_id,omitempty"`
	UserEmail     *string          `json:"user_email,omitempty"`
	RequestMethod *string          `json:"request_method,omitempty"`
	RequestPath   *string          `json:"request_path,omitempty"`
	OldData       *json.RawMessage `json:"old_data,omitempty"`
	NewData       *json.RawMessage `json:"new_data,omitempty"`
	Note          *string          `json:"note,omitempty"`
	CreatedAt     string           `json:"created_at"`
}
