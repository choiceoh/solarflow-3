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
// 한 요청 = 한 SSE. 도구 호출 루프(read 도구 즉시 실행 / propose 도구 stash) 가 한 SSE 안에서 다단계로 진행.
//
// F1 fallback: 첫 청크(=헤더) 송출 전까지만 fallback provider 로 재시도.
//   첫 청크 emit 후 실패 시 SSE 안에서 error 청크로 종료.
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
	ctx := r.Context()
	available := availableAssistantTools(ctx)
	enrichPageContext(ctx, h.db, req.PageContext)
	system := buildSystemPrompt(ctx, req.PageContext, available)
	ctx, collector := withProposalCollector(ctx)

	sse, err := newDataStreamWriter(w)
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	clientPinned := strings.TrimSpace(req.Provider) != ""
	startedAt := time.Now()
	log.Printf("[assistant stream] enter provider=%s model=%s msgs=%d maxTokens=%d", provider, model, len(req.Messages), maxTokens)

	err = h.runStreamingChat(ctx, sse, collector, provider, model, system, req.Messages, maxTokens)
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
			if fbErr := h.runStreamingChat(ctx, sse, collector, fbProvider, fbModel, system, req.Messages, maxTokens); fbErr != nil {
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
		provider = "anthropic"
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
	collector *proposalCollector,
	provider, model, system string,
	messages []assistantMessage,
	maxTokens int,
) error {
	available := availableAssistantTools(ctx)
	toolKindByName := make(map[string]string, len(available))
	for _, t := range available {
		toolKindByName[t.name] = t.kind
	}

	switch provider {
	case "anthropic":
		return h.runAnthropicLoop(ctx, sse, collector, model, system, messages, maxTokens, available, toolKindByName)
	case "openai":
		return h.runOpenAILoop(ctx, sse, collector, model, system, messages, maxTokens, available, toolKindByName)
	default:
		return fmt.Errorf("지원하지 않는 provider: %s", provider)
	}
}

// emitProposalsSince — collector 의 새로 추가된 항목을 data part 로 emit.
// before 길이 이후를 새 proposal 로 간주. 추가된 게 없으면 no-op.
// 각 proposal 은 type="data-proposal" 청크 1개로 emit (id 마다 useChat 이 part 1개로 인식).
func emitProposalsSince(sse *dataStreamWriter, collector *proposalCollector, before int) {
	all := collector.snapshot()
	if len(all) <= before {
		return
	}
	for _, p := range all[before:] {
		err := sse.WriteDataPart("proposal", map[string]any{
			"id":      p.ID,
			"kind":    p.Kind,
			"summary": p.Summary,
			"payload": p.Payload,
		})
		if err != nil {
			log.Printf("[assistant stream] proposal data part 송출 실패: %v", err)
			return
		}
	}
}

// runAnthropicLoop — Anthropic stream + 도구 루프.
func (h *AssistantHandler) runAnthropicLoop(
	ctx context.Context,
	sse *dataStreamWriter,
	collector *proposalCollector,
	model, system string,
	messages []assistantMessage,
	maxTokens int,
	available []assistantTool,
	toolKindByName map[string]string,
) error {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return errors.New("ANTHROPIC_API_KEY 미설정")
	}
	baseURL := strings.TrimRight(os.Getenv("ANTHROPIC_BASE_URL"), "/")
	if baseURL == "" {
		// Z.AI 코딩 플랜 (Anthropic 호환 엔드포인트). 진짜 Anthropic 으로 가려면 ANTHROPIC_BASE_URL 명시.
		baseURL = "https://api.z.ai/api/anthropic"
	}
	version := os.Getenv("ANTHROPIC_VERSION")
	if version == "" {
		version = "2023-06-01"
	}

	msgs := buildAnthropicSeed(messages)

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
			before := len(collector.snapshot())
			kind := toolKindByName[tc.Name]
			if kind == "read" {
				_ = sse.WriteToolInputAvailable(tc.ID, tc.Name, tc.Input)
			}
			out, terr := dispatchAssistantTool(ctx, h.db, tc.Name, tc.Input)
			if terr != nil {
				if kind == "read" {
					_ = sse.WriteToolOutputError(tc.ID, terr.Error())
				}
				results = append(results, anthropicContentBlock{
					Type: "tool_result", ToolUseID: tc.ID,
					Content: terr.Error(), IsError: true,
				})
				continue
			}
			if kind == "read" {
				_ = sse.WriteToolOutputAvailable(tc.ID, json.RawMessage(asJSONOrQuoted(out)))
			} else {
				emitProposalsSince(sse, collector, before)
			}
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
	collector *proposalCollector,
	model, system string,
	messages []assistantMessage,
	maxTokens int,
	available []assistantTool,
	toolKindByName map[string]string,
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

	msgs := buildOpenAISeed(system, messages)

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
			before := len(collector.snapshot())
			kind := toolKindByName[tc.Function.Name]
			args := json.RawMessage(tc.Function.Arguments)
			if len(args) == 0 {
				args = json.RawMessage("{}")
			}
			if kind == "read" {
				_ = sse.WriteToolInputAvailable(tc.ID, tc.Function.Name, args)
			}
			out, terr := dispatchAssistantTool(ctx, h.db, tc.Function.Name, args)
			if terr != nil {
				if kind == "read" {
					_ = sse.WriteToolOutputError(tc.ID, terr.Error())
				}
				out = "ERROR: " + terr.Error()
			} else if kind == "read" {
				_ = sse.WriteToolOutputAvailable(tc.ID, json.RawMessage(asJSONOrQuoted(out)))
			} else {
				emitProposalsSince(sse, collector, before)
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

// buildAnthropicSeed — 프론트 wire 메시지를 Anthropic content block 배열로 변환.
//
// parts 우선:
//   - text       → {type:text}
//   - tool_call  → {type:tool_use}    (assistant role 만)
//   - tool_result→ {type:tool_result} (user role 만)
//
// parts 가 비었으면 content 를 단일 text 블록으로 (레거시 fallback).
//
// 마지막에 연속 동일 role 메시지를 한 메시지로 머지 — Anthropic 은 strict alternation 요구.
// 프론트가 한 UIMessage 의 (text, tool_call, text) 를 step 단위로 쪼개 emit 할 때
// 직전 user(tool_result) 와 다음 user(text) 가 붙어 들어와도 안전.
func buildAnthropicSeed(messages []assistantMessage) []anthropicMessage {
	out := make([]anthropicMessage, 0, len(messages))
	for _, m := range messages {
		role := m.Role
		if role == "system" || (role != "user" && role != "assistant") {
			continue
		}

		var blocks []anthropicContentBlock
		if len(m.Parts) > 0 {
			for _, p := range m.Parts {
				switch p.Type {
				case "text":
					if strings.TrimSpace(p.Text) == "" {
						continue
					}
					blocks = append(blocks, anthropicContentBlock{Type: "text", Text: p.Text})
				case "tool_call":
					if role != "assistant" {
						continue
					}
					input := p.Input
					if len(input) == 0 {
						input = json.RawMessage("{}")
					}
					blocks = append(blocks, anthropicContentBlock{
						Type:  "tool_use",
						ID:    p.ToolCallID,
						Name:  p.ToolName,
						Input: input,
					})
				case "tool_result":
					if role != "user" {
						continue
					}
					content := p.Output
					if content == "" {
						content = "(빈 결과)"
					}
					blocks = append(blocks, anthropicContentBlock{
						Type:      "tool_result",
						ToolUseID: p.ToolCallID,
						Content:   content,
						IsError:   p.IsError,
					})
				}
			}
		} else if strings.TrimSpace(m.Content) != "" {
			blocks = append(blocks, anthropicContentBlock{Type: "text", Text: m.Content})
		}

		if len(blocks) == 0 {
			continue
		}
		if len(out) > 0 && out[len(out)-1].Role == role {
			out[len(out)-1].Content = append(out[len(out)-1].Content, blocks...)
			continue
		}
		out = append(out, anthropicMessage{Role: role, Content: blocks})
	}
	return out
}

// buildOpenAISeed — 프론트 wire 메시지를 OpenAI Chat Completions messages 배열로 변환.
//
// parts 우선:
//   - assistant 의 text  → message.content
//   - assistant 의 tool_call  → message.tool_calls[]
//   - user 의 text  → message.content (별도 user 메시지)
//   - user 의 tool_result  → role="tool" 메시지 (tool_call_id 매칭)
//
// parts 가 비었으면 content 를 단일 메시지로 (레거시 fallback).
//
// 한 wire 메시지에서 여러 OpenAI 메시지를 emit 할 수 있음:
//   - assistant: text 와 tool_calls 는 한 메시지로 합침
//   - user: text 는 user 메시지 1개 + tool_result N개 → role=tool 메시지 N개
func buildOpenAISeed(system string, messages []assistantMessage) []openaiMessage {
	out := make([]openaiMessage, 0, len(messages)+1)
	if strings.TrimSpace(system) != "" {
		out = append(out, openaiMessage{Role: "system", Content: system})
	}
	for _, m := range messages {
		role := m.Role
		if role == "system" || (role != "user" && role != "assistant") {
			continue
		}

		if len(m.Parts) == 0 {
			if strings.TrimSpace(m.Content) == "" {
				continue
			}
			out = append(out, openaiMessage{Role: role, Content: m.Content})
			continue
		}

		if role == "assistant" {
			var textBuf strings.Builder
			var toolCalls []openaiToolCall
			for _, p := range m.Parts {
				switch p.Type {
				case "text":
					textBuf.WriteString(p.Text)
				case "tool_call":
					input := p.Input
					if len(input) == 0 {
						input = json.RawMessage("{}")
					}
					toolCalls = append(toolCalls, openaiToolCall{
						ID:   p.ToolCallID,
						Type: "function",
						Function: openaiToolCallFunc{
							Name:      p.ToolName,
							Arguments: string(input),
						},
					})
				}
			}
			if textBuf.Len() == 0 && len(toolCalls) == 0 {
				continue
			}
			am := openaiMessage{Role: "assistant", Content: textBuf.String()}
			if len(toolCalls) > 0 {
				am.ToolCalls = toolCalls
			}
			out = append(out, am)
			continue
		}

		// role == "user"
		// tool_result 는 OpenAI 에서 별도 role=tool 메시지 — assistant.tool_calls 직후에 와야 함.
		// parts 순서대로 emit 하면 인접성 보장 (프론트가 (assistant tool_call) 직후 (user tool_result) 를 emit).
		var textBuf strings.Builder
		for _, p := range m.Parts {
			switch p.Type {
			case "text":
				textBuf.WriteString(p.Text)
			case "tool_result":
				content := p.Output
				if content == "" {
					content = "(빈 결과)"
				}
				if p.IsError {
					content = "ERROR: " + content
				}
				out = append(out, openaiMessage{
					Role:       "tool",
					ToolCallID: p.ToolCallID,
					Content:    content,
				})
			}
		}
		if textBuf.Len() > 0 {
			out = append(out, openaiMessage{Role: "user", Content: textBuf.String()})
		}
	}
	return out
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
