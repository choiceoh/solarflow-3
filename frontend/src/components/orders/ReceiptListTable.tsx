import { Pencil, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/common/EmptyState';
import { formatDate, formatNumber } from '@/lib/utils';
import type { Receipt } from '@/types/orders';

interface Props {
  items: Receipt[];
  onNew: () => void;
  onEdit?: (r: Receipt) => void;
  onDelete?: (r: Receipt) => void;
}

type MatchStatus = 'full' | 'partial' | 'none';

function getMatchStatus(r: Receipt): MatchStatus {
  const matched = r.matched_total ?? 0;
  if (matched >= r.amount) return 'full';
  if (matched > 0) return 'partial';
  return 'none';
}

function MatchBadge({ receipt }: { receipt: Receipt }) {
  const status = getMatchStatus(receipt);
  const matched = receipt.matched_total ?? 0;
  if (status === 'full') return <span className="sf-pill pos">매칭완료</span>;
  if (status === 'partial') {
    return (
      <span className="sf-pill warn">
        부분매칭 {formatNumber(matched)}/{formatNumber(receipt.amount)}
      </span>
    );
  }
  return <span className="sf-pill ghost">미매칭</span>;
}

export default function ReceiptListTable({ items, onNew, onEdit, onDelete }: Props) {
  if (items.length === 0) return <EmptyState message="등록된 수금이 없습니다" actionLabel="새로 등록" onAction={onNew} />;

  return (
    <div className="rounded-md border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>입금일</TableHead>
            <TableHead>거래처</TableHead>
            <TableHead className="text-right">입금액</TableHead>
            <TableHead>입금계좌</TableHead>
            <TableHead>매칭상태</TableHead>
            <TableHead>메모</TableHead>
            <TableHead className="text-right">작업</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.receipt_id}>
              <TableCell>{formatDate(r.receipt_date)}</TableCell>
              <TableCell>{r.customer_name ?? '—'}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums" style={{ color: 'var(--sf-ink)' }}>{formatNumber(r.amount)}원</TableCell>
              <TableCell>{r.bank_account ?? '—'}</TableCell>
              <TableCell><MatchBadge receipt={r} /></TableCell>
              <TableCell className="max-w-[200px] truncate">{r.memo ?? '—'}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {onEdit && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {onDelete && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(r)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
