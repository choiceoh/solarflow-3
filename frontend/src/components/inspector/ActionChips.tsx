import { useState } from 'react';
import { ChevronDown, ChevronRight, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import {
  applyScaleStep,
  detectInScale,
  SCALE_CATEGORIES,
  SCALES,
  type ClassNameScale,
  type ScaleCategory,
} from './classNameScales';
import type { InspectorPseudoState } from '@/stores/appStore';

interface ActionChipsProps {
  className: string;
  onChange: (next: string) => void;
}

const COLLAPSED_KEY = 'sf.inspector.scale-categories-collapsed';

const readCollapsed = (): Set<ScaleCategory> => {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as ScaleCategory[];
    return new Set(arr);
  } catch {
    return new Set();
  }
};

const writeCollapsed = (set: Set<ScaleCategory>) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* noop */
  }
};

export const ActionChips = ({ className, onChange }: ActionChipsProps) => {
  const pseudoState = useAppStore((s) => s.inspectorPseudoState);
  const [collapsed, setCollapsedState] = useState<Set<ScaleCategory>>(() => readCollapsed());

  const toggleCategory = (cat: ScaleCategory) => {
    setCollapsedState((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      writeCollapsed(next);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {SCALE_CATEGORIES.map(({ id: catId, label }) => {
        const scales = SCALES.filter((s) => s.category === catId);
        const isCollapsed = collapsed.has(catId);
        return (
          <section key={catId}>
            <button
              type="button"
              onClick={() => toggleCategory(catId)}
              className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              <span>{label}</span>
              <span className="ml-auto text-[9px] text-slate-400">{scales.length}</span>
            </button>
            {!isCollapsed && (
              <div className="mt-1 space-y-1">
                {scales.map((scale) => (
                  <ChipRow
                    key={scale.id}
                    scale={scale}
                    className={className}
                    pseudoState={pseudoState}
                    onChange={onChange}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

interface ChipRowProps {
  scale: ClassNameScale;
  className: string;
  pseudoState: InspectorPseudoState;
  onChange: (next: string) => void;
}

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

const ChipRow = ({ scale, className, pseudoState, onChange }: ChipRowProps) => {
  const state = detectInScale(className, scale, pseudoState);
  const atMin = state.index === 0;
  const atMax = state.index === scale.values.length - 1;
  const totalSteps = scale.values.length;

  return (
    <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
      <button
        type="button"
        onClick={() => onChange(applyScaleStep(className, scale, -1, pseudoState))}
        disabled={atMin}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-600',
          atMin ? 'cursor-not-allowed opacity-30' : 'hover:bg-slate-50',
        )}
        aria-label={`${scale.label} 줄이기`}
        title={`${scale.label} 줄이기`}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-medium text-slate-700">{scale.label}</span>
          <span className="shrink-0 text-[10px] text-slate-500">
            {stepLabel(state.index, totalSteps)}
          </span>
        </div>
        <StepBar index={state.index} total={totalSteps} />
      </div>
      <button
        type="button"
        onClick={() => onChange(applyScaleStep(className, scale, +1, pseudoState))}
        disabled={atMax}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-600',
          atMax ? 'cursor-not-allowed opacity-30' : 'hover:bg-slate-50',
        )}
        aria-label={`${scale.label} 키우기`}
        title={`${scale.label} 키우기`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const StepBar = ({ index, total }: { index: number; total: number }) => {
  const pct = index < 0 ? 0 : ((index + 1) / total) * 100;
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className="h-full rounded-full bg-amber-500 transition-[width] duration-100"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

