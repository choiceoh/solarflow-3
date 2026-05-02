import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { UIMessage } from 'ai';
import { ChatBox } from '@/pages/AssistantPage';
import { fetchWithAuth } from '@/lib/api';
import { isDevMockApiActive } from '@/lib/devMockApi';

interface AssistantDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface SessionSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface SessionDetail extends SessionSummary {
  messages: UIMessage[];
}

const DRAWER_WIDTH = 460;

/**
 * 화면 우측 슬라이드 drawer 안에 ChatBox 임베드.
 * 페이지 전환 없이 현재 화면 그 자리에서 어시스턴트 사용.
 *
 * 세션 정책:
 * - drawer 가 열릴 때 세션 목록 fetch → 가장 최근 (updated_at desc 첫 번째) 자동 로드
 * - 풀 /assistant 페이지와 동일 backend 세션 사용 — drawer/풀 페이지에서 한 대화가 양쪽 모두 영속
 * - "새 대화" 버튼으로 빈 세션 시작 가능
 * - 단 mock 모드 (isDevMockApiActive) 면 세션 비활성
 */
export const AssistantDrawer = ({ open, onClose }: AssistantDrawerProps) => {
  const sessionsEnabled = !isDevMockApiActive();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [chatKey, setChatKey] = useState(0);
  const [loading, setLoading] = useState(false);

  // drawer 가 열릴 때 마지막 세션 자동 로드. 닫혀 있으면 fetch 안 함.
  useEffect(() => {
    if (!open || !sessionsEnabled) return;
    let cancelled = false;
    const loadLatest = async () => {
      setLoading(true);
      try {
        const list = await fetchWithAuth<SessionSummary[]>('/api/v1/assistant/sessions');
        if (cancelled) return;
        if (!Array.isArray(list) || list.length === 0) {
          setCurrentSessionId(null);
          setInitialMessages([]);
          setChatKey((k) => k + 1);
          return;
        }
        // backend 가 updated_at desc 정렬해 반환. 첫 번째가 최신.
        const latest = list[0];
        const detail = await fetchWithAuth<SessionDetail>(`/api/v1/assistant/sessions/${latest.id}`);
        if (cancelled) return;
        setCurrentSessionId(detail.id);
        setInitialMessages(Array.isArray(detail.messages) ? detail.messages : []);
        setChatKey((k) => k + 1);
      } catch {
        if (!cancelled) {
          setCurrentSessionId(null);
          setInitialMessages([]);
          setChatKey((k) => k + 1);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadLatest();
    return () => {
      cancelled = true;
    };
  }, [open, sessionsEnabled]);

  // Esc 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const startNew = () => {
    setCurrentSessionId(null);
    setInitialMessages([]);
    setChatKey((k) => k + 1);
  };

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
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              AI
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">어시스턴트</h2>
            {loading ? (
              <span className="text-xs text-slate-400">불러오는 중…</span>
            ) : (
              <span className="truncate text-xs text-slate-400">
                {currentSessionId ? '이전 대화 이어서' : '새 대화'}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={startNew}
              disabled={loading}
              className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              title="새 대화 시작"
            >
              <Plus className="h-3.5 w-3.5" />
              새 대화
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="닫기"
              title="닫기 (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatBox
            key={chatKey}
            initialMessages={initialMessages}
            sessionId={currentSessionId}
            sessionsEnabled={sessionsEnabled}
            onSessionUpserted={(s, makeCurrent) => {
              if (makeCurrent) setCurrentSessionId(s.id);
            }}
          />
        </div>
      </aside>
    </>
  );
};
