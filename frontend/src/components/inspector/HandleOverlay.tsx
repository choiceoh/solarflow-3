import { useEffect, useState } from 'react';
import type { InspectorTarget } from '@/stores/appStore';
import { detectInScale, SCALES, type ClassNameScale } from './classNameScales';

interface HandleOverlayProps {
  target: InspectorTarget;
  className: string;
  onChange: (next: string) => void;
}

type HandleId = 'padding' | 'rounded';

interface DragSession {
  scale: ClassNameScale;
  startX: number;
  startY: number;
  startIndex: number;
  startClassName: string;
  toast: string;
}

const STEP_PX = 5;

const handleScales: Record<HandleId, string> = {
  padding: 'padding',
  rounded: 'rounded',
};

const handleLabel: Record<HandleId, string> = {
  padding: '안쪽 여백',
  rounded: '모서리 둥글기',
};

const stepLabel = (index: number, total: number): string => {
  if (index === -1) return '미설정';
  if (total <= 1) return '단계 1';
  const pct = (index + 1) / total;
  if (pct <= 0.2) return '아주 작음';
  if (pct <= 0.4) return '작음';
  if (pct <= 0.6) return '보통';
  if (pct <= 0.8) return '큼';
  return '아주 큼';
};

const applyAt = (className: string, scale: ClassNameScale, targetIndex: number): string => {
  const cleaned = className.replace(scale.pattern, '').replace(/\s+/g, ' ').trim();
  const idx = Math.max(0, Math.min(scale.values.length - 1, targetIndex));
  return cleaned ? `${cleaned} ${scale.values[idx]}` : scale.values[idx];
};

export const HandleOverlay = ({ target, className, onChange }: HandleOverlayProps) => {
  const [session, setSession] = useState<DragSession | null>(null);
  const { rect } = target;

  useEffect(() => {
    if (!session) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - session.startX;
      const dy = e.clientY - session.startY;
      // 우하단/좌상단 핸들 모두 *대각선 방향* 으로 단계 증가 — 직관 통일.
      // padding (우하단 핸들): +X+Y → 증가
      // rounded (좌상단 핸들): -X-Y → 증가 (반전)
      const directional = session.scale.id === 'rounded' ? -(dx + dy) : dx + dy;
      const stepDelta = Math.round(directional / 2 / STEP_PX);
      const newIndex = Math.max(0, Math.min(session.scale.values.length - 1, session.startIndex + stepDelta));
      const next = applyAt(session.startClassName, session.scale, newIndex);
      onChange(next);
      setSession((s) =>
        s ? { ...s, toast: `${handleLabel[s.scale.id as HandleId]}: ${stepLabel(newIndex, s.scale.values.length)}` } : s,
      );
    };
    const onUp = () => {
      // 드래그 종료. drafts 기록은 TargetInfo 의 디바운스 effect 에 위임.
      setSession(null);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    // session 이 바뀌어도 이전 핸들러는 cleanup 후 새로 등록 — startClassName/startIndex 가 재캡쳐됨.
  }, [session, onChange]);

  const startDrag = (e: React.MouseEvent, handleId: HandleId) => {
    e.preventDefault();
    e.stopPropagation();
    const scaleKey = handleScales[handleId];
    const scale = SCALES.find((s) => s.id === scaleKey);
    if (!scale) return;
    const detected = detectInScale(className, scale);
    const startIndex = detected.index === -1 ? 0 : detected.index;
    setSession({
      scale,
      startX: e.clientX,
      startY: e.clientY,
      startIndex,
      startClassName: className,
      toast: `${handleLabel[handleId]}: ${stepLabel(startIndex, scale.values.length)}`,
    });
  };

  // 핸들이 보이려면 요소가 화면 안에 있어야. width/height 너무 작으면 핸들 겹침 — 최소 크기 보장.
  if (rect.width < 16 || rect.height < 16) return null;

  // 핸들 위치 — 요소 외곽 모서리. 요소 자체와 살짝 떨어져 보이도록 핸들 가장자리가 모서리에 위치.
  const HANDLE = 12;
  const padding = {
    top: rect.top + rect.height - HANDLE / 2,
    left: rect.left + rect.width - HANDLE / 2,
  };
  const rounded = {
    top: rect.top - HANDLE / 2,
    left: rect.left - HANDLE / 2,
  };

  return (
    <>
      <button
        type="button"
        data-inspector-ui="true"
        onMouseDown={(e) => startDrag(e, 'padding')}
        title="드래그해서 안쪽 여백 조정"
        aria-label="안쪽 여백 핸들"
        className="fixed z-[82] cursor-nwse-resize rounded-full bg-amber-500 ring-2 ring-white shadow-md transition hover:scale-125"
        style={{
          top: padding.top,
          left: padding.left,
          width: HANDLE,
          height: HANDLE,
        }}
      />
      <button
        type="button"
        data-inspector-ui="true"
        onMouseDown={(e) => startDrag(e, 'rounded')}
        title="드래그해서 모서리 둥글기 조정"
        aria-label="모서리 둥글기 핸들"
        className="fixed z-[82] cursor-nwse-resize rounded-full bg-amber-400 ring-2 ring-white shadow-md transition hover:scale-125"
        style={{
          top: rounded.top,
          left: rounded.left,
          width: HANDLE,
          height: HANDLE,
        }}
      />
      {session?.toast && (
        <div
          data-inspector-ui="true"
          className="pointer-events-none fixed z-[83] -translate-x-1/2 rounded bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg"
          style={{
            top: rect.top - 32,
            left: rect.left + rect.width / 2,
          }}
        >
          {session.toast}
        </div>
      )}
    </>
  );
};
