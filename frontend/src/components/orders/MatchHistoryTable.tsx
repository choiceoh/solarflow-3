import { memo } from 'react';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatNumber } from '@/lib/utils';
import type { ReceiptMatch } from '@/types/orders';

interface Props {
  items: (ReceiptMatch & { outbound_date?: string; site_name?: string; product_name?: string })[];
  receiptAmount: number;
}

function MatchHistoryTable({ items, receiptAmount }: Props) {
  if (items.length === 0) {
    return <div className="text-center py-4 text-sm text-muted-foreground">매칭 이력이 없습니다</div>;
  }

  const matchedTotal = items.reduce((sum, m) => sum + m.matched_amount, 0);
  const remaining = receiptAmount - matchedTotal;

  return (
    <div className="space-y-2">
      <div className="rounded-md border">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>출고일</TableHead>
              <TableHead>현장명</TableHead>
              <TableHead>모듈</TableHead>
              <TableHead className="text-right">매칭금액</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((m) => (
              <TableRow key={m.match_id}>
                <TableCell>{m.outbound_date ? formatDate(m.outbound_date) : '—'}</TableCell>
                <TableCell>{m.site_name ?? '—'}</TableCell>
                <TableCell>{m.product_name ?? '—'}</TableCell>
                <TableCell className="text-right font-medium">{formatNumber(m.matched_amount)}원</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">합계</TableCell>
              <TableCell className="text-xs text-muted-foreground">{items.length.toLocaleString('ko-KR')}건</TableCell>
              <TableCell />
              <TableCell className="text-right font-medium">{formatNumber(matchedTotal)}원</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <div className="flex justify-end gap-4 text-xs">
        <span>매칭 총액: <strong>{formatNumber(matchedTotal)}원</strong></span>
        <span>입금액: <strong>{formatNumber(receiptAmount)}원</strong></span>
        <span>남은 금액: <strong>{formatNumber(remaining)}원</strong></span>
      </div>
    </div>
  );
}

export default memo(MatchHistoryTable);
