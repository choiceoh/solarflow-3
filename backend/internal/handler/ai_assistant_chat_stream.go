package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"solarflow-backend/internal/response"
)

// ChatStream — POST /api/v1/assistant/chat (v5 UI Message Stream).
// 한 요청 = 한 SSE. 조회 도구 호출 루프가 한 SSE 안에서 다단계로 진행.
//
// F1 fallback: 첫 청크(=헤더) 송출 전까지만 fallback provider 로 재시도.
//
//	첫 청크 emit 후 실패 시 SSE 안에서 error 청크로 종료.
func (h *AssistantHandler) ChatStream(w http.ResponseWriter, r *http.Request) {
	var req assistantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "요청 본문이 올바른 JSON이 아닙니다")
		return
	}
	if len(req.Messages) == 0 {
		response.RespondError(w, http.StatusBadRequest, "messages는 비어 있을 수 없습니다")
		return
	}

	provider, model, maxTokens := resolveProviderModel(req)
	system := buildSystemPrompt(r.Context(), req.PageContext)
	ctx := r.Context()

	sse, err := newDataStreamWriter(w)
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	clientPinned := strings.TrimSpace(req.Provider) != ""
	startedAt := time.Now()
	log.Printf("[assistant stream] enter provider=%s model=%s msgs=%d maxTokens=%d", provider, model, len(req.Messages), maxTokens)

	err = h.runStreamingChat(ctx, sse, provider, model, system, req.Messages, maxTokens)
	elapsed := time.Since(startedAt)
	if err == nil {
		log.Printf("[assistant stream] ok provider=%s model=%s elapsed=%s", provider, model, elapsed)
		return
	}

	// F1 fallback — 헤더 전이고, 클라이언트가 provider pin 안 했고, 인프라성 에러일 때만.
	if !sse.HasWrittenHeader() && !clientPinned && shouldFallback(err) {
		fbProvider := strings.ToLower(strings.TrimSpace(os.Getenv("ASSISTANT_FALLBACK_PROVIDER")))
		if fbProvider != "" && fbProvider != provider {
			fbModel := strings.TrimSpace(os.Getenv("ASSISTANT_FALLBACK_MODEL"))
			if fbModel == "" {
				fbModel = defaultModelForProvider(fbProvider)
			}
			log.Printf("[assistant stream] primary=%s 실패(%v) → fallback=%s", provider, err, fbProvider)
			if fbErr := h.runStreamingChat(ctx, sse, fbProvider, fbModel, system, req.Messages, maxTokens); fbErr != nil {
				log.Printf("[assistant stream] fallback=%s 실패: %v", fbProvider, fbErr)
				h.failResponse(sse, w, fbErr)
				return
			}
			log.Printf("[assistant stream] fallback=%s ok elapsed=%s", fbProvider, time.Since(startedAt))
			return
		}
	}

	log.Printf("[assistant stream] FAIL provider=%s elapsed=%s err=%v", provider, elapsed, err)
	h.failResponse(sse, w, err)
}

// failResponse — 헤더 전이면 일반 5xx, 헤더 후면 SSE 안에 error part.
func (h *AssistantHandler) failResponse(sse *dataStreamWriter, w http.ResponseWriter, err error) {
	if !sse.HasWrittenHeader() {
		response.RespondError(w, http.StatusBadGateway, err.Error())
		return
	}
	_ = sse.WriteError(err.Error())
}

// resolveProviderModel — 환경변수 + 요청 body 에서 provider/model/maxTokens 결정.
// P3: 클라이언트 UI 가 provider/model 을 안 보내는 게 정상. body 값은 디버깅용 backdoor 로 보존.
func resolveProviderModel(req assistantRequest) (string, string, int) {
	provider := strings.ToLower(strings.TrimSpace(req.Provider))
	if provider == "" {
		provider = strings.ToLower(strings.TrimSpace(os.Getenv("ASSISTANT_PROVIDER")))
	}
	if provider == "" {
		provider = "openai"
	}

	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = strings.TrimSpace(os.Getenv("ASSISTANT_MODEL"))
	}
	if model == "" || !modelMatchesProvider(provider, model) {
		model = defaultModelForProvider(provider)
	}

	maxTokens := req.MaxTokens
	if maxTokens <= 0 {
		if v, _ := strconv.Atoi(os.Getenv("ASSISTANT_MAX_TOKENS")); v > 0 {
			maxTokens = v
		} else {
			maxTokens = 2048
		}
	}
	return provider, model, maxTokens
}

// runStreamingChat — provider 분기 + 도구 루프.
func (h *AssistantHandler) runStreamingChat(
	ctx context.Context,
	sse *dataStreamWriter,
	provider, model, system string,
	messages []assistantMessage,
	maxTokens int,
) error {
	available := availableAssistantTools(ctx)

	switch provider {
	case "anthropic":
		return h.runAnthropicLoop(ctx, sse, model, system, messages, maxTokens, available)
	case "openai":
		return h.runOpenAILoop(ctx, sse, model, system, messages, maxTokens, available)
	default:
		return fmt.Errorf("지원하지 않는 provider: %s", provider)
	}
}

// runAnthropicLoop — Anthropic stream + 도구 루프.
func (h *AssistantHandler) runAnthropicLoop(
	ctx context.Context,
	sse *dataStreamWriter,
	model, system string,
	messages []assistantMessage,
	maxTokens int,
	available []assistantTool,
) error {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return errors.New("ANTHROPIC_API_KEY 미설정")
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
		if strings.TrimSpace(m.Content) == "" {
			continue
		}
		role := m.Role
		if role == "system" {
			continue
		}
		if role != "user" && role != "assistant" {
			role = "user"
		}
		msgs = append(msgs, anthropicMessage{
			Role:    role,
			Content: []anthropicContentBlock{{Type: "text", Text: m.Content}},
		})
	}

	tools := make([]anthropicTool, 0, len(available))
	for _, t := range available {
		tools = append(tools, anthropicTool{
			Name:        t.name,
			Description: t.description,
			InputSchema: t.inputSchema,
		})
	}

	if err := sse.WriteStart(""); err != nil {
		return err
	}

	var prevToolSigs []string
	for iter := 0; iter < maxAssistantToolIterations; iter++ {
		if err := sse.WriteStartStep(); err != nil {
			return err
		}

		var (
			textBuf   strings.Builder
			toolCalls []anthropicContentBlock
		)
		cb := streamCallbacks{
			onTextDelta: func(t string) {
				textBuf.WriteString(t)
				_ = sse.WriteText(t)
			},
			onToolCall: func(id, name string, args json.RawMessage) {
				toolCalls = append(toolCalls, anthropicContentBlock{
					Type: "tool_use", ID: id, Name: name, Input: args,
				})
			},
		}

		stopReason, err := h.streamAnthropic(ctx, baseURL, apiKey, version, model, system, msgs, tools, maxTokens, cb)
		if err != nil {
			return err
		}
		_ = sse.EndText()

		assistantContent := make([]anthropicContentBlock, 0, 1+len(toolCalls))
		if textBuf.Len() > 0 {
			assistantContent = append(assistantContent, anthropicContentBlock{Type: "text", Text: textBuf.String()})
		}
		assistantContent = append(assistantContent, toolCalls...)
		if len(assistantContent) > 0 {
			msgs = append(msgs, anthropicMessage{Role: "assistant", Content: assistantContent})
		}

		if stopReason != "tool_use" || len(toolCalls) == 0 {
			_ = sse.WriteFinishStep()
			return sse.WriteFinish(stopReasonToFinish(stopReason))
		}

		curSigs := make([]string, 0, len(toolCalls))
		for _, tc := range toolCalls {
			curSigs = append(curSigs, toolCallSignature(tc.Name, tc.Input))
		}
		if signaturesEqual(prevToolSigs, curSigs) {
			log.Printf("[assistant stream] anthropic 도구 호출 동일 시그니처 반복 (iter=%d) → 종료", iter)
			_ = sse.WriteFinishStep()
			return sse.WriteFinish("stop")
		}
		prevToolSigs = curSigs

		results := make([]anthropicContentBlock, 0, len(toolCalls))
		for _, tc := range toolCalls {
			_ = sse.WriteToolInputAvailable(tc.ID, tc.Name, tc.Input)
			out, terr := dispatchAssistantTool(ctx, h.db, tc.Name, tc.Input)
			if terr != nil {
				_ = sse.WriteToolOutputError(tc.ID, terr.Error())
				results = append(results, anthropicContentBlock{
					Type: "tool_result", ToolUseID: tc.ID,
					Content: terr.Error(), IsError: true,
				})
				continue
			}
			_ = sse.WriteToolOutputAvailable(tc.ID, json.RawMessage(asJSONOrQuoted(out)))
			results = append(results, anthropicContentBlock{
				Type: "tool_result", ToolUseID: tc.ID,
				Content: out,
			})
		}
		msgs = append(msgs, anthropicMessage{Role: "user", Content: results})
		_ = sse.WriteFinishStep()
	}

	log.Printf("[assistant stream] anthropic 도구 호출 반복 횟수 초과")
	return sse.WriteFinish("stop")
}

// runOpenAILoop — OpenAI stream + 도구 루프.
func (h *AssistantHandler) runOpenAILoop(
	ctx context.Context,
	sse *dataStreamWriter,
	model, system string,
	messages []assistantMessage,
	maxTokens int,
	available []assistantTool,
) error {
	apiKey := os.Getenv("OPENAI_API_KEY")
	baseURL := strings.TrimRight(os.Getenv("OPENAI_BASE_URL"), "/")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	requireAuth := !isLocalBaseURL(baseURL)
	if requireAuth && apiKey == "" {
		return errors.New("OPENAI_API_KEY 미설정")
	}

	msgs := make([]openaiMessage, 0, len(messages)+1)
	if strings.TrimSpace(system) != "" {
		msgs = append(msgs, openaiMessage{Role: "system", Content: system})
	}
	for _, m := range messages {
		if strings.TrimSpace(m.Content) == "" {
			continue
		}
		role := m.Role
		if role == "system" {
			continue
		}
		if role != "user" && role != "assistant" {
			role = "user"
		}
		msgs = append(msgs, openaiMessage{Role: role, Content: m.Content})
	}

	tools := make([]openaiTool, 0, len(available))
	for _, t := range available {
		tools = append(tools, openaiTool{
			Type: "function",
			Function: openaiToolFunctionDef{
				Name:        t.name,
				Description: t.description,
				Parameters:  t.inputSchema,
			},
		})
	}

	if err := sse.WriteStart(""); err != nil {
		return err
	}

	var prevToolSigs []string
	for iter := 0; iter < maxAssistantToolIterations; iter++ {
		if err := sse.WriteStartStep(); err != nil {
			return err
		}

		var (
			textBuf   strings.Builder
			toolCalls []openaiToolCall
		)
		cb := streamCallbacks{
			onTextDelta: func(t string) {
				textBuf.WriteString(t)
				_ = sse.WriteText(t)
			},
			onToolCall: func(id, name string, args json.RawMessage) {
				toolCalls = append(toolCalls, openaiToolCall{
					ID: id, Type: "function",
					Function: openaiToolCallFunc{Name: name, Arguments: string(args)},
				})
			},
		}

		finishReason, err := h.streamOpenAI(ctx, baseURL, apiKey, model, msgs, tools, maxTokens, cb)
		if err != nil {
			return err
		}
		_ = sse.EndText()

		assistantMsg := openaiMessage{Role: "assistant", Content: textBuf.String()}
		if len(toolCalls) > 0 {
			assistantMsg.ToolCalls = toolCalls
		}
		msgs = append(msgs, assistantMsg)

		if finishReason != "tool_calls" || len(toolCalls) == 0 {
			_ = sse.WriteFinishStep()
			return sse.WriteFinish(openaiFinishToFinish(finishReason))
		}

		curSigs := make([]string, 0, len(toolCalls))
		for _, tc := range toolCalls {
			curSigs = append(curSigs, toolCallSignature(tc.Function.Name, []byte(tc.Function.Arguments)))
		}
		if signaturesEqual(prevToolSigs, curSigs) {
			log.Printf("[assistant stream] openai 도구 호출 동일 시그니처 반복 (iter=%d) → 종료", iter)
			_ = sse.WriteFinishStep()
			return sse.WriteFinish("stop")
		}
		prevToolSigs = curSigs

		for _, tc := range toolCalls {
			args := json.RawMessage(tc.Function.Arguments)
			if len(args) == 0 {
				args = json.RawMessage("{}")
			}
			_ = sse.WriteToolInputAvailable(tc.ID, tc.Function.Name, args)
			out, terr := dispatchAssistantTool(ctx, h.db, tc.Function.Name, args)
			if terr != nil {
				_ = sse.WriteToolOutputError(tc.ID, terr.Error())
				out = "ERROR: " + terr.Error()
			} else {
				_ = sse.WriteToolOutputAvailable(tc.ID, json.RawMessage(asJSONOrQuoted(out)))
			}
			msgs = append(msgs, openaiMessage{
				Role: "tool", ToolCallID: tc.ID, Content: out,
			})
		}
		_ = sse.WriteFinishStep()
	}

	log.Printf("[assistant stream] openai 도구 호출 반복 횟수 초과")
	return sse.WriteFinish("stop")
}

// signaturesEqual — 직전 턴과 이번 턴 시그니처가 정확히 같은지.
func signaturesEqual(a, b []string) bool {
	if len(a) == 0 || len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// asJSONOrQuoted — 문자열이 유효한 JSON 이면 그대로, 아니면 quoted string 으로.
// 도구 결과 JSON 을 SDK toolInvocations.result 에 그대로 박기 위함.
func asJSONOrQuoted(s string) string {
	trimmed := strings.TrimSpace(s)
	if trimmed != "" && (trimmed[0] == '{' || trimmed[0] == '[') && json.Valid([]byte(trimmed)) {
		return trimmed
	}
	q, _ := json.Marshal(s)
	return string(q)
}

// stopReasonToFinish — Anthropic stop_reason → SDK finishReason 매핑.
func stopReasonToFinish(reason string) string {
	switch reason {
	case "end_turn", "":
		return "stop"
	case "max_tokens":
		return "length"
	case "tool_use":
		return "tool-calls"
	case "stop_sequence":
		return "stop"
	}
	return "stop"
}

// openaiFinishToFinish — OpenAI finish_reason → SDK finishReason 매핑.
func openaiFinishToFinish(reason string) string {
	switch reason {
	case "stop", "":
		return "stop"
	case "length":
		return "length"
	case "tool_calls":
		return "tool-calls"
	case "content_filter":
		return "content-filter"
	}
	return "stop"
}
