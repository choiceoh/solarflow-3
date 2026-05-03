import { Copy, GitCompare, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAppStore, type ClassNameDraft } from '@/stores/appStore';
import { VariantsDiffModal } from './VariantsDiffModal';

const formatDraft = (d: ClassNameDraft): string =>
  `[${d.tagName.toLowerCase()}] ${d.selector}\n  before: "${d.before}"\n  after:  "${d.after}"`;

const formatAll = (drafts: ClassNameDraft[]): string => {
  const header = `${drafts.length} 건의 className 변경 (SolarFlow 인스펙터):\n`;
  return `${header}\n${drafts.map((d, i) => `[${i + 1}] ${formatDraft(d)}`).join('\n\n')}`;
};

const copy = async (text: string, setStatus: (s: string) => void) => {
  try {
    await navigator.clipboard.writeText(text);
    setStatus('복사됨');
    window.setTimeout(() => setStatus(''), 1200);
  } catch {
    setStatus('실패');
    window.setTimeout(() => setStatus(''), 1200);
  }
};

export const DraftsList = () => {
  const drafts = useAppStore((s) => s.classNameDrafts);
  const removeClassNameDraft = useAppStore((s) => s.removeClassNameDraft);
  const clearClassNameDrafts = useAppStore((s) => s.clearClassNameDrafts);
  const [status, setStatus] = useState('');
  const [diffDraft, setDiffDraft] = useState<ClassNameDraft | null>(null);

  if (drafts.length === 0) return null;

  return (
    <section className="rounded border border-slate-200 bg-slate-50 p-2">
      <header className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-700">변경 사항 ({drafts.length})</div>
        <div className="flex items-center gap-2">
          {status && <span className="text-[10px] text-emerald-700">{status}</span>}
          <button
            type="button"
            onClick={() => copy(formatAll(drafts), setStatus)}
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-100"
            title="모두 클립보드에 복사 (AI 에 붙여넣기)"
          >
            <Copy className="h-3 w-3" />
            전체 복사
          </button>
          <button
            type="button"
            onClick={clearClassNameDrafts}
            className="rounded border border-rose-200 bg-white px-1.5 py-0.5 text-[10px] text-rose-700 hover:bg-rose-50"
          >
            모두 지우기
          </button>
        </div>
      </header>
      <ul className="space-y-2">
        {drafts.map((d) => (
          <li key={d.id} className="rounded border border-slate-200 bg-white p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[10px] text-slate-600">
                  <span className="text-slate-400">[{d.tagName.toLowerCase()}]</span> {d.selector}
                </div>
                <div className="mt-1 space-y-0.5">
                  <div className="break-all font-mono text-[10px] text-rose-700">
                    <span className="text-rose-400">- </span>
                    {d.before || <em className="text-slate-300">(빈 className)</em>}
                  </div>
                  <div className="break-all font-mono text-[10px] text-emerald-700">
                    <span className="text-emerald-400">+ </span>
                    {d.after || <em className="text-slate-300">(빈 className)</em>}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setDiffDraft(d)}
                  className="rounded p-1 text-slate-400 hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-900/20 dark:hover:text-purple-300"
                  title="변경 전·후 시각 비교"
                  aria-label="변경 전·후 시각 비교"
                >
                  <GitCompare className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => copy(formatDraft(d), setStatus)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="이 항목 복사"
                  aria-label="이 항목 복사"
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => removeClassNameDraft(d.id)}
                  className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                  title="이 항목 지우기"
                  aria-label="이 항목 지우기"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-1.5 text-[10px] text-amber-800">
        변경 목록은 자동 저장되며, 새로고침 후에도 selector 매칭으로 자동 재적용됩니다.
        영구 반영(모든 사용자)은 "전체 복사" → AI 에 붙여 메타 config 갱신.
      </p>
      <VariantsDiffModal draft={diffDraft} onClose={() => setDiffDraft(null)} />
    </section>
  );
};
