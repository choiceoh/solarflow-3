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

const ChipRow = ({ scale, className, onChange }: ChipRowProps) => {
  const state = detectInScale(className, scale);
  const atMin = state.index === 0;
  const atMax = state.index === scale.values.length - 1;

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
        <div className="truncate text-xs font-medium text-slate-700">{scale.label}</div>
        <div className="truncate font-mono text-[10px] text-slate-400">
          {state.current ?? '미설정'}
          {state.index >= 0 && (
            <span className="ml-1 text-slate-300">
              ({state.index + 1}/{scale.values.length})
            </span>
          )}
        </div>
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
