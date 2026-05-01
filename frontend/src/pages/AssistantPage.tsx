import { useEffect, useRef, useState } from 'react';
import { Bot, Check, Send, Trash2, User, X } from 'lucide-react';
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
};

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;

    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setError(null);
    setBusy(true);

    try {
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
    <div className="flex h-full flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-[var(--sf-solar)]" />
          <h2 className="text-base font-semibold">업무 도우미</h2>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
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
            placeholder="모델 (비우면 서버 기본값)"
            className="h-8 w-[200px] text-xs"
          />
          <Button variant="ghost" size="sm" onClick={reset} disabled={messages.length === 0}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />초기화
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-md border bg-muted/20 p-3">
        {messages.length === 0 ? (
          <EmptyHint />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <div key={i} className="flex flex-col gap-2">
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
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="질문을 입력하세요. Enter 전송 · Shift+Enter 줄바꿈"
          rows={3}
          className="flex-1 resize-none"
          disabled={busy}
        />
        <Button onClick={send} disabled={busy || !input.trim()} className="h-10">
          <Send className="mr-1 h-4 w-4" />전송
        </Button>
      </div>
    </div>
  );
}

function Bubble({ role, content, pulse }: { role: Role; content: string; pulse?: boolean }) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-[var(--sf-solar)]/20 text-[var(--sf-solar)]' : 'bg-muted text-foreground',
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn(
          'max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed shadow-sm',
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
    <div className="ml-9 max-w-[80%] rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 text-sm shadow-sm dark:border-amber-700/40 dark:bg-amber-900/20">
      <div className="flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-200">
        <span className="rounded bg-amber-200/60 px-1.5 py-0.5 text-[10px] dark:bg-amber-800/40">
          AI 제안
        </span>
        <span>{label}</span>
      </div>
      <div className="mt-1.5 whitespace-pre-wrap text-foreground/90">{proposal.summary}</div>

      {proposal.status === 'pending' && (
        <div className="mt-2.5 flex gap-2">
          <Button size="sm" className="h-7" onClick={onConfirm}>
            <Check className="mr-1 h-3.5 w-3.5" />저장
          </Button>
          <Button size="sm" variant="outline" className="h-7" onClick={onReject} disabled={disabled}>
            <X className="mr-1 h-3.5 w-3.5" />거부
          </Button>
        </div>
      )}

      {proposal.status === 'submitting' && (
        <div className="mt-2 text-xs text-muted-foreground">처리 중…</div>
      )}
      {proposal.status === 'confirmed' && (
        <div className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          ✓ 저장됨
        </div>
      )}
      {proposal.status === 'rejected' && (
        <div className="mt-2 text-xs text-muted-foreground">거부됨 (폐기)</div>
      )}
      {proposal.status === 'error' && (
        <div className="mt-2 text-xs text-destructive">
          오류: {proposal.errorMessage ?? '알 수 없음'}
        </div>
      )}
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
      <Bot className="h-8 w-8 opacity-40" />
      <div>업무 관련 질문을 입력하세요.</div>
      <div className="text-xs">예: "거래처 한화 검색", "최근 PO 5건", "수주 LIST", "PO123에 메모 남겨줘"</div>
      <div className="text-xs opacity-70">
        Anthropic 호환에서 DB 조회(거래처·P/O·수주·출고·수금)·작성(메모·거래처) 도구가 활성화됩니다. 쓰기는 카드의 [저장] 클릭 시에만 반영됩니다.
      </div>
    </div>
  );
}
