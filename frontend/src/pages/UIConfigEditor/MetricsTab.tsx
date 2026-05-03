// 메트릭 탭 — KPI 타일별 인라인 편집

import { useMemo } from 'react';
import type { ListScreenConfig, MetricConfig, Tone } from '@/templates/types';
import { metricComputers, subComputers, toneComputers } from '@/templates/registry';
import { ArrayEditor, FieldInput, FieldSelect, moveInArray } from './ArrayEditor';
import { Label } from '@/components/ui/label';

const TONE_OPTIONS = [
  { value: 'solar', label: 'solar' },
  { value: 'ink', label: 'ink' },
  { value: 'info', label: 'info' },
  { value: 'warn', label: 'warn' },
  { value: 'pos', label: 'pos' },
];

export function MetricsTab({
  value, onChange,
}: {
  value: ListScreenConfig;
  onChange: (next: ListScreenConfig) => void;
}) {
  const metrics = value.metrics;

  const computerOptions = useMemo(
    () => Object.keys(metricComputers).sort().map((id) => ({ value: id, label: id })),
    [],
  );
  const subComputerOptions = useMemo(
    () => Object.keys(subComputers).sort().map((id) => ({ value: id, label: id })),
    [],
  );
  const toneComputerOptions = useMemo(
    () => Object.keys(toneComputers).sort().map((id) => ({ value: id, label: id })),
    [],
  );
  const filterKeys = useMemo(
    () => value.filters.map((f) => ({ value: f.key, label: f.key })),
    [value.filters],
  );

  const update = (idx: number, next: MetricConfig) =>
    onChange({ ...value, metrics: metrics.map((m, i) => (i === idx ? next : m)) });

  return (
    <ArrayEditor
      items={metrics}
      hint="KPI 타일은 화면 상단에 가로로 표시됩니다. label = 타일 이름, computerId = 값 계산 함수."
      addLabel="메트릭 추가"
      emptyMsg="메트릭이 없습니다"
      onAdd={() => onChange({ ...value, metrics: [...metrics, { label: '새 메트릭', computerId: 'count', spark: 'auto' }] })}
      onMove={(idx, dir) => onChange({ ...value, metrics: moveInArray(metrics, idx, dir) })}
      onRemove={(idx) => onChange({ ...value, metrics: metrics.filter((_, i) => i !== idx) })}
      onReorder={(next) => onChange({ ...value, metrics: next })}
      onDuplicate={(idx) => {
        const src = metrics[idx];
        const cloned: MetricConfig = { ...src, label: `${src.label} (복사)` };
        onChange({ ...value, metrics: [...metrics.slice(0, idx + 1), cloned, ...metrics.slice(idx + 1)] });
      }}
      renderRow={(m, idx) => {
        const toneIsDynamic = typeof m.tone === 'object' && m.tone !== null && 'computerId' in m.tone;
        const toneStatic = typeof m.tone === 'string' ? m.tone : '';
        const toneDynamicId = toneIsDynamic ? (m.tone as { computerId: string }).computerId : '';

        return (
          <div className="grid grid-cols-2 gap-2">
            <FieldInput label="label" value={m.label}
              onChange={(v) => update(idx, { ...m, label: v })} />
            <FieldSelect label="computerId (값 계산)" value={m.computerId} options={computerOptions}
              onChange={(v) => update(idx, { ...m, computerId: v })} />

            <FieldInput label="unit (단위, 예: '억', '원')" value={m.unit ?? ''}
              onChange={(v) => update(idx, { ...m, unit: v || undefined })} />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">그래프 (sparkline)</Label>
              <label className="flex items-center gap-2 h-7 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={m.spark === 'auto'}
                  onChange={(e) => update(idx, { ...m, spark: e.target.checked ? 'auto' : undefined })}
                />
                <span className="text-muted-foreground">{m.spark === 'auto' ? '표시' : '숨김'}</span>
              </label>
            </div>

            <div className="col-span-2 flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                <input type="radio" name={`tone-mode-${idx}`} checked={!toneIsDynamic}
                  onChange={() => update(idx, { ...m, tone: toneStatic as Tone || undefined })} />
                정적 톤
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name={`tone-mode-${idx}`} checked={toneIsDynamic}
                  onChange={() => update(idx, {
                    ...m,
                    tone: toneDynamicId
                      ? { computerId: toneDynamicId }
                      : (toneComputerOptions[0] ? { computerId: toneComputerOptions[0].value } : undefined),
                  })} />
                동적 톤 (computer)
              </label>
            </div>

            {!toneIsDynamic ? (
              <FieldSelect label="tone (정적)" value={toneStatic} allowEmpty options={TONE_OPTIONS}
                onChange={(v) => update(idx, { ...m, tone: (v || undefined) as Tone | undefined })} />
            ) : (
              <FieldSelect label="toneComputerId" value={toneDynamicId} options={toneComputerOptions}
                onChange={(v) => update(idx, { ...m, tone: { computerId: v } })} />
            )}
            <div />

            <FieldSelect label="subFromFilter (필터 라벨 → 부제)" value={m.subFromFilter ?? ''}
              allowEmpty options={filterKeys}
              onChange={(v) => update(idx, { ...m, subFromFilter: v || undefined })} />
            <FieldSelect label="subFromComputer (동적 부제)" value={m.subFromComputer ?? ''}
              allowEmpty options={subComputerOptions}
              onChange={(v) => update(idx, { ...m, subFromComputer: v || undefined })} />
          </div>
        );
      }}
    />
  );
}
