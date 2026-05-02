import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  applyScaleStep,
  detectInScale,
  SCALES,
  type ClassNameScale,
} from './classNameScales';

interface ActionChipsProps {
  className: string;
  onChange: (next: string) => void;
}

export const ActionChips = ({ className, onChange }: ActionChipsProps) => (
  <div className="space-y-1">
    {SCALES.map((scale) => (
      <ChipRow
        key={scale.id}
        scale={scale}
        className={className}
        onChange={onChange}
      />
    ))}
  </div>
);

interface ChipRowProps {
  scale: ClassNameScale;
  className: string;
  onChange: (next: string) => void;
}

/** 스케일 위치별 한국어 단계 라벨. 코드값(p-4) 대신 직관 표현. */
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

const ChipRow = ({ scale, className, onChange }: ChipRowProps) => {
  const state = detectInScale(className, scale);
  const atMin = state.index === 0;
  const atMax = state.index === scale.values.length - 1;
  const totalSteps = scale.values.length;

  return (
    <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
      <button
        type="button"
        onClick={() => onChange(applyScaleStep(className, scale, -1))}
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
        onClick={() => onChange(applyScaleStep(className, scale, +1))}
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

/** 시각 단계 막대 — 가로로 채워지는 progress bar. 단계 갯수와 무관하게 같은 너비. */
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
