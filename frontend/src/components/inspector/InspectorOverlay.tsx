import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { buildTarget, isInspectorUi, setLastTargetEl } from './inspectorTarget';

interface HoverRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const InspectorOverlay = () => {
  const editMode = useAppStore((s) => s.editMode);
  const inspectorTarget = useAppStore((s) => s.inspectorTarget);
  const setInspectorTarget = useAppStore((s) => s.setInspectorTarget);
  const [hoverRect, setHoverRect] = useState<HoverRect | null>(null);

  useEffect(() => {
    if (!editMode) {
      setHoverRect(null);
      return;
    }

    const onMove = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || isInspectorUi(target)) {
        setHoverRect(null);
        return;
      }
      const r = target.getBoundingClientRect();
      setHoverRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || isInspectorUi(target)) return;
      e.preventDefault();
      e.stopPropagation();
      setLastTargetEl(target instanceof HTMLElement ? target : null);
      setInspectorTarget(buildTarget(target));
      // 좌클릭 시 컨텍스트 메뉴 닫기
      useAppStore.getState().setContextMenuPosition(null);
    };

    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || isInspectorUi(target)) return;
      e.preventDefault();
      setLastTargetEl(target instanceof HTMLElement ? target : null);
      useAppStore.getState().setInspectorTarget(buildTarget(target));
      useAppStore.getState().setContextMenuPosition({ x: e.clientX, y: e.clientY });
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInspectorTarget(null);
        setLastTargetEl(null);
      }
    };

    document.addEventListener('mouseover', onMove);
    document.addEventListener('click', onClick, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mouseover', onMove);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('keydown', onKey);
      setLastTargetEl(null);
    };
  }, [editMode, setInspectorTarget]);

  if (!editMode) return null;

  return (
    <>
      {hoverRect && (
        <div
          data-inspector-ui="true"
          className="pointer-events-none fixed z-[80] border-2 border-amber-400 bg-amber-200/15 transition-[top,left,width,height] duration-75"
          style={{
            top: hoverRect.top,
            left: hoverRect.left,
            width: hoverRect.width,
            height: hoverRect.height,
          }}
        />
      )}
      {inspectorTarget && (
        <div
          data-inspector-ui="true"
          className="pointer-events-none fixed z-[81] border-2 border-amber-600 bg-amber-300/20 shadow-[0_0_0_2px_rgb(245_158_11_/_0.4)]"
          style={{
            top: inspectorTarget.rect.top,
            left: inspectorTarget.rect.left,
            width: inspectorTarget.rect.width,
            height: inspectorTarget.rect.height,
          }}
        />
      )}
    </>
  );
};
