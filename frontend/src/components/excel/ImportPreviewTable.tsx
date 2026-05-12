import type { ParsedRow, FieldDef, RowError } from '@/types/excel';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  rows: ParsedRow[];
  fields: FieldDef[];
  filter: 'all' | 'valid' | 'warning' | 'error';
}

export default function ImportPreviewTable({ rows, fields, filter }: Props) {
  const filtered = rows.filter((r) => {
    const hasWarnings = r.valid && (r.warnings?.length ?? 0) > 0;
    if (filter === 'valid') return r.valid && !hasWarnings;
    if (filter === 'warning') return hasWarnings;
    if (filter === 'error') return !r.valid;
    return true;
  });

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
              getErrorForField={getErrorForField}
              getWarningForField={getWarningForField}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewRow({
  row, fields, getErrorForField, getWarningForField,
}: {
  row: ParsedRow;
  fields: FieldDef[];
  getErrorForField: (row: ParsedRow, fieldLabel: string) => RowError | undefined;
  getWarningForField: (row: ParsedRow, fieldLabel: string) => RowError | undefined;
}) {
  const warningText = (row.warnings ?? []).map((e) => `${e.field}: ${e.message}`).join('\n');
  const hasWarnings = row.valid && warningText !== '';

  return (
    <tr
      className={cn(
        'border-t',
        !row.valid && 'bg-red-50',
        hasWarnings && 'bg-amber-50',
      )}
    >
      <td className="sf-mono sf-text-ink-3 px-2 py-1 tabular-nums">{row.rowNumber}</td>
      {fields.map((f) => {
        const err = getErrorForField(row, f.label);
        const warn = getWarningForField(row, f.label);
        const val = row.data[f.key];
        const display = val === null || val === undefined ? '' : String(val);
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
