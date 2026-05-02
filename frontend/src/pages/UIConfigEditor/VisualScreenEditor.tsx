// Phase 3 v2: ListScreenConfig 시각 편집기 (탭별 폼 GUI)
// 기본 정보·메트릭·필터·컬럼·액션·rail을 인라인 편집. JSON 탭은 고급/폴백.
// 분기마다 ./{ColumnsTab,MetricsTab,FiltersTab,ActionsTab,RailTab}.tsx에 행 렌더러 위치.

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { ListScreenConfig } from '@/templates/types';
import { TabButton } from './ArrayEditor';
import { ColumnsTab } from './ColumnsTab';
import { MetricsTab } from './MetricsTab';
import { FiltersTab } from './FiltersTab';
import { ActionsTab } from './ActionsTab';
import { RailTab } from './RailTab';

type Tab = 'basic' | 'metrics' | 'filters' | 'columns' | 'actions' | 'rail' | 'json';

export interface VisualScreenEditorProps {
  value: ListScreenConfig;
  onChange: (next: ListScreenConfig) => void;
  jsonDraft: string;
  onJsonDraftChange: (next: string) => void;
}

export default function VisualScreenEditor({
  value, onChange, jsonDraft, onJsonDraftChange,
}: VisualScreenEditorProps) {
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
        {tab === 'columns' && <ColumnsTab value={value} onChange={onChange} />}
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
