import { useEffect } from 'react';
import { X } from 'lucide-react';
import { ChatBox } from '@/pages/AssistantPage';

interface AssistantDrawerProps {
  open: boolean;
  onClose: () => void;
}

const DRAWER_WIDTH = 460;

/**
 * 화면 우측 슬라이드 drawer 안에 ChatBox 임베드.
 * 페이지 전환 없이 현재 화면 그 자리에서 어시스턴트 사용.
 *
 * 1차 PR: 매번 새 대화 (세션 비활성). 본인 세션 관리는 /assistant 풀 페이지 그대로 유지.
 */
export const AssistantDrawer = ({ open, onClose }: AssistantDrawerProps) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="어시스턴트 닫기"
        onClick={onClose}
        className="fixed inset-0 z-[110] bg-black/20 backdrop-blur-[1px] transition-opacity"
      />
      <aside
        role="dialog"
        aria-label="AI 어시스턴트"
        className="fixed top-0 right-0 z-[111] flex h-screen flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        style={{ width: DRAWER_WIDTH }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              AI
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">어시스턴트</h2>
            <span className="text-xs text-slate-400">현재 화면 위에서 대화</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="닫기"
            title="닫기 (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatBox
            initialMessages={[]}
            sessionId={null}
            sessionsEnabled={false}
            onSessionUpserted={() => {
              /* drawer 에선 세션 관리 안 함. 본격 세션은 /assistant 풀 페이지에서. */
            }}
          />
        </div>
      </aside>
    </>
  );
};
