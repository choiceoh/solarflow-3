package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
	"unicode/utf8"
)

// 세션 제목 자동 요약 — fallback LLM 으로 한 줄 제목 생성.
// chat 본 처리는 primary 가 잡고 있으므로 가벼운 요약은 fallback 으로 위임 → 부하 분산.
// fallback 미설정·호출 실패·빈 응답 시 빈 문자열 반환 → 호출자가 슬라이스 fallback 으로 떨어뜨림.

const (
	titleMaxRunes        = 30
	titleSummarizeTokens = 60
	titleSummaryTimeout  = 15 * time.Second
)

const titleSystemPrompt = `다음 사용자 질문을 한 줄 제목으로 요약해줘.
- 20자 내외
- 따옴표·이모지·마침표 금지
- 답만 출력 (설명·접두어 금지)`

// summarizeTitleWithFallback — fallback LLM 으로 한 줄 제목 생성.
// 환경변수 미설정 / 호출 실패 / 응답 빈 문자열이면 "" 반환.
func (h *AssistantHandler) summarizeTitleWithFallback(ctx context.Context, userText string) string {
	provider := strings.ToLower(strings.TrimSpace(os.Getenv("ASSISTANT_FALLBACK_PROVIDER")))
	if provider == "" {
		return ""
	}
	model := strings.TrimSpace(os.Getenv("ASSISTANT_FALLBACK_MODEL"))
	if model == "" {
		model = defaultModelForProvider(provider)
	}
	if model == "" {
		return ""
	}

	cctx, cancel := context.WithTimeout(ctx, titleSummaryTimeout)
	defer cancel()

	var (
		raw string
		err error
	)
	switch provider {
	case "anthropic":
		raw, err = h.callAnthropicOnce(cctx, model, titleSystemPrompt, userText, titleSummarizeTokens)
	case "openai":
		raw, err = h.callOpenAIOnce(cctx, model, titleSystemPrompt, userText, titleSummarizeTokens)
	default:
		return ""
	}
	if err != nil {
		log.Printf("[assistant title] fallback=%s 실패: %v", provider, err)
		return ""
	}
	return sanitizeTitle(raw)
}

// sanitizeTitle — LLM 출력 정리: 첫 줄만, 따옴표·괄호·마침표 제거, 30자 truncate.
// 빈 결과면 "" 반환 → 호출자가 슬라이스 fallback.
func sanitizeTitle(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if i := strings.IndexAny(s, "\r\n"); i >= 0 {
		s = s[:i]
	}
	s = strings.Trim(s, "\"'`「」『』《》〈〉()()[]【】 \t")
	s = strings.TrimRight(s, ".。…")
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if utf8.RuneCountInString(s) > titleMaxRunes {
		runes := []rune(s)
		s = string(runes[:titleMaxRunes]) + "…"
	}
	return s
}

// sliceFallbackTitle — LLM 요약 실패 시 사용. 프론트의 buildSessionTitle 과 동일 정책.
func sliceFallbackTitle(s string) string {
	one := strings.Join(strings.Fields(s), " ")
	if one == "" {
		return "새 대화"
	}
	if utf8.RuneCountInString(one) <= titleMaxRunes {
		return one
	}
	runes := []rune(one)
	return string(runes[:titleMaxRunes]) + "…"
}

// extractFirstUserText — UIMessage[] (JSONB) 에서 첫 user 메시지의 모든 text part 를 이어붙임.
// 프론트 lib/assistantMessages.ts 의 extractText 와 동일 형식. 빈 문자열이면 "".
func extractFirstUserText(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var msgs []struct {
		Role  string `json:"role"`
		Parts []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"parts"`
	}
	if err := json.Unmarshal(raw, &msgs); err != nil {
		return ""
	}
	for _, m := range msgs {
		if m.Role != "user" {
			continue
		}
		var b strings.Builder
		for _, p := range m.Parts {
			if p.Type == "text" {
				b.WriteString(p.Text)
			}
		}
		if t := strings.TrimSpace(b.String()); t != "" {
			return t
		}
	}
	return ""
}

// callAnthropicOnce — 한 턴 비스트리밍 Anthropic 호출. 도구 없음, system + user 1개.
func (h *AssistantHandler) callAnthropicOnce(ctx context.Context, model, system, user string, maxTokens int) (string, error) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return "", errors.New("ANTHROPIC_API_KEY 미설정")
	}
	baseURL := strings.TrimRight(os.Getenv("ANTHROPIC_BASE_URL"), "/")
	if baseURL == "" {
		baseURL = "https://api.z.ai/api/anthropic"
	}
	version := os.Getenv("ANTHROPIC_VERSION")
	if version == "" {
		version = "2023-06-01"
	}

	body, err := json.Marshal(anthropicRequest{
		Model:  model,
		System: system,
		Messages: []anthropicMessage{
			{Role: "user", Content: []anthropicContentBlock{{Type: "text", Text: user}}},
		},
		MaxTokens: maxTokens,
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/v1/messages", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", version)

	res, err := h.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("Anthropic 호출 실패: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		raw, _ := io.ReadAll(res.Body)
		return "", fmt.Errorf("Anthropic %d: %s", res.StatusCode, truncate(string(raw), 200))
	}

	var parsed struct {
		Content []anthropicContentBlock `json:"content"`
	}
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return "", err
	}
	var b strings.Builder
	for _, c := range parsed.Content {
		if c.Type == "text" {
			b.WriteString(c.Text)
		}
	}
	return b.String(), nil
}

// callOpenAIOnce — 한 턴 비스트리밍 OpenAI/Qwen 호환 호출. 도구 없음.
func (h *AssistantHandler) callOpenAIOnce(ctx context.Context, model, system, user string, maxTokens int) (string, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	baseURL := strings.TrimRight(os.Getenv("OPENAI_BASE_URL"), "/")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	if !isLocalBaseURL(baseURL) && apiKey == "" {
		return "", errors.New("OPENAI_API_KEY 미설정")
	}

	body, err := json.Marshal(openaiRequest{
		Model: model,
		Messages: []openaiMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
		MaxTokens: maxTokens,
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
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
		return "", fmt.Errorf("OpenAI %d: %s", res.StatusCode, truncate(string(raw), 200))
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 {
		return "", errors.New("응답 choices 비어 있음")
	}
	return parsed.Choices[0].Message.Content, nil
}
