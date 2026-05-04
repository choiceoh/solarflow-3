// 배열 편집 chrome — 컬럼·메트릭·필터·액션·rail이 공통으로 쓰는 패턴
// (헤더 안내문 + 추가 버튼, 행별 ↑↓/삭제 버튼)
// 보강: 선택적 collapse / 검색 / drag-drop / validation badges

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, GripVertical, Copy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

// 검증 결과 — 행별 빨간/노란 점 + 메시지 표시
export type ItemIssue = { level: 'error' | 'warn'; msg: string };

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

  // 보강 — 모두 선택. 제공 시 자동으로 해당 기능 활성.
  // collapsed 모드용 한 줄 요약. 제공 시 행 기본 접힘 + 클릭 펼침.
  renderSummary?: (item: T, idx: number) => ReactNode;
  // 검색 매처 — 텍스트 입력과 매칭 시 행 표시 + 자동 펼침. 제공 시 상단 검색 input.
  searchMatcher?: (item: T, q: string) => boolean;
  // 검증 — 행별 issue 반환. 제공 시 collapsed 좌측 빨간/노란 점 + expanded 상단 메시지.
  validate?: (item: T, items: T[]) => ItemIssue[];
  // drag-drop reorder — 제공 시 collapsed 행 drag 가능. (렌더된 새 배열을 그대로 setItems)
  onReorder?: (next: T[]) => void;
  // 복제 — 제공 시 collapsed 행 호버 액션 + expanded 헤더에 "복제" 버튼
  onDuplicate?: (idx: number) => void;
}

export function ArrayEditor<T>({
  items, hint, addLabel, emptyMsg, onAdd, onMove, onRemove, renderRow, rowKey,
  renderSummary, searchMatcher, validate, onReorder, onDuplicate,
}: ArrayEditorProps<T>) {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const filteredIdx = useMemo(() => {
    if (!filter || !searchMatcher) return null;
    const set = new Set<number>();
    items.forEach((it, i) => { if (searchMatcher(it, filter)) set.add(i); });
    return set;
  }, [filter, items, searchMatcher]);

  const issueCounts = useMemo(() => {
    if (!validate) return { error: 0, warn: 0 };
    let error = 0; let warn = 0;
    items.forEach((it) => {
      validate(it, items).forEach((iss) => {
        if (iss.level === 'error') error++; else warn++;
      });
    });
    return { error, warn };
  }, [items, validate]);

  const expandAll = () => setExpanded(new Set(items.map((_, i) => i)));
  const collapseAll = () => setExpanded(new Set());
  const toggleRow = (idx: number) => setExpanded((p) => {
    const n = new Set(p);
    if (n.has(idx)) n.delete(idx);
    else n.add(idx);
    return n;
  });

  const onDragStart = (idx: number) => setDragIdx(idx);
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };
  const onDragOverIdx = (idx: number) => { if (idx !== dragIdx) setOverIdx(idx); };
  const onDropIdx = (idx: number) => {
    if (dragIdx === null || dragIdx === idx || !onReorder) { onDragEnd(); return; }
    const next = [...items];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    onReorder(next);
    onDragEnd();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {searchMatcher ? (
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="검색 (일치 시 자동 펼침)"
            className="h-7 flex-1 min-w-[200px] rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <p className="flex-1 min-w-0 text-xs text-muted-foreground">{hint}</p>
        )}
        {filter && filteredIdx && (
          <span className="text-xs text-muted-foreground shrink-0">{filteredIdx.size} / {items.length}</span>
        )}
        {renderSummary && (
          <>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={expandAll}>모두 펼치기</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={collapseAll}>모두 접기</Button>
          </>
        )}
        <Button size="sm" variant="outline" className="h-7" onClick={onAdd}>
          <Plus className="h-3 w-3 mr-1" />{addLabel}
        </Button>
      </div>

      {validate && (issueCounts.error > 0 || issueCounts.warn > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs">
          <span className="font-medium text-amber-900">검증:</span>
          {issueCounts.error > 0 && (
            <span className="rounded bg-rose-200 px-1.5 py-0.5 font-medium text-rose-800">error {issueCounts.error}</span>
          )}
          {issueCounts.warn > 0 && (
            <span className="rounded bg-amber-200 px-1.5 py-0.5 font-medium text-amber-800">warn {issueCounts.warn}</span>
          )}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item, idx) => {
          if (filteredIdx && !filteredIdx.has(idx)) return null;
          const isCollapsed = renderSummary && !expanded.has(idx) && !(filter && filteredIdx?.has(idx));
          const issues = validate ? validate(item, items) : [];
          const errorCount = issues.filter((i) => i.level === 'error').length;
          const warnCount = issues.filter((i) => i.level === 'warn').length;
          const issueTitle = issues.map((i) => `[${i.level}] ${i.msg}`).join('\n');
          const k = rowKey ? rowKey(item, idx) : String(idx);
          const isDragging = dragIdx === idx;
          const isDragOver = overIdx === idx && dragIdx !== idx;

          if (isCollapsed) {
            return (
              <div
                key={k}
                draggable={!!onReorder}
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(idx); }}
                onDragOver={(e) => { e.preventDefault(); onDragOverIdx(idx); }}
                onDragEnd={onDragEnd}
                onDrop={(e) => { e.preventDefault(); onDropIdx(idx); }}
                onClick={() => toggleRow(idx)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRow(idx); } }}
                className={`rounded border bg-background hover:bg-muted/30 cursor-pointer transition-colors group
                  ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'border-t-2 border-t-foreground' : ''}`}
              >
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
                  {onReorder && (
                    <GripVertical className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing"
                      onClick={(e) => e.stopPropagation()} />
                  )}
                  {validate && (
                    errorCount > 0 ? (
                      <span title={issueTitle} className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" aria-label={`error ${errorCount}개`} />
                    ) : warnCount > 0 ? (
                      <span title={issueTitle} className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" aria-label={`warn ${warnCount}개`} />
                    ) : (
                      <span className="h-1.5 w-1.5 shrink-0" />
                    )
                  )}
                  <span className="text-[9px] text-muted-foreground mono w-6 text-right shrink-0">#{idx + 1}</span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">{renderSummary!(item, idx)}</div>
                  <span className="ml-auto flex items-center gap-1.5 shrink-0">
                    {validate && errorCount > 0 && (
                      <span title={issueTitle} className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-medium text-rose-800">error {errorCount}</span>
                    )}
                    {validate && warnCount > 0 && errorCount === 0 && (
                      <span title={issueTitle} className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800">warn {warnCount}</span>
                    )}
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); onMove(idx, -1); }} disabled={idx === 0}>
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); onMove(idx, 1); }} disabled={idx === items.length - 1}>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                    {onDuplicate && (
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" title="복제"
                        onClick={(e) => { e.stopPropagation(); onDuplicate(idx); }}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); onRemove(idx); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </span>
                </div>
              </div>
            );
          }

          // Expanded mode (기존 동작 + 검증 메시지 패널)
          return (
            <div
              key={k}
              className="rounded border bg-card p-3 grid grid-cols-12 gap-2 items-start"
            >
              <div className="col-span-1 flex flex-col items-center gap-1">
                <span className="text-xs text-muted-foreground mono">#{idx + 1}</span>
                {renderSummary && (
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="접기"
                    onClick={() => toggleRow(idx)}><ChevronUp className="h-3.5 w-3.5" /></Button>
                )}
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                  onClick={() => onMove(idx, -1)} disabled={idx === 0} title="위로">
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                  onClick={() => onMove(idx, 1)} disabled={idx === items.length - 1} title="아래로">
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="col-span-10 space-y-2">
                {validate && issues.length > 0 && (
                  <div className="space-y-0.5 rounded border border-rose-200 bg-rose-50 px-2 py-1">
                    {issues.map((iss, i) => (
                      <div key={i} className={`text-xs flex items-start gap-1 ${iss.level === 'error' ? 'text-rose-800' : 'text-amber-800'}`}>
                        <span className={`rounded px-1 py-0 text-[9px] font-medium uppercase ${iss.level === 'error' ? 'bg-rose-200' : 'bg-amber-200'}`}>{iss.level}</span>
                        <span>{iss.msg}</span>
                      </div>
                    ))}
                  </div>
                )}
                {renderRow(item, idx)}
              </div>
              <div className="col-span-1 flex flex-col items-end gap-1">
                {onDuplicate && (
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-6 w-6 text-muted-foreground"
                    onClick={() => onDuplicate(idx)} title="복제"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  type="button" variant="ghost" size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(idx)} title="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded">
            {emptyMsg}
          </div>
        )}
        {filter && filteredIdx && filteredIdx.size === 0 && items.length > 0 && (
          <div className="text-center py-3 text-xs text-muted-foreground italic border border-dashed rounded">
            "{filter}" 일치 항목 없음
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 공유 입력 컴포넌트 ───────────────────────────────────────────────────
export function FieldInput({
  label, value, onChange, mono, placeholder, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-7 text-xs ${mono ? 'font-mono' : ''}`}
        placeholder={placeholder}
      />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
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
      <Label className="text-xs text-muted-foreground">{label}</Label>
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
