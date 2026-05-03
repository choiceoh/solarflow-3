import { useEffect } from 'react';
import { ChevronDown, ChevronUp, Clipboard, Copy, MousePointerClick } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { applyScaleStep, SCALES, type ClassNameScale } from './classNameScales';
import { getLastTargetEl } from './inspectorTarget';
import { buildTarget } from './inspectorTarget';

const findScale = (id: string): ClassNameScale | undefined => SCALES.find((s) => s.id === id);

export const ContextMenuOverlay = () => {
  const editMode = useAppStore((s) => s.editMode);
  const position = useAppStore((s) => s.contextMenuPosition);
  const setPosition = useAppStore((s) => s.setContextMenuPosition);
  const copiedClassName = useAppStore((s) => s.copiedClassName);
  const setCopiedClassName = useAppStore((s) => s.setCopiedClassName);
  const recordClassNameDraft = useAppStore((s) => s.recordClassNameDraft);
  const setInspectorTarget = useAppStore((s) => s.setInspectorTarget);
  const pseudoState = useAppStore((s) => s.inspectorPseudoState);

  // Esc / 외부 클릭 → 닫기
  useEffect(() => {
    if (!position) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPosition(null);
    };
    const onWindowClick = () => setPosition(null);
    window.addEventListener('keydown', onKey);
    // capture 단계에서 등록 — 메뉴 항목 클릭은 stopPropagation 으로 이 핸들러 차단
    document.addEventListener('click', onWindowClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onWindowClick);
    };
  }, [position, setPosition]);

  if (!editMode || !position) return null;

  const applyStep = (scaleId: string, delta: number) => {
    const el = getLastTargetEl();
    const scale = findScale(scaleId);
    if (!el || !scale) return;
    const before = el.className;
    const after = applyScaleStep(before, scale, delta, pseudoState);
    el.className = after;
    // store 의 inspectorTarget 갱신 (rect + className)
    const t = buildTarget(el);
    setInspectorTarget(t);
    recordClassNameDraft({ selector: t.selector, tagName: t.tagName, before, after });
    setPosition(null);
  };

  const onCopyStyle = () => {
    const el = getLastTargetEl();
    if (!el) return;
    setCopiedClassName(el.className);
    setPosition(null);
  };

  const onPasteStyle = () => {
    const el = getLastTargetEl();
    if (!el || !copiedClassName) return;
    const before = el.className;
    el.className = copiedClassName;
    const t = buildTarget(el);
    setInspectorTarget(t);
    recordClassNameDraft({ selector: t.selector, tagName: t.tagName, before, after: copiedClassName });
    setPosition(null);
  };

  // 화면 가장자리 보정 — 메뉴가 viewport 밖으로 안 나가게
  const MENU_W = 220;
  const MENU_H = 360;
  const left = Math.min(position.x, window.innerWidth - MENU_W - 8);
  const top = Math.min(position.y, window.innerHeight - MENU_H - 8);

  return (
    <div
      data-inspector-ui="true"
      className="fixed z-[120] w-56 rounded-md border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      style={{ top, left }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuHeader icon={<MousePointerClick className="h-3.5 w-3.5" />} label="이 요소 조정" />
      <ChipPair label="안쪽 여백" onUp={() => applyStep('padding', +1)} onDown={() => applyStep('padding', -1)} />
      <ChipPair label="모서리 둥글기" onUp={() => applyStep('rounded', +1)} onDown={() => applyStep('rounded', -1)} />
      <ChipPair label="글자 크기" onUp={() => applyStep('fontSize', +1)} onDown={() => applyStep('fontSize', -1)} />
      <ChipPair label="글자 굵기" onUp={() => applyStep('fontWeight', +1)} onDown={() => applyStep('fontWeight', -1)} />
      <ChipPair label="그림자" onUp={() => applyStep('shadow', +1)} onDown={() => applyStep('shadow', -1)} />
      <Divider />
      <MenuItem icon={<Copy className="h-3.5 w-3.5" />} label="스타일 복사" onClick={onCopyStyle} />
      <MenuItem
        icon={<Clipboard className="h-3.5 w-3.5" />}
        label={copiedClassName ? '스타일 붙이기' : '스타일 붙이기 (복사 안 됨)'}
        onClick={onPasteStyle}
        disabled={!copiedClassName}
      />
    </div>
  );
};

const MenuHeader = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
    {icon}
    {label}
  </div>
);

interface ChipPairProps {
  label: string;
  onUp: () => void;
  onDown: () => void;
}

const ChipPair = ({ label, onUp, onDown }: ChipPairProps) => (
  <div className="flex items-center gap-1 px-2 py-0.5">
    <span className="flex-1 truncate text-xs text-slate-700 dark:text-slate-200">{label}</span>
    <button
      type="button"
      onClick={onDown}
      className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800"
      aria-label={`${label} 줄이기`}
      title={`${label} 줄이기`}
    >
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
    <button
      type="button"
      onClick={onUp}
      className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800"
      aria-label={`${label} 키우기`}
      title={`${label} 키우기`}
    >
      <ChevronUp className="h-3.5 w-3.5" />
    </button>
  </div>
);

const Divider = () => <div className="my-1 border-t border-slate-200 dark:border-slate-700" />;

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

const MenuItem = ({ icon, label, onClick, disabled = false }: MenuItemProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800"
  >
    {icon}
    {label}
  </button>
);
