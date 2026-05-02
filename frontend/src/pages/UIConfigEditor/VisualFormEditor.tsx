// MetaFormConfig 시각 편집기 — 섹션별 cols + 필드 인라인 편집.

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type { FieldConfig, FieldType, FormSection, MetaFormConfig, Tone } from '@/templates/types';
import { enumDictionaries, masterSources, computedFormulas } from '@/templates/registry';
import { FieldInput, FieldSelect, TabButton, moveInArray } from './ArrayEditor';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'text' },
  { value: 'select', label: 'select' },
  { value: 'number', label: 'number' },
  { value: 'textarea', label: 'textarea' },
  { value: 'switch', label: 'switch' },
  { value: 'date', label: 'date' },
  { value: 'datetime', label: 'datetime' },
  { value: 'time', label: 'time' },
  { value: 'multiselect', label: 'multiselect' },
  { value: 'file', label: 'file' },
  { value: 'computed', label: 'computed' },
];

const NUMBER_FORMATS = [
  { value: 'plain', label: 'plain' },
  { value: 'thousands', label: 'thousands (1,000)' },
  { value: 'krw', label: 'krw (1,000원)' },
  { value: 'usd', label: 'usd ($1,000.00)' },
];

const TONES: { value: Tone; label: string }[] = [
  { value: 'solar', label: 'solar (오렌지)' },
  { value: 'ink', label: 'ink (블루)' },
  { value: 'info', label: 'info (시안)' },
  { value: 'warn', label: 'warn (앰버)' },
  { value: 'pos', label: 'pos (그린)' },
];

const VISIBLE_SOURCES = [
  { value: 'field', label: 'field (같은 폼 다른 필드)' },
  { value: 'context', label: 'context (extraContext)' },
];

const COLS_OPTIONS = [
  { value: '1', label: '1 (전체 폭)' },
  { value: '2', label: '2 (절반씩)' },
  { value: '3', label: '3' },
];

const OPTIONS_FROM = [
  { value: 'enum', label: 'enum' },
  { value: 'master', label: 'master' },
  { value: 'static', label: 'static' },
];

type Tab = 'basic' | 'sections' | 'json';

export interface VisualFormEditorProps {
  value: MetaFormConfig;
  onChange: (next: MetaFormConfig) => void;
  jsonDraft: string;
  onJsonDraftChange: (next: string) => void;
}

export default function VisualFormEditor({
  value, onChange, jsonDraft, onJsonDraftChange,
}: VisualFormEditorProps) {
  const [tab, setTab] = useState<Tab>('basic');
  // 방어: sections·fields가 누락된 부분 JSON에서도 안전하게
  const sections = value.sections ?? [];
  const fieldCount = sections.reduce((s, sec) => s + (sec.fields?.length ?? 0), 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b px-3 flex gap-1 overflow-x-auto">
        <TabButton active={tab === 'basic'} onClick={() => setTab('basic')}>기본 정보</TabButton>
        <TabButton active={tab === 'sections'} onClick={() => setTab('sections')}>
          섹션 ({sections.length}) · 필드 ({fieldCount})
        </TabButton>
        <TabButton active={tab === 'json'} onClick={() => setTab('json')}>JSON (고급)</TabButton>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {tab === 'basic' && <BasicTab value={value} onChange={onChange} />}
        {tab === 'sections' && <SectionsTab value={value} onChange={onChange} />}
        {tab === 'json' && (
          <Textarea
            value={jsonDraft}
            onChange={(e) => onJsonDraftChange(e.target.value)}
            className="font-mono text-xs h-full min-h-[400px] resize-none"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}


function BasicTab({ value, onChange }: { value: MetaFormConfig; onChange: (next: MetaFormConfig) => void }) {
  const title = value.title ?? { create: '', edit: '' };
  const dialogSizes = [
    { value: 'sm', label: 'sm' }, { value: 'md', label: 'md (기본)' },
    { value: 'lg', label: 'lg' }, { value: 'xl', label: 'xl' }, { value: '2xl', label: '2xl' },
  ];
  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">id <span className="text-muted-foreground">(불변)</span></Label>
        <Input value={value.id ?? ''} disabled className="font-mono text-xs bg-muted" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">title.create (신규 등록 다이얼로그 제목)</Label>
        <Input value={title.create}
          onChange={(e) => onChange({ ...value, title: { ...title, create: e.target.value } })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">title.edit (수정 다이얼로그 제목)</Label>
        <Input value={title.edit}
          onChange={(e) => onChange({ ...value, title: { ...title, edit: e.target.value } })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldSelect label="dialogSize" value={value.dialogSize ?? ''} allowEmpty options={dialogSizes}
          onChange={(v) => onChange({ ...value, dialogSize: (v || undefined) as MetaFormConfig['dialogSize'] })} />
        <div className="flex items-center gap-3 pt-4">
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={value.wizard ?? false}
              onChange={(e) => onChange({ ...value, wizard: e.target.checked || undefined })} />
            wizard (다단계 마법사)
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={value.draftAutoSave ?? false}
              onChange={(e) => onChange({ ...value, draftAutoSave: e.target.checked || undefined })} />
            draftAutoSave (초안 자동저장)
          </label>
        </div>
      </div>
    </div>
  );
}

function SectionsTab({ value, onChange }: { value: MetaFormConfig; onChange: (next: MetaFormConfig) => void }) {
  const sections = value.sections ?? [];
  const [filter, setFilter] = useState('');
  // 검색·전체토글로 추가/제거되는 expand 집합. key: `${sIdx}.${fIdx}`
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());

  const setSections = (next: FormSection[]) => onChange({ ...value, sections: next });
  const updateSection = (idx: number, next: FormSection) =>
    setSections(sections.map((s, i) => (i === idx ? next : s)));

  const moveSection = (idx: number, dir: -1 | 1) =>
    setSections(moveInArray(sections, idx, dir));

  const removeSection = (idx: number) =>
    setSections(sections.filter((_, i) => i !== idx));

  const addSection = () =>
    setSections([...sections, { cols: 1, fields: [] }]);

  const totalFields = sections.reduce((s, sec) => s + (sec.fields?.length ?? 0), 0);

  // 검색 일치하는 필드는 자동 expand (검색 결과로 즉시 보이게)
  const filteredSet = useMemo(() => {
    if (!filter) return null;
    const lc = filter.toLowerCase();
    const set = new Set<string>();
    sections.forEach((sec, sIdx) => {
      (sec.fields ?? []).forEach((f, fIdx) => {
        if (f.key.toLowerCase().includes(lc)
          || f.label.toLowerCase().includes(lc)
          || f.type.toLowerCase().includes(lc)) {
          set.add(`${sIdx}.${fIdx}`);
        }
      });
    });
    return set;
  }, [filter, sections]);

  const expandAll = () => {
    const set = new Set<string>();
    sections.forEach((sec, sIdx) => {
      (sec.fields ?? []).forEach((_, fIdx) => set.add(`${sIdx}.${fIdx}`));
    });
    setExpandedSet(set);
  };
  const collapseAll = () => setExpandedSet(new Set());

  const toggleField = (sIdx: number, fIdx: number) => {
    const k = `${sIdx}.${fIdx}`;
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`필드 검색 (key/label/type) — 일치 시 자동 펼침`}
          className="h-7 flex-1 min-w-[240px] rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {filter && (
          <span className="text-[10px] text-muted-foreground">
            {filteredSet?.size ?? 0} / {totalFields}
          </span>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={expandAll}>모두 펼치기</Button>
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={collapseAll}>모두 접기</Button>
        <Button size="sm" variant="outline" className="h-7" onClick={addSection}>
          <Plus className="h-3 w-3 mr-1" />섹션 추가
        </Button>
      </div>
      <div className="space-y-3">
        {sections.map((sec, sIdx) => (
          <SectionCard
            key={sIdx}
            section={sec}
            index={sIdx}
            total={sections.length}
            filter={filter}
            filteredSet={filteredSet}
            expandedSet={expandedSet}
            onToggleField={(fIdx) => toggleField(sIdx, fIdx)}
            onAddedField={(fIdx) => setExpandedSet((p) => new Set(p).add(`${sIdx}.${fIdx}`))}
            onUpdate={(next) => updateSection(sIdx, next)}
            onMoveUp={() => moveSection(sIdx, -1)}
            onMoveDown={() => moveSection(sIdx, 1)}
            onRemove={() => removeSection(sIdx)}
          />
        ))}
        {sections.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded">
            섹션이 없습니다
          </div>
        )}
      </div>
    </div>
  );
}

function SectionCard({
  section, index, total, filter, filteredSet, expandedSet,
  onToggleField, onAddedField, onUpdate, onMoveUp, onMoveDown, onRemove,
}: {
  section: FormSection;
  index: number;
  total: number;
  filter: string;
  filteredSet: Set<string> | null;
  expandedSet: Set<string>;
  onToggleField: (fIdx: number) => void;
  onAddedField: (fIdx: number) => void;
  onUpdate: (next: FormSection) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const updateField = (fIdx: number, next: FieldConfig) =>
    onUpdate({ ...section, fields: (section.fields ?? []).map((f, i) => (i === fIdx ? next : f)) });

  const addField = () => {
    const newIdx = (section.fields ?? []).length;
    onUpdate({ ...section, fields: [...(section.fields ?? []), { key: 'new_field', label: '새 필드', type: 'text' }] });
    // 새 필드는 자동으로 펼침
    onAddedField(newIdx);
  };

  const moveField = (fIdx: number, dir: -1 | 1) =>
    onUpdate({ ...section, fields: moveInArray(section.fields ?? [], fIdx, dir) });

  const removeField = (fIdx: number) =>
    onUpdate({ ...section, fields: (section.fields ?? []).filter((_, i) => i !== fIdx) });

  return (
    <div className="rounded border bg-card">
      {/* 섹션 헤더 */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <span className="text-[10px] text-muted-foreground mono">섹션 #{index + 1}</span>
        <FieldSelect label="" value={String(section.cols ?? 1)} options={COLS_OPTIONS}
          onChange={(v) => onUpdate({ ...section, cols: Number(v) as 1 | 2 | 3 })} />
        <span className="text-[10px] text-muted-foreground">cols</span>
        <input type="text" value={section.title ?? ''}
          onChange={(e) => onUpdate({ ...section, title: e.target.value || undefined })}
          placeholder="title (옵션 — 섹션 헤더)"
          className="h-7 flex-1 min-w-[140px] rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
        <FieldSelect label="" value={section.tone ?? ''} allowEmpty options={TONES}
          onChange={(v) => onUpdate({ ...section, tone: (v || undefined) as Tone | undefined })} />
        <span className="text-[10px] text-muted-foreground">tone</span>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
          onClick={onMoveUp} disabled={index === 0}><ChevronUp className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
          onClick={onMoveDown} disabled={index === total - 1}><ChevronDown className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>

      {/* 섹션 본문 — 필드 배열 */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">필드 ({(section.fields ?? []).length})</p>
          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={addField}>
            <Plus className="h-3 w-3 mr-1" />필드 추가
          </Button>
        </div>
        {(section.fields ?? []).map((field, fIdx) => {
          const k = `${index}.${fIdx}`;
          // 검색 활성 시 매칭 안 된 필드는 숨김 (filteredSet 이 있는데 not in)
          if (filteredSet && !filteredSet.has(k)) return null;
          // 검색 매칭 또는 사용자가 직접 펼친 경우 expanded
          const isExpanded = expandedSet.has(k) || (filter !== '' && filteredSet?.has(k) === true);
          return (
            <FieldRow
              key={fIdx}
              field={field}
              index={fIdx}
              total={(section.fields ?? []).length}
              expanded={isExpanded}
              onToggleExpand={() => onToggleField(fIdx)}
              onUpdate={(next) => updateField(fIdx, next)}
              onMoveUp={() => moveField(fIdx, -1)}
              onMoveDown={() => moveField(fIdx, 1)}
              onRemove={() => removeField(fIdx)}
            />
          );
        })}
        {(section.fields ?? []).length === 0 && (
          <div className="text-center py-3 text-[10px] text-muted-foreground border border-dashed rounded">
            필드가 없습니다
          </div>
        )}
        {filter && (section.fields ?? []).length > 0 && filteredSet && (section.fields ?? []).every((_, fIdx) => !filteredSet.has(`${index}.${fIdx}`)) && (
          <div className="text-center py-2 text-[10px] text-muted-foreground italic">
            "{filter}" 일치하는 필드 없음
          </div>
        )}
      </div>
    </div>
  );
}

// 필드 행 — 핵심 속성 (key/label/type/required/placeholder/editableByRoles)
// + type 별 보조 (select/multiselect 옵션, file multiple, computed formula+dependsOn, number numberFormat)
// + "고급 ▾" 토글: description / defaultValue / readOnly / 검증 / visibleIf / readOnlyIf
function FieldRow({
  field, index, total, expanded, onToggleExpand,
  onUpdate, onMoveUp, onMoveDown, onRemove,
}: {
  field: FieldConfig;
  index: number;
  total: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (next: FieldConfig) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const enumOpts = useMemo(() => Object.keys(enumDictionaries).sort().map((id) => ({ value: id, label: id })), []);
  const masterOpts = useMemo(() => Object.keys(masterSources).sort().map((id) => ({ value: id, label: id })), []);
  const formulaOpts = useMemo(() => Object.keys(computedFormulas).sort().map((id) => ({ value: id, label: id })), []);

  const isOptionField = field.type === 'select' || field.type === 'multiselect';
  const isComputed = field.type === 'computed';
  const isNumber = field.type === 'number';
  const isFile = field.type === 'file';

  // Collapsed 모드 — 한 줄 요약 (검색·스캔 빠르게)
  if (!expanded) {
    const badges: string[] = [];
    if (field.required) badges.push('필수');
    if (field.readOnly) badges.push('readonly');
    if (field.visibleIf?.field) badges.push('조건부');
    if (field.formula?.computerId) badges.push(`= ${field.formula.computerId}`);
    return (
      <div
        className="rounded border bg-background hover:bg-muted/30 cursor-pointer transition-colors group"
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpand(); } }}
      >
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
          <span className="text-[9px] text-muted-foreground mono w-6 text-right shrink-0">#{index + 1}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="font-mono text-[11px] text-foreground/80 shrink-0">{field.key}</span>
          <span className="text-foreground/60 shrink-0">·</span>
          <span className="truncate">{field.label}</span>
          <span className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">{field.type}</span>
            {badges.map((b) => (
              <span key={b} className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-900">{b}</span>
            ))}
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }} disabled={index === 0}>
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }} disabled={index === total - 1}>
              <ChevronDown className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border p-2 grid grid-cols-12 gap-2 items-start text-xs bg-muted/20">
      <div className="col-span-1 flex flex-col items-center gap-1">
        <span className="text-[9px] text-muted-foreground mono">#{index + 1}</span>
        <Button type="button" variant="ghost" size="icon" className="h-5 w-5" title="접기"
          onClick={onToggleExpand}><ChevronUp className="h-3 w-3" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
          onClick={onMoveUp} disabled={index === 0}><ChevronUp className="h-3 w-3" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
          onClick={onMoveDown} disabled={index === total - 1}><ChevronDown className="h-3 w-3" /></Button>
      </div>
      <div className="col-span-10 grid grid-cols-2 gap-2">
        <FieldInput label="key" value={field.key} mono
          onChange={(v) => onUpdate({ ...field, key: v })} />
        <FieldInput label="label" value={field.label}
          onChange={(v) => onUpdate({ ...field, label: v })} />
        <FieldSelect label="type" value={field.type} options={FIELD_TYPES}
          onChange={(v) => onUpdate({ ...field, type: v as FieldType })} />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[10px]">
            <input type="checkbox" checked={field.required ?? false}
              onChange={(e) => onUpdate({ ...field, required: e.target.checked })} />
            required
          </label>
        </div>
        {!isComputed && (
          <FieldInput label="placeholder" value={field.placeholder ?? ''}
            onChange={(v) => onUpdate({ ...field, placeholder: v || undefined })} />
        )}
        <FieldInput label="editableByRoles (콤마, 예: 'admin,operator')"
          value={(field.editableByRoles ?? []).join(',')}
          onChange={(v) => onUpdate({
            ...field,
            editableByRoles: v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          })} />

        {/* select / multiselect 보조 */}
        {isOptionField && (
          <>
            <FieldSelect label="optionsFrom" value={field.optionsFrom ?? ''} allowEmpty options={OPTIONS_FROM}
              onChange={(v) => onUpdate({
                ...field,
                optionsFrom: (v || undefined) as 'enum' | 'master' | 'static' | undefined,
              })} />
            {field.optionsFrom === 'enum' && (
              <FieldSelect label="enumKey" value={field.enumKey ?? ''} allowEmpty options={enumOpts}
                onChange={(v) => onUpdate({ ...field, enumKey: v || undefined })} />
            )}
            {field.optionsFrom === 'master' && (
              <>
                <FieldSelect label="masterKey" value={field.masterKey ?? ''} allowEmpty options={masterOpts}
                  onChange={(v) => onUpdate({ ...field, masterKey: v || undefined })} />
                <FieldInput label="optionsDependsOn (콤마 — master 재로드 트리거)"
                  value={(field.optionsDependsOn ?? []).join(',')} mono
                  onChange={(v) => onUpdate({
                    ...field,
                    optionsDependsOn: v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined,
                  })} />
              </>
            )}
          </>
        )}

        {/* number 보조 */}
        {isNumber && (
          <>
            <FieldSelect label="numberFormat" value={field.numberFormat ?? ''} allowEmpty options={NUMBER_FORMATS}
              onChange={(v) => onUpdate({
                ...field,
                numberFormat: (v || undefined) as 'plain' | 'thousands' | 'krw' | 'usd' | undefined,
              })} />
            <div /> {/* spacer */}
          </>
        )}

        {/* file 보조 */}
        {isFile && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[10px]">
              <input type="checkbox" checked={field.multiple ?? false}
                onChange={(e) => onUpdate({ ...field, multiple: e.target.checked || undefined })} />
              multiple (다중 업로드)
            </label>
          </div>
        )}

        {/* computed 보조 */}
        {isComputed && (
          <>
            <FieldSelect label="formula.computerId" value={field.formula?.computerId ?? ''} allowEmpty options={formulaOpts}
              onChange={(v) => onUpdate({
                ...field,
                formula: v ? { computerId: v } : undefined,
              })} />
            <FieldInput label="dependsOn (콤마 — 재계산 트리거)"
              value={(field.dependsOn ?? []).join(',')} mono
              onChange={(v) => onUpdate({
                ...field,
                dependsOn: v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined,
              })} />
          </>
        )}

        {/* 고급 토글 */}
        <div className="col-span-2 mt-1">
          <button type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            {advancedOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            고급 (description / 검증 / readOnly / 조건부)
          </button>
        </div>

        {advancedOpen && (
          <>
            <FieldInput label="description (필드 아래 도움말)"
              value={field.description ?? ''}
              onChange={(v) => onUpdate({ ...field, description: v || undefined })} />
            <FieldInput label="defaultValue (string/number/boolean)"
              value={field.defaultValue == null ? '' : String(field.defaultValue)}
              onChange={(v) => {
                if (v === '') return onUpdate({ ...field, defaultValue: undefined });
                if (v === 'true') return onUpdate({ ...field, defaultValue: true });
                if (v === 'false') return onUpdate({ ...field, defaultValue: false });
                const n = Number(v);
                onUpdate({ ...field, defaultValue: !Number.isNaN(n) && v.trim() !== '' ? n : v });
              }} />

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[10px]">
                <input type="checkbox" checked={field.readOnly ?? false}
                  onChange={(e) => onUpdate({ ...field, readOnly: e.target.checked || undefined })} />
                readOnly
              </label>
            </div>
            <div /> {/* spacer */}

            {/* 검증 — text/textarea */}
            {(field.type === 'text' || field.type === 'textarea') && (
              <>
                <FieldInput label="minLength" value={field.minLength == null ? '' : String(field.minLength)}
                  onChange={(v) => onUpdate({ ...field, minLength: v ? Number(v) : undefined })} />
                <FieldInput label="maxLength" value={field.maxLength == null ? '' : String(field.maxLength)}
                  onChange={(v) => onUpdate({ ...field, maxLength: v ? Number(v) : undefined })} />
              </>
            )}
            {/* 검증 — number */}
            {isNumber && (
              <>
                <FieldInput label="minValue" value={field.minValue == null ? '' : String(field.minValue)}
                  onChange={(v) => onUpdate({ ...field, minValue: v ? Number(v) : undefined })} />
                <FieldInput label="maxValue" value={field.maxValue == null ? '' : String(field.maxValue)}
                  onChange={(v) => onUpdate({ ...field, maxValue: v ? Number(v) : undefined })} />
              </>
            )}

            {/* visibleIf */}
            <div className="col-span-2 rounded border border-dashed p-2 space-y-1.5 bg-background">
              <p className="text-[10px] font-semibold text-muted-foreground">visibleIf (조건부 노출)</p>
              <div className="grid grid-cols-3 gap-2">
                <FieldInput label="field (의존)" value={field.visibleIf?.field ?? ''} mono
                  onChange={(v) => onUpdate({
                    ...field,
                    visibleIf: v ? { ...(field.visibleIf ?? { value: '' }), field: v } : undefined,
                  })} />
                <FieldInput label="value (문자열 또는 콤마 다중)" value={
                  Array.isArray(field.visibleIf?.value)
                    ? field.visibleIf!.value.join(',')
                    : (field.visibleIf?.value ?? '')
                }
                  onChange={(v) => {
                    if (!field.visibleIf?.field) return;
                    const value = v.includes(',') ? v.split(',').map(s => s.trim()).filter(Boolean) : v;
                    onUpdate({ ...field, visibleIf: { ...field.visibleIf, value } });
                  }} />
                <FieldSelect label="source" value={field.visibleIf?.source ?? 'field'} options={VISIBLE_SOURCES}
                  onChange={(v) => {
                    if (!field.visibleIf?.field) return;
                    onUpdate({ ...field, visibleIf: { ...field.visibleIf, source: v as 'field' | 'context' } });
                  }} />
              </div>
            </div>

            {/* readOnlyIf */}
            <div className="col-span-2 rounded border border-dashed p-2 space-y-1.5 bg-background">
              <p className="text-[10px] font-semibold text-muted-foreground">readOnlyIf (조건부 readonly)</p>
              <div className="grid grid-cols-3 gap-2">
                <FieldInput label="field (의존)" value={field.readOnlyIf?.field ?? ''} mono
                  onChange={(v) => onUpdate({
                    ...field,
                    readOnlyIf: v ? { ...(field.readOnlyIf ?? { value: '' }), field: v } : undefined,
                  })} />
                <FieldInput label="value (문자열 또는 콤마 다중)" value={
                  Array.isArray(field.readOnlyIf?.value)
                    ? field.readOnlyIf!.value.join(',')
                    : (field.readOnlyIf?.value ?? '')
                }
                  onChange={(v) => {
                    if (!field.readOnlyIf?.field) return;
                    const value = v.includes(',') ? v.split(',').map(s => s.trim()).filter(Boolean) : v;
                    onUpdate({ ...field, readOnlyIf: { ...field.readOnlyIf, value } });
                  }} />
                <FieldSelect label="source" value={field.readOnlyIf?.source ?? 'field'} options={VISIBLE_SOURCES}
                  onChange={(v) => {
                    if (!field.readOnlyIf?.field) return;
                    onUpdate({ ...field, readOnlyIf: { ...field.readOnlyIf, source: v as 'field' | 'context' } });
                  }} />
              </div>
            </div>
          </>
        )}
      </div>
      <div className="col-span-1 flex justify-end">
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={onRemove}><Trash2 className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}
