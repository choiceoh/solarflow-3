import { useEffect } from 'react';
import { Bot } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { AssistantDrawer } from './AssistantDrawer';

/**
 * 우하단 floating 버튼 — 클릭 시 어시스턴트 drawer 열기.
 * 단축키 ⌘. (Cmd+Period) — 빠른 호출.
 *
 * 권한: admin only — 일반 사용자에게는 /assistant 사이드바 메뉴로 충분.
 *
 * drawer open 상태는 store 에 lift.
 */
export const FloatingAssistantButton = () => {
  const { role } = useAuth();
  const open = useAppStore((s) => s.assistantDrawerOpen);
  const setOpen = useAppStore((s) => s.setAssistantDrawerOpen);

  useEffect(() => {
    if (role !== 'admin') return;
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || e.key !== '.') return;
      e.preventDefault();
      setOpen(!useAppStore.getState().assistantDrawerOpen);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [role, setOpen]);

  if (role !== 'admin') return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[105] flex h-12 w-12 items-center justify-center rounded-full bg-[var(--sf-solar)] text-white shadow-lg transition hover:bg-[var(--sf-solar-2)] hover:shadow-xl"
          title="AI 어시스턴트 (⌘.)"
          aria-label="AI 어시스턴트 열기"
        >
          <Bot className="h-5 w-5" />
        </button>
      )}
      <AssistantDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
};
