// 필터 탭 — 필터 행별 인라인 편집. optionsFrom에 따라 보조 필드 동적 노출.

import { useMemo } from 'react';
import type { FilterConfig, FilterType, ListScreenConfig } from '@/templates/types';
import { buildRegistryEntries, enumDictionaries, masterSources, masterSourceMeta } from '@/templates/registry';
import { ArrayEditor, FieldInput, FieldSelect, moveInArray } from './ArrayEditor';
import { RegistryIdPicker } from './Pickers';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';

const TYPE_OPTIONS = [
  { value: 'select', label: 'select (드롭다운)' },
  { value: 'month', label: 'month (월 선택)' },
  { value: 'date', label: 'date (날짜)' },
  { value: 'text', label: 'text (텍스트)' },
];

const OPTIONS_FROM = [
  { value: 'enum', label: 'enum (사전 키)' },
  { value: 'master', label: 'master (마스터 데이터)' },
  { value: 'static', label: 'static (정적 옵션)' },
  { value: 'months', label: 'months (최근 N개월)' },
];

export function FiltersTab({
  value, onChange,
}: {
  value: ListScreenConfig;
  onChange: (next: ListScreenConfig) => void;
}) {
  const filters = value.filters;

  const enumOptions = useMemo(
    () => Object.keys(enumDictionaries).sort().map((id) => ({ value: id, label: id })),
    [],
  );
  const masterEntries = useMemo(
    () => buildRegistryEntries(masterSources, masterSourceMeta),
    [],
  );

  const update = (idx: number, next: FilterConfig) =>
    onChange({ ...value, filters: filters.map((f, i) => (i === idx ? next : f)) });

  return (
    <ArrayEditor
      items={filters}
      hint="필터 버튼 안에 표시됩니다. type=select가 가장 흔하고, optionsFrom으로 옵션 출처를 지정."
      addLabel="필터 추가"
      emptyMsg="필터가 없습니다 (필터 버튼이 숨겨집니다)"
      onAdd={() => onChange({
        ...value,
        filters: [...filters, { key: 'new_filter', label: '새 필터', type: 'select', optionsFrom: 'enum' }],
      })}
      onMove={(idx, dir) => onChange({ ...value, filters: moveInArray(filters, idx, dir) })}
      onRemove={(idx) => onChange({ ...value, filters: filters.filter((_, i) => i !== idx) })}
      renderRow={(f, idx) => (
        <div className="grid grid-cols-2 gap-2">
          <FieldInput label="key (서버 필터 파라미터)" value={f.key} mono
            onChange={(v) => update(idx, { ...f, key: v })} />
          <FieldInput label="label (드롭다운 헤더)" value={f.label}
            onChange={(v) => update(idx, { ...f, label: v })} />

          <FieldSelect label="type" value={f.type} options={TYPE_OPTIONS}
            onChange={(v) => update(idx, { ...f, type: v as FilterType })} />
          <FieldInput label="allLabel ('전체 X' 표시 — 메트릭 sub용)" value={f.allLabel ?? ''}
            onChange={(v) => update(idx, { ...f, allLabel: v || undefined })} />

          <FieldSelect label="optionsFrom (옵션 출처)" value={f.optionsFrom ?? ''} allowEmpty
            options={OPTIONS_FROM}
            onChange={(v) => update(idx, {
              ...f,
              optionsFrom: (v || undefined) as 'enum' | 'master' | 'static' | 'months' | undefined,
            })} />
          <div />

          {/* 보조 필드 — optionsFrom에 따라 분기 */}
          {f.optionsFrom === 'enum' && (
            <FieldSelect label="enumKey (registry.enumDictionaries)" value={f.enumKey ?? ''}
              allowEmpty options={enumOptions}
              onChange={(v) => update(idx, { ...f, enumKey: v || undefined })} />
          )}
          {f.optionsFrom === 'master' && (
            <RegistryIdPicker label="masterKey"
              value={f.masterKey} entries={masterEntries}
              onChange={(v) => update(idx, { ...f, masterKey: v })}
              hint="registry.masterSources — 메타가 있으면 라벨/설명 노출" />
          )}
          {f.optionsFrom === 'months' && (
            <FieldInput label="monthsBack (최근 N개월, 기본 12)" value={String(f.monthsBack ?? '')}
              onChange={(v) => update(idx, { ...f, monthsBack: v ? Number(v) : undefined })} />
          )}
          {f.optionsFrom === 'static' && (
            <div className="col-span-2 space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">staticOptions (정적 value/label 쌍)</Label>
                <Button
                  type="button" variant="ghost" size="sm" className="h-6 text-xs"
                  onClick={() => update(idx, {
                    ...f,
                    staticOptions: [...(f.staticOptions ?? []), { value: '', label: '' }],
                  })}
                >
                  <Plus className="h-3 w-3 mr-1" />옵션 추가
                </Button>
              </div>
              <div className="space-y-1.5">
                {(f.staticOptions ?? []).map((opt, oIdx) => (
                  <div key={oIdx} className="flex gap-2 items-center">
                    <input className="h-7 text-xs border rounded px-2 flex-1 font-mono"
                      placeholder="value" value={opt.value}
                      onChange={(e) => update(idx, {
                        ...f,
                        staticOptions: (f.staticOptions ?? []).map((o, i) =>
                          i === oIdx ? { ...o, value: e.target.value } : o),
                      })} />
                    <input className="h-7 text-xs border rounded px-2 flex-1"
                      placeholder="label" value={opt.label}
                      onChange={(e) => update(idx, {
                        ...f,
                        staticOptions: (f.staticOptions ?? []).map((o, i) =>
                          i === oIdx ? { ...o, label: e.target.value } : o),
                      })} />
                    <Button
                      type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => update(idx, {
                        ...f,
                        staticOptions: (f.staticOptions ?? []).filter((_, i) => i !== oIdx),
                      })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    />
  );
}
