import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, getToolName, isToolUIPart } from 'ai';
import type { ToolUIPart, UIMessage } from 'ai';
import { Bot, Check, FileText, Inbox, MessageSquarePlus, Paperclip, Pencil, Search, Send, Trash2, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import MetaForm from '@/templates/MetaForm';
import { cn } from '@/lib/utils';
import { useLocation } from 'react-router-dom';
import { fetchWithAuth, streamFetchWithAuth } from '@/lib/api';
import { isDevMockApiActive } from '@/lib/devMockApi';
import { detectPageContext } from '@/lib/pageContext';
import { MetaConfigPreview } from '@/components/assistant/MetaConfigPreview';
import {
  toBackendMessages,
  extractProposals,
  extractText,
  proposalKindToFormConfig,
  summarizeInput,
  summarizeOutput,
  type ProposalState,
  type ProposalStatus,
} from '@/lib/assistantMessages';

interface SessionSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface SessionDetail extends SessionSummary {
  messages: UIMessage[];
}

const SESSION_TITLE_MAX = 30;
const OCR_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/gif';
const OCR_MAX_BYTES = 20 * 1024 * 1024;

const PROPOSAL_KIND_LABEL: Record<string, string> = {
  create_note: '메모 작성',
  update_note: '메모 수정',
  delete_note: '메모 삭제',
  create_partner: '거래처 등록',
  update_partner: '거래처 수정',
  create_order: '수주 등록',
  update_order: '수주 수정',
  delete_order: '수주 삭제',
  create_outbound: '출고 등록',
  update_outbound: '출고 수정',
  delete_outbound: '출고 삭제',
  create_receipt: '수금 입력',
  create_declaration: '면장 등록',
  propose_ui_config_update: '메타 화면/폼 변경',
};

interface OCRLineLite {
  text: string;
}
interface OCRResult {
  filename: string;
  raw_text?: string;
  lines?: OCRLineLite[];
  error?: string;
  fields?: { document_type?: string; customs_declaration?: Record<string, unknown> };
}
interface OCRExtractResponse {
  results: OCRResult[];
}

function buildOCRBlock(results: OCRResult[]): string {
  const blocks: string[] = [];
  for (const r of results) {
    const head = `[첨부파일 OCR] ${r.filename}`;
    if (r.error) {
      blocks.push(`${head}\n오류: ${r.error}`);
      continue;
    }
    const text = (r.raw_text ?? '').trim();
    let body = text || '(텍스트 추출 결과 없음)';
    if (r.fields?.customs_declaration) {
      body += `\n\n[면장 자동 인식 후보]\n${JSON.stringify(r.fields.customs_declaration, null, 2)}`;
    }
    blocks.push(`${head}\n${body}`);
  }
  return blocks.join('\n\n');
}

function buildSessionTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  const text = firstUser ? extractText(firstUser).trim() : '';
  if (!text) return '새 대화';
  const oneLine = text.replace(/\s+/g, ' ');
  return oneLine.length > SESSION_TITLE_MAX ? oneLine.slice(0, SESSION_TITLE_MAX) + '…' : oneLine;
}

export default function AssistantPage() {
  const sessionsEnabled = !isDevMockApiActive();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [sessionLoadingId, setSessionLoadingId] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);

  useEffect(() => {
    if (!sessionsEnabled) return;
    fetchWithAuth<SessionSummary[]>('/api/v1/assistant/sessions')
      .then((list) => setSessions(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, [sessionsEnabled]);

  const upsertSession = (s: SessionSummary) =>
    setSessions((prev) => [
      { id: s.id, title: s.title, created_at: s.created_at, updated_at: s.updated_at },
      ...prev.filter((x) => x.id !== s.id),
    ]);

  const newSession = () => {
    setCurrentSessionId(null);
    setInitialMessages([]);
    setChatKey((k) => k + 1);
  };

  const loadSession = async (id: string) => {
    if (id === currentSessionId || sessionLoadingId) return;
    setSessionLoadingId(id);
    try {
      const detail = await fetchWithAuth<SessionDetail>(`/api/v1/assistant/sessions/${id}`);
      setInitialMessages(Array.isArray(detail.messages) ? detail.messages : []);
      setCurrentSessionId(detail.id);
      setChatKey((k) => k + 1);
    } catch {
      // 실패 시 현 세션 유지
    } finally {
      setSessionLoadingId(null);
    }
  };

  const deleteSession = async (id: string) => {
    try {
      await fetchWithAuth(`/api/v1/assistant/sessions/${id}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (currentSessionId === id) newSession();
    } catch {
      // 무시 — 다음 새로고침 시 정합 회복
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <ChatBox
        key={chatKey}
        initialMessages={initialMessages}
        sessionId={currentSessionId}
        sessionsEnabled={sessionsEnabled}
        onSessionUpserted={(s, makeCurrent) => {
          upsertSession(s);
          if (makeCurrent) setCurrentSessionId(s.id);
        }}
        sessionsSlot={
          <SessionsPanel
            sessions={sessions}
            currentSessionId={currentSessionId}
            loadingId={sessionLoadingId}
            enabled={sessionsEnabled}
            onNew={newSession}
            onLoad={loadSession}
            onDelete={deleteSession}
          />
        }
      />
    </div>
  );
}

interface ChatBoxProps {
  initialMessages: UIMessage[];
  sessionId: string | null;
  sessionsEnabled: boolean;
  onSessionUpserted: (s: SessionSummary, makeCurrent: boolean) => void;
  sessionsSlot?: React.ReactNode;
}

export function ChatBox({ initialMessages, sessionId, sessionsEnabled, onSessionUpserted, sessionsSlot }: ChatBoxProps) {
  // 빠른 연속 send 시 setSessionIdRef 가 반영되기 전 두 번째 호출이 또 POST 하지 않도록 ref 로 동기 추적.
  const sessionIdRef = useRef<string | null>(sessionId);
  // 쓰기 도구 승인/거부 상태 — proposal id → status. messages 와 별도 메모리 (상태 mutation 안 함).
  const [proposalStatuses, setProposalStatuses] = useState<Map<string, { status: ProposalStatus; errorMessage?: string }>>(
    new Map(),
  );
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [parseAsCustoms, setParseAsCustoms] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // mock 모드에선 인증 우회 public 라우트 (Caddy 가 같은 SSE 인코딩으로 응답).
  const apiPath = isDevMockApiActive() ? '/api/v1/public/assistant/chat' : '/api/v1/assistant/chat';

  // 5.1 PR-B: 현재 페이지 컨텍스트 자동 주입 — backend 가 system prompt 에 합성
  const location = useLocation();
  const pageContextRef = useRef(detectPageContext(location.pathname));
  pageContextRef.current = detectPageContext(location.pathname);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiPath,
        fetch: streamFetchWithAuth,
        // 백엔드는 평면 메시지 + provider/model + page_context 만 받음. parts/도구 history 는 떨굼.
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            messages: toBackendMessages(messages),
            page_context: pageContextRef.current,
            ...(body ?? {}),
          },
        }),
      }),
    [apiPath],
  );

  const { messages, sendMessage, status, error: chatError } = useChat({
    transport,
    messages: initialMessages,
    onFinish: ({ messages: msgs }) => {
      void persistMessages(msgs);
    },
  });

  const persistMessages = async (msgs: UIMessage[]) => {
    if (!sessionsEnabled || msgs.length === 0) return;
    try {
      if (!sessionIdRef.current) {
        const created = await fetchWithAuth<SessionDetail>('/api/v1/assistant/sessions', {
          method: 'POST',
          body: JSON.stringify({ title: buildSessionTitle(msgs), messages: msgs }),
        });
        sessionIdRef.current = created.id;
        onSessionUpserted(created, true);
      } else {
        const updated = await fetchWithAuth<SessionDetail>(
          `/api/v1/assistant/sessions/${sessionIdRef.current}`,
          { method: 'PATCH', body: JSON.stringify({ messages: msgs }) },
        );
        onSessionUpserted(updated, false);
      }
    } catch {
      // 채팅 자체는 영향 없음 (다음 턴에서 다시 시도)
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    const valid: File[] = [];
    for (const f of picked) {
      if (f.size > OCR_MAX_BYTES) {
        setError(`${f.name}: 20MB 초과로 첨부 불가`);
        continue;
      }
      valid.push(f);
    }
    setAttachments((prev) => [...prev, ...valid]);
    e.target.value = '';
  };

  const removeAttachment = (idx: number) => setAttachments((prev) => prev.filter((_, i) => i !== idx));

  const runOCR = async (files: File[]): Promise<OCRResult[]> => {
    const fd = new FormData();
    for (const f of files) fd.append('images', f);
    if (parseAsCustoms) fd.append('document_type', 'customs_declaration');
    const res = await fetchWithAuth<OCRExtractResponse>('/api/v1/assistant/ocr/extract', {
      method: 'POST',
      body: fd,
    });
    return res.results;
  };

  const busy = status === 'submitted' || status === 'streaming' || ocrBusy;

  const send = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    setError(null);

    let userContent = text;
    try {
      if (attachments.length > 0) {
        if (isDevMockApiActive()) throw new Error('목업 모드에서는 OCR 첨부를 지원하지 않습니다');
        setOcrBusy(true);
        try {
          const ocrResults = await runOCR(attachments);
          const block = buildOCRBlock(ocrResults);
          userContent = text ? `${text}\n\n${block}` : block;
        } finally {
          setOcrBusy(false);
        }
      }
      setInput('');
      setAttachments([]);
      await sendMessage({ text: userContent });
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청 실패');
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const updateProposalStatus = (id: string, patch: { status: ProposalStatus; errorMessage?: string }) => {
    setProposalStatuses((prev) => {
      const next = new Map(prev);
      next.set(id, patch);
      return next;
    });
  };

  // overridePayload — 사용자가 폼 미리보기에서 수정한 페이로드. 없으면 store 의 원본 사용.
  const onConfirm = async (prop: ProposalState, overridePayload?: unknown) => {
    if (prop.status !== 'pending') return;
    updateProposalStatus(prop.id, { status: 'submitting' });
    try {
      await fetchWithAuth(`/api/v1/assistant/proposals/${prop.id}/confirm`, {
        method: 'POST',
        body: overridePayload === undefined ? undefined : JSON.stringify({ payload: overridePayload }),
      });
      updateProposalStatus(prop.id, { status: 'confirmed' });
    } catch (e) {
      updateProposalStatus(prop.id, {
        status: 'error',
        errorMessage: e instanceof Error ? e.message : '저장 실패',
      });
    }
  };

  const onReject = async (prop: ProposalState) => {
    if (prop.status !== 'pending') return;
    updateProposalStatus(prop.id, { status: 'submitting' });
    try {
      await fetchWithAuth(`/api/v1/assistant/proposals/${prop.id}/reject`, { method: 'POST' });
      updateProposalStatus(prop.id, { status: 'rejected' });
    } catch (e) {
      updateProposalStatus(prop.id, {
        status: 'error',
        errorMessage: e instanceof Error ? e.message : '거부 실패',
      });
    }
  };

  // 메시지별 proposal 상태 결합. messages 변경 시 proposalStatuses 의 기본값(pending) 으로 채움.
  const messagesWithProposals = useMemo(
    () =>
      messages.map((m) => ({
        message: m,
        proposals: extractProposals(m).map<ProposalState>((p) => ({
          ...p,
          status: proposalStatuses.get(p.id)?.status ?? 'pending',
          errorMessage: proposalStatuses.get(p.id)?.errorMessage,
        })),
      })),
    [messages, proposalStatuses],
  );

  const pendingItems = useMemo(() => {
    const items: { proposal: ProposalState; msgId: string }[] = [];
    for (const { message, proposals } of messagesWithProposals) {
      for (const p of proposals) {
        if (p.status === 'pending') items.push({ proposal: p, msgId: message.id });
      }
    }
    return items;
  }, [messagesWithProposals]);

  const scrollToMessage = (msgId: string) => {
    const el = document.getElementById(`assistant-msg-${msgId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedKey(msgId);
    window.setTimeout(() => setHighlightedKey((v) => (v === msgId ? null : v)), 1500);
  };

  const liveError = error ?? (chatError ? chatError.message : null);

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <header className="flex flex-wrap items-center gap-3 border-b pb-3">
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-[var(--sf-solar)]" />
            <h2 className="text-lg font-semibold">업무 도우미</h2>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-md border bg-muted/20 p-3">
          {messagesWithProposals.length === 0 ? (
            <EmptyHint />
          ) : (
            <div className="flex flex-col gap-3">
              {messagesWithProposals.map(({ message, proposals }) => (
                <div
                  key={message.id}
                  id={`assistant-msg-${message.id}`}
                  className={cn(
                    'flex flex-col gap-2 rounded-md transition-colors',
                    highlightedKey === message.id && 'bg-[var(--sf-solar)]/10 ring-2 ring-[var(--sf-solar)]/40',
                  )}
                >
                  <MessageParts message={message} />
                  {proposals.map((p) => (
                    <ProposalCard
                      key={p.id}
                      proposal={p}
                      onConfirm={(override) => onConfirm(p, override)}
                      onReject={() => onReject(p)}
                    />
                  ))}
                </div>
              ))}
              {(status === 'submitted' || status === 'streaming') && messages.at(-1)?.role !== 'assistant' && (
                <Bubble role="assistant" content="…" pulse />
              )}
            </div>
          )}
        </div>

        {liveError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-base text-destructive">
            {liveError}
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 rounded-md border bg-muted/30 p-2">
            {attachments.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="max-w-[180px] truncate">{f.name}</span>
                <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)}KB</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="ml-0.5 rounded p-0.5 hover:bg-muted"
                  disabled={busy}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <label className="flex cursor-pointer select-none items-center gap-1 px-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={parseAsCustoms}
                onChange={(e) => setParseAsCustoms(e.target.checked)}
                className="h-3 w-3"
                disabled={busy}
              />
              면장 자동 인식
            </label>
          </div>
        )}

        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              attachments.length > 0
                ? '첨부 파일과 함께 보낼 질문 (예: "이 면장 등록해줘")'
                : '질문을 입력하세요. Enter 전송 · Shift+Enter 줄바꿈'
            }
            rows={5}
            className="flex-1 resize-none text-lg leading-relaxed md:text-lg"
            disabled={busy}
          />
          <Input
            ref={fileInputRef}
            type="file"
            multiple
            accept={OCR_ACCEPT}
            onChange={onPickFiles}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-12 w-12 shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            title="파일 첨부 (PDF/이미지, OCR 추출)"
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <Button
            onClick={() => void send()}
            disabled={busy || (!input.trim() && attachments.length === 0)}
            className="h-12 shrink-0 px-5 text-base"
          >
            <Send className="mr-1.5 h-5 w-5" />
            {ocrBusy ? 'OCR 중…' : '전송'}
          </Button>
        </div>
      </div>

      <aside className="hidden w-[340px] shrink-0 flex-col border-l bg-muted/10 lg:flex">
        {sessionsSlot}
        <PendingPanel pending={pendingItems} onConfirm={onConfirm} onReject={onReject} onSelect={scrollToMessage} />
      </aside>
    </>
  );
}

// MessageParts — 한 메시지의 parts 를 순서대로 렌더링.
// text → Bubble (텍스트 박스), tool-* → ToolChip (회색 칩), data-proposal 은 상위에서 ProposalCard 로 처리하므로 무시.
function MessageParts({ message }: { message: UIMessage }) {
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < message.parts.length; i++) {
    const part = message.parts[i];
    if (part.type === 'text') {
      if (!part.text.trim()) continue;
      nodes.push(<Bubble key={i} role={message.role} content={part.text} />);
      continue;
    }
    if (isToolUIPart(part)) {
      nodes.push(<ToolChip key={i} part={part} />);
      continue;
    }
    // data-proposal / step-start 등은 상위에서 처리하거나 무시.
  }
  // 메시지에 text 가 하나도 없고 tool 만 있는 경우(드물게 발생) 빈 메시지 방지 — 폴백 텍스트 박스.
  if (nodes.length === 0 && message.role === 'assistant') {
    nodes.push(<Bubble key="fallback" role={message.role} content={extractText(message)} />);
  }
  return <>{nodes}</>;
}

// ToolChip — 한 도구 호출의 input/output 을 작은 인라인 칩으로 표시.
// state 별 표시:
//   input-streaming/input-available → "실행 중…"
//   output-available → 결과 요약
//   output-error → "오류: …"
function ToolChip({ part }: { part: ToolUIPart }) {
  const toolName = String(getToolName(part));
  const inputSummary = summarizeInput(part.input);
  const stateLabel =
    part.state === 'output-available'
      ? summarizeOutput(part.output)
      : part.state === 'output-error'
        ? `오류: ${part.errorText ?? '알 수 없음'}`
        : '실행 중…';
  const errored = part.state === 'output-error';
  return (
    <div
      className={cn(
        'ml-11 inline-flex max-w-[80%] items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-xs',
        errored
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-muted-foreground/20 bg-muted/40 text-muted-foreground',
      )}
      title={`${toolName}${inputSummary} → ${stateLabel}`}
    >
      <Search className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate font-mono">
        {toolName}
        {inputSummary}
      </span>
      <span aria-hidden>→</span>
      <span className="truncate">{stateLabel}</span>
    </div>
  );
}

function Bubble({ role, content, pulse }: { role: UIMessage['role']; content: string; pulse?: boolean }) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-[var(--sf-solar)]/20 text-[var(--sf-solar)]' : 'bg-muted text-foreground',
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          'max-w-[80%] whitespace-pre-wrap rounded-lg px-4 py-3 text-base leading-relaxed shadow-sm',
          isUser ? 'bg-[var(--sf-solar)]/10' : 'bg-background border',
          pulse && 'animate-pulse text-muted-foreground',
        )}
      >
        {content}
      </div>
    </div>
  );
}

function ProposalCard({
  proposal,
  onConfirm,
  onReject,
}: {
  proposal: ProposalState;
  onConfirm: (overridePayload?: unknown) => void;
  onReject: () => void;
}) {
  const label = PROPOSAL_KIND_LABEL[proposal.kind] ?? proposal.kind;
  const disabled = proposal.status !== 'pending';
  const formConfig = proposalKindToFormConfig(proposal.kind);
  const [previewOpen, setPreviewOpen] = useState(false);

  // 폼 미리보기에서 [저장] 시 — MetaForm 의 onSubmit 결과(수정된 payload)를 그대로 confirm 에 전달.
  const onPreviewSubmit = async (data: Record<string, unknown>) => {
    setPreviewOpen(false);
    onConfirm(data);
  };

  return (
    <div className="ml-11 max-w-[80%] rounded-lg border border-amber-300/60 bg-amber-50/60 p-4 text-base shadow-sm dark:border-amber-700/40 dark:bg-amber-900/20">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
        <span className="rounded bg-amber-200/60 px-2 py-0.5 text-xs dark:bg-amber-800/40">AI 제안</span>
        <span>{label}</span>
      </div>
      <div className="mt-2 whitespace-pre-wrap text-foreground/90">{proposal.summary}</div>

      {proposal.kind === 'propose_ui_config_update' && (
        <MetaConfigPreview payload={proposal.payload} />
      )}

      {proposal.status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="h-9 px-3 text-sm" onClick={() => onConfirm()}>
            <Check className="mr-1 h-4 w-4" />저장
          </Button>
          {formConfig && (
            <Button
              size="sm"
              variant="secondary"
              className="h-9 px-3 text-sm"
              onClick={() => setPreviewOpen(true)}
              title="폼에서 미리보기·수정 후 저장"
            >
              <Pencil className="mr-1 h-4 w-4" />검토·수정
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-9 px-3 text-sm" onClick={onReject} disabled={disabled}>
            <X className="mr-1 h-4 w-4" />거부
          </Button>
        </div>
      )}
      {proposal.status === 'submitting' && <div className="mt-2 text-sm text-muted-foreground">처리 중…</div>}
      {proposal.status === 'confirmed' && (
        <div className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">✓ 저장됨</div>
      )}
      {proposal.status === 'rejected' && <div className="mt-2 text-sm text-muted-foreground">거부됨 (폐기)</div>}
      {proposal.status === 'error' && (
        <div className="mt-2 text-sm text-destructive">오류: {proposal.errorMessage ?? '알 수 없음'}</div>
      )}

      {formConfig && (
        <MetaForm
          config={formConfig}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          onSubmit={onPreviewSubmit}
          editData={proposal.payload as object | undefined}
        />
      )}
    </div>
  );
}

function PendingPanel({
  pending,
  onConfirm,
  onReject,
  onSelect,
}: {
  pending: { proposal: ProposalState; msgId: string }[];
  onConfirm: (prop: ProposalState) => void;
  onReject: (prop: ProposalState) => void;
  onSelect: (msgId: string) => void;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Inbox className="h-4 w-4 text-[var(--sf-solar)]" />
        <h3 className="text-sm font-semibold">작업목록</h3>
        <span className="ml-auto rounded-full bg-[var(--sf-solar)]/15 px-2 py-0.5 text-xs font-medium text-[var(--sf-solar)]">
          {pending.length}건
        </span>
      </header>
      <div className="flex-1 overflow-y-auto p-3">
        {pending.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <Inbox className="h-7 w-7 opacity-30" />
            <div>대기 중인 작업이 없습니다.</div>
            <div className="text-xs opacity-70">AI 제안이 생기면 여기에 모입니다.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map(({ proposal, msgId }) => {
              const label = PROPOSAL_KIND_LABEL[proposal.kind] ?? proposal.kind;
              return (
                <div
                  key={proposal.id}
                  className="rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 shadow-sm dark:border-amber-700/40 dark:bg-amber-900/20"
                >
                  <button
                    type="button"
                    onClick={() => onSelect(msgId)}
                    className="block w-full text-left"
                    title="채팅에서 보기"
                  >
                    <div className="text-xs font-medium text-amber-900 dark:text-amber-200">{label}</div>
                    <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-foreground/90">
                      {proposal.summary}
                    </div>
                  </button>
                  <div className="mt-2.5 flex gap-2">
                    <Button size="sm" className="h-8 flex-1 text-sm" onClick={() => onConfirm(proposal)}>
                      <Check className="mr-1 h-4 w-4" />저장
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 flex-1 text-sm"
                      onClick={() => onReject(proposal)}
                    >
                      <X className="mr-1 h-4 w-4" />거부
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function SessionsPanel({
  sessions,
  currentSessionId,
  loadingId,
  enabled,
  onNew,
  onLoad,
  onDelete,
}: {
  sessions: SessionSummary[];
  currentSessionId: string | null;
  loadingId: string | null;
  enabled: boolean;
  onNew: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col border-b">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <MessageSquarePlus className="h-4 w-4 text-[var(--sf-solar)]" />
        <h3 className="text-sm font-semibold">세션목록</h3>
        <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={onNew} title="새 대화 시작">
          + 새 대화
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto p-3">
        {!enabled ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <div>목업 모드</div>
            <div className="text-xs opacity-70">로그인 후 세션이 저장됩니다.</div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <MessageSquarePlus className="h-7 w-7 opacity-30" />
            <div>저장된 대화가 없습니다.</div>
            <div className="text-xs opacity-70">대화를 보내면 자동 저장됩니다.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={cn(
                  'group flex items-center gap-1 rounded-md border bg-background px-2 py-1.5 text-sm shadow-sm transition-colors hover:border-[var(--sf-solar)]/40',
                  s.id === currentSessionId && 'border-[var(--sf-solar)]/60 bg-[var(--sf-solar)]/5',
                )}
              >
                <button
                  type="button"
                  onClick={() => onLoad(s.id)}
                  disabled={s.id === loadingId}
                  className="min-w-0 flex-1 truncate text-left"
                  title={s.title}
                >
                  <span className="truncate">{s.title || '새 대화'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(s.id)}
                  className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-destructive group-hover:opacity-100"
                  title="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyHint() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-base text-muted-foreground">
      <Bot className="h-10 w-10 opacity-40" />
      <div>업무 관련 질문을 입력하세요.</div>
      <div className="text-sm">예: "거래처 한화 검색", "최근 PO 5건", "PO123에 메모 남겨줘"</div>
      <div className="text-sm">📎 면장 PDF 첨부 후 "이 면장 등록해줘" — OCR 인식 → 등록 제안</div>
      <div className="text-sm opacity-70">DB 조회·작성·OCR 도구가 활성화됩니다. 쓰기는 카드의 [저장] 클릭 시에만 반영됩니다.</div>
    </div>
  );
}
