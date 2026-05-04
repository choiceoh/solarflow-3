import { getToolName, isToolUIPart } from 'ai';
import type { UIMessage } from 'ai';

// 백엔드 chat 엔드포인트가 받는 wire 포맷.
// 과거에는 {role, content} 만 보내 도구 history 가 사라졌음 — 이제 parts 로 보내
// 백엔드가 Anthropic tool_use/tool_result 블록 또는 OpenAI tool_calls/role=tool 메시지로 복원.
export interface BackendMessage {
  role: 'user' | 'assistant';
  parts: BackendPart[];
}

export type BackendPart =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; tool_call_id: string; tool_name: string; input: unknown }
  | { type: 'tool_result'; tool_call_id: string; output: string; is_error?: boolean };

// 어시스턴트 proposal data part 의 페이로드.
// 백엔드 SSE writer 의 WriteDataPart("proposal", ...) 와 1:1 일치.
export interface ProposalData {
  id: string;
  kind: string;
  summary: string;
  payload: unknown;
}

export type ProposalStatus =
  | 'pending'
  | 'submitting'
  | 'confirmed'
  | 'rejected'
  | 'error';

export interface ProposalState extends ProposalData {
  status: ProposalStatus;
  errorMessage?: string;
}

// toBackendMessages — UIMessage[] 를 wire 포맷으로 직렬화.
//
// user 메시지: text part 만 추출.
// assistant 메시지: text + 완료된 도구 호출을 step 단위로 쪼갬.
//   - (text*, tool_call+) 한 묶음 → assistant 메시지 1 + 직후 user(tool_result+) 1
//   - tool_call 뒤에 다시 text 가 나오면 새 step 시작 (Anthropic 의 multi-step tool 루프 흐름과 동일)
//
// data-* part (proposal 등) 는 LLM 컨텍스트에 안 보냄 — 사용자 결정 결과는 system prompt 쪽에서 별도 주입.
// 진행 중(input-streaming/input-available) 도구 part 는 다음 턴에 보낼 의미 없으니 떨굼.
export function toBackendMessages(messages: UIMessage[]): BackendMessage[] {
  const out: BackendMessage[] = [];

  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;

    if (m.role === 'user') {
      const text = m.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('');
      if (!text.trim()) continue;
      out.push({ role: 'user', parts: [{ type: 'text', text }] });
      continue;
    }

    // assistant: step 별 그루핑.
    let assistantBuf: BackendPart[] = [];
    let resultsBuf: BackendPart[] = [];
    let prevWasTool = false;

    const flushStep = () => {
      if (assistantBuf.length > 0) {
        out.push({ role: 'assistant', parts: assistantBuf });
      }
      if (resultsBuf.length > 0) {
        out.push({ role: 'user', parts: resultsBuf });
      }
      assistantBuf = [];
      resultsBuf = [];
    };

    for (const part of m.parts) {
      if (part.type === 'text') {
        if (prevWasTool) {
          flushStep();
          prevWasTool = false;
        }
        if (part.text.trim()) {
          assistantBuf.push({ type: 'text', text: part.text });
        }
        continue;
      }
      if (!isToolUIPart(part)) continue;
      // 완료된 도구 호출만 — 진행 중 상태는 다음 턴 컨텍스트에 의미 없음.
      if (part.state !== 'output-available' && part.state !== 'output-error') continue;

      const toolCallId = part.toolCallId;
      const toolName = String(getToolName(part));
      assistantBuf.push({
        type: 'tool_call',
        tool_call_id: toolCallId,
        tool_name: toolName,
        input: part.input ?? {},
      });
      if (part.state === 'output-available') {
        const toolOutput = part.output;
        resultsBuf.push({
          type: 'tool_result',
          tool_call_id: toolCallId,
          output: typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput ?? null),
        });
      } else {
        resultsBuf.push({
          type: 'tool_result',
          tool_call_id: toolCallId,
          output: part.errorText ?? '알 수 없는 오류',
          is_error: true,
        });
      }
      prevWasTool = true;
    }
    flushStep();
  }
  return out;
}

// extractProposals — 메시지에서 proposal data part 들을 추출.
// 같은 id 의 proposal 이 여러 번 나오면 마지막 것을 채택 (백엔드 wire 상으로는 유일하지만 안전망).
export function extractProposals(message: UIMessage): ProposalData[] {
  const seen = new Map<string, ProposalData>();
  for (const part of message.parts) {
    if (part.type !== 'data-proposal') continue;
    const data = (part as { type: 'data-proposal'; data: ProposalData }).data;
    if (data && data.id) seen.set(data.id, data);
  }
  return Array.from(seen.values());
}

// extractText — 메시지의 모든 text part 를 이어 붙임 (UI 표시용).
export function extractText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

// summarizeInput — 도구 input 객체를 ToolChip 표시용 짧은 문자열로 요약.
// 빈/없음 → "()". 객체면 키-값 1~2개를 "k=v" 형태로. v 가 길면 truncate.
export function summarizeInput(input: unknown): string {
  if (input == null) return '()';
  if (typeof input !== 'object' || Array.isArray(input)) {
    const s = JSON.stringify(input);
    return `(${s.length > 40 ? s.slice(0, 40) + '…' : s})`;
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return '()';
  const parts = entries.slice(0, 2).map(([k, v]) => {
    const sv = typeof v === 'string' ? v : JSON.stringify(v);
    const truncated = sv.length > 20 ? sv.slice(0, 20) + '…' : sv;
    return `${k}=${truncated}`;
  });
  if (entries.length > 2) parts.push('…');
  return `(${parts.join(', ')})`;
}

// summarizeOutput — 도구 결과를 ToolChip 표시용 짧은 문자열로 요약.
// 백엔드는 결과를 JSON 문자열 또는 파싱된 JSON 으로 emit. array 면 "N건", object 면 .total/.items.length 우선, fallback 키 요약.
export function summarizeOutput(output: unknown): string {
  if (output == null) return '';
  if (typeof output === 'string') {
    const trimmed = output.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return summarizeOutput(JSON.parse(trimmed));
      } catch {
        // fall through
      }
    }
    return trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed;
  }
  if (Array.isArray(output)) return `${output.length}건`;
  if (typeof output === 'object') {
    const obj = output as Record<string, unknown>;
    if (Array.isArray(obj.items)) return `${(obj.items as unknown[]).length}건`;
    if (typeof obj.total === 'number') return `${obj.total}건`;
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '…' : ''}}`;
  }
  return String(output);
}
