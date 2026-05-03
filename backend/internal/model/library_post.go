package model

import (
	"strings"
	"unicode/utf8"
)

const (
	LibraryPostTitleMaxRunes   = 120
	LibraryPostContentMaxRunes = 5000
)

// LibraryPost — 자료실에 등록되는 게시글
type LibraryPost struct {
	PostID    string  `json:"post_id"`
	Title     string  `json:"title"`
	Content   string  `json:"content"`
	CreatedBy *string `json:"created_by"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

// CreateLibraryPostRequest — 자료실 게시글 등록 요청
type CreateLibraryPostRequest struct {
	Title     string  `json:"title"`
	Content   string  `json:"content"`
	CreatedBy *string `json:"created_by,omitempty"`
}

func (req *CreateLibraryPostRequest) Normalize() {
	req.Title = strings.TrimSpace(req.Title)
	req.Content = strings.TrimSpace(req.Content)
}

func (req *CreateLibraryPostRequest) Validate() string {
	if strings.TrimSpace(req.Title) == "" {
		return "title은 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.Title) > LibraryPostTitleMaxRunes {
		return "title은 120자를 초과할 수 없습니다"
	}
	if strings.TrimSpace(req.Content) == "" {
		return "content는 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.Content) > LibraryPostContentMaxRunes {
		return "content는 5000자를 초과할 수 없습니다"
	}
	return ""
}

// UpdateLibraryPostRequest — 자료실 게시글 수정 요청
type UpdateLibraryPostRequest struct {
	Title   *string `json:"title,omitempty"`
	Content *string `json:"content,omitempty"`
}

func (req *UpdateLibraryPostRequest) Normalize() {
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		req.Title = &title
	}
	if req.Content != nil {
		content := strings.TrimSpace(*req.Content)
		req.Content = &content
	}
}

func (req *UpdateLibraryPostRequest) Validate() string {
	if req.Title == nil && req.Content == nil {
		return "수정할 항목이 없습니다"
	}
	if req.Title != nil {
		if *req.Title == "" {
			return "title은 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.Title) > LibraryPostTitleMaxRunes {
			return "title은 120자를 초과할 수 없습니다"
		}
	}
	if req.Content != nil {
		if *req.Content == "" {
			return "content는 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.Content) > LibraryPostContentMaxRunes {
			return "content는 5000자를 초과할 수 없습니다"
		}
	}
	return ""
}
