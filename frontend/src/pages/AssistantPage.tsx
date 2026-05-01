import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { fetchWithAuth } from '@/lib/api';
import { cn } from '@/lib/utils';

type Role = 'user' | 'assistant';
type Provider = 'anthropic' | 'openai';

interface ChatMessage {
  role: Role;
  content: string;
}

interface AssistantChatResponse {
  content: string;
  model: string;
  provider: Provider;
}

const SYSTEM_PROMPT =
  'You are SolarFlow의 업무 도우미입니다. 한국어로 간결하게 답합니다. ' +
  '태양광 ERP(수입/L·C/B·L/면장/원가/판매/수금) 맥락의 질문에 우선 도움을 줍니다.';

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
      const res = await fetchWithAuth<AssistantChatResponse>('/api/v1/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: next,
          provider,
          model: model.trim() || undefined,
          system: SYSTEM_PROMPT,
        }),
      });
      setMessages([...next, { role: 'assistant', content: res.content }]);
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
              <Bubble key={i} role={m.role} content={m.content} />
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

function EmptyHint() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
      <Bot className="h-8 w-8 opacity-40" />
      <div>업무 관련 질문을 입력하세요.</div>
      <div className="text-xs">기본 provider는 Anthropic 호환 (서버 env로 GLM 등 베이스 URL 지정).</div>
    </div>
  );
}
