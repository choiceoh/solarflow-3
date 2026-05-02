import { useEffect, useRef, useState } from 'react';
import { Bot, Check, FileText, Inbox, Paperclip, Send, Trash2, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { fetchWithAuth } from '@/lib/api';
import { isDevMockApiActive } from '@/lib/devMockApi';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

type Role = 'user' | 'assistant';
type Provider = 'anthropic' | 'openai';

interface Proposal {
  id: string;
  kind: string;
  summary: string;
  payload: unknown;
}

type ProposalStatus = 'pending' | 'submitting' | 'confirmed' | 'rejected' | 'error';

interface ProposalState extends Proposal {
  status: ProposalStatus;
  errorMessage?: string;
}

interface ChatMessage {
  role: Role;
  content: string;
  proposals?: ProposalState[];
}

interface AssistantChatResponse {
  content: string;
  model: string;
  provider: Provider;
  proposals?: Proposal[];
}

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
};

const OCR_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/gif';
const OCR_MAX_BYTES = 20 * 1024 * 1024; // 20MB per file (서버 maxOCRUploadBytes)

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

// 사용자 메시지 본문에 OCR 결과를 붙이는 형식 — LLM이 인식하기 쉽도록 마커 포함.
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

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  // 운영 디폴트는 로컬 vLLM Qwen3.6 (openai 호환) — 빠르고 비용 0.
  // Anthropic(GLM) 은 fallback 또는 사용자 명시 토글 시 사용.
  const [provider, setProvider] = useState<Provider>('openai');
  const [model, setModel] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [parseAsCustoms, setParseAsCustoms] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIdx, setHighlightedIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToMessage = (idx: number) => {
    const el = document.getElementById(`assistant-msg-${idx}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedIdx(idx);
    window.setTimeout(() => setHighlightedIdx((v) => (v === idx ? null : v)), 1500);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

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
    e.target.value = ''; // 같은 파일 재선택 허용
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // OCR 사전 호출 — 첨부 파일을 서버 OCR 엔드포인트로 보내 텍스트 추출.
  // /api/v1/assistant/ocr/extract: AI 통합 네임스페이스 (기존 /api/v1/ocr/extract와 alias).
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

  const send = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;

    setError(null);
    setBusy(true);

    let userContent = text;
    let ocrResults: OCRResult[] = [];

    try {
      if (attachments.length > 0) {
        if (isDevMockApiActive()) {
          throw new Error('목업 모드에서는 OCR 첨부를 지원하지 않습니다');
        }
        setOcrBusy(true);
        try {
          ocrResults = await runOCR(attachments);
        } finally {
          setOcrBusy(false);
        }
        const ocrBlock = buildOCRBlock(ocrResults);
        userContent = text ? `${text}\n\n${ocrBlock}` : ocrBlock;
      }

      const next: ChatMessage[] = [...messages, { role: 'user', content: userContent }];
      setMessages(next);
      setInput('');
      setAttachments([]);

      const body = JSON.stringify({
        messages: next.map(({ role, content }) => ({ role, content })),
        provider,
        model: model.trim() || undefined,
      });

      let data: AssistantChatResponse;
      if (isDevMockApiActive()) {
        // 목업 모드 — public 라우트로 raw fetch (mockFetchWithAuth 우회, Z.ai 직결).
        // 도구·제안은 인증이 필요하므로 자동 비활성화 → bare LLM 응답만.
        const res = await fetch(`${API_BASE_URL}/api/v1/public/assistant/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`${res.status}: ${errBody.slice(0, 200)}`);
        }
        data = (await res.json()) as AssistantChatResponse;
      } else {
        // 실제 모드 — JWT 인증 라우트로 접근 (도구·제안 활성).
        data = await fetchWithAuth<AssistantChatResponse>('/api/v1/assistant/chat', {
          method: 'POST',
          body,
        });
      }

      const proposals: ProposalState[] | undefined = data.proposals?.map((p) => ({
        ...p,
        status: 'pending',
      }));
      setMessages([...next, { role: 'assistant', content: data.content, proposals }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청 실패');
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const reset = () => {
    setMessages([]);
    setError(null);
  };

  const updateProposal = (msgIdx: number, propId: string, patch: Partial<ProposalState>) => {
    setMessages((prev) =>
      prev.map((m, i) => {
        if (i !== msgIdx || !m.proposals) return m;
        return {
          ...m,
          proposals: m.proposals.map((p) => (p.id === propId ? { ...p, ...patch } : p)),
        };
      }),
    );
  };

  const onConfirm = async (msgIdx: number, prop: ProposalState) => {
    if (prop.status !== 'pending') return;
    updateProposal(msgIdx, prop.id, { status: 'submitting' });
    try {
      await fetchWithAuth(`/api/v1/assistant/proposals/${prop.id}/confirm`, { method: 'POST' });
      updateProposal(msgIdx, prop.id, { status: 'confirmed' });
    } catch (e) {
      updateProposal(msgIdx, prop.id, {
        status: 'error',
        errorMessage: e instanceof Error ? e.message : '저장 실패',
      });
    }
  };

  const onReject = async (msgIdx: number, prop: ProposalState) => {
    if (prop.status !== 'pending') return;
    updateProposal(msgIdx, prop.id, { status: 'submitting' });
    try {
      await fetchWithAuth(`/api/v1/assistant/proposals/${prop.id}/reject`, { method: 'POST' });
      updateProposal(msgIdx, prop.id, { status: 'rejected' });
    } catch (e) {
      updateProposal(msgIdx, prop.id, {
        status: 'error',
        errorMessage: e instanceof Error ? e.message : '거부 실패',
      });
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-[var(--sf-solar)]" />
          <h2 className="text-lg font-semibold">업무 도우미</h2>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            value={provider}
            onValueChange={(v) => {
              // provider 변경 시 model 도 비워서 서버가 provider 기본값을 적용하도록 함.
              // (예: provider=anthropic 인데 model='qwen…' 이면 Z.ai 가 Unknown Model 400)
              setProvider(v as Provider);
              setModel('');
            }}
          >
            <SelectTrigger className="h-9 w-[160px] text-sm">
              <span>{provider === 'anthropic' ? 'Anthropic 호환' : 'OpenAI 호환'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="anthropic">Anthropic 호환</SelectItem>
              <SelectItem value="openai">OpenAI 호환</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={
              provider === 'anthropic'
                ? '예: glm-5.1 (비우면 기본값)'
                : '예: qwen3.6-35b-a3b (비우면 기본값)'
            }
            className="h-9 w-[220px] text-sm"
          />
          <Button variant="ghost" size="sm" onClick={reset} disabled={messages.length === 0}>
            <Trash2 className="mr-1 h-4 w-4" />초기화
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-md border bg-muted/20 p-3">
        {messages.length === 0 ? (
          <EmptyHint />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <div
                key={i}
                id={`assistant-msg-${i}`}
                className={cn(
                  'flex flex-col gap-2 rounded-md transition-colors',
                  highlightedIdx === i && 'bg-[var(--sf-solar)]/10 ring-2 ring-[var(--sf-solar)]/40',
                )}
              >
                <Bubble role={m.role} content={m.content} />
                {m.proposals?.map((p) => (
                  <ProposalCard
                    key={p.id}
                    proposal={p}
                    onConfirm={() => onConfirm(i, p)}
                    onReject={() => onReject(i, p)}
                  />
                ))}
              </div>
            ))}
            {busy && <Bubble role="assistant" content="…" pulse />}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-base text-destructive">
          {error}
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
          onClick={send}
          disabled={busy || (!input.trim() && attachments.length === 0)}
          className="h-12 shrink-0 px-5 text-base"
        >
          <Send className="mr-1.5 h-5 w-5" />
          {ocrBusy ? 'OCR 중…' : '전송'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={OCR_ACCEPT}
          onChange={onPickFiles}
          className="hidden"
        />
      </div>
      </div>

      <PendingPanel
        messages={messages}
        onConfirm={onConfirm}
        onReject={onReject}
        onSelect={scrollToMessage}
      />
    </div>
  );
}

function Bubble({ role, content, pulse }: { role: Role; content: string; pulse?: boolean }) {
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
  onConfirm: () => void;
  onReject: () => void;
}) {
  const label = PROPOSAL_KIND_LABEL[proposal.kind] ?? proposal.kind;
  const disabled = proposal.status !== 'pending';

  return (
    <div className="ml-11 max-w-[80%] rounded-lg border border-amber-300/60 bg-amber-50/60 p-4 text-base shadow-sm dark:border-amber-700/40 dark:bg-amber-900/20">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
        <span className="rounded bg-amber-200/60 px-2 py-0.5 text-xs dark:bg-amber-800/40">
          AI 제안
        </span>
        <span>{label}</span>
      </div>
      <div className="mt-2 whitespace-pre-wrap text-foreground/90">{proposal.summary}</div>

      {proposal.status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="h-9 px-3 text-sm" onClick={onConfirm}>
            <Check className="mr-1 h-4 w-4" />저장
          </Button>
          <Button size="sm" variant="outline" className="h-9 px-3 text-sm" onClick={onReject} disabled={disabled}>
            <X className="mr-1 h-4 w-4" />거부
          </Button>
        </div>
      )}

      {proposal.status === 'submitting' && (
        <div className="mt-2 text-sm text-muted-foreground">처리 중…</div>
      )}
      {proposal.status === 'confirmed' && (
        <div className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          ✓ 저장됨
        </div>
      )}
      {proposal.status === 'rejected' && (
        <div className="mt-2 text-sm text-muted-foreground">거부됨 (폐기)</div>
      )}
      {proposal.status === 'error' && (
        <div className="mt-2 text-sm text-destructive">
          오류: {proposal.errorMessage ?? '알 수 없음'}
        </div>
      )}
    </div>
  );
}

function PendingPanel({
  messages,
  onConfirm,
  onReject,
  onSelect,
}: {
  messages: ChatMessage[];
  onConfirm: (msgIdx: number, prop: ProposalState) => void;
  onReject: (msgIdx: number, prop: ProposalState) => void;
  onSelect: (msgIdx: number) => void;
}) {
  const pending = messages.flatMap((m, mi) =>
    (m.proposals ?? [])
      .filter((p) => p.status === 'pending')
      .map((p) => ({ proposal: p, msgIdx: mi })),
  );

  return (
    <aside className="hidden w-[340px] shrink-0 flex-col border-l bg-muted/10 lg:flex">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Inbox className="h-4 w-4 text-[var(--sf-solar)]" />
        <h3 className="text-sm font-semibold">승인 대기</h3>
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
            {pending.map(({ proposal, msgIdx }) => (
              <PendingItem
                key={proposal.id}
                proposal={proposal}
                onSelect={() => onSelect(msgIdx)}
                onConfirm={() => onConfirm(msgIdx, proposal)}
                onReject={() => onReject(msgIdx, proposal)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function PendingItem({
  proposal,
  onSelect,
  onConfirm,
  onReject,
}: {
  proposal: ProposalState;
  onSelect: () => void;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const label = PROPOSAL_KIND_LABEL[proposal.kind] ?? proposal.kind;

  return (
    <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 shadow-sm dark:border-amber-700/40 dark:bg-amber-900/20">
      <button
        type="button"
        onClick={onSelect}
        className="block w-full text-left"
        title="채팅에서 보기"
      >
        <div className="text-xs font-medium text-amber-900 dark:text-amber-200">{label}</div>
        <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-foreground/90">
          {proposal.summary}
        </div>
      </button>
      <div className="mt-2.5 flex gap-2">
        <Button size="sm" className="h-8 flex-1 text-sm" onClick={onConfirm}>
          <Check className="mr-1 h-4 w-4" />저장
        </Button>
        <Button size="sm" variant="outline" className="h-8 flex-1 text-sm" onClick={onReject}>
          <X className="mr-1 h-4 w-4" />거부
        </Button>
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-base text-muted-foreground">
      <Bot className="h-10 w-10 opacity-40" />
      <div>업무 관련 질문을 입력하세요.</div>
      <div className="text-sm">예: "거래처 한화 검색", "최근 PO 5건", "PO123에 메모 남겨줘"</div>
      <div className="text-sm">📎 면장 PDF 첨부 후 "이 면장 등록해줘" — OCR 인식 → 등록 제안</div>
      <div className="text-sm opacity-70">
        Anthropic 호환에서 DB 조회·작성·OCR 도구가 활성화됩니다. 쓰기는 카드의 [저장] 클릭 시에만 반영됩니다.
      </div>
    </div>
  );
}
