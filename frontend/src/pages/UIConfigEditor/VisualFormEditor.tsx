// MetaFormConfig 시각 편집기 — 섹션별 cols + 필드 인라인 편집.

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type { FieldConfig, FieldType, FormSection, MetaFormConfig } from '@/templates/types';
import { enumDictionaries, masterSources } from '@/templates/registry';
import { FieldInput, FieldSelect, TabButton, moveInArray } from './ArrayEditor';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'text' },
  { value: 'select', label: 'select' },
  { value: 'number', label: 'number' },
  { value: 'textarea', label: 'textarea' },
  { value: 'switch', label: 'switch' },
  { value: 'date', label: 'date' },
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
    </div>
  );
}

function SectionsTab({ value, onChange }: { value: MetaFormConfig; onChange: (next: MetaFormConfig) => void }) {
  const sections = value.sections ?? [];

  const setSections = (next: FormSection[]) => onChange({ ...value, sections: next });
  const updateSection = (idx: number, next: FormSection) =>
    setSections(sections.map((s, i) => (i === idx ? next : s)));

  const moveSection = (idx: number, dir: -1 | 1) =>
    setSections(moveInArray(sections, idx, dir));

  const removeSection = (idx: number) =>
    setSections(sections.filter((_, i) => i !== idx));

  const addSection = () =>
    setSections([...sections, { cols: 1, fields: [] }]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          섹션은 폼에서 위→아래 순. 각 섹션은 cols(1/2/3) grid + 필드 배열.
        </p>
        <Button size="sm" variant="outline" onClick={addSection}>
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
  section, index, total, onUpdate, onMoveUp, onMoveDown, onRemove,
}: {
  section: FormSection;
  index: number;
  total: number;
  onUpdate: (next: FormSection) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const enumOpts = useMemo(() => Object.keys(enumDictionaries).sort().map((id) => ({ value: id, label: id })), []);
  const masterOpts = useMemo(() => Object.keys(masterSources).sort().map((id) => ({ value: id, label: id })), []);

  const updateField = (fIdx: number, next: FieldConfig) =>
    onUpdate({ ...section, fields: (section.fields ?? []).map((f, i) => (i === fIdx ? next : f)) });

  const addField = () =>
    onUpdate({ ...section, fields: [...(section.fields ?? []), { key: 'new_field', label: '새 필드', type: 'text' }] });

  const moveField = (fIdx: number, dir: -1 | 1) =>
    onUpdate({ ...section, fields: moveInArray(section.fields ?? [], fIdx, dir) });

  const removeField = (fIdx: number) =>
    onUpdate({ ...section, fields: (section.fields ?? []).filter((_, i) => i !== fIdx) });

  return (
    <div className="rounded border bg-card">
      {/* 섹션 헤더 */}
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <span className="text-[10px] text-muted-foreground mono">섹션 #{index + 1}</span>
        <FieldSelect label="" value={String(section.cols ?? 1)} options={COLS_OPTIONS}
          onChange={(v) => onUpdate({ ...section, cols: Number(v) as 1 | 2 | 3 })} />
        <span className="text-[10px] text-muted-foreground">cols</span>
        <span className="ml-auto" />
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
        {(section.fields ?? []).map((field, fIdx) => (
          <div key={fIdx} className="rounded border p-2 grid grid-cols-12 gap-2 items-start text-xs bg-muted/20">
            <div className="col-span-1 flex flex-col items-center gap-1">
              <span className="text-[9px] text-muted-foreground mono">#{fIdx + 1}</span>
              <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                onClick={() => moveField(fIdx, -1)} disabled={fIdx === 0}><ChevronUp className="h-3 w-3" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                onClick={() => moveField(fIdx, 1)} disabled={fIdx === (section.fields ?? []).length - 1}><ChevronDown className="h-3 w-3" /></Button>
            </div>
            <div className="col-span-10 grid grid-cols-2 gap-2">
              <FieldInput label="key" value={field.key} mono
                onChange={(v) => updateField(fIdx, { ...field, key: v })} />
              <FieldInput label="label" value={field.label}
                onChange={(v) => updateField(fIdx, { ...field, label: v })} />
              <FieldSelect label="type" value={field.type} options={FIELD_TYPES}
                onChange={(v) => updateField(fIdx, { ...field, type: v as FieldType })} />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[10px]">
                  <input type="checkbox" checked={field.required ?? false}
                    onChange={(e) => updateField(fIdx, { ...field, required: e.target.checked })} />
                  required
                </label>
              </div>
              <FieldInput label="placeholder" value={field.placeholder ?? ''}
                onChange={(v) => updateField(fIdx, { ...field, placeholder: v || undefined })} />
              <FieldInput label="editableByRoles (콤마, 예: 'admin,operator')"
                value={(field.editableByRoles ?? []).join(',')}
                onChange={(v) => updateField(fIdx, {
                  ...field,
                  editableByRoles: v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined,
                })} />
              {/* select 타입 보조 */}
              {field.type === 'select' && (
                <>
                  <FieldSelect label="optionsFrom" value={field.optionsFrom ?? ''} allowEmpty options={OPTIONS_FROM}
                    onChange={(v) => updateField(fIdx, {
                      ...field,
                      optionsFrom: (v || undefined) as 'enum' | 'master' | 'static' | undefined,
                    })} />
                  {field.optionsFrom === 'enum' && (
                    <FieldSelect label="enumKey" value={field.enumKey ?? ''} allowEmpty options={enumOpts}
                      onChange={(v) => updateField(fIdx, { ...field, enumKey: v || undefined })} />
                  )}
                  {field.optionsFrom === 'master' && (
                    <FieldSelect label="masterKey" value={field.masterKey ?? ''} allowEmpty options={masterOpts}
                      onChange={(v) => updateField(fIdx, { ...field, masterKey: v || undefined })} />
                  )}
                </>
              )}
            </div>
            <div className="col-span-1 flex justify-end">
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => removeField(fIdx)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
        {(section.fields ?? []).length === 0 && (
          <div className="text-center py-3 text-[10px] text-muted-foreground border border-dashed rounded">
            필드가 없습니다
          </div>
        )}
      </div>
    </div>
  );
}
