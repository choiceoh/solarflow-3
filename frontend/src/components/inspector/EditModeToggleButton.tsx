import { Pencil } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';

/**
 * 시스템 관리자(admin) 가 편집 모드로 *진입* 하기 위한 topbar 버튼.
 *
 * - 단축키 ⌘⇧E 외에 마우스 클릭 진입 가능
 * - 편집 모드 ON 시에는 숨김 — 우상단 EditModeBadge 가 종료 담당
 * - admin 외 역할에는 노출 안 함
 */
export const EditModeToggleButton = () => {
  const { role } = useAuth();
  const editMode = useAppStore((s) => s.editMode);
  const toggleEditMode = useAppStore((s) => s.toggleEditMode);

  if (role !== 'admin') return null;
  if (editMode) return null;

  return (
    <button
      type="button"
      onClick={toggleEditMode}
      className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--sf-ink-3)] transition hover:bg-[var(--sf-bg-2)] hover:text-[var(--sf-ink)]"
      title="편집 모드 (⌘⇧E)"
      aria-label="편집 모드 진입"
    >
      <Pencil className="h-4 w-4" />
    </button>
  );
};
