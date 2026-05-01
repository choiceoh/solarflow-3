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

export function useSort<T>(
  items: T[],
  getValue: (item: T, field: string) => Comparable,
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
    if (!state.field || !state.direction) return items;
    const field = state.field;
    const dir = state.direction === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => dir * compare(getValue(a, field), getValue(b, field)));
  }, [items, state, getValue]);

  const headerProps = useCallback((field: string) => ({
    sortKey: field,
    direction: state.field === field ? state.direction : null,
    onSort: toggle,
  }), [state, toggle]);

  return { sorted, sortField: state.field, sortDirection: state.direction, toggle, headerProps };
}
