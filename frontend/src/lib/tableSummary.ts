import type { ReactNode } from 'react';
import { formatCapacity, formatKRW, formatNumber, formatUSD } from '@/lib/utils';

export type TableSummaryMode = 'sum' | 'average' | false;

export interface TableSummaryColumn<T> {
  key: string;
  label?: ReactNode;
  summary?: TableSummaryMode;
  summaryAccessor?: (item: T) => number | null | undefined;
  summaryFormatter?: (value: number, rows: T[]) => ReactNode;
}

const SUM_KEY_RE = /(amount|total|quantity|qty|capacity|_kw\b|_mw\b|_ea\b|count|limit|balance|remaining|outstanding|collected|reserved|available|physical|incoming|supply|vat|cost|credit)/i;
const SUM_LABEL_RE = /(수량|용량|금액|합계|한도|잔여|미수|입금|매출|공급|부가세|비용|원화|외화|확보|예약|재고|건수)/;
const SKIP_KEY_RE = /(unit|rate|ratio|pct|percent|spec|width|height|date|_id\b|status|number|code|days|day|wp|exchange)/i;
const SKIP_LABEL_RE = /(단가|환율|비율|사용률|규격|가로|세로|일자|날짜|상태|번호|코드|미수일|율)/;

function labelText(label: ReactNode): string {
  if (typeof label === 'string' || typeof label === 'number') return String(label);
  return '';
}

function inferSummaryMode<T>(column: TableSummaryColumn<T>): TableSummaryMode {
  if (column.summary !== undefined) return column.summary;
  const key = column.key;
  const label = labelText(column.label);
  if (SKIP_KEY_RE.test(key) || SKIP_LABEL_RE.test(label)) return false;
  if (SUM_KEY_RE.test(key) || SUM_LABEL_RE.test(label)) return 'sum';
  return false;
}

function formatSummaryValue<T>(column: TableSummaryColumn<T>, value: number, rows: T[]): ReactNode {
  if (column.summaryFormatter) return column.summaryFormatter(value, rows);
  const key = column.key.toLowerCase();
  const label = labelText(column.label);
  if (key.includes('usd') || /usd|외화/i.test(label)) return formatUSD(value);
  if (key.includes('krw') || /(원|krw|금액|합계|한도|미수|입금|매출|공급|부가세|비용|원화)/i.test(label)) {
    return formatKRW(value);
  }
  if (key.endsWith('_mw') || /mw/i.test(label)) return `${value.toLocaleString('ko-KR', { maximumFractionDigits: 3 })} MW`;
  if (key.includes('capacity') || key.endsWith('_kw') || /(용량|kw)/i.test(label)) return formatCapacity(value);
  return formatNumber(value);
}

export function buildTableSummary<T>(
  columns: TableSummaryColumn<T>[],
  rows: T[],
  fallbackAccessor?: (column: TableSummaryColumn<T>, row: T) => unknown,
): Map<string, ReactNode> {
  const result = new Map<string, ReactNode>();
  if (rows.length === 0) return result;

  for (const column of columns) {
    const mode = inferSummaryMode(column);
    if (!mode) continue;

    const values = rows
      .map((row) => {
        const raw = column.summaryAccessor ? column.summaryAccessor(row) : fallbackAccessor?.(column, row);
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
      })
      .filter((value): value is number => value != null);

    if (values.length === 0) continue;
    const sum = values.reduce((acc, value) => acc + value, 0);
    const resolved = mode === 'average' ? sum / values.length : sum;
    result.set(column.key, formatSummaryValue(column, resolved, rows));
  }

  return result;
}
