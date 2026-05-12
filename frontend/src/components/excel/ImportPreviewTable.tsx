import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { ParsedRow, FieldDef, RowError } from '@/types/excel';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  rows: ParsedRow[];
  fields: FieldDef[];
  filter: 'all' | 'valid' | 'warning' | 'error';
  /** 사이드 패널에서 에러를 클릭했을 때 점프할 행. 잠깐 노란 글로우 → 사라짐. */
  highlightedRow?: number | null;
  editable?: boolean;
  onCellChange?: (rowNumber: number, fieldKey: string, value: string) => void;
}

/**
 * 부모(다이얼로그)에서 사이드 패널 → 표 행으로 점프하기 위한 imperative API.
 * 행 번호로 scrollIntoView + focus 임시 효과.
 */
export interface ImportPreviewTableHandle {
  scrollToRow: (rowNumber: number) => void;
}

const ImportPreviewTable = forwardRef<ImportPreviewTableHandle, Props>(function ImportPreviewTable(
  { rows, fields, filter, highlightedRow, editable, onCellChange },
  ref,
) {
  const filtered = rows.filter((r) => {
    const hasWarnings = r.valid && (r.warnings?.length ?? 0) > 0;
    if (filter === 'valid') return r.valid && !hasWarnings;
    if (filter === 'warning') return hasWarnings;
    if (filter === 'error') return !r.valid;
    return true;
  });

  // 행 번호별 <tr> ref. 부모가 scrollToRow 를 호출하면 같은 키의 element 로 scrollIntoView.
  const rowRefs = useRef<Map<number, HTMLTableRowElement | null>>(new Map());
  useImperativeHandle(
    ref,
    () => ({
      scrollToRow(rowNumber: number) {
        const el = rowRefs.current.get(rowNumber);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    }),
    [],
  );

  if (filtered.length === 0) {
    return <p className="sf-text-ink-3 py-4 text-center text-sm">표시할 데이터가 없습니다</p>;
  }

  // 에러 필드 빠른 조회용
  const getErrorForField = (row: ParsedRow, fieldLabel: string) =>
    row.errors.find((e) => e.field === fieldLabel);
  const getWarningForField = (row: ParsedRow, fieldLabel: string) =>
    (row.warnings ?? []).find((e) => e.field === fieldLabel);

  return (
    <div className="overflow-auto max-h-[400px] border rounded-md">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 sticky top-0 z-10">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium w-10">#</th>
            {fields.map((f) => (
              <th key={f.key} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                {f.label}
              </th>
            ))}
            <th className="px-2 py-1.5 text-left font-medium w-16">상태</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <PreviewRow
              key={row.rowNumber}
              row={row}
              fields={fields}
              isHighlighted={highlightedRow === row.rowNumber}
              registerRef={(el) => {
                if (el) rowRefs.current.set(row.rowNumber, el);
                else rowRefs.current.delete(row.rowNumber);
              }}
              getErrorForField={getErrorForField}
              getWarningForField={getWarningForField}
              editable={editable}
              onCellChange={onCellChange}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default ImportPreviewTable;

function PreviewRow({
  row, fields, getErrorForField, getWarningForField, isHighlighted, registerRef, editable, onCellChange,
}: {
  row: ParsedRow;
  fields: FieldDef[];
  isHighlighted: boolean;
  registerRef: (el: HTMLTableRowElement | null) => void;
  getErrorForField: (row: ParsedRow, fieldLabel: string) => RowError | undefined;
  getWarningForField: (row: ParsedRow, fieldLabel: string) => RowError | undefined;
  editable?: boolean;
  onCellChange?: (rowNumber: number, fieldKey: string, value: string) => void;
}) {
  const warningText = (row.warnings ?? []).map((e) => `${e.field}: ${e.message}`).join('\n');
  const hasWarnings = row.valid && warningText !== '';

  return (
    <tr
      ref={registerRef}
      className={cn(
        'border-t transition-colors',
        !row.valid && 'bg-red-50',
        hasWarnings && 'bg-amber-50',
        // 사이드 패널에서 에러를 클릭하면 잠깐 노란 ring 으로 점프 위치 표시.
        // highlightedRow 가 null 로 되돌아가면 트랜지션으로 자연스럽게 사라짐.
        isHighlighted && 'ring-2 ring-amber-400 ring-inset bg-amber-100',
      )}
    >
      <td className="sf-mono sf-text-ink-3 px-2 py-1 tabular-nums">{row.rowNumber}</td>
      {fields.map((f) => {
        const err = getErrorForField(row, f.label);
        const warn = getWarningForField(row, f.label);
        const val = row.data[f.key];
        const display = val === null || val === undefined ? '' : String(val);
        if (editable && onCellChange) {
          const issue = err?.message ?? warn?.message;
          return (
            <td
              key={f.key}
              className={cn(
                'px-2 py-1 whitespace-nowrap max-w-[170px]',
                err && 'bg-red-50',
                warn && !err && 'bg-amber-50',
              )}
            >
              <input
                aria-label={`${row.rowNumber}행 ${f.label}`}
                value={display}
                title={issue}
                onChange={(event) => onCellChange(row.rowNumber, f.key, event.target.value)}
                className={cn(
                  'h-7 w-full min-w-[90px] rounded border bg-white px-1.5 text-xs outline-none focus:ring-1',
                  err
                    ? 'border-red-300 text-red-700 focus:ring-red-300'
                    : warn
                      ? 'border-amber-300 text-amber-800 focus:ring-amber-300'
                      : 'border-transparent focus:border-[var(--sf-solar-2)] focus:ring-[var(--sf-solar-2)]',
                )}
              />
            </td>
          );
        }
        return (
          <td
            key={f.key}
            className={cn(
              'px-2 py-1 whitespace-nowrap max-w-[150px] truncate',
              err && 'text-red-600 font-medium',
              warn && !err && 'text-amber-700 font-medium',
            )}
          >
            {err || warn ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    className={cn(
                      'cursor-help underline decoration-dashed',
                      err ? 'decoration-red-400' : 'decoration-amber-500',
                    )}
                  >
                    {display || '(빈값)'}
                  </TooltipTrigger>
                  <TooltipContent>{err?.message ?? warn?.message}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              display
            )}
          </td>
        );
      })}
      <td className="px-2 py-1">
        {!row.valid ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <XCircle className="h-4 w-4 text-red-600" />
              </TooltipTrigger>
              <TooltipContent>
                {row.errors.map((e) => `${e.field}: ${e.message}`).join('\n')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : hasWarnings ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </TooltipTrigger>
              <TooltipContent>{warningText}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        )}
      </td>
    </tr>
  );
}
