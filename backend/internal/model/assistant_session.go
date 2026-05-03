package model

import (
	"encoding/json"
	"unicode/utf8"
)

// AssistantSession — AI 어시스턴트 대화 세션 한 건.
// messages는 프런트의 UIMessage[]를 JSONB로 그대로 보관.
type AssistantSession struct {
	ID        string          `json:"id"`
	UserID    string          `json:"user_id"`
	Title     string          `json:"title"`
	Messages  json.RawMessage `json:"messages"`
	CreatedAt string          `json:"created_at"`
	UpdatedAt string          `json:"updated_at"`
}

// AssistantSessionSummary — 목록 표시용 (messages 제외, 페이로드 절감).
type AssistantSessionSummary struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// CreateAssistantSessionRequest — 세션 생성 요청. 둘 다 선택. user_id는 서버가 JWT로 결정.
type CreateAssistantSessionRequest struct {
	Title    string          `json:"title,omitempty"`
	Messages json.RawMessage `json:"messages,omitempty"`
}

func (req *CreateAssistantSessionRequest) Validate() string {
	if utf8.RuneCountInString(req.Title) > 200 {
		return "title은 200자를 초과할 수 없습니다"
	}
	return ""
}

// UpdateAssistantSessionRequest — 제목·메시지 부분 갱신.
type UpdateAssistantSessionRequest struct {
	Title    *string          `json:"title,omitempty"`
	Messages *json.RawMessage `json:"messages,omitempty"`
}

func (req *UpdateAssistantSessionRequest) Validate() string {
	if req.Title != nil && utf8.RuneCountInString(*req.Title) > 200 {
		return "title은 200자를 초과할 수 없습니다"
	}
	return ""
}
