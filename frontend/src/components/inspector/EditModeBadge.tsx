import { Pencil, X } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';

export const EditModeBadge = () => {
  const editMode = useAppStore((s) => s.editMode);
  const toggleEditMode = useAppStore((s) => s.toggleEditMode);

  if (!editMode) return null;

  return (
    <button
      data-inspector-ui="true"
      type="button"
      onClick={toggleEditMode}
      className="fixed top-3 right-3 z-[100] flex items-center gap-2 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg transition hover:bg-amber-600"
      aria-label="편집 모드 종료"
    >
      <Pencil className="h-3.5 w-3.5" />
      <span>편집 모드 · Cmd+Shift+E</span>
      <X className="h-3.5 w-3.5 opacity-70" />
    </button>
  );
};
