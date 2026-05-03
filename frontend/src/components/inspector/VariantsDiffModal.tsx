import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { ClassNameDraft } from '@/stores/appStore';
import { getLastTargetEl } from './inspectorTarget';

interface VariantsDiffModalProps {
  draft: ClassNameDraft | null;
  onClose: () => void;
}

/**
 * 변경 전 / 변경 후 시각 비교 모달.
 * 현재 선택된 element 를 두 번 cloneNode → 각각 before/after className 적용 → 사이드 바이 사이드.
 */
export const VariantsDiffModal = ({ draft, onClose }: VariantsDiffModalProps) => {
  const beforeRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, onClose]);

  useEffect(() => {
    if (!draft) return;
    const el = getLastTargetEl();
    const beforeC = beforeRef.current;
    const afterC = afterRef.current;
    if (!el || !beforeC || !afterC) return;

    const beforeClone = el.cloneNode(true) as Element;
    beforeClone.className = draft.before;
    const afterClone = el.cloneNode(true) as Element;
    afterClone.className = draft.after;

    beforeC.innerHTML = '';
    beforeC.appendChild(beforeClone);
    afterC.innerHTML = '';
    afterC.appendChild(afterClone);

    return () => {
      beforeC.innerHTML = '';
      afterC.innerHTML = '';
    };
  }, [draft]);

  if (!draft) return null;

  return (
    <>
      <button
        type="button"
        data-inspector-ui="true"
        aria-label="비교 닫기"
        onClick={onClose}
        className="fixed inset-0 z-[140] bg-black/40 backdrop-blur-sm"
      />
      <div
        data-inspector-ui="true"
        role="dialog"
        aria-label="변경 전·후 비교"
        className="fixed inset-8 z-[141] flex flex-col rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-900 dark:bg-purple-900/40 dark:text-purple-100">
              변경 전·후 비교
            </span>
            <code className="font-mono text-[10px] text-slate-500">{draft.selector}</code>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="닫기"
            title="닫기 (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="grid flex-1 grid-cols-2 gap-2 overflow-auto bg-[var(--sf-bg)] p-3" style={{ minHeight: 0 }}>
          <div className="flex flex-col">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
                이전
              </span>
              <code className="truncate font-mono text-[10px] text-slate-500">{draft.before || '(빈 className)'}</code>
            </div>
            <div className="flex flex-1 items-center justify-center rounded border border-rose-200 bg-[var(--sf-surface)] p-3 dark:border-rose-700/40">
              <div ref={beforeRef} />
            </div>
          </div>
          <div className="flex flex-col">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                이후
              </span>
              <code className="truncate font-mono text-[10px] text-slate-500">{draft.after || '(빈 className)'}</code>
            </div>
            <div className="flex flex-1 items-center justify-center rounded border border-emerald-200 bg-[var(--sf-surface)] p-3 dark:border-emerald-700/40">
              <div ref={afterRef} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
