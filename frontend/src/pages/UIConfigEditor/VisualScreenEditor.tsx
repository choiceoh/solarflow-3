// Phase 3 v2: ListScreenConfig 시각 편집기
// JSON 텍스트 대신 탭별 폼 GUI로 자주 편집되는 영역(기본 정보·컬럼)을 인라인 편집한다.
// 컬럼 외 영역(metrics·filters·actions·rail)은 같은 패턴으로 follow-up.

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { ColumnConfig, Formatter, ListScreenConfig } from '@/templates/types';
import { cellRenderers } from '@/templates/registry';

const FORMATTER_OPTIONS: { value: Formatter | ''; label: string }[] = [
  { value: '', label: '— 없음 —' },
  { value: 'date', label: 'date (날짜)' },
  { value: 'number', label: 'number (천단위 콤마)' },
  { value: 'kw', label: 'kw (kW 단위)' },
  { value: 'currency', label: 'currency (통화)' },
];

const ALIGN_OPTIONS: { value: 'left' | 'right' | 'center'; label: string }[] = [
  { value: 'left', label: 'left' },
  { value: 'right', label: 'right' },
  { value: 'center', label: 'center' },
];

type Tab = 'basic' | 'columns' | 'json';

export interface VisualScreenEditorProps {
  value: ListScreenConfig;
  onChange: (next: ListScreenConfig) => void;
  /** JSON 탭이 직접 텍스트 편집을 원할 때 호출 — 검증/포맷은 부모가 담당 */
  jsonDraft: string;
  onJsonDraftChange: (next: string) => void;
}

export default function VisualScreenEditor({
  value, onChange, jsonDraft, onJsonDraftChange,
}: VisualScreenEditorProps) {
  const [tab, setTab] = useState<Tab>('basic');

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b px-3 flex gap-1">
        <TabButton active={tab === 'basic'} onClick={() => setTab('basic')}>기본 정보</TabButton>
        <TabButton active={tab === 'columns'} onClick={() => setTab('columns')}>
          컬럼 ({value.columns.length})
        </TabButton>
        <TabButton active={tab === 'json'} onClick={() => setTab('json')}>JSON (고급)</TabButton>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {tab === 'basic' && <BasicTab value={value} onChange={onChange} />}
        {tab === 'columns' && <ColumnsTab value={value} onChange={onChange} />}
        {tab === 'json' && <JsonTab value={jsonDraft} onChange={onJsonDraftChange} />}
      </div>
    </div>
  );
}

function TabButton({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors
        ${active ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
    >
      {children}
    </button>
  );
}

// ─── 기본 정보 탭 ────────────────────────────────────────────────────────────
function BasicTab({
  value, onChange,
}: {
  value: ListScreenConfig;
  onChange: (next: ListScreenConfig) => void;
}) {
  const update = <K extends keyof ListScreenConfig>(k: K, v: ListScreenConfig[K]) =>
    onChange({ ...value, [k]: v });

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
        <Label className="text-xs">description <span className="text-muted-foreground">(설명)</span></Label>
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
            onChange={(e) => update('requiresCompany', e.target.checked)}
          />
          requiresCompany (법인 선택 필요)
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={value.tableSubFromTotal ?? false}
            onChange={(e) => update('tableSubFromTotal', e.target.checked)}
          />
          tableSubFromTotal ("X / Y개 표시")
        </label>
      </div>
    </div>
  );
}

// ─── 컬럼 탭 ────────────────────────────────────────────────────────────────
function ColumnsTab({
  value, onChange,
}: {
  value: ListScreenConfig;
  onChange: (next: ListScreenConfig) => void;
}) {
  const cols = value.columns;
  const rendererIds = useMemo(() => Object.keys(cellRenderers).sort(), []);

  const updateCol = (idx: number, next: ColumnConfig) => {
    onChange({ ...value, columns: cols.map((c, i) => (i === idx ? next : c)) });
  };

  const moveCol = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= cols.length) return;
    const arr = [...cols];
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    onChange({ ...value, columns: arr });
  };

  const removeCol = (idx: number) => {
    onChange({ ...value, columns: cols.filter((_, i) => i !== idx) });
  };

  const addCol = () => {
    const newCol: ColumnConfig = { key: 'new_field', label: '새 컬럼' };
    onChange({ ...value, columns: [...cols, newCol] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          순서대로 표시됩니다. ↑↓로 정렬, 휴지통으로 삭제, "+ 컬럼 추가"로 새 컬럼.
        </p>
        <Button size="sm" variant="outline" onClick={addCol}>
          <Plus className="h-3 w-3 mr-1" />컬럼 추가
        </Button>
      </div>

      <div className="space-y-2">
        {cols.map((col, idx) => (
          <ColumnRow
            key={`${idx}-${col.key}`}
            col={col}
            index={idx}
            total={cols.length}
            rendererIds={rendererIds}
            onUpdate={(next) => updateCol(idx, next)}
            onMoveUp={() => moveCol(idx, -1)}
            onMoveDown={() => moveCol(idx, 1)}
            onRemove={() => removeCol(idx)}
          />
        ))}
        {cols.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded">
            컬럼이 없습니다
          </div>
        )}
      </div>
    </div>
  );
}

function ColumnRow({
  col, index, total, rendererIds, onUpdate, onMoveUp, onMoveDown, onRemove,
}: {
  col: ColumnConfig;
  index: number;
  total: number;
  rendererIds: string[];
  onUpdate: (next: ColumnConfig) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded border bg-card p-3 grid grid-cols-12 gap-2 items-start">
      {/* 순서 + 정렬 버튼 */}
      <div className="col-span-1 flex flex-col items-center gap-1">
        <span className="text-[10px] text-muted-foreground mono">#{index + 1}</span>
        <Button
          type="button" variant="ghost" size="icon" className="h-6 w-6"
          onClick={onMoveUp} disabled={index === 0} title="위로"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon" className="h-6 w-6"
          onClick={onMoveDown} disabled={index === total - 1} title="아래로"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* 필드 입력 */}
      <div className="col-span-10 grid grid-cols-2 gap-2">
        <FieldInput
          label="key (데이터 경로)"
          value={col.key}
          onChange={(v) => onUpdate({ ...col, key: v })}
          mono
        />
        <FieldInput
          label="label (표시 라벨)"
          value={col.label}
          onChange={(v) => onUpdate({ ...col, label: v })}
        />

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">formatter</Label>
          <select
            className="w-full h-7 text-xs border rounded px-2 bg-background"
            value={col.formatter ?? ''}
            onChange={(e) => onUpdate({ ...col, formatter: (e.target.value || undefined) as Formatter | undefined })}
          >
            {FORMATTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">rendererId (커스텀, formatter보다 우선)</Label>
          <select
            className="w-full h-7 text-xs border rounded px-2 bg-background"
            value={col.rendererId ?? ''}
            onChange={(e) => onUpdate({ ...col, rendererId: (e.target.value || undefined) as string | undefined })}
          >
            <option value="">— 없음 —</option>
            {rendererIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">align</Label>
          <select
            className="w-full h-7 text-xs border rounded px-2 bg-background"
            value={col.align ?? 'left'}
            onChange={(e) => onUpdate({ ...col, align: e.target.value as 'left' | 'right' | 'center' })}
          >
            {ALIGN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <FieldInput
          label="width (CSS, 예: 120px)"
          value={col.width ?? ''}
          onChange={(v) => onUpdate({ ...col, width: v || undefined })}
          mono
        />

        <FieldInput
          label="fallback (빈 값 표시, 기본 '—')"
          value={col.fallback ?? ''}
          onChange={(v) => onUpdate({ ...col, fallback: v || undefined })}
        />

        <FieldInput
          label="className (Tailwind, 예: 'font-mono')"
          value={col.className ?? ''}
          onChange={(v) => onUpdate({ ...col, className: v || undefined })}
          mono
        />
      </div>

      {/* 삭제 버튼 */}
      <div className="col-span-1 flex justify-end">
        <Button
          type="button" variant="ghost" size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove} title="삭제"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function FieldInput({
  label, value, onChange, mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-7 text-xs ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}

// ─── JSON 탭 ───────────────────────────────────────────────────────────────
function JsonTab({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="font-mono text-xs h-full min-h-[400px] resize-none"
      spellCheck={false}
    />
  );
}
