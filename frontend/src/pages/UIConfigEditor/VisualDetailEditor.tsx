// MetaDetailConfig 시각 편집기 — 섹션별 cols + 필드 (formatter/span 위주) 인라인 편집.

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type { DetailFieldConfig, DetailFormatter, DetailSectionConfig, MetaDetailConfig } from '@/templates/types';
import { cellRenderers, contentBlocks, enumDictionaries } from '@/templates/registry';
import { FieldInput, FieldSelect, TabButton, moveInArray } from './ArrayEditor';

const FORMATTER_OPTIONS = [
  { value: 'date', label: 'date' },
  { value: 'number', label: 'number' },
  { value: 'kw', label: 'kw' },
  { value: 'currency', label: 'currency' },
  { value: 'enum', label: 'enum (사전 매핑)' },
];

const COLS_OPTIONS = [
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
];

const SPAN_OPTIONS = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
];

type Tab = 'basic' | 'sections' | 'json';

export interface VisualDetailEditorProps {
  value: MetaDetailConfig;
  onChange: (next: MetaDetailConfig) => void;
  jsonDraft: string;
  onJsonDraftChange: (next: string) => void;
}

export default function VisualDetailEditor({
  value, onChange, jsonDraft, onJsonDraftChange,
}: VisualDetailEditorProps) {
  const [tab, setTab] = useState<Tab>('basic');
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


function BasicTab({ value, onChange }: { value: MetaDetailConfig; onChange: (next: MetaDetailConfig) => void }) {
  const source = value.source ?? { hookId: '' };
  const header = value.header ?? { title: '' };
  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">id <span className="text-muted-foreground">(불변)</span></Label>
        <Input value={value.id ?? ''} disabled className="font-mono text-xs bg-muted" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">데이터 hookId <span className="text-muted-foreground">(registry.detailDataHooks)</span></Label>
        <Input value={source.hookId}
          onChange={(e) => onChange({ ...value, source: { hookId: e.target.value } })}
          className="font-mono text-xs" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">header.title (페이지 제목)</Label>
        <Input value={header.title}
          onChange={(e) => onChange({ ...value, header: { ...header, title: e.target.value } })} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        header.actionsBlock·extraBlocks 편집은 JSON 탭. 같은 패턴으로 별도 탭 가능 (follow-up).
      </p>
    </div>
  );
}

function SectionsTab({ value, onChange }: { value: MetaDetailConfig; onChange: (next: MetaDetailConfig) => void }) {
  const sections = value.sections ?? [];
  const blockOptions = useMemo(() => Object.keys(contentBlocks).sort().map((id) => ({ value: id, label: id })), []);

  const updateSection = (idx: number, next: DetailSectionConfig) =>
    onChange({ ...value, sections: sections.map((s, i) => (i === idx ? next : s)) });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          데이터 섹션 또는 contentBlock 슬롯. 필드와 contentBlock은 둘 중 하나만 사용.
        </p>
        <Button size="sm" variant="outline"
          onClick={() => onChange({
            ...value,
            sections: [...sections, { title: '새 섹션', cols: 4, fields: [] }],
          })}>
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
            blockOptions={blockOptions}
            onUpdate={(next) => updateSection(sIdx, next)}
            onMoveUp={() => onChange({ ...value, sections: moveInArray(sections, sIdx, -1) })}
            onMoveDown={() => onChange({ ...value, sections: moveInArray(sections, sIdx, 1) })}
            onRemove={() => onChange({ ...value, sections: sections.filter((_, i) => i !== sIdx) })}
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
  section, index, total, blockOptions, onUpdate, onMoveUp, onMoveDown, onRemove,
}: {
  section: DetailSectionConfig;
  index: number;
  total: number;
  blockOptions: { value: string; label: string }[];
  onUpdate: (next: DetailSectionConfig) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const enumOpts = useMemo(() => Object.keys(enumDictionaries).sort().map((id) => ({ value: id, label: id })), []);
  const rendererOpts = useMemo(() => Object.keys(cellRenderers).sort().map((id) => ({ value: id, label: id })), []);

  const isContentBlock = !!section.contentBlock;
  const fields = section.fields ?? [];

  const updateField = (fIdx: number, next: DetailFieldConfig) =>
    onUpdate({ ...section, fields: fields.map((f, i) => (i === fIdx ? next : f)) });

  return (
    <div className="rounded border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <span className="text-[10px] text-muted-foreground mono">섹션 #{index + 1}</span>
        <Input className="h-7 text-xs flex-1 max-w-md" value={section.title}
          onChange={(e) => onUpdate({ ...section, title: e.target.value })}
          placeholder="섹션 제목" />
        <FieldSelect label="" value={String(section.cols ?? 4)} options={COLS_OPTIONS}
          onChange={(v) => onUpdate({ ...section, cols: Number(v) as 2 | 3 | 4 })} />
        <span className="text-[10px] text-muted-foreground">cols</span>
        <span className="ml-auto" />
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
          onClick={onMoveUp} disabled={index === 0}><ChevronUp className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
          onClick={onMoveDown} disabled={index === total - 1}><ChevronDown className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input type="radio" name={`mode-${index}`} checked={!isContentBlock}
              onChange={() => onUpdate({ ...section, contentBlock: undefined, fields: section.fields ?? [] })} />
            데이터 필드
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name={`mode-${index}`} checked={isContentBlock}
              onChange={() => onUpdate({
                ...section,
                fields: undefined,
                contentBlock: { blockId: blockOptions[0]?.value ?? '', props: {} },
              })} />
            contentBlock (커스텀 슬롯)
          </label>
        </div>

        {isContentBlock ? (
          <div className="grid grid-cols-2 gap-2">
            <FieldSelect label="contentBlock.blockId (registry.contentBlocks)"
              value={section.contentBlock?.blockId ?? ''} options={blockOptions}
              onChange={(v) => onUpdate({
                ...section,
                contentBlock: { blockId: v, props: section.contentBlock?.props },
              })} />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">필드 ({fields.length})</p>
              <Button size="sm" variant="ghost" className="h-6 text-[10px]"
                onClick={() => onUpdate({
                  ...section,
                  fields: [...fields, { key: 'new_field', label: '새 필드' }],
                })}>
                <Plus className="h-3 w-3 mr-1" />필드 추가
              </Button>
            </div>
            {fields.map((field, fIdx) => (
              <div key={fIdx} className="rounded border p-2 grid grid-cols-12 gap-2 text-xs bg-muted/20">
                <div className="col-span-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] mono">#{fIdx + 1}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                    onClick={() => onUpdate({ ...section, fields: moveInArray(fields, fIdx, -1) })}
                    disabled={fIdx === 0}><ChevronUp className="h-3 w-3" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                    onClick={() => onUpdate({ ...section, fields: moveInArray(fields, fIdx, 1) })}
                    disabled={fIdx === fields.length - 1}><ChevronDown className="h-3 w-3" /></Button>
                </div>
                <div className="col-span-10 grid grid-cols-2 gap-2">
                  <FieldInput label="key (데이터 경로)" value={field.key} mono
                    onChange={(v) => updateField(fIdx, { ...field, key: v })} />
                  <FieldInput label="label" value={field.label}
                    onChange={(v) => updateField(fIdx, { ...field, label: v })} />
                  <FieldSelect label="formatter" value={field.formatter ?? ''} allowEmpty options={FORMATTER_OPTIONS}
                    onChange={(v) => updateField(fIdx, {
                      ...field,
                      formatter: (v || undefined) as DetailFormatter | undefined,
                    })} />
                  {field.formatter === 'enum' && (
                    <FieldSelect label="enumKey" value={field.enumKey ?? ''} allowEmpty options={enumOpts}
                      onChange={(v) => updateField(fIdx, { ...field, enumKey: v || undefined })} />
                  )}
                  <FieldSelect label="rendererId (커스텀, formatter보다 우선)"
                    value={field.rendererId ?? ''} allowEmpty options={rendererOpts}
                    onChange={(v) => updateField(fIdx, { ...field, rendererId: v || undefined })} />
                  <FieldSelect label="span" value={String(field.span ?? 1)} options={SPAN_OPTIONS}
                    onChange={(v) => updateField(fIdx, { ...field, span: Number(v) as 1 | 2 | 3 | 4 })} />
                  <FieldInput label="suffix (예: 'Wp', '원/Wp')" value={field.suffix ?? ''}
                    onChange={(v) => updateField(fIdx, { ...field, suffix: v || undefined })} />
                  <FieldInput label="fallback (빈 값, 기본 '—')" value={field.fallback ?? ''}
                    onChange={(v) => updateField(fIdx, { ...field, fallback: v || undefined })} />
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => onUpdate({ ...section, fields: fields.filter((_, i) => i !== fIdx) })}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
            {fields.length === 0 && (
              <div className="text-center py-3 text-[10px] text-muted-foreground border border-dashed rounded">
                필드가 없습니다
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
