// Phase 3 v2: ListScreenConfig 시각 편집기 (탭별 폼 GUI)
// 기본 정보·메트릭·필터·컬럼·액션·rail을 인라인 편집. JSON 탭은 고급/폴백.
// 분기마다 ./{ColumnsTab,MetricsTab,FiltersTab,ActionsTab,RailTab}.tsx에 행 렌더러 위치.

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { ColumnConfig, ListScreenConfig } from '@/templates/types';
import { TabButton, FieldInput } from './ArrayEditor';
import { ColumnsTab } from './ColumnsTab';
import { MetricsTab } from './MetricsTab';
import { FiltersTab } from './FiltersTab';
import { ActionsTab } from './ActionsTab';
import { RailTab } from './RailTab';
import { EditorWithPanel, PanelGroup, PanelSelectionHeader } from './RightPanel';
import { BooleanPicker, EndpointPicker, IdFieldPicker, AllowedSizesPicker, InlineEditTypePicker, InlineEditOptionsPicker } from './Pickers';

type Tab = 'basic' | 'metrics' | 'filters' | 'columns' | 'actions' | 'rail' | 'json';

export interface VisualScreenEditorProps {
  value: ListScreenConfig;
  onChange: (next: ListScreenConfig) => void;
  jsonDraft: string;
  onJsonDraftChange: (next: string) => void;
}

// 레이아웃 wrapper — 본체 (Body) 와 우측 패널 (EditorWithPanel) 을 합침.
// 외부 (UIConfigEditorPage) 는 default export 사용. 재귀 (TabbedList 안) 은 Body 사용.
export default function VisualScreenEditor(props: VisualScreenEditorProps) {
  return <VisualScreenEditorWithPanel {...props} />;
}

// 본체만 — 우측 패널 없이 main content 만 렌더. TabbedList recursive editor 용.
// L1 list-level 설정 (pagination 등) 은 상위가 별도로 노출 — 또는 JSON 탭에서.
export function VisualScreenEditorBody({
  value, onChange, jsonDraft, onJsonDraftChange, onSelectColumn,
}: VisualScreenEditorProps & {
  onSelectColumn?: (idx: number | null) => void;
}) {
  const [tab, setTab] = useState<Tab>('basic');

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b px-3 flex gap-1 overflow-x-auto">
        <TabButton active={tab === 'basic'} onClick={() => setTab('basic')}>기본 정보</TabButton>
        <TabButton active={tab === 'metrics'} onClick={() => setTab('metrics')}>
          메트릭 ({value.metrics.length})
        </TabButton>
        <TabButton active={tab === 'filters'} onClick={() => setTab('filters')}>
          필터 ({value.filters.length})
        </TabButton>
        <TabButton active={tab === 'columns'} onClick={() => setTab('columns')}>
          컬럼 ({value.columns.length})
        </TabButton>
        <TabButton active={tab === 'actions'} onClick={() => setTab('actions')}>
          액션 ({(value.actions ?? []).length})
        </TabButton>
        <TabButton active={tab === 'rail'} onClick={() => setTab('rail')}>
          Rail ({(value.rail ?? []).length})
        </TabButton>
        <TabButton active={tab === 'json'} onClick={() => setTab('json')}>JSON (고급)</TabButton>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {tab === 'basic' && <BasicTab value={value} onChange={onChange} />}
        {tab === 'metrics' && <MetricsTab value={value} onChange={onChange} />}
        {tab === 'filters' && <FiltersTab value={value} onChange={onChange} />}
        {tab === 'columns' && <ColumnsTab value={value} onChange={onChange} onSelectColumn={onSelectColumn} />}
        {tab === 'actions' && <ActionsTab value={value} onChange={onChange} />}
        {tab === 'rail' && <RailTab value={value} onChange={onChange} />}
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

// 우측 패널 포함 wrapper — 일반적인 standalone 편집기 모드.
function VisualScreenEditorWithPanel(props: VisualScreenEditorProps) {
  const { value, onChange } = props;
  // Phase 4 follow-up #1: 선택된 컬럼 idx (selection-driven 우측 패널)
  const [selectedColumnIdx, setSelectedColumnIdx] = useState<number | null>(null);
  const selectedColumn = selectedColumnIdx !== null ? value.columns[selectedColumnIdx] : null;

  const main = (
    <VisualScreenEditorBody {...props} onSelectColumn={setSelectedColumnIdx} />
  );

  // 우측 패널 — 컬럼 선택 시 selection-driven, 아니면 list-level
  const panel = selectedColumn
    ? (
      <ColumnPanel
        col={selectedColumn}
        onChange={(next) => onChange({
          ...value,
          columns: value.columns.map((c, i) => i === selectedColumnIdx ? next : c),
        })}
        onBack={() => setSelectedColumnIdx(null)}
      />
    )
    : <ListLevelPanel value={value} onChange={onChange} />;

  const panelTitle = selectedColumn
    ? `선택: ${selectedColumn.label}`
    : '⚙ 리스트 화면 설정';

  return <EditorWithPanel panel={panel} panelTitle={panelTitle}>{main}</EditorWithPanel>;
}

// ─── 우측 패널: 선택된 컬럼의 L3/L4 (selection-driven) ─────────────────────
// Phase 4 follow-up #1 — Q8-B 풀 구현. 컬럼 행 ⚙ 클릭 → 이 패널로 전환.
function ColumnPanel({
  col, onChange, onBack,
}: {
  col: ColumnConfig;
  onChange: (next: ColumnConfig) => void;
  onBack: () => void;
}) {
  return (
    <>
      <PanelSelectionHeader title={col.label || col.key} subtitle={`key: ${col.key}`} onBack={onBack} />
      <PanelGroup title="기본">
        <FieldInput label="key" value={col.key} mono onChange={(v) => onChange({ ...col, key: v })} />
        <FieldInput label="label" value={col.label} onChange={(v) => onChange({ ...col, label: v })} />
        <FieldInput label="width (예: 120px)" value={col.width ?? ''} mono
          onChange={(v) => onChange({ ...col, width: v || undefined })} />
        <FieldInput label="fallback (빈 값, 기본 '—')" value={col.fallback ?? ''}
          onChange={(v) => onChange({ ...col, fallback: v || undefined })} />
      </PanelGroup>
      <PanelGroup title="가시성·정렬" defaultOpen={false}>
        <BooleanPicker
          label="sortable"
          value={col.sortable ?? false}
          onChange={(v) => onChange({ ...col, sortable: v || undefined })}
          hint="헤더 클릭 → asc → desc → 해제"
        />
        <BooleanPicker
          label="hideable"
          value={col.hideable ?? false}
          onChange={(v) => onChange({ ...col, hideable: v || undefined })}
          hint="컬럼 가시성 메뉴에 노출"
        />
        <BooleanPicker
          label="hiddenByDefault"
          value={col.hiddenByDefault ?? false}
          onChange={(v) => onChange({ ...col, hiddenByDefault: v || undefined })}
          hint="처음 페이지 진입 시 숨김 (admin 이 toggle 로 표시)"
        />
      </PanelGroup>
      <PanelGroup title="인라인 편집 (셀 클릭)" defaultOpen={false}>
        <BooleanPicker
          label="inlineEditable"
          value={col.inlineEditable ?? false}
          onChange={(v) => onChange({ ...col, inlineEditable: v || undefined })}
          hint="ListScreenConfig.inlineEdit.enabled 도 활성화 필요"
        />
        {col.inlineEditable && (
          <>
            <InlineEditTypePicker
              value={col.inlineEditType}
              onChange={(v) => onChange({ ...col, inlineEditType: v as ColumnConfig['inlineEditType'] })}
            />
            {col.inlineEditType === 'select' && (
              <InlineEditOptionsPicker
                value={col.inlineEditOptions}
                onChange={(v) => onChange({ ...col, inlineEditOptions: v })}
              />
            )}
          </>
        )}
      </PanelGroup>
    </>
  );
}

// ─── 우측 패널: list-level 컨테이너 설정 (L1) ─────────────────────────────
// pagination / savedViews / inlineEdit — Phase 4 메타 인프라 신규 항목들.
function ListLevelPanel({
  value, onChange,
}: {
  value: ListScreenConfig;
  onChange: (next: ListScreenConfig) => void;
}) {
  const pagination = value.pagination;
  const savedViews = value.savedViews;
  const inlineEdit = value.inlineEdit;
  const columnKeys = useMemo(() => value.columns.map((c) => c.key), [value.columns]);

  return (
    <>
      <PanelGroup title="페이지네이션">
        <BooleanPicker
          label="활성화"
          value={!!pagination}
          onChange={(v) => onChange({ ...value, pagination: v ? { defaultPageSize: 50 } : undefined })}
          hint="대용량 리스트 — page-size 선택 + 이전/다음"
        />
        {pagination && (
          <>
            <FieldInput
              label="defaultPageSize"
              value={String(pagination.defaultPageSize ?? 50)}
              onChange={(v) => onChange({
                ...value,
                pagination: { ...pagination, defaultPageSize: Number(v) || 50 },
              })}
            />
            <AllowedSizesPicker
              value={pagination.allowedSizes}
              onChange={(v) => onChange({ ...value, pagination: { ...pagination, allowedSizes: v } })}
            />
            <BooleanPicker
              label="serverMode (dataHook 이 paged 반환)"
              value={pagination.serverMode ?? false}
              onChange={(v) => onChange({
                ...value,
                pagination: { ...pagination, serverMode: v || undefined },
              })}
              hint="비활성 = client-side slicing"
            />
          </>
        )}
      </PanelGroup>

      <PanelGroup title="저장된 뷰 (savedViews)">
        <BooleanPicker
          label="활성화"
          value={savedViews?.enabled ?? false}
          onChange={(v) => onChange({
            ...value,
            savedViews: v ? { enabled: true } : undefined,
          })}
          hint="툴바에 '뷰' 드롭다운 — filter+hidden+pageSize 묶음 명명 저장"
        />
      </PanelGroup>

      <PanelGroup title="인라인 편집 (셀)">
        <BooleanPicker
          label="활성화"
          value={inlineEdit?.enabled ?? false}
          onChange={(v) => onChange({
            ...value,
            inlineEdit: v ? { ...(inlineEdit ?? {}), enabled: true } : undefined,
          })}
          hint="ColumnConfig.inlineEditable=true 인 셀 클릭 → input → PATCH"
        />
        {inlineEdit?.enabled && (
          <>
            <EndpointPicker
              label="endpoint"
              value={inlineEdit.endpoint}
              onChange={(v) => onChange({ ...value, inlineEdit: { ...inlineEdit, endpoint: v } })}
              hint=":id 자리표시 — /api/v1/<resource>/:id"
            />
            <IdFieldPicker
              label="idField"
              value={inlineEdit.idField}
              onChange={(v) => onChange({ ...value, inlineEdit: { ...inlineEdit, idField: v } })}
              columnKeys={columnKeys}
              hint="현재 컬럼 키 중 하나"
            />
          </>
        )}
      </PanelGroup>
    </>
  );
}

// ─── 기본 정보 탭 (단순 텍스트 입력 — 분리 안 함) ─────────────────────────
function BasicTab({
  value, onChange,
}: {
  value: ListScreenConfig;
  onChange: (next: ListScreenConfig) => void;
}) {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">id <span className="text-muted-foreground">(불변 — 레지스트리 키)</span></Label>
        <Input value={value.id} disabled className="font-mono text-xs bg-muted" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">데이터 hookId <span className="text-muted-foreground">(registry.dataHooks 키)</span></Label>
        <Input
          value={value.source.hookId}
          onChange={(e) => onChange({ ...value, source: { hookId: e.target.value } })}
          className="font-mono text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">eyebrow <span className="text-muted-foreground">(상단 작은 라벨)</span></Label>
        <Input
          value={value.page.eyebrow}
          onChange={(e) => onChange({ ...value, page: { ...value.page, eyebrow: e.target.value } })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">title <span className="text-muted-foreground">(페이지 제목)</span></Label>
        <Input
          value={value.page.title}
          onChange={(e) => onChange({ ...value, page: { ...value.page, title: e.target.value } })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">description</Label>
        <Textarea
          value={value.page.description}
          onChange={(e) => onChange({ ...value, page: { ...value.page, description: e.target.value } })}
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={value.requiresCompany ?? true}
            onChange={(e) => onChange({ ...value, requiresCompany: e.target.checked })}
          />
          requiresCompany (법인 선택 필요)
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={value.tableSubFromTotal ?? false}
            onChange={(e) => onChange({ ...value, tableSubFromTotal: e.target.checked })}
          />
          tableSubFromTotal ("X / Y개 표시")
        </label>
      </div>
    </div>
  );
}
