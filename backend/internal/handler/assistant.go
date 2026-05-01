package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"solarflow-backend/internal/response"
)

// AssistantHandler — LLM 업무 도우미 핸들러
// Anthropic Messages API와 OpenAI Chat Completions API를 모두 호출 가능.
// GLM 등 호환 엔드포인트는 *_BASE_URL 환경변수로 지정.
type AssistantHandler struct {
	httpClient *http.Client
}

func NewAssistantHandler() *AssistantHandler {
	return &AssistantHandler{
		httpClient: &http.Client{Timeout: 90 * time.Second},
	}
}

type assistantMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type assistantRequest struct {
	Messages  []assistantMessage `json:"messages"`
	Model     string             `json:"model,omitempty"`
	System    string             `json:"system,omitempty"`
	Provider  string             `json:"provider,omitempty"`
	MaxTokens int                `json:"max_tokens,omitempty"`
}

type assistantResponse struct {
	Content  string `json:"content"`
	Model    string `json:"model"`
	Provider string `json:"provider"`
}

func (h *AssistantHandler) Chat(w http.ResponseWriter, r *http.Request) {
	var req assistantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "요청 본문이 올바른 JSON이 아닙니다")
		return
	}
	if len(req.Messages) == 0 {
		response.RespondError(w, http.StatusBadRequest, "messages는 비어 있을 수 없습니다")
		return
	}

	provider := strings.ToLower(strings.TrimSpace(req.Provider))
	if provider == "" {
		provider = strings.ToLower(strings.TrimSpace(os.Getenv("ASSISTANT_PROVIDER")))
	}
	if provider == "" {
		provider = "anthropic"
	}

	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = strings.TrimSpace(os.Getenv("ASSISTANT_MODEL"))
	}
	if model == "" {
		model = "glm-5.1"
	}

	maxTokens := req.MaxTokens
	if maxTokens <= 0 {
		if v, _ := strconv.Atoi(os.Getenv("ASSISTANT_MAX_TOKENS")); v > 0 {
			maxTokens = v
		} else {
			maxTokens = 2048
		}
	}

	var (
		content string
		err     error
	)
	switch provider {
	case "anthropic":
		content, err = h.callAnthropic(r.Context(), model, req.System, req.Messages, maxTokens)
	case "openai":
		content, err = h.callOpenAI(r.Context(), model, req.System, req.Messages, maxTokens)
	default:
		response.RespondError(w, http.StatusBadRequest, fmt.Sprintf("지원하지 않는 provider: %s", provider))
		return
	}

	if err != nil {
		response.RespondError(w, http.StatusBadGateway, err.Error())
		return
	}

	response.RespondJSON(w, http.StatusOK, assistantResponse{
		Content:  content,
		Model:    model,
		Provider: provider,
	})
}

// --- Anthropic Messages API ---
// POST {baseURL}/v1/messages
// Headers: x-api-key, anthropic-version
type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicRequest struct {
	Model     string             `json:"model"`
	System    string             `json:"system,omitempty"`
	Messages  []anthropicMessage `json:"messages"`
	MaxTokens int                `json:"max_tokens"`
}

type anthropicResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (h *AssistantHandler) callAnthropic(ctx context.Context, model, system string, messages []assistantMessage, maxTokens int) (string, error) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return "", errors.New("ANTHROPIC_API_KEY 미설정")
	}
	baseURL := strings.TrimRight(os.Getenv("ANTHROPIC_BASE_URL"), "/")
	if baseURL == "" {
		baseURL = "https://api.anthropic.com"
	}
	version := os.Getenv("ANTHROPIC_VERSION")
	if version == "" {
		version = "2023-06-01"
	}

	msgs := make([]anthropicMessage, 0, len(messages))
	for _, m := range messages {
		role := m.Role
		if role != "user" && role != "assistant" {
			role = "user"
		}
		msgs = append(msgs, anthropicMessage{Role: role, Content: m.Content})
	}

	body, err := json.Marshal(anthropicRequest{
		Model:     model,
		System:    system,
		Messages:  msgs,
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
	raw, _ := io.ReadAll(res.Body)

	if res.StatusCode >= 400 {
		var parsed anthropicResponse
		if json.Unmarshal(raw, &parsed) == nil && parsed.Error != nil {
			return "", fmt.Errorf("Anthropic %d: %s", res.StatusCode, parsed.Error.Message)
		}
		return "", fmt.Errorf("Anthropic %d: %s", res.StatusCode, truncate(string(raw), 400))
	}

	var parsed anthropicResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("Anthropic 응답 파싱 실패: %w", err)
	}

	var sb strings.Builder
	for _, c := range parsed.Content {
		if c.Type == "text" {
			sb.WriteString(c.Text)
		}
	}
	return sb.String(), nil
}

// --- OpenAI Chat Completions API ---
// POST {baseURL}/chat/completions
// Headers: Authorization: Bearer
type openaiMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openaiRequest struct {
	Model     string          `json:"model"`
	Messages  []openaiMessage `json:"messages"`
	MaxTokens int             `json:"max_tokens,omitempty"`
}

type openaiResponse struct {
	Choices []struct {
		Message openaiMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

func (h *AssistantHandler) callOpenAI(ctx context.Context, model, system string, messages []assistantMessage, maxTokens int) (string, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return "", errors.New("OPENAI_API_KEY 미설정")
	}
	baseURL := strings.TrimRight(os.Getenv("OPENAI_BASE_URL"), "/")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}

	msgs := make([]openaiMessage, 0, len(messages)+1)
	if strings.TrimSpace(system) != "" {
		msgs = append(msgs, openaiMessage{Role: "system", Content: system})
	}
	for _, m := range messages {
		role := m.Role
		if role != "user" && role != "assistant" && role != "system" {
			role = "user"
		}
		msgs = append(msgs, openaiMessage{Role: role, Content: m.Content})
	}

	body, err := json.Marshal(openaiRequest{
		Model:     model,
		Messages:  msgs,
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
	req.Header.Set("Authorization", "Bearer "+apiKey)

	res, err := h.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("OpenAI 호출 실패: %w", err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)

	if res.StatusCode >= 400 {
		var parsed openaiResponse
		if json.Unmarshal(raw, &parsed) == nil && parsed.Error != nil {
			return "", fmt.Errorf("OpenAI %d: %s", res.StatusCode, parsed.Error.Message)
		}
		return "", fmt.Errorf("OpenAI %d: %s", res.StatusCode, truncate(string(raw), 400))
	}

	var parsed openaiResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("OpenAI 응답 파싱 실패: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return "", errors.New("OpenAI 응답에 choices 없음")
	}
	return parsed.Choices[0].Message.Content, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
