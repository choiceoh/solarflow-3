import type { UIMessage } from 'ai';

// 백엔드 chat 엔드포인트가 받는 평면 메시지 형식.
// {role, content} 만 — 도구 호출 history 는 LLM 컨텍스트에 자동 인라인됨 (T1 결정).
export interface BackendMessage {
  role: 'user' | 'assistant';
  content: string;
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
