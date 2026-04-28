package dbrpc

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

// Error — PostgREST RPC 실패 응답
// 비유: DB 함수 호출 실패 안내서 — HTTP 상태와 Postgres 메시지를 함께 보관한다.
type Error struct {
	StatusCode int
	Code       string
	Message    string
	Body       string
}

func (e *Error) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return fmt.Sprintf("PostgREST RPC 실패: HTTP %d", e.StatusCode)
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details string `json:"details"`
	Hint    string `json:"hint"`
}

// Call — PostgREST RPC를 호출하고, 실패 상태를 Go error로 돌려준다.
// 비유: DB 접수창구에 신청서를 내고 접수 거절이면 사유서까지 받아오는 것
func Call(ctx context.Context, name string, body interface{}) ([]byte, error) {
	baseURL := strings.TrimRight(os.Getenv("SUPABASE_URL"), "/")
	key := os.Getenv("SUPABASE_KEY")
	if baseURL == "" || key == "" {
		return nil, fmt.Errorf("SUPABASE_URL 또는 SUPABASE_KEY가 설정되지 않았습니다")
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("RPC 요청 직렬화 실패: %w", err)
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		baseURL+"/rest/v1/rpc/"+name,
		bytes.NewReader(payload),
	)
	if err != nil {
		return nil, fmt.Errorf("RPC 요청 생성 실패: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", key)
	req.Header.Set("Authorization", "Bearer "+key)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("RPC 호출 실패: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("RPC 응답 읽기 실패: %w", err)
	}

	if resp.StatusCode >= http.StatusBadRequest {
		msg := strings.TrimSpace(string(respBody))
		var parsed errorBody
		if err := json.Unmarshal(respBody, &parsed); err == nil && parsed.Message != "" {
			msg = parsed.Message
			if parsed.Details != "" {
				msg += ": " + parsed.Details
			}
		}
		return nil, &Error{
			StatusCode: resp.StatusCode,
			Code:       parsed.Code,
			Message:    msg,
			Body:       string(respBody),
		}
	}

	return respBody, nil
}

// StatusCode — RPC 에러의 HTTP 상태를 꺼낸다.
// 비유: 거절 사유서에 찍힌 상태 도장을 확인하는 것
func StatusCode(err error, fallback int) int {
	if rpcErr, ok := err.(*Error); ok {
		if rpcErr.Code == "P0002" {
			return http.StatusNotFound
		}
		return rpcErr.StatusCode
	}
	return fallback
}
