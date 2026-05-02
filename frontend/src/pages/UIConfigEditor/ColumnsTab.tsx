// 컬럼 탭 — 행별 인라인 편집 + ↑↓ 정렬 + 추가/삭제

import { useMemo } from 'react';
import type { ColumnConfig, Formatter, ListScreenConfig } from '@/templates/types';
import { cellRenderers } from '@/templates/registry';
import { ArrayEditor, FieldInput, FieldSelect, moveInArray } from './ArrayEditor';

const FORMATTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'date', label: 'date (날짜)' },
  { value: 'number', label: 'number (천단위 콤마)' },
  { value: 'kw', label: 'kw (kW 단위)' },
  { value: 'currency', label: 'currency (통화)' },
];

const ALIGN_OPTIONS = [
  { value: 'left', label: 'left' },
  { value: 'right', label: 'right' },
  { value: 'center', label: 'center' },
];

export function ColumnsTab({
  value, onChange,
}: {
  value: ListScreenConfig;
  onChange: (next: ListScreenConfig) => void;
}) {
  const cols = value.columns;
  const rendererOptions = useMemo(
    () => Object.keys(cellRenderers).sort().map((id) => ({ value: id, label: id })),
    [],
  );

  const updateCol = (idx: number, next: ColumnConfig) =>
    onChange({ ...value, columns: cols.map((c, i) => (i === idx ? next : c)) });

  return (
    <ArrayEditor
      items={cols}
      hint="순서대로 표시됩니다. ↑↓로 정렬, 휴지통으로 삭제, '+ 컬럼 추가'로 새 컬럼."
      addLabel="컬럼 추가"
      emptyMsg="컬럼이 없습니다"
      rowKey={(_, i) => `${i}-${cols[i].key}`}
      onAdd={() => onChange({ ...value, columns: [...cols, { key: 'new_field', label: '새 컬럼' }] })}
      onMove={(idx, dir) => onChange({ ...value, columns: moveInArray(cols, idx, dir) })}
      onRemove={(idx) => onChange({ ...value, columns: cols.filter((_, i) => i !== idx) })}
      renderRow={(col, idx) => (
        <div className="grid grid-cols-2 gap-2">
          <FieldInput label="key (데이터 경로)" value={col.key} mono
            onChange={(v) => updateCol(idx, { ...col, key: v })} />
          <FieldInput label="label (표시 라벨)" value={col.label}
            onChange={(v) => updateCol(idx, { ...col, label: v })} />

          <FieldSelect label="formatter" value={col.formatter ?? ''} allowEmpty options={FORMATTER_OPTIONS}
            onChange={(v) => updateCol(idx, { ...col, formatter: (v || undefined) as Formatter | undefined })} />

          <FieldSelect label="rendererId (커스텀, formatter보다 우선)" value={col.rendererId ?? ''}
            allowEmpty options={rendererOptions}
            onChange={(v) => updateCol(idx, { ...col, rendererId: v || undefined })} />

          <FieldSelect label="align" value={col.align ?? 'left'} options={ALIGN_OPTIONS}
            onChange={(v) => updateCol(idx, { ...col, align: v as 'left' | 'right' | 'center' })} />

          <FieldInput label="width (CSS, 예: 120px)" value={col.width ?? ''} mono
            onChange={(v) => updateCol(idx, { ...col, width: v || undefined })} />

          <FieldInput label="fallback (빈 값, 기본 '—')" value={col.fallback ?? ''}
            onChange={(v) => updateCol(idx, { ...col, fallback: v || undefined })} />

          <FieldInput label="className (Tailwind, 예: 'font-mono')" value={col.className ?? ''} mono
            onChange={(v) => updateCol(idx, { ...col, className: v || undefined })} />
        </div>
      )}
    />
  );
}
