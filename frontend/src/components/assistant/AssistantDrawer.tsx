import { useEffect, useState } from 'react';
import { Bot, Plus, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import type { UIMessage } from 'ai';
import { ChatBox } from '@/pages/AssistantPage';
import { fetchWithAuth } from '@/lib/api';
import { isDevMockApiActive } from '@/lib/devMockApi';
import { detectPageLabel } from '@/lib/pageContext';
import { getPageChips } from '@/lib/assistantChips';
import { useAppStore } from '@/stores/appStore';

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

const DRAWER_WIDTH = 380;

/**
 * 화면 우측 슬라이드 drawer 안에 ChatBox 임베드.
 * "팝업" 의미에 맞게 가볍게 — 무거운 작업은 /assistant 풀 페이지에서.
 *
 * 헤더 = 2줄:
 *   1줄: 🤖 어시스턴트 · 세션 상태 · [+ 새 대화] [X]
 *   2줄: 📍 {pageLabel} — AI 가 이 화면 인식 중 (라벨 추론 실패 시 생략)
 *
 * 세션:
 * - drawer 가 열릴 때 가장 최근 세션 자동 로드 — 풀 페이지와 동일 backend 세션 공유
 * - "+ 새 대화" 로 빈 세션. 다른 세션 점프는 풀 페이지에서 (팝업은 가볍게)
 * - mock 모드면 세션 비활성
 */
export const AssistantDrawer = ({ open, onClose }: AssistantDrawerProps) => {
  const sessionsEnabled = !isDevMockApiActive();
  const location = useLocation();
  const pageLabel = detectPageLabel(location.pathname) ?? getPageChips(location.pathname).label;
  // M-2: 외부 (ScopePanel 등) 가 prefill 한 첫 입력 — 마운트 시 한번 사용 후 clear
  const initialPrompt = useAppStore((s) => s.assistantDrawerInitialPrompt);
  const setInitialPrompt = useAppStore((s) => s.setAssistantDrawerInitialPrompt);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [chatKey, setChatKey] = useState(0);
  const [loading, setLoading] = useState(false);

  // drawer 가 닫힐 때 initialPrompt clear — 다음 open 때 재사용 안 함
  useEffect(() => {
    if (!open && initialPrompt) {
      setInitialPrompt(null);
    }
  }, [open, initialPrompt, setInitialPrompt]);

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

  const sessionStatusLabel = loading ? '불러오는 중…' : currentSessionId ? '이전 대화 이어서' : '새 대화';

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
        <header className="flex shrink-0 flex-col gap-1 border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Bot className="h-5 w-5 shrink-0 text-[var(--sf-solar)]" aria-hidden />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">어시스턴트</h2>
              <span className="truncate text-xs text-slate-400">{sessionStatusLabel}</span>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
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
          </div>
          {pageLabel && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span aria-hidden>📍</span>
              <span className="truncate">
                <span className="font-medium text-slate-700 dark:text-slate-200">{pageLabel}</span>
                <span className="ml-1.5 text-slate-400">— AI 가 이 화면 인식 중</span>
              </span>
            </div>
          )}
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatBox
            key={chatKey}
            initialMessages={initialMessages}
            sessionId={currentSessionId}
            sessionsEnabled={sessionsEnabled}
            embedded
            initialInput={initialPrompt ?? undefined}
            onSessionUpserted={(s, makeCurrent) => {
              if (makeCurrent) setCurrentSessionId(s.id);
            }}
          />
        </div>
      </aside>
    </>
  );
};
