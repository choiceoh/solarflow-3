// Phase 1+1.5 PoC: 단일 리스트 화면 템플릿
// config(메타) + registry(코드)를 결합해 한 도메인의 목록 화면을 렌더한다.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useResolvedConfig } from './configOverride';
import { applyTenantToScreen } from '@/config/tenants';
import { useTenantStore } from '@/stores/tenantStore';
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import EmptyState from '@/components/common/EmptyState';
import SkeletonRows from '@/components/common/SkeletonRows';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { ColumnVisibilityMenu } from '@/components/common/ColumnVisibilityMenu';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import { MasterConsole, type MasterConsoleMetric } from '@/components/command/MasterConsole';
import { FilterButton } from '@/components/command/MockupPrimitives';
import { cn } from '@/lib/utils';
import type {
  ListScreenConfig, FilterConfig, FormConfig, MetricConfig, ColumnConfig,
  ActionConfig, ActionIcon, Tone,
} from './types';
import {
  cellRenderers, dataHooks, metricComputers, toneComputers, sparkComputers, subComputers,
  formComponents, detailComponents, railBlocks, toolbarExtras,
  masterSources, enumDictionaries,
  applyFormatter, getFieldValue, generateMonths,
} from './registry';

type Options = { value: string; label: string }[];

// ─── 옵션 로딩 (필터별 옵션 출처) ───────────────────────────────────────────
export function useFilterOptions(filters: FilterConfig[]): Record<string, Options> {
  const [options, setOptions] = useState<Record<string, Options>>({});

  useEffect(() => {
    let cancelled = false;
    const next: Record<string, Options> = {};

    filters.forEach((f) => {
      if (f.optionsFrom === 'enum' && f.enumKey) {
        const dict = enumDictionaries[f.enumKey];
        if (dict) next[f.key] = Object.entries(dict).map(([value, label]) => ({ value, label }));
      } else if (f.optionsFrom === 'static' && f.staticOptions) {
        next[f.key] = f.staticOptions;
      } else if (f.optionsFrom === 'months') {
        next[f.key] = generateMonths(f.monthsBack ?? 12);
      }
    });
    setOptions(next);

    filters.forEach(async (f) => {
      if (f.optionsFrom === 'master' && f.masterKey) {
        const src = masterSources[f.masterKey];
        if (!src) return;
        const opts = await src.load();
        if (!cancelled) setOptions((prev) => ({ ...prev, [f.key]: opts }));
      }
    });

    return () => { cancelled = true; };
  }, [filters]);

  return options;
}

export function filterLabel(filter: FilterConfig, value: string, options: Options): string {
  if (!value) return filter.allLabel ?? `전체 ${filter.label}`;
  return options.find((o) => o.value === value)?.label ?? value;
}

// ─── Metric → MasterConsoleMetric ──────────────────────────────────────────
export function buildMetric(
  m: MetricConfig,
  items: unknown[],
  filters: Record<string, string>,
  filterConfigs: FilterConfig[],
  filterOptions: Record<string, Options>,
): MasterConsoleMetric {
  const computer = metricComputers[m.computerId];
  const value = computer ? String(computer(items, filters)) : '';

  let tone: Tone | undefined;
  if (typeof m.tone === 'string') tone = m.tone;
  else if (m.tone && 'computerId' in m.tone) tone = toneComputers[m.tone.computerId]?.(items);

  let sub: string | undefined;
  if (m.subFromComputer) {
    const c = subComputers[m.subFromComputer];
    if (c) sub = String(c(items, filters));
  } else if (m.subFromFilter) {
    const fc = filterConfigs.find((f) => f.key === m.subFromFilter);
    if (fc) sub = filterLabel(fc, filters[m.subFromFilter] ?? '', filterOptions[m.subFromFilter] ?? []);
  }

  const spark = m.spark === 'auto' ? sparkComputers['spark.outbound_count']?.(items) : undefined;

  return { label: m.label, value, unit: m.unit, sub, tone, spark };
}

// ─── 행 외양 규칙 ───────────────────────────────────────────────────────────
export function rowClassName(
  row: Record<string, unknown>,
  rules: ListScreenConfig['rowAppearance'],
): string | undefined {
  if (!rules) return undefined;
  const classes = rules
    .filter((r) => getFieldValue(row, r.whenEquals.field) === r.whenEquals.value)
    .map((r) => r.className);
  return classes.length ? cn(...classes) : undefined;
}

// ─── 셀 렌더 ───────────────────────────────────────────────────────────────
export function renderCell(col: ColumnConfig, row: Record<string, unknown>): ReactNode {
  const value = getFieldValue(row, col.key);
  if (col.rendererId) {
    const renderer = cellRenderers[col.rendererId];
    if (renderer) return renderer(value, row);
  }
  if (col.formatter) {
    const formatted = applyFormatter(col.formatter, value);
    return formatted || (col.fallback ?? '—');
  }
  if (value == null || value === '') return col.fallback ?? '—';
  return String(value);
}

// ─── 한 리스트의 전체 상태 (탭 안에서 재사용) ─────────────────────────────
export interface TabState {
  filters: Record<string, string>;
  setFilters: (next: Record<string, string>) => void;
  filterOptions: Record<string, Options>;
  data: unknown[];
  loading: boolean;
  reload: () => void;
  metrics: MasterConsoleMetric[];
}

export function useTabState(list: ListScreenConfig): TabState {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const filterOptions = useFilterOptions(list.filters);

  const hook = dataHooks[list.source.hookId];
  if (!hook) throw new Error(`[ListScreen] data hook not registered: ${list.source.hookId}`);
  const { data, loading, reload } = hook(filters);

  const metrics = useMemo(
    () => list.metrics.map((m) => buildMetric(m, data, filters, list.filters, filterOptions)),
    [list.metrics, list.filters, data, filters, filterOptions],
  );

  return { filters, setFilters, filterOptions, data, loading, reload, metrics };
}

// ─── 클라이언트 검색 적용 ──────────────────────────────────────────────────
function applySearch(
  items: unknown[],
  query: string,
  fields: string[],
): unknown[] {
  if (!query) return items;
  const lower = query.toLowerCase();
  return items.filter((row) => {
    const rec = row as Record<string, unknown>;
    return fields.some((f) => {
      const v = getFieldValue(rec, f);
      return v != null && String(v).toLowerCase().includes(lower);
    });
  });
}

// ─── Phase 4 보강: 정렬 ────────────────────────────────────────────────────
export type SortState = { key: string; direction: 'asc' | 'desc' } | null;

function applySort(items: unknown[], sort: SortState): unknown[] {
  if (!sort) return items;
  const sorted = [...items];
  sorted.sort((a, b) => {
    const va = getFieldValue(a as Record<string, unknown>, sort.key);
    const vb = getFieldValue(b as Record<string, unknown>, sort.key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    // 숫자/Date 처리 — 양쪽 모두 number 면 숫자 비교, 그 외엔 문자열 비교
    if (typeof va === 'number' && typeof vb === 'number') {
      return sort.direction === 'asc' ? va - vb : vb - va;
    }
    if (typeof va === 'boolean' && typeof vb === 'boolean') {
      return sort.direction === 'asc' ? Number(va) - Number(vb) : Number(vb) - Number(va);
    }
    const sa = String(va);
    const sb = String(vb);
    return sort.direction === 'asc' ? sa.localeCompare(sb, 'ko') : sb.localeCompare(sa, 'ko');
  });
  return sorted;
}

function nextSortDirection(current: SortState, key: string): SortState {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return null; // 두 번 클릭 후 해제
}

// ─── 액션 헬퍼 ─────────────────────────────────────────────────────────────
const ICONS: Record<ActionIcon, ReactNode> = {
  plus: <Plus className="h-4 w-4" />,
  pencil: <Pencil className="h-3.5 w-3.5" />,
  trash: <Trash2 className="h-3.5 w-3.5" />,
};

function fillTemplate(template: string, row: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(row[key] ?? ''));
}

function substituteIdInUrl(url: string, row: Record<string, unknown>, idField?: string): string {
  if (!idField) return url;
  const id = row[idField];
  return url.replace(':id', String(id ?? ''));
}

// ─── 툴바 (검색 + 필터 + extras) ─────────────────────────────────────────
export function ToolbarBar({
  list, state, searchQuery, setSearchQuery, openForm,
}: {
  list: ListScreenConfig;
  state: TabState;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  openForm: (formId: string) => void;
}) {
  return (
    <>
      {list.searchable ? (
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={list.searchable.placeholder ?? '검색'}
          className="h-7 text-xs"
          style={{ width: 220 }}
        />
      ) : null}
      {list.filters.length > 0 ? (
        <FilterButton
          items={list.filters.map((f) => ({
            label: f.label,
            value: state.filters[f.key] ?? '',
            onChange: (next: string) => state.setFilters({ ...state.filters, [f.key]: next }),
            options: state.filterOptions[f.key] ?? [],
          }))}
        />
      ) : null}
      {list.toolbarExtras?.map((extra, idx) => {
        const Extra = toolbarExtras[extra.extraId];
        if (!Extra) return null;
        return <Extra key={idx} config={extra.props ?? {}} openForm={openForm} />;
      })}
    </>
  );
}

// ─── 행 액션 버튼 (인라인) ─────────────────────────────────────────────────
export function RowActionsCell({
  row, actions, onAction,
}: {
  row: Record<string, unknown>;
  actions: ActionConfig[];
  onAction: (action: ActionConfig, row: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {actions.map((a) => (
        <Button
          key={a.id}
          type="button"
          variant={a.variant === 'destructive' || a.variant === 'primary' ? 'ghost' : (a.variant ?? 'ghost')}
          size="icon"
          className={cn(
            'h-7 w-7',
            a.variant === 'destructive' && 'text-red-500 hover:text-red-700 hover:bg-red-50',
          )}
          onClick={(e) => { e.stopPropagation(); onAction(a, row); }}
          title={a.label}
        >
          {a.iconId ? ICONS[a.iconId] : null}
        </Button>
      ))}
    </div>
  );
}

// ─── 테이블 + Empty + Forms ───────────────────────────────────────────────
export function TableArea({
  list, state, displayItems, setFormOpenId, onRowAction, onRowSelect,
  visibleColumns, sort, setSort, selectedIds, setSelectedIds,
}: {
  list: ListScreenConfig;
  state: TabState;
  displayItems: unknown[];
  formOpenId?: string | null;
  setFormOpenId: (id: string | null) => void;
  onOpenEdit?: (formId: string, editData: unknown) => void;
  onRowAction: (action: ActionConfig, row: Record<string, unknown>) => void;
  onRowSelect: (id: string) => void;
  // Phase 4 보강: 정렬 + 멀티 선택 (선택적 — 미전달 시 비활성)
  visibleColumns?: ColumnConfig[];
  sort?: SortState;
  setSort?: (next: SortState) => void;
  selectedIds?: Set<string>;
  setSelectedIds?: (next: Set<string>) => void;
}) {
  if (state.loading) return <SkeletonRows rows={6} />;

  const cols = visibleColumns ?? list.columns;
  const rowActions = list.actions?.filter((a) => a.trigger === 'row') ?? [];
  const hasRowActions = rowActions.length > 0;
  const bulkActions = list.actions?.filter((a) => a.trigger === 'bulk') ?? [];
  const showBulkColumn = bulkActions.length > 0 && !!selectedIds && !!setSelectedIds;
  const idField = bulkActions.find((a) => a.idField)?.idField
    ?? (list.onRowClick && 'idField' in list.onRowClick ? list.onRowClick.idField : undefined);

  if (displayItems.length === 0 && list.emptyState) {
    const action = list.actions?.find((a) => a.id === list.emptyState!.actionId);
    return (
      <EmptyState
        message={list.emptyState.message}
        actionLabel={action?.label}
        onAction={action?.kind === 'open_form' && action.formId ? () => setFormOpenId(action.formId!) : undefined}
      />
    );
  }

  const allRowIds = showBulkColumn && idField
    ? displayItems.map((r) => String(getFieldValue(r as Record<string, unknown>, idField) ?? ''))
    : [];
  const allSelected = showBulkColumn && allRowIds.length > 0 && allRowIds.every((id) => selectedIds!.has(id));
  const partiallySelected = showBulkColumn && allRowIds.some((id) => selectedIds!.has(id)) && !allSelected;

  const toggleAll = () => {
    if (!setSelectedIds) return;
    setSelectedIds(allSelected ? new Set() : new Set(allRowIds));
  };
  const toggleRow = (id: string) => {
    if (!setSelectedIds || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  return (
    <>
      <div className="rounded-md border">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              {showBulkColumn ? (
                <TableHead style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label="모두 선택"
                    className="h-3.5 w-3.5"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = partiallySelected; }}
                    onChange={toggleAll}
                  />
                </TableHead>
              ) : null}
              {cols.map((c) => {
                const sortable = c.sortable && setSort;
                const isSorted = sort?.key === c.key;
                const SortIcon = isSorted
                  ? (sort?.direction === 'asc' ? ArrowUp : ArrowDown)
                  : ArrowUpDown;
                return (
                  <TableHead
                    key={c.key}
                    className={cn(c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}
                    style={c.width ? { width: c.width } : undefined}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => setSort!(nextSortDirection(sort ?? null, c.key))}
                      >
                        {c.label}
                        <SortIcon className={cn('h-3 w-3', isSorted ? 'opacity-100' : 'opacity-40')} />
                      </button>
                    ) : c.label}
                  </TableHead>
                );
              })}
              {hasRowActions ? <TableHead className="text-right">작업</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayItems.map((row, idx) => {
              const rec = row as Record<string, unknown>;
              const idVal = list.onRowClick && 'idField' in list.onRowClick
                ? String(getFieldValue(rec, list.onRowClick.idField) ?? idx)
                : String(idx);
              const bulkRowId = idField ? String(getFieldValue(rec, idField) ?? '') : '';
              const onClick = list.onRowClick?.kind === 'detail'
                ? () => onRowSelect(idVal)
                : undefined;
              return (
                <TableRow
                  key={idVal}
                  className={cn(
                    onClick && 'cursor-pointer hover:bg-accent/50',
                    rowClassName(rec, list.rowAppearance),
                  )}
                  onClick={onClick}
                >
                  {showBulkColumn ? (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label="행 선택"
                        className="h-3.5 w-3.5"
                        checked={selectedIds!.has(bulkRowId)}
                        onChange={() => toggleRow(bulkRowId)}
                      />
                    </TableCell>
                  ) : null}
                  {cols.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(
                        c.align === 'right' && 'text-right tabular-nums',
                        c.align === 'center' && 'text-center',
                        c.className,
                      )}
                    >
                      {renderCell(c, rec)}
                    </TableCell>
                  ))}
                  {hasRowActions ? (
                    <TableCell className="text-right">
                      <RowActionsCell row={rec} actions={rowActions} onAction={onRowAction} />
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

    </>
  );
}

export function BulkActionToolbar({
  selectedCount, actions, onAction, onClear,
}: {
  selectedCount: number;
  actions: ActionConfig[];
  onAction: (action: ActionConfig) => void;
  onClear: () => void;
}) {
  if (selectedCount === 0 || actions.length === 0) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
      <span className="font-medium">{selectedCount.toLocaleString()}개 선택됨</span>
      <div className="flex-1" />
      {actions.map((a) => (
        <Button
          key={a.id}
          size="sm"
          variant={a.variant === 'destructive' ? 'destructive' : (a.variant === 'outline' ? 'outline' : 'default')}
          onClick={() => onAction(a)}
        >
          {a.iconId ? <span className="mr-1">{ICONS[a.iconId]}</span> : null}
          {a.label}
        </Button>
      ))}
      <Button size="sm" variant="ghost" onClick={onClear}>선택 해제</Button>
    </div>
  );
}

// ─── 페이지 액션 상태 (폼 + 편집 + 확인 다이얼로그) — ListScreen·TabbedListScreen 공유 ─
export interface PendingConfirm {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'destructive' | 'default';
  onConfirm: () => Promise<void>;
}

export interface PageActions {
  formOpenId: string | null;
  formEditTargets: Record<string, unknown>;
  pendingConfirm: PendingConfirm | null;
  openForm: (formId: string, editData?: unknown) => void;
  closeForm: (formId: string) => void;
  setPendingConfirm: (c: PendingConfirm | null) => void;
}

export function usePageActions(): PageActions {
  const [formOpenId, setFormOpenId] = useState<string | null>(null);
  const [formEditTargets, setFormEditTargets] = useState<Record<string, unknown>>({});
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  return {
    formOpenId,
    formEditTargets,
    pendingConfirm,
    setPendingConfirm,
    openForm: (formId, editData) => {
      setFormEditTargets((prev) => ({ ...prev, [formId]: editData ?? null }));
      setFormOpenId(formId);
    },
    closeForm: (formId) => {
      setFormOpenId(null);
      setFormEditTargets((prev) => ({ ...prev, [formId]: null }));
    },
  };
}

// 행 액션 핸들러 — 탭별 reload를 클로저로 받음
export function makeRowActionHandler(actions: PageActions, reload: () => void) {
  return (action: ActionConfig, row: Record<string, unknown>) => {
    if (action.kind === 'edit_form' && action.formId) {
      actions.openForm(action.formId, row);
    } else if (action.kind === 'confirm_call' && action.endpoint && action.method) {
      const desc = action.confirm ? fillTemplate(action.confirm.description, row) : '진행하시겠습니까?';
      actions.setPendingConfirm({
        title: action.confirm?.title ?? action.label,
        description: desc,
        confirmLabel: action.confirm?.confirmLabel,
        variant: action.confirm?.variant,
        onConfirm: async () => {
          const url = substituteIdInUrl(action.endpoint!, row, action.idField);
          await fetchWithAuth(url, {
            method: action.method!,
            body: action.body ? JSON.stringify(action.body) : undefined,
          });
          reload();
        },
      });
    }
  };
}

// 폼 묶음 마운트 — 한 list의 forms를 한 reload에 바인드
export function FormsMounted({
  forms, reload, actions,
}: {
  forms: FormConfig[];
  reload: () => void;
  actions: PageActions;
}) {
  return (
    <>
      {forms.map((f) => {
        const FormComp = formComponents[f.componentId];
        if (!FormComp) return null;
        const editData = actions.formEditTargets[f.id];
        return (
          <FormComp
            key={f.id}
            open={actions.formOpenId === f.id}
            onOpenChange={(o: boolean) => { if (!o) actions.closeForm(f.id); }}
            onSubmit={async (formData: Record<string, unknown>) => {
              if (editData && f.editEndpoint && f.editIdField) {
                const id = (editData as Record<string, unknown>)[f.editIdField];
                const url = f.editEndpoint.replace(':id', String(id));
                await fetchWithAuth(url, { method: 'PUT', body: JSON.stringify(formData) });
              } else {
                await fetchWithAuth(f.endpoint, { method: 'POST', body: JSON.stringify(formData) });
              }
              reload();
            }}
            editData={editData ?? undefined}
          />
        );
      })}
    </>
  );
}

export function ConfirmDialogMounted({ actions }: { actions: PageActions }) {
  return (
    <ConfirmDialog
      open={!!actions.pendingConfirm}
      onOpenChange={(o) => { if (!o) actions.setPendingConfirm(null); }}
      title={actions.pendingConfirm?.title ?? ''}
      description={actions.pendingConfirm?.description ?? ''}
      confirmLabel={actions.pendingConfirm?.confirmLabel}
      variant={actions.pendingConfirm?.variant}
      onConfirm={async () => {
        if (actions.pendingConfirm) {
          await actions.pendingConfirm.onConfirm();
          actions.setPendingConfirm(null);
        }
      }}
    />
  );
}

// ─── Rail 렌더링 ───────────────────────────────────────────────────────────
export function renderRail(
  list: ListScreenConfig,
  data: unknown[],
  filters: Record<string, string>,
): ReactNode | undefined {
  if (!list.rail?.length) return undefined;
  return (
    <>
      {list.rail.map((b, idx) => {
        const Block = railBlocks[b.blockId];
        if (!Block) return null;
        return <Block key={idx} items={data} filters={filters} config={(b.props ?? {}) as Record<string, unknown>} />;
      })}
    </>
  );
}

// ─── 헤더 액션 버튼 ────────────────────────────────────────────────────────
export function HeaderActions({
  actions, openForm,
}: {
  actions: ActionConfig[];
  openForm: (formId: string) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <>
      {actions.map((a) => (
        <Button
          key={a.id}
          size="sm"
          variant={a.variant === 'destructive' ? 'destructive' : (a.variant === 'outline' ? 'outline' : 'default')}
          onClick={() => { if (a.kind === 'open_form' && a.formId) openForm(a.formId); }}
        >
          {a.iconId ? <span className="mr-1.5">{ICONS[a.iconId]}</span> : null}
          {a.label}
        </Button>
      ))}
    </>
  );
}

// ─── 단일 리스트 페이지 ────────────────────────────────────────────────────
export default function ListScreen({ config: defaultConfig }: { config: ListScreenConfig }) {
  // Phase 4 PoC: tenant 오버레이 (계열사 포크) — base 에 tenant override 먼저 적용
  const tenantId = useTenantStore((s) => s.tenantId);
  const tenantConfig = useMemo(
    () => applyTenantToScreen(defaultConfig, tenantId),
    [defaultConfig, tenantId],
  );
  // Phase 3: localStorage override 우선, 없으면 (tenant 적용된) defaultConfig
  const config = useResolvedConfig(tenantConfig, 'screen');
  const [selected, setSelected] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Phase 4 보강: 정렬 + 멀티 선택 + 컬럼 가시성
  const [sort, setSort] = useState<SortState>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { hidden: hiddenCols, setHidden: setHiddenCols } = useColumnVisibility(config.id, config.columns);

  const pageActions = usePageActions();
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const requiresCompany = config.requiresCompany ?? true;

  const state = useTabState(config);

  if (requiresCompany && !selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p>
      </div>
    );
  }

  if (selected && config.onRowClick?.kind === 'detail') {
    const Detail = detailComponents[config.onRowClick.detailId];
    if (!Detail) throw new Error(`[ListScreen] detail not registered: ${config.onRowClick.detailId}`);
    return (
      <div className="p-6">
        <Detail id={selected} onBack={() => { setSelected(null); state.reload(); }} />
      </div>
    );
  }

  // 검색 → 정렬 → 표시
  const searched = config.searchable
    ? applySearch(state.data, searchQuery, config.searchable.fields)
    : state.data;
  const displayItems = applySort(searched, sort);

  // 가시 컬럼 (사용자가 숨긴 항목 제외)
  const visibleColumns = config.columns.filter((c) => !hiddenCols.has(c.key));

  const onRowAction = makeRowActionHandler(pageActions, state.reload);
  const headerActions = config.actions?.filter((a) => a.trigger === 'header') ?? [];
  const bulkActions = config.actions?.filter((a) => a.trigger === 'bulk') ?? [];
  const hasHideable = config.columns.some((c) => c.hideable);

  // 멀티 액션 핸들러 — selected ids 에 일괄 적용
  const onBulkAction = (action: ActionConfig) => {
    if (action.kind !== 'bulk_call' || !action.endpoint || !action.method || !action.idField) return;
    const ids = [...selectedIds];
    const desc = (action.confirm?.description ?? '선택한 {count}개 항목에 적용하시겠습니까?').replace('{count}', String(ids.length));
    pageActions.setPendingConfirm({
      title: action.confirm?.title ?? action.label,
      description: desc,
      confirmLabel: action.confirm?.confirmLabel,
      variant: action.confirm?.variant,
      onConfirm: async () => {
        await Promise.all(ids.map((id) => fetchWithAuth(
          action.endpoint!.replace(':id', id),
          { method: action.method!, body: action.body ? JSON.stringify(action.body) : undefined },
        )));
        setSelectedIds(new Set());
        state.reload();
      },
    });
  };

  const tableSub = config.tableSubFromTotal && config.searchable
    ? `${displayItems.length.toLocaleString()} / ${state.data.length.toLocaleString()}개 표시`
    : `${state.data.length.toLocaleString()}건`;

  return (
    <>
      <MasterConsole
        eyebrow={config.page.eyebrow}
        title={config.page.title}
        description={config.page.description}
        tableTitle={config.page.title}
        tableSub={tableSub}
        actions={headerActions.length > 0
          ? <HeaderActions actions={headerActions} openForm={(id) => pageActions.openForm(id)} />
          : undefined}
        metrics={state.metrics}
        toolbar={
          <div className="sf-card-controls" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}>
            <ToolbarBar
              list={config}
              state={state}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              openForm={(id) => pageActions.openForm(id)}
            />
            <div style={{ flex: 1 }} />
            {hasHideable
              ? <ColumnVisibilityMenu columns={config.columns} hidden={hiddenCols} setHidden={setHiddenCols} />
              : null}
          </div>
        }
        rail={renderRail(config, displayItems, state.filters)}
      >
        {bulkActions.length > 0 && selectedIds.size > 0 ? (
          <div className="mb-3">
            <BulkActionToolbar
              selectedCount={selectedIds.size}
              actions={bulkActions}
              onAction={onBulkAction}
              onClear={() => setSelectedIds(new Set())}
            />
          </div>
        ) : null}
        <TableArea
          list={config}
          state={state}
          displayItems={displayItems}
          setFormOpenId={(id) => { if (id) pageActions.openForm(id); }}
          onRowAction={onRowAction}
          onRowSelect={setSelected}
          visibleColumns={visibleColumns}
          sort={sort}
          setSort={setSort}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
        />
      </MasterConsole>

      {config.forms ? <FormsMounted forms={config.forms} reload={state.reload} actions={pageActions} /> : null}
      <ConfirmDialogMounted actions={pageActions} />
    </>
  );
}

