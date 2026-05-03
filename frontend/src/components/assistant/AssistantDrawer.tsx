import { useEffect, useRef, useState } from 'react';
import { Bot, ChevronDown, Maximize2, Minimize2, MessageSquare, Plus, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { UIMessage } from 'ai';
import { ChatBox } from '@/pages/AssistantPage';
import { fetchWithAuth } from '@/lib/api';
import { isDevMockApiActive } from '@/lib/devMockApi';
import { detectPageLabel } from '@/lib/pageContext';
import { getPageChips } from '@/lib/assistantChips';

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

const DRAWER_WIDTH_DEFAULT = 460;
const DRAWER_WIDTH_EXPANDED = 800;
const STORAGE_EXPANDED = 'solarflow.assistant.drawer.expanded';
const SESSIONS_POPOVER_LIMIT = 5;

/**
 * 화면 우측 슬라이드 drawer 안에 ChatBox 임베드.
 * 페이지 전환 없이 현재 화면 그 자리에서 어시스턴트 사용.
 *
 * 헤더 = 2줄 (b안):
 *   1줄: 🤖 어시스턴트  · "이전 대화 이어서" 토글  · [+ 새 대화] [⤢] [X]
 *   2줄: 📍 {pageLabel} — AI 가 이 화면을 인식 중
 *        (라벨 추론 실패 시 2줄 자체 생략 — 노이즈 ↓)
 *
 * 세션 정책:
 * - drawer 가 열릴 때 세션 목록 fetch → 가장 최근 자동 로드 + 최근 5개 popover 캐시
 * - 풀 /assistant 페이지와 동일 backend 세션 사용 — 양쪽 모두 영속
 * - "+ 새 대화" 로 빈 세션, "이전 대화 ▾" popover 로 다른 세션 점프
 * - mock 모드면 세션 비활성
 */
export const AssistantDrawer = ({ open, onClose }: AssistantDrawerProps) => {
  const sessionsEnabled = !isDevMockApiActive();
  const location = useLocation();
  const navigate = useNavigate();
  const pageLabel = detectPageLabel(location.pathname) ?? getPageChips(location.pathname).label;
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [chatKey, setChatKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const sessionsAnchorRef = useRef<HTMLButtonElement>(null);

  // 폭 토글 — localStorage 영속.
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_EXPANDED) === '1';
  });
  const drawerWidth = expanded ? DRAWER_WIDTH_EXPANDED : DRAWER_WIDTH_DEFAULT;
  const toggleExpanded = () => {
    setExpanded((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(STORAGE_EXPANDED, next ? '1' : '0');
      } catch {
        // localStorage 차단 환경 무시
      }
      return next;
    });
  };

  // drawer 가 열릴 때 세션 목록 + 마지막 세션 자동 로드.
  useEffect(() => {
    if (!open || !sessionsEnabled) return;
    let cancelled = false;
    const loadLatest = async () => {
      setLoading(true);
      try {
        const list = await fetchWithAuth<SessionSummary[]>('/api/v1/assistant/sessions');
        if (cancelled) return;
        const safeList = Array.isArray(list) ? list : [];
        setSessions(safeList);
        if (safeList.length === 0) {
          setCurrentSessionId(null);
          setInitialMessages([]);
          setChatKey((k) => k + 1);
          return;
        }
        const latest = safeList[0];
        const detail = await fetchWithAuth<SessionDetail>(`/api/v1/assistant/sessions/${latest.id}`);
        if (cancelled) return;
        setCurrentSessionId(detail.id);
        setInitialMessages(Array.isArray(detail.messages) ? detail.messages : []);
        setChatKey((k) => k + 1);
      } catch {
        if (!cancelled) {
          setSessions([]);
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

  // Esc 닫기. popover 가 열려 있으면 popover 만 닫음.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (sessionsOpen) {
        setSessionsOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, sessionsOpen]);

  // popover outside-click 닫기.
  useEffect(() => {
    if (!sessionsOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (sessionsAnchorRef.current?.contains(target)) return;
      const popover = document.getElementById('assistant-sessions-popover');
      if (popover?.contains(target)) return;
      setSessionsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [sessionsOpen]);

  const startNew = () => {
    setCurrentSessionId(null);
    setInitialMessages([]);
    setChatKey((k) => k + 1);
    setSessionsOpen(false);
  };

  const loadSession = async (id: string) => {
    if (id === currentSessionId) {
      setSessionsOpen(false);
      return;
    }
    setSessionsOpen(false);
    setLoading(true);
    try {
      const detail = await fetchWithAuth<SessionDetail>(`/api/v1/assistant/sessions/${id}`);
      setCurrentSessionId(detail.id);
      setInitialMessages(Array.isArray(detail.messages) ? detail.messages : []);
      setChatKey((k) => k + 1);
    } catch {
      // 실패 시 현 세션 유지
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const sessionStatusLabel = loading ? '불러오는 중…' : currentSessionId ? '이전 대화 이어서' : '새 대화';
  const recentSessions = sessions.slice(0, SESSIONS_POPOVER_LIMIT);

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
        className="fixed top-0 right-0 z-[111] flex h-screen flex-col border-l border-slate-200 bg-white shadow-2xl transition-[width] duration-150 dark:border-slate-700 dark:bg-slate-900"
        style={{ width: drawerWidth }}
      >
        <header className="flex shrink-0 flex-col gap-1 border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Bot className="h-5 w-5 shrink-0 text-[var(--sf-solar)]" aria-hidden />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">어시스턴트</h2>
              {sessionsEnabled ? (
                <button
                  ref={sessionsAnchorRef}
                  type="button"
                  onClick={() => setSessionsOpen((v) => !v)}
                  className="flex items-center gap-0.5 truncate rounded px-1 text-xs text-slate-500 underline decoration-dotted underline-offset-2 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-haspopup="menu"
                  aria-expanded={sessionsOpen}
                  title="이전 대화 목록"
                >
                  <span className="truncate">{sessionStatusLabel}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
                </button>
              ) : (
                <span className="truncate text-xs text-slate-400">{sessionStatusLabel}</span>
              )}
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
                onClick={toggleExpanded}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label={expanded ? '드로어 축소' : '드로어 확장'}
                title={expanded ? '축소' : '확장'}
              >
                {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
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
        {sessionsOpen && (
          <div className="relative">
            <div
              id="assistant-sessions-popover"
              className="absolute left-3 right-3 top-1 z-[112] max-h-80 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
            >
              {recentSessions.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-slate-400">저장된 대화 없음</div>
              ) : (
                <ul className="py-1">
                  {recentSessions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => void loadSession(s.id)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700 ${
                          s.id === currentSessionId ? 'bg-[var(--sf-solar)]/10 text-[var(--sf-solar)]' : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <MessageSquare className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
                        <span className="truncate">{s.title || '새 대화'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setSessionsOpen(false);
                    onClose();
                    navigate('/assistant');
                  }}
                  className="block w-full px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                >
                  전체 보기 →
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatBox
            key={chatKey}
            initialMessages={initialMessages}
            sessionId={currentSessionId}
            sessionsEnabled={sessionsEnabled}
            embedded
            onSessionUpserted={(s, makeCurrent) => {
              setSessions((prev) => [s, ...prev.filter((x) => x.id !== s.id)]);
              if (makeCurrent) setCurrentSessionId(s.id);
            }}
          />
        </div>
      </aside>
    </>
  );
};
