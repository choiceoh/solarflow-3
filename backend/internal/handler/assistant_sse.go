package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"github.com/google/uuid"
)

// Vercel AI SDK v5 UI Message Stream Protocol 인코더.
// 각 청크는 SSE event "data: <JSON>\n\n". 종료는 "data: [DONE]\n\n".
// Content-Type: text/event-stream + x-vercel-ai-ui-message-stream: v1.
//
// useChat 의 DefaultChatTransport 가 이 형식을 파싱해서 message.parts 를 채움.
//
// 비유: 업스트림 LLM 의 토큰을 받아 클라이언트에게 표준 청크로 흘려보내는 어댑터.
// v5 의 텍스트 청크는 start/delta*/end 그룹으로 묶이므로 writer 가 textActiveID 상태를 보유.
type dataStreamWriter struct {
	w           http.ResponseWriter
	f           http.Flusher
	mu          sync.Mutex
	wroteHeader bool
	textActive  string // 활성 text 그룹의 id. 비어있으면 비활성.
}

func newDataStreamWriter(w http.ResponseWriter) (*dataStreamWriter, error) {
	f, ok := w.(http.Flusher)
	if !ok {
		return nil, fmt.Errorf("ResponseWriter 에 http.Flusher 미지원")
	}
	return &dataStreamWriter{w: w, f: f}, nil
}

// ensureHeaders — 첫 청크 직전에 한 번만 헤더 송출. firstChunkSent 분기용.
func (s *dataStreamWriter) ensureHeaders() {
	if s.wroteHeader {
		return
	}
	h := s.w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache, no-transform")
	h.Set("Connection", "keep-alive")
	h.Set("x-vercel-ai-ui-message-stream", "v1")
	h.Set("X-Accel-Buffering", "no")
	s.w.WriteHeader(http.StatusOK)
	s.wroteHeader = true
}

func (s *dataStreamWriter) writeChunk(chunk any) error {
	data, err := json.Marshal(chunk)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureHeaders()
	if _, err := fmt.Fprintf(s.w, "data: %s\n\n", data); err != nil {
		return err
	}
	s.f.Flush()
	return nil
}

// HasWrittenHeader — F1 fallback 판정용. 헤더 송출 후엔 fallback 불가.
func (s *dataStreamWriter) HasWrittenHeader() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.wroteHeader
}

// WriteStart — 메시지 전체 시작. messageId 부여.
func (s *dataStreamWriter) WriteStart(messageID string) error {
	if messageID == "" {
		messageID = "msg_" + uuid.NewString()
	}
	return s.writeChunk(map[string]any{"type": "start", "messageId": messageID})
}

// WriteStartStep — 한 LLM 호출 시작 표지 (도구 루프 다단계).
func (s *dataStreamWriter) WriteStartStep() error {
	return s.writeChunk(map[string]any{"type": "start-step"})
}

// WriteFinishStep — 한 LLM 호출 종료 표지.
func (s *dataStreamWriter) WriteFinishStep() error {
	return s.writeChunk(map[string]any{"type": "finish-step"})
}

// WriteText — 텍스트 델타. 첫 호출 시 자동으로 text-start 를 emit, EndText 로 그룹 종료.
func (s *dataStreamWriter) WriteText(delta string) error {
	if delta == "" {
		return nil
	}
	if s.textActive == "" {
		id := "txt_" + uuid.NewString()
		if err := s.writeChunk(map[string]any{"type": "text-start", "id": id}); err != nil {
			return err
		}
		s.textActive = id
	}
	return s.writeChunk(map[string]any{"type": "text-delta", "id": s.textActive, "delta": delta})
}

// EndText — 활성 text 그룹 종료. 도구 호출 직전과 step 종료 직전에 호출.
func (s *dataStreamWriter) EndText() error {
	if s.textActive == "" {
		return nil
	}
	id := s.textActive
	s.textActive = ""
	return s.writeChunk(map[string]any{"type": "text-end", "id": id})
}

// WriteToolInputAvailable — 도구 호출 (input 확정). 읽기 도구에서 사용.
// v5 는 streaming 도구 input(`tool-input-start`/`tool-input-delta`)도 지원하지만,
// 우리는 LLM 응답을 모두 받은 후에야 확정 input 을 알 수 있으므로 한 번에 emit.
func (s *dataStreamWriter) WriteToolInputAvailable(toolCallID, toolName string, input json.RawMessage) error {
	if len(input) == 0 {
		input = json.RawMessage("{}")
	}
	return s.writeChunk(map[string]any{
		"type":       "tool-input-available",
		"toolCallId": toolCallID,
		"toolName":   toolName,
		"input":      input,
	})
}

// WriteToolOutputAvailable — 도구 실행 결과 (성공).
func (s *dataStreamWriter) WriteToolOutputAvailable(toolCallID string, output any) error {
	return s.writeChunk(map[string]any{
		"type":       "tool-output-available",
		"toolCallId": toolCallID,
		"output":     output,
	})
}

// WriteToolOutputError — 도구 실행 결과 (실패).
func (s *dataStreamWriter) WriteToolOutputError(toolCallID, errorText string) error {
	return s.writeChunk(map[string]any{
		"type":       "tool-output-error",
		"toolCallId": toolCallID,
		"errorText":  errorText,
	})
}

// WriteDataPart — 임의 data part. type="data-<name>" 으로 emit.
// 현재 read-only assistant 경로에서는 사용하지 않지만 UIMessage stream 호환을 위해 보존.
func (s *dataStreamWriter) WriteDataPart(name string, data any) error {
	return s.writeChunk(map[string]any{
		"type": "data-" + name,
		"id":   uuid.NewString(),
		"data": data,
	})
}

// WriteFinish — 메시지 전체 종료. finishReason: "stop"|"length"|"tool-calls"|"error".
func (s *dataStreamWriter) WriteFinish(reason string) error {
	if reason == "" {
		reason = "stop"
	}
	if err := s.writeChunk(map[string]any{"type": "finish", "finishReason": reason}); err != nil {
		return err
	}
	return s.writeDone()
}

// writeDone — SSE 종료 마커.
func (s *dataStreamWriter) writeDone() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureHeaders()
	if _, err := fmt.Fprint(s.w, "data: [DONE]\n\n"); err != nil {
		return err
	}
	s.f.Flush()
	return nil
}

// WriteError — 스트림 도중 에러. 헤더 송출 후만 사용.
func (s *dataStreamWriter) WriteError(msg string) error {
	if err := s.writeChunk(map[string]any{"type": "error", "errorText": msg}); err != nil {
		return err
	}
	return s.writeDone()
}
