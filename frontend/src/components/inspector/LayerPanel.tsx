import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { buildTarget, getLastTargetEl, setLastTargetEl } from './inspectorTarget';
import { tagLabel } from './tagLabel';

const MAX_PARENTS = 10;
const MAX_CHILDREN = 30;

interface LayerEntry {
  el: Element;
  depth: number;
  isCurrent: boolean;
}

const buildParentChain = (el: Element): Element[] => {
  const chain: Element[] = [];
  let cur: Element | null = el;
  while (cur && chain.length < MAX_PARENTS) {
    chain.push(cur);
    if (cur.tagName === 'BODY') break;
    cur = cur.parentElement;
  }
  return chain.reverse(); // root → leaf
};

const isInspectorUiTree = (el: Element): boolean => {
  let cur: Element | null = el;
  while (cur) {
    if (cur instanceof HTMLElement && cur.dataset.inspectorUi === 'true') return true;
    cur = cur.parentElement;
  }
  return false;
};

const childElements = (el: Element): Element[] => {
  const list: Element[] = [];
  for (const child of Array.from(el.children)) {
    if (isInspectorUiTree(child)) continue;
    list.push(child);
    if (list.length >= MAX_CHILDREN) break;
  }
  return list;
};

const elementShortLabel = (el: Element): string => {
  const tag = tagLabel(el.tagName);
  if (el instanceof HTMLElement) {
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
    if (text) return `${tag} · "${text}"`;
  }
  return tag;
};

export const LayerPanel = () => {
  const inspectorTarget = useAppStore((s) => s.inspectorTarget);
  const setInspectorTarget = useAppStore((s) => s.setInspectorTarget);
  const [refreshKey, setRefreshKey] = useState(0);

  // inspectorTarget 변경 시 chain/children 재계산을 강제하기 위한 기준점
  // (DOM 자체는 mutate 가능하므로 inspectorTarget reference 변경을 trigger 로 사용)
  useEffect(() => {
    setRefreshKey((k) => k + 1);
  }, [inspectorTarget]);

  const targetEl = getLastTargetEl();
  if (!inspectorTarget || !targetEl) {
    return (
      <div className="space-y-3 text-slate-600">
        <p className="text-xs leading-relaxed">화면 위 요소를 먼저 클릭하면 부모/자식 구조가 표시됩니다.</p>
      </div>
    );
  }

  const parents = buildParentChain(targetEl);
  const children = childElements(targetEl);

  const onSelect = (el: Element) => {
    setLastTargetEl(el instanceof HTMLElement ? el : null);
    setInspectorTarget(buildTarget(el));
  };

  return (
    <div className="space-y-3 text-xs" key={refreshKey}>
      <section>
        <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">위 (조상)</h3>
        <div className="space-y-0.5">
          {parents.map((el, i) => (
            <Layer
              key={`p-${i}`}
              entry={{ el, depth: i, isCurrent: el === targetEl }}
              onSelect={onSelect}
            />
          ))}
        </div>
      </section>
      {children.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            아래 (자식 {children.length}{children.length === MAX_CHILDREN ? '+' : ''})
          </h3>
          <div className="space-y-0.5">
            {children.map((el, i) => (
              <Layer
                key={`c-${i}`}
                entry={{ el, depth: parents.length, isCurrent: false }}
                onSelect={onSelect}
              />
            ))}
          </div>
        </section>
      )}
      <p className="rounded border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-500">
        항목을 클릭하면 그 요소가 선택됩니다 (인스펙터 자동 갱신).
      </p>
    </div>
  );
};

interface LayerProps {
  entry: LayerEntry;
  onSelect: (el: Element) => void;
}

const Layer = ({ entry, onSelect }: LayerProps) => {
  const indent = Math.min(entry.depth, 8) * 12;
  const Icon = entry.isCurrent ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.el)}
      className={cn(
        'flex w-full items-center gap-1 rounded px-1.5 py-1 text-left transition',
        entry.isCurrent
          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
      )}
      style={{ paddingLeft: 6 + indent }}
    >
      <Icon className="h-3 w-3 shrink-0 opacity-60" />
      <span className="truncate">{elementShortLabel(entry.el)}</span>
    </button>
  );
};
