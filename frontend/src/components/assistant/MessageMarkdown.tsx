import { useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import 'highlight.js/styles/github.css';
import { cn } from '@/lib/utils';

function CodeBlock({
  language,
  className,
  children,
}: {
  language?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    const text = codeRef.current?.textContent ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 권한 거부 등은 조용히 무시
    }
  };
  return (
    <div className="my-2 overflow-hidden rounded-md border border-border bg-muted/30">
      <div className="flex items-center justify-between border-b border-border bg-muted/60 px-3 py-1 text-xs">
        <span className="font-mono text-muted-foreground">{language || 'text'}</span>
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="코드 복사"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? '복사됨' : '복사'}</span>
        </button>
      </div>
      <pre className="overflow-x-auto bg-background p-3 text-xs leading-relaxed">
        <code ref={codeRef} className={className}>
          {children}
        </code>
      </pre>
    </div>
  );
}

const components: Components = {
  // pre 는 패스스루 — 실제 코드블록 렌더링은 code 핸들러에서 (CodeBlock 이 자체 pre 를 가짐).
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '');
    if (match) {
      return (
        <CodeBlock language={match[1]} className={className}>
          {children}
        </CodeBlock>
      );
    }
    // inline 코드
    return (
      <code
        className={cn('rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]', className)}
        {...props}
      >
        {children}
      </code>
    );
  },
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--sf-solar)] underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b-2 border-border px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-border/40 px-2 py-1 align-top">{children}</td>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  h1: ({ children }) => <h1 className="mt-3 mb-2 text-lg font-bold">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-2 text-base font-bold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2 mb-1 text-sm font-bold">{children}</h3>,
  hr: () => <hr className="my-3 border-border" />,
  p: ({ children }) => <p className="leading-relaxed [&:not(:first-child)]:mt-2">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
};

export function MessageMarkdown({ content }: { content: string }) {
  return (
    <div className="break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
