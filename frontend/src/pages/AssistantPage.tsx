import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, getToolName, isToolUIPart } from 'ai';
import type { ToolUIPart, UIMessage } from 'ai';
import { Bot, Check, ChevronDown, ChevronUp, Copy, FileText, Inbox, MessageSquarePlus, Paperclip, Pencil, RotateCcw, Search, Send, Square, Trash2, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { MessageMarkdown } from '@/components/assistant/MessageMarkdown';
import { cn } from '@/lib/utils';
import { useLocation } from 'react-router-dom';
import { fetchWithAuth, streamFetchWithAuth } from '@/lib/api';
import { isDevMockApiActive } from '@/lib/devMockApi';
import { detectPageContext } from '@/lib/pageContext';
import { getPageChips, type ChipDef } from '@/lib/assistantChips';
import {
  toBackendMessages,
  extractProposals,
  extractText,
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
  bulk_update_outbound: '출고 일괄 수정',
  bulk_update_order: '수주 일괄 수정',
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

function firstUserText(messages: UIMessage[]): string {
  const u = messages.find((m) => m.role === 'user');
  return u ? extractText(u).trim() : '';
}

// 새 세션 첫 턴 직후 fallback LLM 으로 제목 요약 — fire-and-forget.
// 실패 시 백엔드가 슬라이스 fallback 으로 떨어뜨려 200 반환하므로 프론트에선 그냥 무시.
async function refineSessionTitle(
  sessionId: string,
  text: string,
  onSessionUpserted: (s: SessionSummary, makeCurrent: boolean) => void,
) {
  if (!text) return;
  try {
    const refined = await fetchWithAuth<SessionSummary>(
      `/api/v1/assistant/sessions/${sessionId}/summarize-title`,
      { method: 'POST', body: JSON.stringify({ first_user_text: text }) },
    );
    onSessionUpserted(refined, false);
  } catch {
    // 슬라이스 제목 그대로 유지 — 사용자 영향 없음
  }
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
  /** drawer 안에서 사용 시 — 자체 헤더 숨김 (drawer 헤더가 대신함) */
  embedded?: boolean;
  /** drawer 등 외부에서 자동 채워주는 첫 입력 — 마운트 시 input 에 prefill (사용자가 검토 후 send) */
  initialInput?: string;
}

export function ChatBox({ initialMessages, sessionId, sessionsEnabled, onSessionUpserted, sessionsSlot, embedded, initialInput }: ChatBoxProps) {
  // 빠른 연속 send 시 setSessionIdRef 가 반영되기 전 두 번째 호출이 또 POST 하지 않도록 ref 로 동기 추적.
  const sessionIdRef = useRef<string | null>(sessionId);
  // 쓰기 도구 승인/거부 상태 — proposal id → status. messages 와 별도 메모리 (상태 mutation 안 함).
  const [proposalStatuses, setProposalStatuses] = useState<Map<string, { status: ProposalStatus; errorMessage?: string }>>(
    new Map(),
  );
  const [input, setInput] = useState(initialInput ?? '');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [parseAsCustoms, setParseAsCustoms] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // mock 모드에선 인증 우회 public 라우트 (Caddy 가 같은 SSE 인코딩으로 응답).
  const apiPath = isDevMockApiActive() ? '/api/v1/public/assistant/chat' : '/api/v1/assistant/chat';

  // 5.1 PR-B: 현재 페이지 컨텍스트 자동 주입 — backend 가 system prompt 에 합성.
  // 단 /assistant 풀 페이지에선 의미 없는 noise 라 스킵 (drawer 안에서만 가치).
  const location = useLocation();
  const pageContextRef = useRef<ReturnType<typeof detectPageContext> | undefined>(undefined);
  if (location.pathname === '/assistant') {
    pageContextRef.current = undefined;
  } else {
    pageContextRef.current = detectPageContext(location.pathname);
  }

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiPath,
        fetch: streamFetchWithAuth,
        // 백엔드는 평면 메시지 + provider/model + page_context (선택) 만 받음. parts/도구 history 는 떨굼.
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            messages: toBackendMessages(messages),
            ...(pageContextRef.current ? { page_context: pageContextRef.current } : {}),
            ...(body ?? {}),
          },
        }),
      }),
    [apiPath],
  );

  const { messages, sendMessage, setMessages, status, stop, regenerate, error: chatError } = useChat({
    transport,
    messages: initialMessages,
    onFinish: ({ messages: msgs }) => {
      void persistMessages(msgs);
    },
  });

  // 사용자 메시지 편집 — 한 번에 한 개만 편집 모드.
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  const handleSubmitEdit = async (messageId: string, newText: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    setEditingMessageId(null);
    setMessages(messages.slice(0, idx));
    stickToBottomRef.current = true;
    await sendMessage({ text: newText });
  };

  const handleRegenerate = async () => {
    if (status === 'submitted' || status === 'streaming') return;
    stickToBottomRef.current = true;
    await regenerate();
  };

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
        // 새 세션만 fallback 모델로 제목 다듬기. 실패해도 슬라이스 제목 그대로 유지.
        void refineSessionTitle(created.id, firstUserText(msgs), onSessionUpserted);
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

  // 자동 스크롤은 사용자가 하단 근처(120px 이내)에 있을 때만. 위로 스크롤해 과거를 읽는 중이면 방해 안 함.
  const stickToBottomRef = useRef(true);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceToBottom < 120;
  };
  useEffect(() => {
    if (!stickToBottomRef.current) return;
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
      stickToBottomRef.current = true; // 새 질문 보내면 다시 하단 추적 모드로
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

  const pageChips = getPageChips(location.pathname);

  return (
    <>
      <div className={cn('flex min-w-0 flex-1 flex-col gap-3', embedded ? 'p-3' : 'p-4')}>
        {!embedded && (
          <header className="flex flex-wrap items-center gap-3 border-b pb-3">
            <div className="flex items-center gap-2">
              <Bot className="h-6 w-6 text-[var(--sf-solar)]" />
              <h2 className="text-lg font-semibold">업무 도우미</h2>
            </div>
          </header>
        )}

        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto rounded-md border bg-muted/20 p-3">
          {messagesWithProposals.length === 0 ? (
            <ChipEmpty chips={pageChips.chips} onPick={(t) => setInput(t)} />
          ) : (
            <div className="flex flex-col gap-3">
              {messagesWithProposals.map(({ message, proposals }, idx) => {
                const isLast = idx === messagesWithProposals.length - 1;
                const isLastAssistant = isLast && message.role === 'assistant';
                const isStreamingThis =
                  isLastAssistant && (status === 'submitted' || status === 'streaming');
                const canRegenerate = isLastAssistant && status !== 'submitted' && status !== 'streaming';
                return (
                  <div
                    key={message.id}
                    id={`assistant-msg-${message.id}`}
                    className={cn(
                      'flex flex-col gap-2 rounded-md transition-colors',
                      highlightedKey === message.id && 'bg-[var(--sf-solar)]/10 ring-2 ring-[var(--sf-solar)]/40',
                    )}
                  >
                    <MessageParts
                      message={message}
                      isStreaming={isStreamingThis}
                      isEditing={editingMessageId === message.id}
                      onStartEdit={
                        message.role === 'user' && !editingMessageId
                          ? () => setEditingMessageId(message.id)
                          : undefined
                      }
                      onCancelEdit={() => setEditingMessageId(null)}
                      onSubmitEdit={(newText) => void handleSubmitEdit(message.id, newText)}
                      onRegenerate={canRegenerate ? handleRegenerate : undefined}
                    />
                    {proposals.map((p) => (
                      <ProposalCard
                        key={p.id}
                        proposal={p}
                        onConfirm={(override) => onConfirm(p, override)}
                        onReject={() => onReject(p)}
                      />
                    ))}
                  </div>
                );
              })}
              {(status === 'submitted' || status === 'streaming') && messages.at(-1)?.role !== 'assistant' && (
                <TypingIndicator />
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

        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              attachments.length > 0
                ? '첨부 파일과 함께 보낼 질문 (예: "이 면장 등록해줘")'
                : '질문을 입력하세요…'
            }
            rows={embedded ? 3 : 5}
            className="w-full resize-none pb-12 text-base leading-relaxed md:text-base"
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
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="pointer-events-auto h-8 w-8"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              title="파일 첨부 (PDF/이미지, OCR 추출)"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            {status === 'submitted' || status === 'streaming' ? (
              <Button
                type="button"
                onClick={() => stop()}
                size="sm"
                variant="destructive"
                className="pointer-events-auto h-8 px-3"
                title="응답 중단"
              >
                <Square className="mr-1 h-3 w-3 fill-current" />
                중단
              </Button>
            ) : (
              <Button
                onClick={() => void send()}
                disabled={ocrBusy || (!input.trim() && attachments.length === 0)}
                size="sm"
                className="pointer-events-auto h-8 px-3"
              >
                <Send className="mr-1 h-4 w-4" />
                {ocrBusy ? 'OCR 중…' : '전송'}
              </Button>
            )}
          </div>
        </div>
        <div className="-mt-1 px-1 text-[11px] text-muted-foreground/70">
          Enter 전송 · Shift+Enter 줄바꿈
        </div>
      </div>

      {embedded ? (
        <PendingFooter pending={pendingItems} onConfirm={onConfirm} onReject={onReject} onSelect={scrollToMessage} />
      ) : (
        <aside className="hidden w-[340px] shrink-0 flex-col border-l bg-muted/10 lg:flex">
          {sessionsSlot}
          <PendingPanel pending={pendingItems} onConfirm={onConfirm} onReject={onReject} onSelect={scrollToMessage} />
        </aside>
      )}
    </>
  );
}

interface MessagePartsProps {
  message: UIMessage;
  isStreaming?: boolean;
  isEditing?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSubmitEdit?: (newText: string) => void;
  onRegenerate?: () => void;
}

// MessageParts — 한 메시지의 parts 를 순서대로 렌더링.
// text → Bubble (텍스트 박스), tool-* → ToolChip (회색 칩), data-proposal 은 상위에서 ProposalCard 로 처리하므로 무시.
function MessageParts({
  message,
  isStreaming,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onRegenerate,
}: MessagePartsProps) {
  // 텍스트 part 는 첫 번째 것만 액션을 붙임 (다중 텍스트 part 인 경우 첫 거품에만 호버 액션).
  let textIdx = -1;
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < message.parts.length; i++) {
    const part = message.parts[i];
    if (part.type === 'text') {
      if (!part.text.trim()) continue;
      const isFirstText = textIdx === -1;
      textIdx = i;
      nodes.push(
        <Bubble
          key={i}
          role={message.role}
          content={part.text}
          isStreaming={isFirstText && isStreaming}
          isEditing={isFirstText && isEditing}
          onStartEdit={isFirstText ? onStartEdit : undefined}
          onCancelEdit={isFirstText ? onCancelEdit : undefined}
          onSubmitEdit={isFirstText ? onSubmitEdit : undefined}
          onRegenerate={isFirstText ? onRegenerate : undefined}
        />,
      );
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
    nodes.push(
      <Bubble
        key="fallback"
        role={message.role}
        content={extractText(message)}
        isStreaming={isStreaming}
        onRegenerate={onRegenerate}
      />,
    );
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

function TypingIndicator() {
  return (
    <div className="flex gap-2.5" aria-live="polite" aria-label="AI 응답 작성 중">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-2 rounded-lg border bg-background px-4 py-3 shadow-sm">
        <span className="flex items-end gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" />
        </span>
        <span className="text-sm text-muted-foreground">응답 작성 중</span>
      </div>
    </div>
  );
}

interface BubbleProps {
  role: UIMessage['role'];
  content: string;
  isStreaming?: boolean;
  isEditing?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSubmitEdit?: (newText: string) => void;
  onRegenerate?: () => void;
}

function Bubble({
  role,
  content,
  isStreaming,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onRegenerate,
}: BubbleProps) {
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);
  const [editText, setEditText] = useState(content);

  // 편집 모드 진입할 때마다 textarea 를 현재 content 로 동기화.
  useEffect(() => {
    if (isEditing) setEditText(content);
  }, [isEditing, content]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한 거부 등은 무시 — 메시지 표면화 안 함
    }
  };

  const submitEdit = () => {
    const next = editText.trim();
    if (!next || next === content.trim()) {
      onCancelEdit?.();
      return;
    }
    onSubmitEdit?.(next);
  };

  const onEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancelEdit?.();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitEdit();
    }
  };

  return (
    <div className={cn('group/bubble flex gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}>
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
          'flex min-w-0 max-w-[80%] flex-col gap-1',
          isUser ? 'items-end' : 'items-start',
          isEditing && 'w-full max-w-[80%]',
        )}
      >
        {isEditing ? (
          <div className="w-full rounded-2xl rounded-tr-sm bg-[var(--sf-solar)]/10 p-2">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={onEditKeyDown}
              rows={Math.min(8, Math.max(2, content.split('\n').length + 1))}
              className="w-full resize-none bg-background text-base leading-relaxed md:text-base"
              autoFocus
            />
            <div className="mt-2 flex items-center justify-end gap-2 text-xs">
              <span className="mr-auto text-muted-foreground/70">⌘+Enter 저장 · Esc 취소</span>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onCancelEdit}>
                취소
              </Button>
              <Button size="sm" className="h-7 px-3 text-xs" onClick={submitEdit}>
                <Check className="mr-1 h-3 w-3" />저장 후 다시 보내기
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'rounded-2xl px-4 py-3 text-base leading-relaxed transition-opacity',
              isUser
                ? 'whitespace-pre-wrap rounded-tr-sm bg-[var(--sf-solar)]/10'
                : 'rounded-tl-sm bg-background',
              isStreaming && 'sf-stream-fade',
            )}
          >
            {isUser ? content : <MessageMarkdown content={content} />}
            {isStreaming && (
              <span
                className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-foreground/60"
                aria-hidden
              />
            )}
          </div>
        )}

        {/* 호버 액션 줄: 복사 / (사용자) 편집 / (마지막 어시스턴트) 재생성 */}
        {!isEditing && content.trim() && (
          <div
            className={cn(
              'flex h-6 items-center gap-1 text-xs text-muted-foreground/70 opacity-0 transition-opacity group-hover/bubble:opacity-100 focus-within:opacity-100',
            )}
          >
            <button
              type="button"
              onClick={onCopy}
              className="flex items-center gap-1 rounded px-1.5 hover:bg-muted hover:text-foreground"
              title="복사"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? '복사됨' : '복사'}</span>
            </button>
            {onStartEdit && (
              <button
                type="button"
                onClick={onStartEdit}
                className="flex items-center gap-1 rounded px-1.5 hover:bg-muted hover:text-foreground"
                title="편집해서 다시 보내기"
              >
                <Pencil className="h-3 w-3" />
                <span>편집</span>
              </button>
            )}
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="flex items-center gap-1 rounded px-1.5 hover:bg-muted hover:text-foreground"
                title="다시 생성"
              >
                <RotateCcw className="h-3 w-3" />
                <span>다시 생성</span>
              </button>
            )}
          </div>
        )}
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

  return (
    <div className="ml-11 max-w-[80%] rounded-lg border border-amber-300/60 bg-amber-50/60 p-4 text-base shadow-sm dark:border-amber-700/40 dark:bg-amber-900/20">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
        <span className="rounded bg-amber-200/60 px-2 py-0.5 text-xs dark:bg-amber-800/40">AI 제안</span>
        <span>{label}</span>
      </div>
      <div className="mt-2 whitespace-pre-wrap text-foreground/90">{proposal.summary}</div>

      {proposal.status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="h-9 px-3 text-sm" onClick={() => onConfirm()}>
            <Check className="mr-1 h-4 w-4" />저장
          </Button>
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

// updated_at 기준으로 세션을 시간 버킷에 그룹핑. ChatGPT 식 "오늘/어제/지난 7일/지난 30일/이전".
type SessionBucket = '오늘' | '어제' | '지난 7일' | '지난 30일' | '이전';
const SESSION_BUCKETS: SessionBucket[] = ['오늘', '어제', '지난 7일', '지난 30일', '이전'];

function bucketOf(updatedAt: string): SessionBucket {
  const now = new Date();
  const updated = new Date(updatedAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const updatedTime = updated.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (updatedTime >= startOfToday) return '오늘';
  if (updatedTime >= startOfToday - dayMs) return '어제';
  if (updatedTime >= startOfToday - 7 * dayMs) return '지난 7일';
  if (updatedTime >= startOfToday - 30 * dayMs) return '지난 30일';
  return '이전';
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
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => (s.title || '').toLowerCase().includes(q));
  }, [sessions, query]);
  const grouped = useMemo(() => {
    const map = new Map<SessionBucket, SessionSummary[]>();
    for (const s of filtered) {
      const b = bucketOf(s.updated_at);
      const list = map.get(b) ?? [];
      list.push(s);
      map.set(b, list);
    }
    return map;
  }, [filtered]);

  return (
    <section className="flex min-h-0 flex-1 flex-col border-b">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <MessageSquarePlus className="h-4 w-4 text-[var(--sf-solar)]" />
        <h3 className="text-sm font-semibold">세션목록</h3>
        <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={onNew} title="새 대화 시작">
          + 새 대화
        </Button>
      </header>
      {enabled && sessions.length > 0 && (
        <div className="border-b px-3 py-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="대화 제목 검색…"
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>
      )}
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
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <Search className="h-7 w-7 opacity-30" />
            <div>일치하는 대화가 없습니다.</div>
            <div className="text-xs opacity-70">"{query}" 와 일치하는 제목 없음</div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {SESSION_BUCKETS.map((bucket) => {
              const items = grouped.get(bucket);
              if (!items || items.length === 0) return null;
              return (
                <div key={bucket} className="flex flex-col gap-1">
                  <div className="px-1 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
                    {bucket}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {items.map((s) => (
                      <div
                        key={s.id}
                        className={cn(
                          'group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted',
                          s.id === currentSessionId && 'bg-[var(--sf-solar)]/10 text-foreground',
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
                          className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted-foreground/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                          title="삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
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

/**
 * 빈 상태 — chip 클릭으로 입력창 채우기 (자동 전송 X — 사용자가 다듬어 전송).
 * chip 구성 = 공통 2개 + 페이지별 0~2개. 정의는 lib/assistantChips.ts.
 */
function ChipEmpty({ chips, onPick }: { chips: ChipDef[]; onPick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--sf-solar)]/10 text-[var(--sf-solar)]">
        <Bot className="h-8 w-8" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <div className="text-lg font-semibold text-foreground">무엇을 도와드릴까요?</div>
        <div className="text-sm text-muted-foreground">아래 예시로 시작하거나 직접 입력하세요</div>
      </div>
      <div className="flex max-w-2xl flex-wrap justify-center gap-2">
        {chips.map((c) => (
          <button
            key={c.text}
            type="button"
            onClick={() => onPick(c.text)}
            className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2 text-sm text-muted-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--sf-solar)]/40 hover:bg-[var(--sf-solar)]/5 hover:text-foreground hover:shadow-md"
          >
            {c.icon && <span className="text-base">{c.icon}</span>}
            <span>{c.text}</span>
          </button>
        ))}
      </div>
      <div className="text-xs text-muted-foreground/70">
        클릭하면 입력창에 채워집니다 · PDF/이미지 첨부 시 OCR 자동 인식
      </div>
    </div>
  );
}

/**
 * drawer 전용 — pending 0건이면 한 줄로 collapse, N>0이면 자동 펼침.
 * 펼친 상태에서는 컴팩트 카드 리스트 (PendingPanel 보다 좁은 폭에 최적).
 */
function PendingFooter({
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
  const hasItems = pending.length > 0;
  const [open, setOpen] = useState(hasItems);
  // pending 항목이 새로 생기면 자동 펼침.
  useEffect(() => {
    if (hasItems) setOpen(true);
  }, [hasItems]);
  if (!hasItems && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center justify-center gap-1.5 border-t border-slate-200 px-3 py-1.5 text-xs text-muted-foreground hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        title="작업목록 펼치기"
      >
        <Inbox className="h-3 w-3" aria-hidden />
        <span>작업목록</span>
        <ChevronUp className="h-3 w-3" aria-hidden />
      </button>
    );
  }
  return (
    <section className="flex shrink-0 flex-col border-t border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-800"
        title={open ? '접기' : '펼치기'}
      >
        <Inbox className="h-3 w-3 text-[var(--sf-solar)]" aria-hidden />
        <span className="font-medium">작업목록</span>
        {hasItems && (
          <span className="rounded-full bg-[var(--sf-solar)]/15 px-1.5 text-[10px] font-medium text-[var(--sf-solar)]">
            {pending.length}
          </span>
        )}
        <span className="ml-auto">
          {open ? <ChevronDown className="h-3 w-3" aria-hidden /> : <ChevronUp className="h-3 w-3" aria-hidden />}
        </span>
      </button>
      {open && (
        <div className="max-h-48 overflow-y-auto border-t border-slate-200 px-2 py-2 dark:border-slate-700">
          {!hasItems ? (
            <div className="py-3 text-center text-xs text-muted-foreground/70">
              AI 제안이 생기면 여기에 모입니다.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {pending.map(({ proposal, msgId }) => {
                const label = PROPOSAL_KIND_LABEL[proposal.kind] ?? proposal.kind;
                return (
                  <div
                    key={proposal.id}
                    className="rounded-md border border-amber-300/60 bg-amber-50/60 p-2 text-xs shadow-sm dark:border-amber-700/40 dark:bg-amber-900/20"
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(msgId)}
                      className="block w-full text-left"
                      title="채팅에서 보기"
                    >
                      <div className="font-medium text-amber-900 dark:text-amber-200">{label}</div>
                      <div className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-foreground/90">
                        {proposal.summary}
                      </div>
                    </button>
                    <div className="mt-1.5 flex gap-1">
                      <Button size="sm" className="h-7 flex-1 text-xs" onClick={() => onConfirm(proposal)}>
                        <Check className="mr-1 h-3 w-3" />저장
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 flex-1 text-xs"
                        onClick={() => onReject(proposal)}
                      >
                        <X className="mr-1 h-3 w-3" />거부
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
