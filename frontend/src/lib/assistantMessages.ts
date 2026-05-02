import type { UIMessage } from 'ai';

// 백엔드 chat 엔드포인트가 받는 평면 메시지 형식.
// {role, content} 만 — 도구 호출 history 는 LLM 컨텍스트에 자동 인라인됨 (T1 결정).
export interface BackendMessage {
  role: 'user' | 'assistant';
  content: string;
}

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

// toBackendMessages — UIMessage[] 를 백엔드 평면 메시지로 평면화.
// parts 에서 text 만 추출. 도구 호출/결과/data part 는 떨굼 (LLM 에 다시 보내지 않음 — 변조 방지).
export function toBackendMessages(messages: UIMessage[]): BackendMessage[] {
  const out: BackendMessage[] = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const text = m.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
    if (!text.trim()) continue;
    out.push({ role: m.role, content: text });
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
