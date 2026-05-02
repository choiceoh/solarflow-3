import { useCallback, useState } from 'react';

export interface ColumnVisibilityMeta {
  key: string;
  label: string;
  hideable?: boolean;
  hiddenByDefault?: boolean;
}

const COLVIS_PREFIX = 'sf.colvis.';

export function loadHiddenCols(scopeId: string): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(COLVIS_PREFIX + scopeId);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function saveHiddenCols(scopeId: string, hidden: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(COLVIS_PREFIX + scopeId, JSON.stringify([...hidden]));
}

export function initialHiddenCols(scopeId: string, columns: ColumnVisibilityMeta[]): Set<string> {
  const stored = loadHiddenCols(scopeId);
  if (stored.size > 0) return stored;
  const fromDefault = new Set<string>();
  columns.forEach((c) => { if (c.hiddenByDefault) fromDefault.add(c.key); });
  return fromDefault;
}

export function useColumnVisibility(scopeId: string, columns: ColumnVisibilityMeta[]) {
  const [hidden, setHiddenState] = useState<Set<string>>(() => initialHiddenCols(scopeId, columns));
  const setHidden = useCallback((next: Set<string>) => {
    setHiddenState(next);
    saveHiddenCols(scopeId, next);
  }, [scopeId]);
  return { hidden, setHidden };
}
