import { useMemo, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { InspectorTarget } from '@/stores/appStore';
import { streamFetchWithAuth } from '@/lib/api';
import { isDevMockApiActive } from '@/lib/devMockApi';

interface AiVariantsPanelProps {
  target: InspectorTarget;
  className: string;
  onApply: (next: string) => void;
}

const PROMPT_HINT = '예: "더 따뜻한 톤", "더 단정하게", "강조 강하게"';

const extractTextFromMessage = (m: UIMessage): string => {
  const parts = (m as unknown as { parts?: Array<{ type: string; text?: string }> }).parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('');
};

const extractVariants = (text: string): string[] => {
  // 백틱 ` ... ` 안의 className 후보를 4개까지 추출.
  // 너무 짧거나 (5자 이하) 너무 긴 (200자 이상) 후보는 제외.
  const matches = Array.from(text.matchAll(/`([^`]+)`/g)).map((m) => m[1].trim());
  const filtered = matches.filter((c) => c.length > 5 && c.length < 200 && !c.includes('\n'));
  return filtered.slice(0, 4);
};

export const AiVariantsPanel = ({ target, className, onApply }: AiVariantsPanelProps) => {
  const [intent, setIntent] = useState('');
  const apiPath = isDevMockApiActive() ? '/api/v1/public/assistant/chat' : '/api/v1/assistant/chat';

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiPath,
        fetch: streamFetchWithAuth,
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            messages: messages.map((m) => ({
              role: m.role,
              content: extractTextFromMessage(m),
            })),
            page_context: {
              path: window.location.pathname,
              selected_element: {
                tag_name: target.tagName,
                class_name: className,
                selector: target.selector,
              },
            },
            ...(body ?? {}),
          },
        }),
      }),
    [apiPath, target.tagName, className, target.selector],
  );

  const { messages, sendMessage, status } = useChat({ transport });

  const variants = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return [];
    return extractVariants(extractTextFromMessage(last));
  }, [messages]);

  const onAsk = () => {
    const trimmed = intent.trim();
    if (!trimmed) return;
    sendMessage({
      role: 'user',
      parts: [
        {
          type: 'text',
          text:
            `이 요소의 className 변형을 *정확히 4개* 제안해주세요. ` +
            `각 변형은 백틱(\`)으로 감싸 한 줄에 표시. ` +
            `제목은 한국어로 짧게 (예: "**1. 따뜻한 쪽**: \`bg-amber-...\`"). ` +
            `사용자 의도: ${trimmed}`,
        },
      ],
    });
  };

  const isLoading = status === 'submitted' || status === 'streaming';

  return (
    <section className="space-y-2 rounded border border-purple-200 bg-purple-50/50 p-2 dark:border-purple-900/40 dark:bg-purple-900/10">
      <header className="flex items-center gap-1.5 text-xs font-semibold text-purple-900 dark:text-purple-200">
        <Sparkles className="h-3.5 w-3.5" />
        AI 에 변형 제안 받기
      </header>
      <div className="flex gap-1">
        <Input
          data-inspector-ui="true"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder={PROMPT_HINT}
          className="h-7 text-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isLoading) {
              e.preventDefault();
              onAsk();
            }
          }}
        />
        <Button
          data-inspector-ui="true"
          type="button"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={onAsk}
          disabled={isLoading || !intent.trim()}
        >
          {isLoading ? '생각 중…' : '제안'}
        </Button>
      </div>
      {variants.length > 0 && (
        <ul className="space-y-1">
          {variants.map((v, i) => (
            <li key={`${i}-${v.slice(0, 12)}`}>
              <button
                data-inspector-ui="true"
                type="button"
                onClick={() => onApply(v)}
                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-left text-[11px] hover:border-purple-400 hover:bg-purple-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-purple-900/20"
              >
                <div className="text-[10px] font-medium text-purple-700 dark:text-purple-300">변형 {i + 1}</div>
                <code className="mt-0.5 block break-all font-mono text-[10px] text-slate-700 dark:text-slate-300">
                  {v}
                </code>
              </button>
            </li>
          ))}
        </ul>
      )}
      {isLoading && variants.length === 0 && (
        <div className="text-[10px] text-slate-500">응답 받는 중…</div>
      )}
    </section>
  );
};

