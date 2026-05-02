package handler

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// streamCallbacks — provider stream 파서가 호출하는 콜백.
// onTextDelta: 텍스트 토큰 1조각.
// onToolCall: 한 번에 완성된 도구 호출 1건 (id, name, args 모두 확정 후).
// 호출자는 콜백으로 모은 정보를 자체 누적해서 다음 LLM 턴 메시지를 구성.
type streamCallbacks struct {
	onTextDelta func(string)
	onToolCall  func(id, name string, args json.RawMessage)
}

// streamAnthropic — Anthropic Messages API stream 호출 + SSE 파싱.
// 한 번 호출 = LLM 한 턴. 종료 시 stop_reason 반환 ("end_turn"|"tool_use"|"max_tokens" 등).
//
// SSE 이벤트 타입별 처리:
//   - content_block_start (type=tool_use): id, name 기록
//   - content_block_delta (type=text_delta): cb.onTextDelta
//   - content_block_delta (type=input_json_delta): 해당 인덱스 partial_json 누적
//   - content_block_stop (tool_use 였던 인덱스): args 합쳐서 cb.onToolCall
//   - message_delta: stop_reason 저장
//   - message_stop: 종료
func (h *AssistantHandler) streamAnthropic(
	ctx context.Context,
	baseURL, apiKey, version, model, system string,
	msgs []anthropicMessage,
	tools []anthropicTool,
	maxTokens int,
	cb streamCallbacks,
) (string, error) {
	body, err := json.Marshal(struct {
		anthropicRequest
		Stream bool `json:"stream"`
	}{
		anthropicRequest: anthropicRequest{
			Model:     model,
			System:    system,
			Messages:  msgs,
			Tools:     tools,
			MaxTokens: maxTokens,
		},
		Stream: true,
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/v1/messages", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", version)

	res, err := h.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("Anthropic 호출 실패: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		raw, _ := io.ReadAll(res.Body)
		return "", fmt.Errorf("Anthropic %d: %s", res.StatusCode, truncate(string(raw), 400))
	}

	type pendingTool struct {
		id      string
		name    string
		partial strings.Builder
	}
	pending := make(map[int]*pendingTool)
	var stopReason string

	scanner := bufio.NewScanner(res.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}

		var ev struct {
			Type  string `json:"type"`
			Index int    `json:"index"`
			ContentBlock struct {
				Type  string          `json:"type"`
				ID    string          `json:"id"`
				Name  string          `json:"name"`
				Input json.RawMessage `json:"input"`
			} `json:"content_block"`
			Delta struct {
				Type        string `json:"type"`
				Text        string `json:"text"`
				PartialJSON string `json:"partial_json"`
				StopReason  string `json:"stop_reason"`
			} `json:"delta"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(payload), &ev); err != nil {
			continue
		}
		if ev.Error != nil {
			return stopReason, fmt.Errorf("Anthropic stream error: %s", ev.Error.Message)
		}

		switch ev.Type {
		case "content_block_start":
			if ev.ContentBlock.Type == "tool_use" {
				pending[ev.Index] = &pendingTool{id: ev.ContentBlock.ID, name: ev.ContentBlock.Name}
			}
		case "content_block_delta":
			switch ev.Delta.Type {
			case "text_delta":
				if ev.Delta.Text != "" && cb.onTextDelta != nil {
					cb.onTextDelta(ev.Delta.Text)
				}
			case "input_json_delta":
				if pt, ok := pending[ev.Index]; ok {
					pt.partial.WriteString(ev.Delta.PartialJSON)
				}
			}
		case "content_block_stop":
			if pt, ok := pending[ev.Index]; ok {
				args := json.RawMessage(pt.partial.String())
				if len(strings.TrimSpace(string(args))) == 0 {
					args = json.RawMessage("{}")
				}
				if cb.onToolCall != nil {
					cb.onToolCall(pt.id, pt.name, args)
				}
				delete(pending, ev.Index)
			}
		case "message_delta":
			if ev.Delta.StopReason != "" {
				stopReason = ev.Delta.StopReason
			}
		case "message_stop":
			return stopReason, nil
		}
	}
	if err := scanner.Err(); err != nil {
		return stopReason, fmt.Errorf("Anthropic stream 파싱 실패: %w", err)
	}
	return stopReason, nil
}

// streamOpenAI — OpenAI Chat Completions stream 호출 + SSE 파싱.
// 한 번 호출 = LLM 한 턴. 종료 시 finish_reason 반환 ("stop"|"tool_calls"|"length").
//
// chunk 별 처리:
//   - choices[0].delta.content: 텍스트 델타 → cb.onTextDelta
//   - choices[0].delta.tool_calls[i]: i 인덱스로 누적 (id/name 은 첫 chunk, arguments 는 누적)
//   - choices[0].finish_reason: 마지막 chunk 에서 도착 → 모든 누적된 도구 호출을 cb.onToolCall 일괄 emit
func (h *AssistantHandler) streamOpenAI(
	ctx context.Context,
	baseURL, apiKey, model string,
	msgs []openaiMessage,
	tools []openaiTool,
	maxTokens int,
	cb streamCallbacks,
) (string, error) {
	body, err := json.Marshal(struct {
		openaiRequest
		Stream bool `json:"stream"`
	}{
		openaiRequest: openaiRequest{
			Model:     model,
			Messages:  msgs,
			Tools:     tools,
			MaxTokens: maxTokens,
		},
		Stream: true,
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	res, err := h.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("OpenAI 호출 실패: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		raw, _ := io.ReadAll(res.Body)
		return "", fmt.Errorf("OpenAI %d: %s", res.StatusCode, truncate(string(raw), 400))
	}

	type pendingTool struct {
		id   string
		name string
		args strings.Builder
	}
	pending := make(map[int]*pendingTool)
	var finishReason string

	scanner := bufio.NewScanner(res.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   string `json:"content"`
					ToolCalls []struct {
						Index    int    `json:"index"`
						ID       string `json:"id"`
						Type     string `json:"type"`
						Function struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
			continue
		}
		if chunk.Error != nil {
			return finishReason, fmt.Errorf("OpenAI stream error: %s", chunk.Error.Message)
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		ch := chunk.Choices[0]

		if ch.Delta.Content != "" && cb.onTextDelta != nil {
			cb.onTextDelta(ch.Delta.Content)
		}
		for _, tc := range ch.Delta.ToolCalls {
			pt, ok := pending[tc.Index]
			if !ok {
				pt = &pendingTool{}
				pending[tc.Index] = pt
			}
			if tc.ID != "" {
				pt.id = tc.ID
			}
			if tc.Function.Name != "" {
				pt.name = tc.Function.Name
			}
			if tc.Function.Arguments != "" {
				pt.args.WriteString(tc.Function.Arguments)
			}
		}

		if ch.FinishReason != "" {
			finishReason = ch.FinishReason
			break
		}
	}
	if err := scanner.Err(); err != nil {
		return finishReason, fmt.Errorf("OpenAI stream 파싱 실패: %w", err)
	}

	if finishReason == "tool_calls" && cb.onToolCall != nil {
		// index 순으로 emit — 일부 모델은 순서가 비정상일 수 있어 정렬 명시
		max := -1
		for i := range pending {
			if i > max {
				max = i
			}
		}
		for i := 0; i <= max; i++ {
			pt, ok := pending[i]
			if !ok {
				continue
			}
			args := json.RawMessage(pt.args.String())
			if len(strings.TrimSpace(string(args))) == 0 {
				args = json.RawMessage("{}")
			}
			cb.onToolCall(pt.id, pt.name, args)
		}
	}

	if finishReason == "" {
		return "", errors.New("OpenAI stream 이 finish_reason 없이 종료")
	}
	return finishReason, nil
}
