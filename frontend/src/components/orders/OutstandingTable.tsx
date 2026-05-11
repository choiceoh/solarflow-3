import { memo } from 'react';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn, formatDate, formatNumber } from '@/lib/utils';
import type { OutstandingItem } from '@/types/orders';

interface Props {
  items: OutstandingItem[];
  selectedIds: Set<string>;
  matchAmounts: Record<string, number>;
  onToggle: (outboundId: string) => void;
  onAmountChange: (outboundId: string, amount: number) => void;
}

function OutstandingTable({ items, selectedIds, matchAmounts, onToggle, onAmountChange }: Props) {
  if (items.length === 0) {
    return <div className="text-center py-6 text-sm text-muted-foreground">미수금 내역이 없습니다</div>;
  }

  const totals = items.reduce(
    (acc, item) => ({
      total: acc.total + item.total_amount,
      matched: acc.matched + item.matched_amount,
      outstanding: acc.outstanding + item.outstanding_amount,
    }),
    { total: 0, matched: 0, outstanding: 0 },
  );
  const selectedMatchTotal = items.reduce((sum, item) => (
    selectedIds.has(item.outbound_id) ? sum + (matchAmounts[item.outbound_id] ?? 0) : sum
  ), 0);

  return (
    <div className="rounded-md border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>출고일</TableHead>
            <TableHead>현장명</TableHead>
            <TableHead>모듈</TableHead>
            <TableHead className="text-right">총액</TableHead>
            <TableHead className="text-right">기매칭</TableHead>
            <TableHead className="text-right">미수금</TableHead>
            <TableHead className="w-36 text-right">매칭금액</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const isSelected = selectedIds.has(item.outbound_id);
            const matchAmount = matchAmounts[item.outbound_id] ?? 0;
            const invalidAmount = isSelected && (matchAmount <= 0 || matchAmount > item.outstanding_amount);

            return (
              <TableRow
                key={item.outbound_id}
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => onToggle(item.outbound_id)}
              >
                <TableCell>
                  <Checkbox
                    checked={isSelected}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={() => onToggle(item.outbound_id)}
                  />
                </TableCell>
                <TableCell>{item.outbound_date ? formatDate(item.outbound_date) : '—'}</TableCell>
                <TableCell>{item.site_name ?? '—'}</TableCell>
                <TableCell>
                  {item.product_name ?? '—'}
                  {item.spec_wp ? ` ${item.spec_wp}Wp` : ''}
                  {item.quantity ? ` x${item.quantity}` : ''}
                </TableCell>
                <TableCell className="text-right">{formatNumber(item.total_amount)}</TableCell>
                <TableCell className="text-right">{formatNumber(item.matched_amount)}</TableCell>
                <TableCell className="text-right font-medium">{formatNumber(item.outstanding_amount)}</TableCell>
                <TableCell className="text-right">
                  {isSelected ? (
                    <Input
                      type="number"
                      min={1}
                      max={item.outstanding_amount}
                      step={1}
                      value={matchAmount || ''}
                      aria-invalid={invalidAmount}
                      className={cn('h-7 text-right text-xs', invalidAmount && 'border-destructive')}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      onChange={(event) => onAmountChange(item.outbound_id, Number(event.target.value))}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell />
            <TableCell className="font-medium">합계</TableCell>
            <TableCell className="text-xs text-muted-foreground">{items.length.toLocaleString('ko-KR')}건</TableCell>
            <TableCell />
            <TableCell className="text-right font-medium">{formatNumber(totals.total)}</TableCell>
            <TableCell className="text-right font-medium">{formatNumber(totals.matched)}</TableCell>
            <TableCell className="text-right font-medium">{formatNumber(totals.outstanding)}</TableCell>
            <TableCell className="text-right font-medium">{formatNumber(selectedMatchTotal)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

export default memo(OutstandingTable);
