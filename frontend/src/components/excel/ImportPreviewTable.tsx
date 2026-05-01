import type { ParsedRow, FieldDef } from '@/types/excel';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  rows: ParsedRow[];
  fields: FieldDef[];
  filter: 'all' | 'valid' | 'error';
}

export default function ImportPreviewTable({ rows, fields, filter }: Props) {
  const filtered = rows.filter((r) => {
    if (filter === 'valid') return r.valid;
    if (filter === 'error') return !r.valid;
    return true;
  });

  if (filtered.length === 0) {
    return <p className="py-4 text-center text-sm text-[var(--sf-ink-3)]">표시할 데이터가 없습니다</p>;
  }

  // 에러 필드 빠른 조회용
  const getErrorForField = (row: ParsedRow, fieldLabel: string) =>
    row.errors.find((e) => e.field === fieldLabel);

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
            <tr
              key={row.rowNumber}
              className={cn(
                'border-t',
                !row.valid && 'bg-red-50',
              )}
            >
              <td className="sf-mono px-2 py-1 tabular-nums text-[var(--sf-ink-3)]">{row.rowNumber}</td>
              {fields.map((f) => {
                const err = getErrorForField(row, f.label);
                const val = row.data[f.key];
                const display = val === null || val === undefined ? '' : String(val);
                return (
                  <td
                    key={f.key}
                    className={cn(
                      'px-2 py-1 whitespace-nowrap max-w-[150px] truncate',
                      err && 'text-red-600 font-medium',
                    )}
                  >
                    {err ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="cursor-help underline decoration-dashed decoration-red-400">
                            {display || '(빈값)'}
                          </TooltipTrigger>
                          <TooltipContent>{err.message}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      display
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-1">
                {row.valid ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
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
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
