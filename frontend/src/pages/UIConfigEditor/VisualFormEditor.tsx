// MetaFormConfig 시각 편집기 — 섹션별 cols + 필드 인라인 편집.

import { useMemo, useState } from 'react';

// 필드 검증 — registry/key 충돌/누락 의존성 즉시 감지
type FieldIssue = { level: 'error' | 'warn'; msg: string };
function validateField(
  field: FieldConfig,
  allFieldKeys: string[],
  allFormFieldKeys: string[],
): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (!field.key.trim()) issues.push({ level: 'error', msg: 'key 가 비어 있습니다' });
  if (!field.label.trim()) issues.push({ level: 'error', msg: 'label 이 비어 있습니다' });
  if (allFieldKeys.filter((k) => k === field.key).length > 1) {
    issues.push({ level: 'error', msg: `key '${field.key}' 가 폼 내에서 중복됩니다` });
  }
  // registry 검증
  if (field.optionsFrom === 'enum' && field.enumKey && !(field.enumKey in enumDictionaries)) {
    issues.push({ level: 'error', msg: `enumKey '${field.enumKey}' 가 registry 에 없습니다` });
  }
  if (field.optionsFrom === 'master' && field.masterKey && !(field.masterKey in masterSources)) {
    issues.push({ level: 'error', msg: `masterKey '${field.masterKey}' 가 registry 에 없습니다` });
  }
  if (field.formula?.computerId && !(field.formula.computerId in computedFormulas)) {
    issues.push({ level: 'error', msg: `formula.computerId '${field.formula.computerId}' 가 registry 에 없습니다` });
  }
  if (field.type === 'computed' && !field.formula?.computerId) {
    issues.push({ level: 'warn', msg: 'computed 타입인데 formula.computerId 미지정' });
  }
  // 의존성 필드 존재 확인
  for (const dep of field.dependsOn ?? []) {
    if (!allFormFieldKeys.includes(dep)) {
      issues.push({ level: 'warn', msg: `dependsOn '${dep}' 필드가 폼에 없습니다` });
    }
  }
  for (const dep of field.optionsDependsOn ?? []) {
    if (!allFormFieldKeys.includes(dep)) {
      issues.push({ level: 'warn', msg: `optionsDependsOn '${dep}' 필드가 폼에 없습니다` });
    }
  }
  if (field.visibleIf?.field && (field.visibleIf.source ?? 'field') === 'field'
      && !allFormFieldKeys.includes(field.visibleIf.field)) {
    issues.push({ level: 'warn', msg: `visibleIf.field '${field.visibleIf.field}' 가 폼에 없습니다` });
  }
  if (field.readOnlyIf?.field && (field.readOnlyIf.source ?? 'field') === 'field'
      && !allFormFieldKeys.includes(field.readOnlyIf.field)) {
    issues.push({ level: 'warn', msg: `readOnlyIf.field '${field.readOnlyIf.field}' 가 폼에 없습니다` });
  }
  return issues;
}

// 새 필드 key 생성 — 충돌 안 나는 'field_N' 또는 'new_field_N'
function suggestFieldKey(existingKeys: string[]): string {
  const base = 'field';
  for (let i = 1; i < 1000; i++) {
    const candidate = `${base}_${i}`;
    if (!existingKeys.includes(candidate)) return candidate;
  }
  return 'new_field';
}
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Plus, Trash2, GripVertical, Copy, Settings2 } from 'lucide-react';
import type { AsyncRefineRule, FieldConfig, FieldType, FormSection, MetaFormConfig, Tone } from '@/templates/types';
import { asyncRefinements, buildRegistryEntries, enumDictionaries, enumDictionaryMeta, masterSources, masterSourceMeta, computedFormulas, permissionGuards } from '@/templates/registry';
import { FieldInput, FieldSelect, TabButton, moveInArray } from './ArrayEditor';
import { EditorWithPanel, PanelGroup, PanelEmpty, PanelSelectionHeader } from './RightPanel';
import { BooleanPicker, RegistryIdPicker, RolePicker, type RegistryEntry } from './Pickers';

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
  { value: 'child_array', label: 'child_array (자식 행 배열)' },
  { value: 'date_range', label: 'date_range (시작/종료 페어)' },
  { value: 'currency_amount', label: 'currency_amount (통화+금액)' },
  { value: 'address', label: 'address (우편번호+도로명+상세)' },
  { value: 'rich_text', label: 'rich_text (서식 메모)' },
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
  // Phase 4 follow-up #1: 선택된 필드 (sectionIdx, fieldIdx) — selection-driven 우측 패널
  const [selectedField, setSelectedField] = useState<{ sec: number; field: number } | null>(null);
  // 방어: sections·fields가 누락된 부분 JSON에서도 안전하게
  const sections = value.sections ?? [];
  const fieldCount = sections.reduce((s, sec) => s + (sec.fields?.length ?? 0), 0);

  const selectedFieldConfig = selectedField
    ? sections[selectedField.sec]?.fields?.[selectedField.field]
    : null;

  const main = (
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
        {tab === 'sections' && (
          <SectionsTab
            value={value}
            onChange={onChange}
            onSelectField={(sec, field) => setSelectedField({ sec, field })}
          />
        )}
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

  // 우측 패널: 필드 선택 시 selection-driven, 아니면 form-level
  const panel = selectedFieldConfig
    ? (
      <FieldPanel
        field={selectedFieldConfig}
        onChange={(next) => {
          if (!selectedField) return;
          const newSections = sections.map((s, sIdx) => {
            if (sIdx !== selectedField.sec) return s;
            const newFields = (s.fields ?? []).map((f, fIdx) => fIdx === selectedField.field ? next : f);
            return { ...s, fields: newFields };
          });
          onChange({ ...value, sections: newSections });
        }}
        onBack={() => setSelectedField(null)}
      />
    )
    : <FormLevelPanel value={value} onChange={onChange} />;

  const panelTitle = selectedFieldConfig
    ? `선택: ${selectedFieldConfig.label || selectedFieldConfig.key}`
    : '⚙ 폼 설정';

  return <EditorWithPanel panel={panel} panelTitle={panelTitle}>{main}</EditorWithPanel>;
}

// ─── 우측 패널: 선택된 필드의 L3/L4 (selection-driven, security focus) ─────
// Phase 4 follow-up #1 — Q8-B 풀 구현. 새 인프라 보안 픽커는 여기.
// 기존 inline 필드 (key/label/type/검증 등) 는 sections 탭의 row 에서 그대로 편집.
// 이 패널은 보안·동적 권한 등 새 메타 인프라 항목 전용.
function FieldPanel({
  field, onChange, onBack,
}: {
  field: FieldConfig;
  onChange: (next: FieldConfig) => void;
  onBack: () => void;
}) {
  const guardEntries = useMemo(
    () => Object.entries(permissionGuards).map(([id, e]) => ({
      id,
      label: e.label,
      description: e.description,
    })),
    [],
  );
  return (
    <>
      <PanelSelectionHeader
        title={field.label || field.key}
        subtitle={`${field.key} · ${field.type}`}
        onBack={onBack}
      />
      <PanelGroup title="보안 (역할 기반)">
        <RolePicker
          label="maskByRoles (마스킹 — ●●●●●●)"
          value={field.maskByRoles}
          onChange={(v) => onChange({ ...field, maskByRoles: v })}
          hint="이 역할에는 값을 마스킹 표시 + 편집 불가"
        />
        <RolePicker
          label="editableByRoles (편집 허용 역할)"
          value={field.editableByRoles}
          onChange={(v) => onChange({ ...field, editableByRoles: v })}
          hint="비우면 모두 편집 가능. 지정 시 그 외 역할은 readOnly"
        />
        <RegistryIdPicker
          label="permissionGuardId (동적 권한)"
          value={field.permissionGuardId}
          onChange={(v) => onChange({ ...field, permissionGuardId: v })}
          entries={guardEntries}
          hint="컨텍스트 (현재 row, role) 로 readOnly 동적 결정"
        />
      </PanelGroup>
      <PanelGroup title="기본 설정" defaultOpen={false}>
        <BooleanPicker
          label="readOnly (정적)"
          value={field.readOnly ?? false}
          onChange={(v) => onChange({ ...field, readOnly: v || undefined })}
        />
        <BooleanPicker
          label="required"
          value={field.required ?? false}
          onChange={(v) => onChange({ ...field, required: v || undefined })}
        />
        <FieldInput
          label="description (필드 아래 설명)"
          value={field.description ?? ''}
          onChange={(v) => onChange({ ...field, description: v || undefined })}
        />
      </PanelGroup>
      <PanelEmpty message="key/label/type/검증/visibleIf 는 해당 필드 행에서 직접 편집" />
    </>
  );
}

// ─── 우측 패널: form-level 컨테이너 설정 (L1) ─────────────────────────────
// asyncRefine[] 비동기 검증 규칙 편집 — 가장 새 메타 인프라 항목.
function FormLevelPanel({
  value, onChange,
}: {
  value: MetaFormConfig;
  onChange: (next: MetaFormConfig) => void;
}) {
  const asyncRefineEntries: RegistryEntry[] = useMemo(
    () => Object.entries(asyncRefinements).map(([id, e]) => ({
      id,
      label: e.label,
      description: e.description,
    })),
    [],
  );
  const rules = value.asyncRefine ?? [];

  const addRule = () => {
    const next: AsyncRefineRule = { ruleId: '', message: '검증 실패' };
    onChange({ ...value, asyncRefine: [...rules, next] });
  };
  const updateRule = (idx: number, patch: Partial<AsyncRefineRule>) => {
    const next = rules.map((r, i) => i === idx ? { ...r, ...patch } : r);
    onChange({ ...value, asyncRefine: next });
  };
  const removeRule = (idx: number) => {
    const next = rules.filter((_, i) => i !== idx);
    onChange({ ...value, asyncRefine: next.length === 0 ? undefined : next });
  };

  return (
    <>
      <PanelGroup title="비동기 검증 (asyncRefine)">
        {rules.length === 0 ? (
          <PanelEmpty message="규칙 없음 — 아래 + 로 추가" />
        ) : (
          rules.map((r, i) => (
            <div key={i} className="rounded border p-2 space-y-1.5 bg-background">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">규칙 #{i + 1}</span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => removeRule(i)}
                  aria-label="삭제"
                >
                  ✕
                </button>
              </div>
              <RegistryIdPicker
                label="ruleId"
                value={r.ruleId}
                onChange={(v) => updateRule(i, { ruleId: v ?? '' })}
                entries={asyncRefineEntries}
                hint="registry.asyncRefinements 에 등록된 키"
                allowEmpty={false}
              />
              <FieldInput
                label="message (실패 시 표시)"
                value={r.message}
                onChange={(v) => updateRule(i, { message: v })}
              />
              <FieldInput
                label="path (콤마 = 다중, 비우면 form-level)"
                value={(r.path ?? []).join(',')}
                onChange={(v) => {
                  const path = v.split(',').map(s => s.trim()).filter(Boolean);
                  updateRule(i, { path: path.length === 0 ? undefined : path });
                }}
                mono
              />
            </div>
          ))
        )}
        <button
          type="button"
          onClick={addRule}
          className="w-full text-xs text-muted-foreground hover:text-foreground border border-dashed rounded py-1.5"
        >
          + 비동기 검증 규칙 추가
        </button>
      </PanelGroup>
    </>
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

function SectionsTab({ value, onChange, onSelectField }: {
  value: MetaFormConfig;
  onChange: (next: MetaFormConfig) => void;
  // Phase 4 follow-up #1: 필드 ⚙ 클릭 → 우측 패널.
  onSelectField?: (sectionIdx: number, fieldIdx: number) => void;
}) {
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

  // 폼 전체 필드 key 목록 — 의존성 검증 + smart key 추천
  const allFormFieldKeys = useMemo(
    () => sections.flatMap((s) => (s.fields ?? []).map((f) => f.key)),
    [sections],
  );

  // 폼 전체 검증 요약 — 상단 배너에 표시
  const formIssueCounts = useMemo(() => {
    let error = 0; let warn = 0;
    sections.forEach((sec) => {
      (sec.fields ?? []).forEach((f) => {
        validateField(f, allFormFieldKeys, allFormFieldKeys).forEach((i) => {
          if (i.level === 'error') error++;
          else warn++;
        });
      });
    });
    return { error, warn };
  }, [sections, allFormFieldKeys]);

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
          <span className="text-xs text-muted-foreground">
            {filteredSet?.size ?? 0} / {totalFields}
          </span>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={expandAll}>모두 펼치기</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={collapseAll}>모두 접기</Button>
        <Button size="sm" variant="outline" className="h-7" onClick={addSection}>
          <Plus className="h-3 w-3 mr-1" />섹션 추가
        </Button>
      </div>

      {(formIssueCounts.error > 0 || formIssueCounts.warn > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs">
          <span className="font-medium text-amber-900">검증:</span>
          {formIssueCounts.error > 0 && (
            <span className="rounded bg-rose-200 px-1.5 py-0.5 font-medium text-rose-800">
              error {formIssueCounts.error}
            </span>
          )}
          {formIssueCounts.warn > 0 && (
            <span className="rounded bg-amber-200 px-1.5 py-0.5 font-medium text-amber-800">
              warn {formIssueCounts.warn}
            </span>
          )}
          <span className="text-muted-foreground">
            붉은/노란 점이 표시된 행을 펼쳐 상세 메시지 확인
          </span>
        </div>
      )}
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
            allFormFieldKeys={allFormFieldKeys}
            onToggleField={(fIdx) => toggleField(sIdx, fIdx)}
            onAddedField={(fIdx) => setExpandedSet((p) => new Set(p).add(`${sIdx}.${fIdx}`))}
            onUpdate={(next) => updateSection(sIdx, next)}
            onMoveUp={() => moveSection(sIdx, -1)}
            onMoveDown={() => moveSection(sIdx, 1)}
            onRemove={() => removeSection(sIdx)}
            onSelectField={(fIdx) => onSelectField?.(sIdx, fIdx)}
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
  section, index, total, filter, filteredSet, expandedSet, allFormFieldKeys,
  onToggleField, onAddedField, onUpdate, onMoveUp, onMoveDown, onRemove, onSelectField,
}: {
  section: FormSection;
  index: number;
  total: number;
  filter: string;
  filteredSet: Set<string> | null;
  expandedSet: Set<string>;
  allFormFieldKeys: string[];
  onToggleField: (fIdx: number) => void;
  onAddedField: (fIdx: number) => void;
  onUpdate: (next: FormSection) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onSelectField?: (fIdx: number) => void;
}) {
  // 드래그 상태 — 섹션 내 필드 재정렬 (section-local)
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const onDragStart = (fIdx: number) => setDragIdx(fIdx);
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };
  const onDragOver = (fIdx: number) => { if (fIdx !== dragIdx) setOverIdx(fIdx); };
  const onDrop = (fIdx: number) => {
    if (dragIdx === null || dragIdx === fIdx) { onDragEnd(); return; }
    const next = [...(section.fields ?? [])];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(fIdx, 0, moved);
    onUpdate({ ...section, fields: next });
    onDragEnd();
  };

  const updateField = (fIdx: number, next: FieldConfig) =>
    onUpdate({ ...section, fields: (section.fields ?? []).map((f, i) => (i === fIdx ? next : f)) });

  const addField = () => {
    const newIdx = (section.fields ?? []).length;
    const newKey = suggestFieldKey(allFormFieldKeys);
    onUpdate({ ...section, fields: [...(section.fields ?? []), { key: newKey, label: '새 필드', type: 'text' }] });
    // 새 필드는 자동으로 펼침
    onAddedField(newIdx);
  };

  const moveField = (fIdx: number, dir: -1 | 1) =>
    onUpdate({ ...section, fields: moveInArray(section.fields ?? [], fIdx, dir) });

  const removeField = (fIdx: number) =>
    onUpdate({ ...section, fields: (section.fields ?? []).filter((_, i) => i !== fIdx) });

  const duplicateField = (fIdx: number) => {
    const src = (section.fields ?? [])[fIdx];
    const newKey = suggestFieldKey(allFormFieldKeys);
    const cloned: FieldConfig = { ...src, key: newKey, label: `${src.label} (복사)` };
    const next = [...(section.fields ?? [])];
    next.splice(fIdx + 1, 0, cloned);
    onUpdate({ ...section, fields: next });
    // 복제된 항목 자동 펼침
    onAddedField(fIdx + 1);
  };

  return (
    <div className="rounded border bg-card">
      {/* 섹션 헤더 */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <span className="text-xs text-muted-foreground mono">섹션 #{index + 1}</span>
        <FieldSelect label="" value={String(section.cols ?? 1)} options={COLS_OPTIONS}
          onChange={(v) => onUpdate({ ...section, cols: Number(v) as 1 | 2 | 3 })} />
        <span className="text-xs text-muted-foreground">cols</span>
        <input type="text" value={section.title ?? ''}
          onChange={(e) => onUpdate({ ...section, title: e.target.value || undefined })}
          placeholder="title (옵션 — 섹션 헤더)"
          className="h-7 flex-1 min-w-[140px] rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
        <FieldSelect label="" value={section.tone ?? ''} allowEmpty options={TONES}
          onChange={(v) => onUpdate({ ...section, tone: (v || undefined) as Tone | undefined })} />
        <span className="text-xs text-muted-foreground">tone</span>
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
          <p className="text-xs text-muted-foreground">필드 ({(section.fields ?? []).length})</p>
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={addField}>
            <Plus className="h-3 w-3 mr-1" />필드 추가
          </Button>
        </div>
        {(section.fields ?? []).map((field, fIdx) => {
          const k = `${index}.${fIdx}`;
          // 검색 활성 시 매칭 안 된 필드는 숨김 (filteredSet 이 있는데 not in)
          if (filteredSet && !filteredSet.has(k)) return null;
          // 검색 매칭 또는 사용자가 직접 펼친 경우 expanded
          const isExpanded = expandedSet.has(k) || (filter !== '' && filteredSet?.has(k) === true);
          const isDragging = dragIdx === fIdx;
          const isDragOver = overIdx === fIdx && dragIdx !== fIdx;
          const issues = validateField(field, allFormFieldKeys, allFormFieldKeys);
          return (
            <div
              key={fIdx}
              draggable={!isExpanded /* 펼쳐진 행은 input 편집 위해 drag 비활성 */}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                onDragStart(fIdx);
              }}
              onDragOver={(e) => { e.preventDefault(); onDragOver(fIdx); }}
              onDragEnd={onDragEnd}
              onDrop={(e) => { e.preventDefault(); onDrop(fIdx); }}
              className={`${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'border-t-2 border-t-foreground' : ''} transition-opacity`}
            >
              <FieldRow
                field={field}
                index={fIdx}
                total={(section.fields ?? []).length}
                expanded={isExpanded}
                issues={issues}
                onToggleExpand={() => onToggleField(fIdx)}
                onUpdate={(next) => updateField(fIdx, next)}
                onMoveUp={() => moveField(fIdx, -1)}
                onMoveDown={() => moveField(fIdx, 1)}
                onDuplicate={() => duplicateField(fIdx)}
                onRemove={() => removeField(fIdx)}
                onSelect={onSelectField ? () => onSelectField(fIdx) : undefined}
              />
            </div>
          );
        })}
        {(section.fields ?? []).length === 0 && (
          <div className="text-center py-3 text-xs text-muted-foreground border border-dashed rounded">
            필드가 없습니다
          </div>
        )}
        {filter && (section.fields ?? []).length > 0 && filteredSet && (section.fields ?? []).every((_, fIdx) => !filteredSet.has(`${index}.${fIdx}`)) && (
          <div className="text-center py-2 text-xs text-muted-foreground italic">
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
  field, index, total, expanded, issues, onToggleExpand,
  onUpdate, onMoveUp, onMoveDown, onDuplicate, onRemove, onSelect,
}: {
  field: FieldConfig;
  index: number;
  total: number;
  expanded: boolean;
  issues: FieldIssue[];
  onToggleExpand: () => void;
  onUpdate: (next: FieldConfig) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onSelect?: () => void;
}) {
  const errorCount = issues.filter((i) => i.level === 'error').length;
  const warnCount = issues.filter((i) => i.level === 'warn').length;
  const issueTitle = issues.map((i) => `[${i.level}] ${i.msg}`).join('\n');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const enumEntries = useMemo(() => buildRegistryEntries(enumDictionaries, enumDictionaryMeta), []);
  const masterEntries = useMemo(() => buildRegistryEntries(masterSources, masterSourceMeta), []);
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
          <GripVertical className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()} />
          {/* 검증 표시: 에러는 빨간 점, 경고는 노란 점, 정상은 빈 칸 */}
          {errorCount > 0 ? (
            <span title={issueTitle} className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" aria-label={`error ${errorCount}개`} />
          ) : warnCount > 0 ? (
            <span title={issueTitle} className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" aria-label={`warn ${warnCount}개`} />
          ) : (
            <span className="h-1.5 w-1.5 shrink-0" />
          )}
          <span className="text-[9px] text-muted-foreground mono w-6 text-right shrink-0">#{index + 1}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="font-mono text-xs text-foreground/80 shrink-0">{field.key}</span>
          <span className="text-foreground/60 shrink-0">·</span>
          <span className="truncate">{field.label}</span>
          <span className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">{field.type}</span>
            {badges.map((b) => (
              <span key={b} className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-900">{b}</span>
            ))}
            {errorCount > 0 && (
              <span title={issueTitle} className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-medium text-rose-800">
                error {errorCount}
              </span>
            )}
            {warnCount > 0 && errorCount === 0 && (
              <span title={issueTitle} className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800">
                warn {warnCount}
              </span>
            )}
            {onSelect && (
              <Button type="button" variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" title="우측 패널에서 보안·검증 편집"
                onClick={(e) => { e.stopPropagation(); onSelect(); }}>
                <Settings2 className="h-3 w-3" />
              </Button>
            )}
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }} disabled={index === 0}>
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }} disabled={index === total - 1}>
              <ChevronDown className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" title="복제"
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
              <Copy className="h-3 w-3" />
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
        {issues.length > 0 && (
          <div className="col-span-2 space-y-0.5 rounded border border-rose-200 bg-rose-50 px-2 py-1">
            {issues.map((iss, i) => (
              <div key={i} className={`text-xs flex items-start gap-1 ${iss.level === 'error' ? 'text-rose-800' : 'text-amber-800'}`}>
                <span className={`rounded px-1 py-0 text-[9px] font-medium uppercase ${iss.level === 'error' ? 'bg-rose-200' : 'bg-amber-200'}`}>{iss.level}</span>
                <span>{iss.msg}</span>
              </div>
            ))}
          </div>
        )}
        <FieldInput label="key" value={field.key} mono
          onChange={(v) => onUpdate({ ...field, key: v })} />
        <FieldInput label="label" value={field.label}
          onChange={(v) => onUpdate({ ...field, label: v })} />
        <FieldSelect label="type" value={field.type} options={FIELD_TYPES}
          onChange={(v) => onUpdate({ ...field, type: v as FieldType })} />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
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
              <RegistryIdPicker label="enumKey"
                value={field.enumKey} entries={enumEntries}
                onChange={(v) => onUpdate({ ...field, enumKey: v })}
                hint="registry.enumDictionaries" />
            )}
            {field.optionsFrom === 'master' && (
              <>
                <RegistryIdPicker label="masterKey"
                  value={field.masterKey} entries={masterEntries}
                  onChange={(v) => onUpdate({ ...field, masterKey: v })}
                  hint="registry.masterSources" />
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
            <label className="flex items-center gap-1 text-xs">
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
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
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
              <label className="flex items-center gap-1 text-xs">
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
              <p className="text-xs font-semibold text-muted-foreground">visibleIf (조건부 노출)</p>
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
              <p className="text-xs font-semibold text-muted-foreground">readOnlyIf (조건부 readonly)</p>
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
      <div className="col-span-1 flex flex-col items-end gap-1">
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" title="복제"
          onClick={onDuplicate}><Copy className="h-3 w-3" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" title="삭제"
          onClick={onRemove}><Trash2 className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}
