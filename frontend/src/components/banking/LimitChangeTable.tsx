import { ArrowUp, ArrowDown } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatUSD, formatDate } from '@/lib/utils';
import type { LimitChange } from '@/types/banking';

interface Props {
  items: LimitChange[];
}

export default function LimitChangeTable({ items }: Props) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm" style={{ color: 'var(--sf-ink-3)' }}>한도 변경 이력이 없습니다</p>;
  }

  const totalDiff = items.reduce((sum, c) => sum + c.new_limit - c.previous_limit, 0);
  const isTotalIncrease = totalDiff > 0;
  const isTotalDecrease = totalDiff < 0;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>은행</TableHead>
          <TableHead>변경일</TableHead>
          <TableHead className="text-right">이전한도</TableHead>
          <TableHead className="text-right">변경한도</TableHead>
          <TableHead className="text-right">변동</TableHead>
          <TableHead>사유</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((c) => {
          const diff = c.new_limit - c.previous_limit;
          const isIncrease = diff > 0;
          return (
            <TableRow key={c.limit_change_id}>
              <TableCell className="text-sm font-medium">{c.bank_name || c.bank_id.slice(0, 8)}</TableCell>
              <TableCell className="text-sm">{formatDate(c.change_date)}</TableCell>
              <TableCell className="text-sm text-right">{formatUSD(c.previous_limit)}</TableCell>
              <TableCell className="text-sm text-right">{formatUSD(c.new_limit)}</TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                <span
                  className="inline-flex items-center gap-0.5 font-semibold"
                  style={{ color: isIncrease ? 'var(--sf-pos)' : 'var(--sf-neg)' }}
                >
                  {isIncrease ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                  {formatUSD(Math.abs(diff))}
                </span>
              </TableCell>
              <TableCell className="text-sm">{c.reason || '—'}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-medium">합계</TableCell>
          <TableCell className="text-xs text-muted-foreground">{items.length.toLocaleString('ko-KR')}건</TableCell>
          <TableCell />
          <TableCell />
          <TableCell className="text-right text-sm tabular-nums">
            <span
              className="inline-flex items-center gap-0.5 font-medium"
              style={{ color: isTotalIncrease ? 'var(--sf-pos)' : isTotalDecrease ? 'var(--sf-neg)' : 'var(--sf-ink)' }}
            >
              {isTotalIncrease ? <ArrowUp className="h-3.5 w-3.5" /> : isTotalDecrease ? <ArrowDown className="h-3.5 w-3.5" /> : null}
              {formatUSD(Math.abs(totalDiff))}
            </span>
          </TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  );
}
