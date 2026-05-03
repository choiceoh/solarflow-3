package model

import (
	"strings"
	"testing"
)

func TestCreateLibraryPostRequestValidate(t *testing.T) {
	tests := []struct {
		name string
		req  CreateLibraryPostRequest
		want string
	}{
		{
			name: "valid",
			req:  CreateLibraryPostRequest{Title: "운영 매뉴얼", Content: "자료실 본문"},
			want: "",
		},
		{
			name: "title required",
			req:  CreateLibraryPostRequest{Content: "자료실 본문"},
			want: "title은 필수 항목입니다",
		},
		{
			name: "content required",
			req:  CreateLibraryPostRequest{Title: "운영 매뉴얼"},
			want: "content는 필수 항목입니다",
		},
		{
			name: "title length",
			req:  CreateLibraryPostRequest{Title: strings.Repeat("가", LibraryPostTitleMaxRunes+1), Content: "자료실 본문"},
			want: "title은 120자를 초과할 수 없습니다",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.req.Normalize()
			if got := tt.req.Validate(); got != tt.want {
				t.Fatalf("Validate()=%q want %q", got, tt.want)
			}
		})
	}
}

func TestUpdateLibraryPostRequestValidate(t *testing.T) {
	blank := " "
	title := "개정 매뉴얼"
	content := strings.Repeat("나", LibraryPostContentMaxRunes+1)

	tests := []struct {
		name string
		req  UpdateLibraryPostRequest
		want string
	}{
		{name: "no fields", req: UpdateLibraryPostRequest{}, want: "수정할 항목이 없습니다"},
		{name: "blank title", req: UpdateLibraryPostRequest{Title: &blank}, want: "title은 빈 값으로 변경할 수 없습니다"},
		{name: "content length", req: UpdateLibraryPostRequest{Content: &content}, want: "content는 5000자를 초과할 수 없습니다"},
		{name: "valid title", req: UpdateLibraryPostRequest{Title: &title}, want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.req.Normalize()
			if got := tt.req.Validate(); got != tt.want {
				t.Fatalf("Validate()=%q want %q", got, tt.want)
			}
		})
	}
}
