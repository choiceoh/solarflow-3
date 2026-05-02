import { useEffect } from 'react';
import { useAppStore, type InspectorTarget } from '@/stores/appStore';

const PANEL_WIDTH = 360;

export const InspectorPanel = () => {
  const editMode = useAppStore((s) => s.editMode);
  const inspectorTarget = useAppStore((s) => s.inspectorTarget);

  useEffect(() => {
    if (!editMode) return;
    const prev = document.body.style.paddingRight;
    document.body.style.paddingRight = `${PANEL_WIDTH}px`;
    return () => {
      document.body.style.paddingRight = prev;
    };
  }, [editMode]);

  if (!editMode) return null;

  return (
    <aside
      data-inspector-ui="true"
      className="fixed top-0 right-0 z-[90] h-screen border-l border-amber-300 bg-white shadow-2xl"
      style={{ width: PANEL_WIDTH }}
    >
      <header className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-3">
        <h2 className="text-sm font-semibold text-amber-900">인스펙터</h2>
        <span className="text-xs text-amber-700">읽기 전용 · B-1</span>
      </header>
      <div className="overflow-y-auto p-4 text-sm" style={{ height: 'calc(100vh - 49px)' }}>
        {inspectorTarget ? <TargetInfo target={inspectorTarget} /> : <Placeholder />}
      </div>
    </aside>
  );
};

const Placeholder = () => (
  <div className="space-y-3 text-slate-600">
    <p className="font-medium text-slate-800">편집 모드 활성</p>
    <p className="text-xs leading-relaxed">화면 위 요소를 클릭하면 정보가 표시됩니다.</p>
    <ul className="space-y-1.5 border-t border-slate-200 pt-3 text-xs text-slate-500">
      <li>
        <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono">⌘⇧E</kbd>
        <span className="ml-2">편집 모드 토글</span>
      </li>
      <li>요소 hover — 노란 outline</li>
      <li>요소 클릭 — 정보 표시 + 진한 outline</li>
      <li>
        <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono">Esc</kbd>
        <span className="ml-2">선택 해제</span>
      </li>
      <li className="pt-2 text-slate-400">디자인 토큰 / className 편집 — B-2·B-3 에서</li>
    </ul>
    <p className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
      편집 모드 중에는 페이지 이동·버튼 클릭이 비활성됩니다. 이동하려면 먼저 편집 모드를 종료하세요.
    </p>
  </div>
);

const TargetInfo = ({ target }: { target: InspectorTarget }) => (
  <div className="space-y-3">
    <Field label="태그" value={target.tagName.toLowerCase()} />
    <Field label="selector" value={target.selector} mono />
    <Field label="className" value={target.className} mono multiline />
    {target.configSource && <Field label="config 출처" value={target.configSource} mono />}
    <Field
      label="위치"
      value={`${Math.round(target.rect.left)},${Math.round(target.rect.top)} · ${Math.round(target.rect.width)}×${Math.round(target.rect.height)}`}
    />
  </div>
);

interface FieldProps {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}

const Field = ({ label, value, mono = false, multiline = false }: FieldProps) => (
  <div>
    <div className="text-xs font-medium text-slate-500">{label}</div>
    <div
      className={`mt-0.5 ${mono ? 'font-mono text-xs' : ''} ${
        multiline ? 'whitespace-pre-wrap break-all' : 'truncate'
      }`}
    >
      {value || <span className="text-slate-400">—</span>}
    </div>
  </div>
);
