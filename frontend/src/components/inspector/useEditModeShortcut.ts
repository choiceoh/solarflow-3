import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';

const isEditableTarget = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

export const useEditModeShortcut = () => {
  const toggleEditMode = useAppStore((s) => s.toggleEditMode);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || !e.shiftKey) return;
      if (e.key.toLowerCase() !== 'e') return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      toggleEditMode();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleEditMode]);
};
