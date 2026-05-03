// 컬럼 탭 — 행별 인라인 편집 + collapse + 검색 + drag-drop + 검증
// Phase 4 follow-up #1: 행 ⚙ 버튼 → 우측 패널에서 selection-driven L3/L4 편집.

import { useMemo } from 'react';
import { Settings2 } from 'lucide-react';
import type { ColumnConfig, Formatter, ListScreenConfig } from '@/templates/types';
import { buildRegistryEntries, cellRenderers, cellRendererMeta } from '@/templates/registry';
import { ArrayEditor, FieldInput, FieldSelect, moveInArray, type ItemIssue } from './ArrayEditor';
import { RegistryIdPicker } from './Pickers';

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

// 컬럼 검증 — registry/key 충돌 즉시 감지
function validateColumn(col: ColumnConfig, all: ColumnConfig[]): ItemIssue[] {
  const issues: ItemIssue[] = [];
  if (!col.key.trim()) issues.push({ level: 'error', msg: 'key 가 비어 있습니다' });
  if (!col.label.trim()) issues.push({ level: 'error', msg: 'label 이 비어 있습니다' });
  if (all.filter((c) => c.key === col.key).length > 1) {
    issues.push({ level: 'error', msg: `key '${col.key}' 가 중복됩니다` });
  }
  if (col.rendererId && !(col.rendererId in cellRenderers)) {
    issues.push({ level: 'error', msg: `rendererId '${col.rendererId}' 가 registry 에 없습니다` });
  }
  return issues;
}

// 새 컬럼 key 생성 — 충돌 안 나는 'col_N'
function suggestColumnKey(existing: string[]): string {
  for (let i = 1; i < 1000; i++) {
    const candidate = `col_${i}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return 'new_column';
}

export function ColumnsTab({
  value, onChange, onSelectColumn,
}: {
  value: ListScreenConfig;
  onChange: (next: ListScreenConfig) => void;
  // Phase 4 follow-up #1: 컬럼 행 ⚙ 클릭 → 우측 패널에서 L3/L4 편집.
  onSelectColumn?: (idx: number) => void;
}) {
  const cols = value.columns;
  const rendererEntries = useMemo(
    () => buildRegistryEntries(cellRenderers, cellRendererMeta),
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
      onAdd={() => onChange({
        ...value,
        columns: [...cols, { key: suggestColumnKey(cols.map((c) => c.key)), label: '새 컬럼' }],
      })}
      onMove={(idx, dir) => onChange({ ...value, columns: moveInArray(cols, idx, dir) })}
      onRemove={(idx) => onChange({ ...value, columns: cols.filter((_, i) => i !== idx) })}
      onReorder={(next) => onChange({ ...value, columns: next })}
      onDuplicate={(idx) => {
        const src = cols[idx];
        const newKey = suggestColumnKey(cols.map((c) => c.key));
        const cloned: ColumnConfig = { ...src, key: newKey, label: `${src.label} (복사)` };
        onChange({ ...value, columns: [...cols.slice(0, idx + 1), cloned, ...cols.slice(idx + 1)] });
      }}
      validate={validateColumn}
      searchMatcher={(col, q) => {
        const lc = q.toLowerCase();
        return col.key.toLowerCase().includes(lc)
          || col.label.toLowerCase().includes(lc)
          || (col.formatter ?? '').toLowerCase().includes(lc)
          || (col.rendererId ?? '').toLowerCase().includes(lc);
      }}
      renderSummary={(col, idx) => (
        <span className="flex items-center gap-2 min-w-0 w-full">
          <span className="font-mono text-[11px] text-foreground/80 shrink-0">{col.key}</span>
          <span className="text-foreground/60 shrink-0">·</span>
          <span className="truncate">{col.label}</span>
          {col.formatter && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground shrink-0">{col.formatter}</span>
          )}
          {col.rendererId && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-900 shrink-0">renderer</span>
          )}
          {col.inlineEditable && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] text-blue-900 shrink-0">inline-edit</span>
          )}
          {col.align && col.align !== 'left' && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground shrink-0">{col.align}</span>
          )}
          {onSelectColumn && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelectColumn(idx); }}
              className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
              title="우측 패널에서 자세히 편집"
              aria-label="패널에서 편집"
            >
              <Settings2 className="h-3 w-3" />
            </button>
          )}
        </span>
      )}
      renderRow={(col, idx) => (
        <div className="grid grid-cols-2 gap-2">
          <FieldInput label="key (데이터 경로)" value={col.key} mono
            onChange={(v) => updateCol(idx, { ...col, key: v })} />
          <FieldInput label="label (표시 라벨)" value={col.label}
            onChange={(v) => updateCol(idx, { ...col, label: v })} />

          <FieldSelect label="formatter" value={col.formatter ?? ''} allowEmpty options={FORMATTER_OPTIONS}
            onChange={(v) => updateCol(idx, { ...col, formatter: (v || undefined) as Formatter | undefined })} />

          <RegistryIdPicker label="rendererId (커스텀, formatter보다 우선)"
            value={col.rendererId} entries={rendererEntries}
            onChange={(v) => updateCol(idx, { ...col, rendererId: v })}
            hint="registry.cellRenderers — 메타 채워진 entry 만 라벨/설명 표시" />

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
