// 배열 편집 chrome — 컬럼·메트릭·필터·액션·rail이 공통으로 쓰는 패턴
// (헤더 안내문 + 추가 버튼, 행별 ↑↓/삭제 버튼)

import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export interface ArrayEditorProps<T> {
  items: T[];
  hint: string;
  addLabel: string;
  emptyMsg: string;
  onAdd: () => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  onRemove: (idx: number) => void;
  renderRow: (item: T, idx: number) => ReactNode;
  rowKey?: (item: T, idx: number) => string;
}

export function ArrayEditor<T>({
  items, hint, addLabel, emptyMsg, onAdd, onMove, onRemove, renderRow, rowKey,
}: ArrayEditorProps<T>) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{hint}</p>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-3 w-3 mr-1" />{addLabel}
        </Button>
      </div>

      <div className="space-y-2">
        {items.map((item, idx) => (
          <div
            key={rowKey ? rowKey(item, idx) : idx}
            className="rounded border bg-card p-3 grid grid-cols-12 gap-2 items-start"
          >
            <div className="col-span-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground mono">#{idx + 1}</span>
              <Button
                type="button" variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => onMove(idx, -1)} disabled={idx === 0} title="위로"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button" variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => onMove(idx, 1)} disabled={idx === items.length - 1} title="아래로"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="col-span-10">{renderRow(item, idx)}</div>
            <div className="col-span-1 flex justify-end">
              <Button
                type="button" variant="ghost" size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(idx)} title="삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded">
            {emptyMsg}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 공유 입력 컴포넌트 ───────────────────────────────────────────────────
export function FieldInput({
  label, value, onChange, mono, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-7 text-xs ${mono ? 'font-mono' : ''}`}
        placeholder={placeholder}
      />
    </div>
  );
}

export function FieldSelect({
  label, value, onChange, options, allowEmpty, emptyLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <select
        className="w-full h-7 text-xs border rounded px-2 bg-background"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowEmpty && <option value="">{emptyLabel ?? '— 없음 —'}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// 작은 도우미 — 배열 정렬 swap
export function moveInArray<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
  const target = idx + dir;
  if (target < 0 || target >= arr.length) return arr;
  const next = [...arr];
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

// ─── 시각 편집기 공용 탭 버튼 ────────────────────────────────────────────
export function TabButton({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap
        ${active ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
    >
      {children}
    </button>
  );
}
