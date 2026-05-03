// MetaDetailConfig 시각 편집기 — 섹션별 cols + 필드 (formatter/span 위주) 인라인 편집.
// Phase 4: tabs[] 편집 + 우측 패널 (L1 inlineEdit) + selection-driven tab metadata.

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Copy, GripVertical, Plus, Search, Settings2, Trash2 } from 'lucide-react';
import type { DetailFieldConfig, DetailFormatter, DetailSectionConfig, DetailTabConfig, MetaDetailConfig } from '@/templates/types';
import { buildRegistryEntries, cellRenderers, cellRendererMeta, contentBlocks, contentBlockMeta, enumDictionaries } from '@/templates/registry';
import { FieldInput, FieldSelect, TabButton, moveInArray } from './ArrayEditor';
import { EditorWithPanel, PanelGroup, PanelSelectionHeader, PanelEmpty } from './RightPanel';
import { TabsEditor } from './TabsEditor';
import { BooleanPicker, EndpointPicker, IdFieldPicker, InlineEditOptionsPicker, InlineEditTypePicker, RegistryIdPicker } from './Pickers';

const FORMATTER_OPTIONS = [
  { value: 'date', label: 'date' },
  { value: 'number', label: 'number' },
  { value: 'kw', label: 'kw' },
  { value: 'currency', label: 'currency' },
  { value: 'enum', label: 'enum (사전 매핑)' },
];

const COLS_OPTIONS = [
  { value: '1', label: '1' },
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

// PR #242 패턴 — DetailField 검증 (registry/key 충돌/누락 의존성)
type FieldIssue = { level: 'error' | 'warn'; msg: string };
function validateDetailField(
  field: DetailFieldConfig,
  allFieldKeys: string[],
  allDetailFieldKeys: string[],
): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (!field.key?.trim()) issues.push({ level: 'error', msg: 'key 가 비어 있습니다' });
  if (!field.label?.trim()) issues.push({ level: 'error', msg: 'label 이 비어 있습니다' });
  if (field.key && allFieldKeys.filter((k) => k === field.key).length > 1) {
    issues.push({ level: 'error', msg: `key '${field.key}' 가 detail 내에서 중복됩니다` });
  }
  if (field.formatter === 'enum') {
    if (!field.enumKey) {
      issues.push({ level: 'warn', msg: "formatter='enum' 인데 enumKey 미지정" });
    } else if (!(field.enumKey in enumDictionaries)) {
      issues.push({ level: 'error', msg: `enumKey '${field.enumKey}' 가 registry 에 없습니다` });
    }
  }
  if (field.rendererId && !(field.rendererId in cellRenderers)) {
    issues.push({ level: 'error', msg: `rendererId '${field.rendererId}' 가 registry 에 없습니다` });
  }
  if (field.visibleIf?.field && !allDetailFieldKeys.includes(field.visibleIf.field)) {
    issues.push({ level: 'warn', msg: `visibleIf.field '${field.visibleIf.field}' 가 detail 에 없습니다` });
  }
  return issues;
}

// 섹션 검증 — contentBlock.blockId 가 registry 에 있는지
function validateSection(section: DetailSectionConfig): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (section.contentBlock?.blockId && !(section.contentBlock.blockId in contentBlocks)) {
    issues.push({ level: 'error', msg: `contentBlock.blockId '${section.contentBlock.blockId}' 가 registry 에 없습니다` });
  }
  return issues;
}

type Tab = 'basic' | 'sections' | 'tabs' | 'json';

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
  // Phase 4 메타 인프라: tabs[] 편집 시 선택된 탭 (selection-driven 우측 패널).
  const [selectedTabIdx, setSelectedTabIdx] = useState<number | null>(null);
  // Phase 4 follow-up #1: sections 의 detailField 선택 (selection-driven 우측 패널).
  const [selectedDetailField, setSelectedDetailField] = useState<{ sec: number; field: number } | null>(null);
  const sections = value.sections ?? [];
  const fieldCount = sections.reduce((s, sec) => s + (sec.fields?.length ?? 0), 0);
  const tabs = value.tabs ?? [];

  const selectedDetailFieldConfig = selectedDetailField
    ? sections[selectedDetailField.sec]?.fields?.[selectedDetailField.field]
    : null;

  const main = (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b px-3 flex gap-1 overflow-x-auto">
        <TabButton active={tab === 'basic'} onClick={() => setTab('basic')}>기본 정보</TabButton>
        <TabButton active={tab === 'sections'} onClick={() => setTab('sections')}>
          섹션 ({sections.length}) · 필드 ({fieldCount})
        </TabButton>
        <TabButton active={tab === 'tabs'} onClick={() => setTab('tabs')}>
          탭 ({tabs.length})
        </TabButton>
        <TabButton active={tab === 'json'} onClick={() => setTab('json')}>JSON (고급)</TabButton>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {tab === 'basic' && <BasicTab value={value} onChange={onChange} />}
        {tab === 'sections' && (
          <SectionsTab
            value={value}
            onChange={onChange}
            onSelectDetailField={(sec, field) => setSelectedDetailField({ sec, field })}
          />
        )}
        {tab === 'tabs' && (
          <TabsTab
            value={value}
            onChange={onChange}
            selectedIdx={selectedTabIdx}
            onSelectIdx={setSelectedTabIdx}
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

  // 우측 패널 — 우선순위: detailField 선택 > 탭 선택 > detail-level
  const panel = selectedDetailFieldConfig
    ? (
      <DetailFieldPanel
        field={selectedDetailFieldConfig}
        onChange={(next) => {
          if (!selectedDetailField) return;
          const newSections = sections.map((s, sIdx) => {
            if (sIdx !== selectedDetailField.sec) return s;
            const newFields = (s.fields ?? []).map((f, fIdx) => fIdx === selectedDetailField.field ? next : f);
            return { ...s, fields: newFields };
          });
          onChange({ ...value, sections: newSections });
        }}
        onBack={() => setSelectedDetailField(null)}
      />
    )
    : tab === 'tabs' && selectedTabIdx !== null && tabs[selectedTabIdx]
    ? (
      <SelectedTabPanel
        tab={tabs[selectedTabIdx]}
        onChange={(next) => onChange({
          ...value,
          tabs: tabs.map((t, i) => i === selectedTabIdx ? next : t),
        })}
        onBack={() => setSelectedTabIdx(null)}
      />
    )
    : <DetailLevelPanel value={value} onChange={onChange} />;

  const panelTitle = selectedDetailFieldConfig
    ? `선택: ${selectedDetailFieldConfig.label || selectedDetailFieldConfig.key}`
    : tab === 'tabs' && selectedTabIdx !== null
    ? `선택: ${tabs[selectedTabIdx]?.label ?? ''}`
    : '⚙ 상세 화면 설정';

  return <EditorWithPanel panel={panel} panelTitle={panelTitle}>{main}</EditorWithPanel>;
}

// ─── 우측 패널: 선택된 detailField 의 L3/L4 ────────────────────────────────
function DetailFieldPanel({
  field, onChange, onBack,
}: {
  field: import('@/templates/types').DetailFieldConfig;
  onChange: (next: import('@/templates/types').DetailFieldConfig) => void;
  onBack: () => void;
}) {
  return (
    <>
      <PanelSelectionHeader
        title={field.label || field.key}
        subtitle={field.key}
        onBack={onBack}
      />
      <PanelGroup title="인라인 편집 (필드 클릭)">
        <BooleanPicker
          label="inlineEditable"
          value={field.inlineEditable ?? false}
          onChange={(v) => onChange({ ...field, inlineEditable: v || undefined })}
          hint="MetaDetailConfig.inlineEdit.enabled 도 활성화 필요"
        />
        {field.inlineEditable && (
          <>
            <InlineEditTypePicker
              value={field.inlineEditType}
              onChange={(v) => onChange({ ...field, inlineEditType: v as import('@/templates/types').DetailFieldConfig['inlineEditType'] })}
            />
            {field.inlineEditType === 'select' && (
              <InlineEditOptionsPicker
                value={field.inlineEditOptions}
                onChange={(v) => onChange({ ...field, inlineEditOptions: v })}
              />
            )}
          </>
        )}
      </PanelGroup>
      <PanelGroup title="조건부 노출 (visibleIf)" defaultOpen={false}>
        <FieldInput
          label="field (의존)"
          value={field.visibleIf?.field ?? ''}
          onChange={(v) => onChange({
            ...field,
            visibleIf: v ? { ...(field.visibleIf ?? { value: '' }), field: v } : undefined,
          })}
          mono
        />
        <FieldInput
          label="value (콤마 = 다중)"
          value={Array.isArray(field.visibleIf?.value) ? field.visibleIf!.value.join(',') : (field.visibleIf?.value ?? '')}
          onChange={(v) => {
            if (!field.visibleIf?.field) return;
            const value = v.includes(',') ? v.split(',').map(s => s.trim()).filter(Boolean) : v;
            onChange({ ...field, visibleIf: { ...field.visibleIf, value } });
          }}
        />
      </PanelGroup>
      <PanelEmpty message="key/label/formatter/span 은 해당 필드 행에서 직접 편집" />
    </>
  );
}

// ─── 탭 편집 sub-tab ──────────────────────────────────────────────────────
function TabsTab({
  value, onChange, selectedIdx, onSelectIdx,
}: {
  value: MetaDetailConfig;
  onChange: (next: MetaDetailConfig) => void;
  selectedIdx: number | null;
  onSelectIdx: (idx: number | null) => void;
}) {
  const tabs = value.tabs ?? [];
  return (
    <div className="space-y-3">
      <div className="rounded border bg-card">
        <TabsEditor
          tabs={tabs}
          onChange={(next) => onChange({ ...value, tabs: next.length === 0 ? undefined : next })}
          selectedIdx={selectedIdx}
          onSelectIdx={onSelectIdx}
        />
      </div>
      {tabs.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center text-xs text-muted-foreground">
          탭이 없습니다. 위 [+ 탭 추가] 로 시작하세요.<br />
          탭은 sections 와 함께 사용 가능 — 정의되면 sections 대신 탭 모드로 렌더.
        </div>
      ) : selectedIdx === null ? (
        <div className="rounded border border-dashed p-6 text-center text-xs text-muted-foreground">
          탭을 클릭하면 우측 패널에서 메타 편집 (label/key/visibleIf/contentBlock)
        </div>
      ) : (
        <div className="rounded border bg-muted/20 p-3 text-xs text-muted-foreground">
          선택: <span className="font-mono">{tabs[selectedIdx]?.key}</span>
          {' — '}내용 (sections / contentBlock) 은 우측 패널.
        </div>
      )}
    </div>
  );
}

// ─── 우측 패널: detail-level 컨테이너 설정 (L1) ───────────────────────────
function DetailLevelPanel({
  value, onChange,
}: {
  value: MetaDetailConfig;
  onChange: (next: MetaDetailConfig) => void;
}) {
  const inlineEdit = value.inlineEdit;
  return (
    <>
      <PanelGroup title="인라인 편집 (DetailField.inlineEditable)">
        <BooleanPicker
          label="활성화 (inlineEdit.enabled)"
          value={inlineEdit?.enabled ?? false}
          onChange={(v) => onChange({
            ...value,
            inlineEdit: v ? { ...(inlineEdit ?? {}), enabled: true } : undefined,
          })}
          hint="DetailField.inlineEditable=true 인 필드 즉시 편집 가능"
        />
        {inlineEdit?.enabled && (
          <>
            <EndpointPicker
              label="endpoint (PATCH URL)"
              value={inlineEdit.endpoint}
              onChange={(v) => onChange({ ...value, inlineEdit: { ...inlineEdit, endpoint: v } })}
              hint=":id 자리표시자 필요 — 예: /api/v1/banks/:id"
            />
            <IdFieldPicker
              label="idField (행 데이터 키)"
              value={inlineEdit.idField}
              onChange={(v) => onChange({ ...value, inlineEdit: { ...inlineEdit, idField: v } })}
              columnKeys={[]}
              hint="JSON 탭에서 직접 입력 가능 (예: id, bank_id)"
            />
          </>
        )}
      </PanelGroup>
      <PanelGroup title="기본 탭 (defaultTab)" defaultOpen={false}>
        <FieldInput
          label="defaultTab (탭 모드 시 기본 활성)"
          value={value.defaultTab ?? ''}
          onChange={(v) => onChange({ ...value, defaultTab: v || undefined })}
          mono
          placeholder="첫번째 탭 자동"
        />
      </PanelGroup>
    </>
  );
}

// ─── 우측 패널: 선택된 탭 메타 (selection-driven) ──────────────────────────
function SelectedTabPanel({
  tab, onChange, onBack,
}: {
  tab: DetailTabConfig;
  onChange: (next: DetailTabConfig) => void;
  onBack: () => void;
}) {
  const blockEntries = useMemo(() => buildRegistryEntries(contentBlocks, contentBlockMeta), []);
  return (
    <>
      <PanelSelectionHeader title={tab.label || tab.key} subtitle={`key: ${tab.key}`} onBack={onBack} />
      <PanelGroup title="기본">
        <FieldInput
          label="key (식별자, 변경 시 영속 상태 무효화)"
          value={tab.key}
          onChange={(v) => onChange({ ...tab, key: v })}
          mono
        />
        <FieldInput
          label="label"
          value={tab.label}
          onChange={(v) => onChange({ ...tab, label: v })}
        />
      </PanelGroup>
      <PanelGroup title="조건부 노출 (visibleIf)" defaultOpen={false}>
        <FieldInput
          label="field (의존 필드)"
          value={tab.visibleIf?.field ?? ''}
          onChange={(v) => onChange({
            ...tab,
            visibleIf: v ? { ...(tab.visibleIf ?? { value: '' }), field: v } : undefined,
          })}
          mono
        />
        <FieldInput
          label="value (콤마 = 다중)"
          value={Array.isArray(tab.visibleIf?.value) ? tab.visibleIf!.value.join(',') : (tab.visibleIf?.value ?? '')}
          onChange={(v) => {
            if (!tab.visibleIf?.field) return;
            const value = v.includes(',') ? v.split(',').map(s => s.trim()).filter(Boolean) : v;
            onChange({ ...tab, visibleIf: { ...tab.visibleIf, value } });
          }}
        />
      </PanelGroup>
      <PanelGroup title="contentBlock (커스텀 React 컴포넌트)" defaultOpen={false}>
        <RegistryIdPicker
          label="blockId"
          value={tab.contentBlock?.blockId}
          entries={blockEntries}
          onChange={(v) => onChange({
            ...tab,
            contentBlock: v ? { blockId: v, props: tab.contentBlock?.props } : undefined,
          })}
          hint="registry.contentBlocks"
        />
        <p className="text-xs text-muted-foreground">
          제공되면 sections 대신 이 블록 렌더. props 는 JSON 탭에서.
        </p>
      </PanelGroup>
      {!tab.sections && !tab.contentBlock && (
        <PanelEmpty message="이 탭에 sections / contentBlock 모두 없음 — JSON 탭에서 sections 추가 가능" />
      )}
    </>
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
      <p className="text-xs text-muted-foreground">
        header.actionsBlock·extraBlocks 편집은 JSON 탭. 같은 패턴으로 별도 탭 가능 (follow-up).
      </p>
    </div>
  );
}

function SectionsTab({ value, onChange, onSelectDetailField }: {
  value: MetaDetailConfig;
  onChange: (next: MetaDetailConfig) => void;
  onSelectDetailField?: (sectionIdx: number, fieldIdx: number) => void;
}) {
  const sections = value.sections ?? [];
  const blockOptions = useMemo(() => Object.keys(contentBlocks).sort().map((id) => ({ value: id, label: id })), []);

  // VisualFormEditor 사용성 시리즈 패턴 적용 — 섹션 collapse + 검색
  const [collapsedSet, setCollapsedSet] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const searchLower = search.trim().toLowerCase();

  // 검색 매칭 — title / fields key·label / contentBlock.blockId
  const matchesSearch = (sec: DetailSectionConfig): boolean => {
    if (!searchLower) return true;
    if (sec.title?.toLowerCase().includes(searchLower)) return true;
    if (sec.contentBlock?.blockId?.toLowerCase().includes(searchLower)) return true;
    return (sec.fields ?? []).some(
      (f) =>
        f.key?.toLowerCase().includes(searchLower) ||
        f.label?.toLowerCase().includes(searchLower),
    );
  };

  const matchedCount = sections.filter(matchesSearch).length;

  // PR #242 패턴 — detail 전체 필드 key 목록 + 검증 요약
  const allDetailFieldKeys = useMemo(
    () => sections.flatMap((s) => (s.fields ?? []).map((f) => f.key)),
    [sections],
  );
  const detailIssueCounts = useMemo(() => {
    let error = 0;
    let warn = 0;
    sections.forEach((sec) => {
      validateSection(sec).forEach((i) => {
        if (i.level === 'error') error++;
        else warn++;
      });
      (sec.fields ?? []).forEach((f) => {
        validateDetailField(f, allDetailFieldKeys, allDetailFieldKeys).forEach((i) => {
          if (i.level === 'error') error++;
          else warn++;
        });
      });
    });
    return { error, warn };
  }, [sections, allDetailFieldKeys]);

  const toggleSection = (idx: number) => {
    setCollapsedSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const expandAll = () => setCollapsedSet(new Set());
  const collapseAll = () => setCollapsedSet(new Set(sections.map((_, i) => i)));

  const updateSection = (idx: number, next: DetailSectionConfig) =>
    onChange({ ...value, sections: sections.map((s, i) => (i === idx ? next : s)) });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex-1 text-xs text-muted-foreground">
          데이터 섹션 또는 contentBlock 슬롯. 필드와 contentBlock은 둘 중 하나만 사용.
        </p>
        <Button size="sm" variant="outline"
          onClick={() => {
            const newIdx = sections.length;
            onChange({
              ...value,
              sections: [...sections, { title: '새 섹션', cols: 4, fields: [] }],
            });
            // 새 섹션은 자동 펼침 — 즉시 편집 가능
            setCollapsedSet((prev) => {
              const next = new Set(prev);
              next.delete(newIdx);
              return next;
            });
          }}>
          <Plus className="h-3 w-3 mr-1" />섹션 추가
        </Button>
      </div>
      {(detailIssueCounts.error > 0 || detailIssueCounts.warn > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px]">
          <span className="font-medium text-amber-900">검증:</span>
          {detailIssueCounts.error > 0 && (
            <span className="rounded bg-rose-200 px-1.5 py-0.5 font-medium text-rose-800">
              error {detailIssueCounts.error}
            </span>
          )}
          {detailIssueCounts.warn > 0 && (
            <span className="rounded bg-amber-200 px-1.5 py-0.5 font-medium text-amber-800">
              warn {detailIssueCounts.warn}
            </span>
          )}
          <span className="text-muted-foreground">
            붉은/노란 점이 표시된 섹션·필드를 펼쳐 상세 메시지 확인
          </span>
        </div>
      )}
      {sections.length > 1 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="섹션·필드 검색 (title / key / label)"
              className="h-7 pl-7 text-xs"
            />
            {searchLower && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                {matchedCount}/{sections.length}
              </span>
            )}
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={expandAll}>
            모두 펼침
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={collapseAll}>
            모두 접기
          </Button>
        </div>
      )}
      <div className="space-y-3">
        {sections.map((sec, sIdx) => {
          const isMatch = matchesSearch(sec);
          if (searchLower && !isMatch) return null;
          // 검색 매칭 시 자동 펼침 (사용자가 찾는 항목 즉시 보이도록)
          const isCollapsed = searchLower ? false : collapsedSet.has(sIdx);
          return (
            <SectionCard
              key={sIdx}
              section={sec}
              index={sIdx}
              total={sections.length}
              blockOptions={blockOptions}
              collapsed={isCollapsed}
              allDetailFieldKeys={allDetailFieldKeys}
              onToggleCollapse={() => toggleSection(sIdx)}
              onUpdate={(next) => updateSection(sIdx, next)}
              onMoveUp={() => onChange({ ...value, sections: moveInArray(sections, sIdx, -1) })}
              onMoveDown={() => onChange({ ...value, sections: moveInArray(sections, sIdx, 1) })}
              onDuplicate={() => {
                const src = sections[sIdx];
                // 필드 key 충돌 회피 — 모든 필드 key 에 _copy 접미
                const existingKeys = new Set(allDetailFieldKeys);
                const dedupedFields = (src.fields ?? []).map((f) => {
                  if (!f.key) return { ...f };
                  let candidate = `${f.key}_copy`;
                  let n = 2;
                  while (existingKeys.has(candidate)) { candidate = `${f.key}_copy${n}`; n++; }
                  existingKeys.add(candidate);
                  return { ...f, key: candidate };
                });
                const cloned: DetailSectionConfig = {
                  ...src,
                  title: `${src.title} (복사)`,
                  fields: src.fields ? dedupedFields : undefined,
                  contentBlock: src.contentBlock ? { ...src.contentBlock } : undefined,
                };
                onChange({ ...value, sections: [...sections.slice(0, sIdx + 1), cloned, ...sections.slice(sIdx + 1)] });
              }}
              onRemove={() => onChange({ ...value, sections: sections.filter((_, i) => i !== sIdx) })}
              onSelectField={onSelectDetailField ? (fIdx) => onSelectDetailField(sIdx, fIdx) : undefined}
            />
          );
        })}
        {sections.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded">
            섹션이 없습니다
          </div>
        )}
        {sections.length > 0 && searchLower && matchedCount === 0 && (
          <div className="text-center py-4 text-xs text-muted-foreground border border-dashed rounded">
            검색 결과 없음 — "{search}" 와 매칭되는 섹션·필드 없음
          </div>
        )}
      </div>
    </div>
  );
}

function SectionCard({
  section, index, total, blockOptions, collapsed, allDetailFieldKeys, onToggleCollapse,
  onUpdate, onMoveUp, onMoveDown, onDuplicate, onRemove, onSelectField,
}: {
  section: DetailSectionConfig;
  index: number;
  total: number;
  blockOptions: { value: string; label: string }[];
  collapsed: boolean;
  allDetailFieldKeys: string[];
  onToggleCollapse: () => void;
  onUpdate: (next: DetailSectionConfig) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onSelectField?: (fIdx: number) => void;
}) {
  const enumOpts = useMemo(() => Object.keys(enumDictionaries).sort().map((id) => ({ value: id, label: id })), []);
  const rendererEntries = useMemo(() => buildRegistryEntries(cellRenderers, cellRendererMeta), []);

  const isContentBlock = !!section.contentBlock;
  const fields = section.fields ?? [];

  // 섹션·필드 검증 결과 — 헤더 dot + 필드 행 inline message
  const sectionIssues = validateSection(section);
  const fieldIssuesByIdx = fields.map((f) => validateDetailField(f, allDetailFieldKeys, allDetailFieldKeys));
  const sectionErrorCount =
    sectionIssues.filter((i) => i.level === 'error').length +
    fieldIssuesByIdx.reduce((s, arr) => s + arr.filter((i) => i.level === 'error').length, 0);
  const sectionWarnCount =
    sectionIssues.filter((i) => i.level === 'warn').length +
    fieldIssuesByIdx.reduce((s, arr) => s + arr.filter((i) => i.level === 'warn').length, 0);
  const sectionIssueTitle = [
    ...sectionIssues.map((i) => `[${i.level}] (섹션) ${i.msg}`),
    ...fieldIssuesByIdx.flatMap((arr, fIdx) =>
      arr.map((i) => `[${i.level}] #${fIdx + 1} ${fields[fIdx]?.key || ''}: ${i.msg}`),
    ),
  ].join('\n');

  const updateField = (fIdx: number, next: DetailFieldConfig) =>
    onUpdate({ ...section, fields: fields.map((f, i) => (i === fIdx ? next : f)) });

  // PR #241 패턴 — 섹션 내 필드 drag-drop 재정렬 (HTML5 native, 라이브러리 없이)
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const onDragStart = (fIdx: number) => setDragIdx(fIdx);
  const onDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };
  const onDragOver = (fIdx: number) => {
    if (fIdx !== dragIdx) setOverIdx(fIdx);
  };
  const onDrop = (fIdx: number) => {
    if (dragIdx === null || dragIdx === fIdx) {
      onDragEnd();
      return;
    }
    const next = [...fields];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(fIdx, 0, moved);
    onUpdate({ ...section, fields: next });
    onDragEnd();
  };

  return (
    <div className="rounded border bg-card">
      <div
        className="flex cursor-pointer items-center gap-2 border-b bg-muted/30 px-3 py-2 hover:bg-muted/50"
        onClick={(e) => {
          // input/button 등 inner click 은 무시 — 헤더 *공백* 클릭만 토글
          if ((e.target as HTMLElement).closest('input,button,select,[role="combobox"]')) return;
          onToggleCollapse();
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapse();
          }
        }}
        title={collapsed ? '클릭해서 펼치기' : '클릭해서 접기'}
      >
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${collapsed ? '-rotate-90' : ''}`}
        />
        {sectionErrorCount > 0 ? (
          <span title={sectionIssueTitle} className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" aria-label={`error ${sectionErrorCount}개`} />
        ) : sectionWarnCount > 0 ? (
          <span title={sectionIssueTitle} className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" aria-label={`warn ${sectionWarnCount}개`} />
        ) : null}
        <span className="text-xs text-muted-foreground mono">섹션 #{index + 1}</span>
        <Input className="h-7 text-xs flex-1 max-w-md" value={section.title}
          onChange={(e) => onUpdate({ ...section, title: e.target.value })}
          placeholder="섹션 제목" />
        {collapsed && (
          <span className="text-[10px] text-muted-foreground">
            {section.contentBlock
              ? `[${section.contentBlock.blockId}]`
              : `필드 ${(section.fields ?? []).length}개`}
          </span>
        )}
        {collapsed && sectionErrorCount > 0 && (
          <span title={sectionIssueTitle} className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-medium text-rose-800">
            error {sectionErrorCount}
          </span>
        )}
        {collapsed && sectionWarnCount > 0 && sectionErrorCount === 0 && (
          <span title={sectionIssueTitle} className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800">
            warn {sectionWarnCount}
          </span>
        )}
        <FieldSelect label="" value={String(section.cols ?? 4)} options={COLS_OPTIONS}
          onChange={(v) => onUpdate({ ...section, cols: Number(v) as 1 | 2 | 3 | 4 })} />
        <span className="text-xs text-muted-foreground">cols</span>
        <span className="ml-auto" />
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
          onClick={onMoveUp} disabled={index === 0}><ChevronUp className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
          onClick={onMoveDown} disabled={index === total - 1}><ChevronDown className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="섹션 복제"><Copy className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>

      {!collapsed && (
      <div className="p-3 space-y-2">
        {sectionIssues.length > 0 && (
          <div className="space-y-0.5 rounded border border-rose-200 bg-rose-50 px-2 py-1">
            {sectionIssues.map((iss, i) => (
              <div key={i} className={`text-[10px] flex items-start gap-1 ${iss.level === 'error' ? 'text-rose-800' : 'text-amber-800'}`}>
                <span className={`rounded px-1 py-0 text-[9px] font-medium uppercase ${iss.level === 'error' ? 'bg-rose-200' : 'bg-amber-200'}`}>{iss.level}</span>
                <span>{iss.msg}</span>
              </div>
            ))}
          </div>
        )}
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
              <p className="text-xs text-muted-foreground">필드 ({fields.length})</p>
              <Button size="sm" variant="ghost" className="h-6 text-xs"
                onClick={() => onUpdate({
                  ...section,
                  fields: [...fields, { key: 'new_field', label: '새 필드' }],
                })}>
                <Plus className="h-3 w-3 mr-1" />필드 추가
              </Button>
            </div>
            {fields.map((field, fIdx) => {
              const isDragging = dragIdx === fIdx;
              const isDragOver = overIdx === fIdx && dragIdx !== fIdx;
              const fieldIssues = fieldIssuesByIdx[fIdx] ?? [];
              const fErrorCount = fieldIssues.filter((i) => i.level === 'error').length;
              const fWarnCount = fieldIssues.filter((i) => i.level === 'warn').length;
              return (
              <div
                key={fIdx}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  onDragStart(fIdx);
                }}
                onDragOver={(e) => { e.preventDefault(); onDragOver(fIdx); }}
                onDragEnd={onDragEnd}
                onDrop={(e) => { e.preventDefault(); onDrop(fIdx); }}
                className={`group rounded border p-2 grid grid-cols-12 gap-2 text-xs bg-muted/20 transition-opacity ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'border-t-2 border-t-foreground' : ''} ${fErrorCount > 0 ? 'border-rose-300' : fWarnCount > 0 ? 'border-amber-300' : ''}`}
              >
                <div className="col-span-1 flex flex-col items-center gap-1">
                  <GripVertical
                    className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground cursor-grab active:cursor-grabbing"
                    onClick={(e) => e.stopPropagation()}
                  />
                  {fErrorCount > 0 ? (
                    <span title={fieldIssues.map((i) => `[${i.level}] ${i.msg}`).join('\n')} className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" aria-label={`error ${fErrorCount}개`} />
                  ) : fWarnCount > 0 ? (
                    <span title={fieldIssues.map((i) => `[${i.level}] ${i.msg}`).join('\n')} className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" aria-label={`warn ${fWarnCount}개`} />
                  ) : null}
                  <span className="text-[9px] mono">#{fIdx + 1}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                    onClick={() => onUpdate({ ...section, fields: moveInArray(fields, fIdx, -1) })}
                    disabled={fIdx === 0}><ChevronUp className="h-3 w-3" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                    onClick={() => onUpdate({ ...section, fields: moveInArray(fields, fIdx, 1) })}
                    disabled={fIdx === fields.length - 1}><ChevronDown className="h-3 w-3" /></Button>
                </div>
                <div className="col-span-10 grid grid-cols-2 gap-2">
                  {fieldIssues.length > 0 && (
                    <div className="col-span-2 space-y-0.5 rounded border border-rose-200 bg-rose-50 px-2 py-1">
                      {fieldIssues.map((iss, i) => (
                        <div key={i} className={`text-[10px] flex items-start gap-1 ${iss.level === 'error' ? 'text-rose-800' : 'text-amber-800'}`}>
                          <span className={`rounded px-1 py-0 text-[9px] font-medium uppercase ${iss.level === 'error' ? 'bg-rose-200' : 'bg-amber-200'}`}>{iss.level}</span>
                          <span>{iss.msg}</span>
                        </div>
                      ))}
                    </div>
                  )}
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
                  <RegistryIdPicker label="rendererId (커스텀, formatter보다 우선)"
                    value={field.rendererId} entries={rendererEntries}
                    onChange={(v) => updateField(fIdx, { ...field, rendererId: v })}
                    hint="registry.cellRenderers — 메타 채워진 entry 만 라벨/설명 표시" />
                  <FieldSelect label="span" value={String(field.span ?? 1)} options={SPAN_OPTIONS}
                    onChange={(v) => updateField(fIdx, { ...field, span: Number(v) as 1 | 2 | 3 | 4 })} />
                  <FieldInput label="suffix (예: 'Wp', '원/Wp')" value={field.suffix ?? ''}
                    onChange={(v) => updateField(fIdx, { ...field, suffix: v || undefined })} />
                  <FieldInput label="fallback (빈 값, 기본 '—')" value={field.fallback ?? ''}
                    onChange={(v) => updateField(fIdx, { ...field, fallback: v || undefined })} />
                </div>
                <div className="col-span-1 flex flex-col items-end gap-0.5">
                  {onSelectField && (
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                      onClick={() => onSelectField(fIdx)}
                      title="우측 패널에서 inlineEditable·visibleIf 편집">
                      <Settings2 className="h-3 w-3" />
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => {
                      const existingKeys = new Set(allDetailFieldKeys);
                      let candidate = `${field.key}_copy`;
                      let n = 2;
                      while (existingKeys.has(candidate)) { candidate = `${field.key}_copy${n}`; n++; }
                      const cloned: DetailFieldConfig = { ...field, key: candidate, label: `${field.label} (복사)` };
                      onUpdate({ ...section, fields: [...fields.slice(0, fIdx + 1), cloned, ...fields.slice(fIdx + 1)] });
                    }}
                    title="필드 복제">
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => onUpdate({ ...section, fields: fields.filter((_, i) => i !== fIdx) })}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              );
            })}
            {fields.length === 0 && (
              <div className="text-center py-3 text-xs text-muted-foreground border border-dashed rounded">
                필드가 없습니다
              </div>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}
