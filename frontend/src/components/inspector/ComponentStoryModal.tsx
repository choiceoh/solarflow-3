import { useEffect, useRef, useState } from 'react';
import { Maximize2, Smartphone, Tablet, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLastTargetEl } from './inspectorTarget';

interface ComponentStoryModalProps {
  open: boolean;
  onClose: () => void;
}

type Viewport = 'mobile' | 'tablet' | 'full';

const VIEWPORT_WIDTH: Record<Viewport, number> = {
  mobile: 375,
  tablet: 768,
  full: 0, // 0 = 100% (모달 영역 채움)
};

const VIEWPORT_LABEL: Record<Viewport, string> = {
  mobile: '모바일',
  tablet: '태블릿',
  full: '전체',
};

const VIEWPORT_ICON: Record<Viewport, React.ComponentType<{ className?: string }>> = {
  mobile: Smartphone,
  tablet: Tablet,
  full: Maximize2,
};

/**
 * Storybook / Plasmic 의 isolated preview 패턴.
 * 선택된 요소를 모달 안에 *복제* 해 단독 표시. 주변 영향 없음.
 *
 * 한계:
 *   - DOM clone — React 이벤트 핸들러 X (미리보기라 OK)
 *   - body 의 inherited 속성 (font-family 등) 은 모달도 동일 — 시스템과 일관
 *   - viewport 토글로 반응형 미리보기 (모바일/태블릿/전체)
 */
export const ComponentStoryModal = ({ open, onClose }: ComponentStoryModalProps) => {
  const [viewport, setViewport] = useState<Viewport>('full');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 모달 열릴 때 element 복제 → containerRef 안에 삽입
  useEffect(() => {
    if (!open) return;
    const el = getLastTargetEl();
    const container = containerRef.current;
    if (!el || !container) return;
    container.innerHTML = '';
    const clone = el.cloneNode(true) as Element;
    container.appendChild(clone);
    return () => {
      container.innerHTML = '';
    };
  }, [open, viewport]); // viewport 변경 시 다시 렌더

  if (!open) return null;

  const targetWidth = VIEWPORT_WIDTH[viewport];

  return (
    <>
      <button
        type="button"
        data-inspector-ui="true"
        aria-label="단독 미리보기 닫기"
        onClick={onClose}
        className="fixed inset-0 z-[140] bg-black/40 backdrop-blur-sm"
      />
      <div
        data-inspector-ui="true"
        role="dialog"
        aria-label="단독 미리보기"
        className="fixed inset-8 z-[141] flex flex-col rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-900 dark:bg-purple-900/40 dark:text-purple-100">
              단독 미리보기
            </span>
            <span className="text-xs text-slate-400">선택된 요소만 따로 표시 (복제) — 주변 영향 없음</span>
          </div>
          <div className="flex items-center gap-1">
            {(['mobile', 'tablet', 'full'] as Viewport[]).map((v) => {
              const Icon = VIEWPORT_ICON[v];
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setViewport(v)}
                  className={cn(
                    'flex items-center gap-1 rounded border px-2 py-1 text-xs transition',
                    viewport === v
                      ? 'border-purple-500 bg-purple-50 text-purple-900 dark:border-purple-600 dark:bg-purple-900/30 dark:text-purple-100'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
                  )}
                  title={VIEWPORT_LABEL[v]}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {VIEWPORT_LABEL[v]}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="닫기"
              title="닫기 (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div
          className="flex flex-1 items-center justify-center overflow-auto bg-[var(--sf-bg)] p-6"
          style={{ minHeight: 0 }}
        >
          <div
            ref={containerRef}
            style={{
              width: targetWidth > 0 ? `${targetWidth}px` : '100%',
              maxWidth: '100%',
              transition: 'width 200ms ease',
            }}
            className="border border-slate-200 bg-[var(--sf-surface)] p-3 shadow-sm dark:border-slate-700"
          />
        </div>
      </div>
    </>
  );
};
