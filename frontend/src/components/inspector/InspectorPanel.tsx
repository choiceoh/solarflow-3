import { useEffect, useState } from 'react';
import { useAppStore, type InspectorMode, type InspectorTarget } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import { Maximize2 } from 'lucide-react';
import { ActionChips } from './ActionChips';
import { AiVariantsPanel } from './AiVariantsPanel';
import { ComponentStoryModal } from './ComponentStoryModal';
import { HandleOverlay } from './HandleOverlay';
import { LayerPanel } from './LayerPanel';
import { PreviewRolePanel } from './PreviewRolePanel';
import { PseudoStateTabs } from './PseudoStateTabs';
import { TokenPanel } from './TokenPanel';
import { DraftsList } from './DraftsList';
import { getLastTargetEl } from './inspectorTarget';
import { tagLabel } from './tagLabel';

const PANEL_WIDTH = 360;

export const InspectorPanel = () => {
  const editMode = useAppStore((s) => s.editMode);
  const inspectorTarget = useAppStore((s) => s.inspectorTarget);
  const inspectorMode = useAppStore((s) => s.inspectorMode);
  const setInspectorMode = useAppStore((s) => s.setInspectorMode);

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
      <header className="border-b border-amber-200 bg-amber-50 px-4 pt-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-amber-900">인스펙터</h2>
          <span className="text-xs text-amber-700">B-1·B-2·B-3</span>
        </div>
        <div className="-mb-px mt-2 flex gap-1 text-xs">
          <ModeTab mode="element" current={inspectorMode} onClick={setInspectorMode}>
            요소
          </ModeTab>
          <ModeTab mode="structure" current={inspectorMode} onClick={setInspectorMode}>
            구조
          </ModeTab>
          <ModeTab mode="token" current={inspectorMode} onClick={setInspectorMode}>
            디자인 토큰
          </ModeTab>
        </div>
      </header>
      <div className="overflow-y-auto p-4 text-sm" style={{ height: 'calc(100vh - 73px)' }}>
        {inspectorMode === 'element' && <ElementMode target={inspectorTarget} />}
        {inspectorMode === 'structure' && <LayerPanel />}
        {inspectorMode === 'token' && <TokenPanel />}
      </div>
    </aside>
  );
};

interface ModeTabProps {
  mode: InspectorMode;
  current: InspectorMode;
  onClick: (mode: InspectorMode) => void;
  children: React.ReactNode;
}

const ModeTab = ({ mode, current, onClick, children }: ModeTabProps) => (
  <button
    type="button"
    onClick={() => onClick(mode)}
    className={cn(
      'border-b-2 px-2 pb-1.5 transition',
      current === mode
        ? 'border-amber-600 font-medium text-amber-900'
        : 'border-transparent text-amber-700/70 hover:text-amber-900',
    )}
  >
    {children}
  </button>
);

const ElementMode = ({ target }: { target: InspectorTarget | null }) => (
  <div className="space-y-4">
    {target ? <TargetInfo target={target} /> : <Placeholder />}
    <DraftsList />
  </div>
);

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
      <li>요소 클릭 — 정보 표시 + className 편집 가능</li>
      <li>
        <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono">Esc</kbd>
        <span className="ml-2">선택 해제</span>
      </li>
      <li className="pt-2 text-slate-400">상단 "디자인 토큰" 탭 — 색·간격·모서리 슬라이더</li>
    </ul>
    <p className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
      편집 모드 중에는 페이지 이동·버튼 클릭이 비활성됩니다. 이동하려면 먼저 편집 모드를 종료하세요.
    </p>
  </div>
);

const TargetInfo = ({ target }: { target: InspectorTarget }) => {
  const [draft, setDraft] = useState(target.className);
  const [storyOpen, setStoryOpen] = useState(false);

  useEffect(() => {
    setDraft(target.className);
  }, [target.className]);

  useEffect(() => {
    const el = getLastTargetEl();
    if (!el) return;
    el.className = draft;
    // 드래그 핸들이 element 의 최신 위치를 따라가도록 rect 동기화 — 다음 frame 에서 측정.
    // requestAnimationFrame 으로 layout 반영 후 측정.
    const rafId = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      useAppStore.getState().setInspectorTarget({
        ...target,
        className: draft,
        rect: { top: r.top, left: r.left, width: r.width, height: r.height },
      });
    });
    const t = window.setTimeout(() => {
      useAppStore.getState().recordClassNameDraft({
        selector: target.selector,
        tagName: target.tagName,
        before: target.className,
        after: draft,
      });
    }, 300);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(rafId);
    };
  }, [draft, target.selector, target.tagName, target.className]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            선택된 요소
          </div>
          <div className="text-sm font-medium text-slate-800">{tagLabel(target.tagName)}</div>
        </div>
        <div className="flex items-center gap-1">
          {target.configSource && (
            <span
              className="truncate rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
              title={target.configSource}
            >
              메타: {target.configSource}
            </span>
          )}
          <button
            type="button"
            onClick={() => setStoryOpen(true)}
            className="flex items-center gap-1 rounded border border-purple-300 bg-white px-1.5 py-0.5 text-[10px] text-purple-700 hover:bg-purple-50 dark:border-purple-700/40 dark:bg-slate-800 dark:text-purple-300"
            title="이 요소만 단독 미리보기 (모달)"
          >
            <Maximize2 className="h-3 w-3" />
            단독 보기
          </button>
        </div>
      </div>
      <ComponentStoryModal open={storyOpen} onClose={() => setStoryOpen(false)} />
      <PreviewRolePanel />
      <PseudoStateTabs />
      <ActionChips className={draft} onChange={setDraft} />
      <HandleOverlay target={target} className={draft} onChange={setDraft} />
      <AiVariantsPanel target={target} className={draft} onApply={setDraft} />
      <details
        data-inspector-ui="true"
        className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
      >
        <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-800">
          고급 — className 직접 편집 / selector / 위치
        </summary>
        <div className="mt-2 space-y-2">
          <div>
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium text-slate-500">className</div>
              {draft !== target.className && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  미적용
                </span>
              )}
            </div>
            <textarea
              data-inspector-ui="true"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className="mt-0.5 w-full resize-y rounded border border-slate-300 bg-slate-50 p-1.5 font-mono text-[11px] leading-snug focus:border-amber-400 focus:bg-white focus:outline-none"
              rows={4}
            />
          </div>
          <Field label="selector" value={target.selector} mono />
          <Field
            label="위치"
            value={`${Math.round(target.rect.left)},${Math.round(target.rect.top)} · ${Math.round(target.rect.width)}×${Math.round(target.rect.height)}`}
          />
        </div>
      </details>
    </div>
  );
};

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
