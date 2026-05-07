import { useCallback, useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortState {
  field: string | null;
  direction: SortDirection;
}

type Comparable = string | number | Date | boolean | null | undefined;

function compare(a: Comparable, b: Comparable): number {
  const aNull = a === null || a === undefined || a === '';
  const bNull = b === null || b === undefined || b === '';
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), 'ko', { numeric: true });
}

// controlled mode — 부모 (예: ProcurementPage 의 useServerSort) 가 sort state 를 들고 있고
// 정렬은 server 가 한 경우. ListTable 안에서 useSort 를 호출하면서 controlled 를 넘기면
// items 를 그대로 보여주고 (다시 정렬 안 함) 헤더 클릭만 부모로 위임.
export interface SortControlled {
  sortField: string | null
  sortDirection: SortDirection
  onSort: (field: string) => void
}

export function useSort<T>(
  items: T[],
  getValue: (item: T, field: string) => Comparable,
  controlled?: SortControlled,
) {
  const [state, setState] = useState<SortState>({ field: null, direction: null });

  const toggle = useCallback((field: string) => {
    setState(prev => {
      if (prev.field !== field) return { field, direction: 'desc' };
      if (prev.direction === 'desc') return { field, direction: 'asc' };
      return { field: null, direction: null };
    });
  }, []);

  const sorted = useMemo(() => {
    if (controlled) return items;  // server 정렬 — 그대로
    if (!state.field || !state.direction) return items;
    const field = state.field;
    const dir = state.direction === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => dir * compare(getValue(a, field), getValue(b, field)));
  }, [items, state, getValue, controlled]);

  const effectiveField = controlled ? controlled.sortField : state.field
  const effectiveDirection = controlled ? controlled.sortDirection : state.direction
  const effectiveOnSort = controlled ? controlled.onSort : toggle

  const headerProps = useCallback((field: string) => ({
    sortKey: field,
    direction: effectiveField === field ? effectiveDirection : null,
    onSort: effectiveOnSort,
  }), [effectiveField, effectiveDirection, effectiveOnSort]);

  return { sorted, sortField: effectiveField, sortDirection: effectiveDirection, toggle: effectiveOnSort, headerProps };
}
