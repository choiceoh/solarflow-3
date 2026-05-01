import { Pencil, ReceiptText } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/common/EmptyState';
import OutboundStatusBadge from './OutboundStatusBadge';
import { formatDate, formatNumber, formatKw } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { USAGE_CATEGORY_LABEL, type Outbound } from '@/types/outbound';

interface Props {
  items: Outbound[];
  onSelect: (item: Outbound) => void;
  onNew: () => void;
  onInvoice?: (item: Outbound) => void;
}

export default function OutboundListTable({ items, onSelect, onNew, onInvoice }: Props) {
  if (items.length === 0) return <EmptyState message="등록된 출고가 없습니다" actionLabel="새로 등록" onAction={onNew} />;

  return (
    <div className="rounded-md border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>출고일</TableHead>
            <TableHead>품번</TableHead>
            <TableHead>품명</TableHead>
            <TableHead>규격</TableHead>
            <TableHead className="text-right">수량</TableHead>
            <TableHead className="text-right">용량</TableHead>
            <TableHead>창고</TableHead>
            <TableHead>용도</TableHead>
            <TableHead>현장명</TableHead>
            <TableHead>수주연결</TableHead>
            <TableHead>그룹거래</TableHead>
            <TableHead>계산서</TableHead>
            <TableHead>상태</TableHead>
            <TableHead className="text-right">작업</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((ob) => {
            const isCancelPending = ob.status === 'cancel_pending';
            const isCancelled = ob.status === 'cancelled';
            return (
              <TableRow
                key={ob.outbound_id}
                className={cn(
                  'cursor-pointer hover:bg-accent/50',
                  isCancelPending && 'bg-orange-50',
                  isCancelled && 'bg-gray-50 text-muted-foreground line-through',
                )}
                onClick={() => onSelect(ob)}
              >
                <TableCell>{formatDate(ob.outbound_date)}</TableCell>
                <TableCell className="font-mono">{ob.product_code ?? '—'}</TableCell>
                <TableCell>{ob.product_name ?? '—'}</TableCell>
                <TableCell>{ob.spec_wp ? `${ob.spec_wp}` : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(ob.quantity)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatKw(ob.capacity_kw)}</TableCell>
                <TableCell>{ob.warehouse_name ?? '—'}</TableCell>
                <TableCell>{USAGE_CATEGORY_LABEL[ob.usage_category] ?? ob.usage_category}</TableCell>
                <TableCell>{ob.site_name ?? '—'}</TableCell>
                <TableCell>{ob.order_number ?? '—'}</TableCell>
                <TableCell>
                  {ob.group_trade ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="sf-pill info">그룹</span>
                      <span className="text-[10px] text-[var(--sf-ink-3)]">{ob.target_company_name}</span>
                    </span>
                  ) : '—'}
                </TableCell>
                <TableCell>
                  {ob.sale ? (
                    ob.sale.tax_invoice_date ? (
                      <span className="sf-pill pos">{formatDate(ob.sale.tax_invoice_date)}</span>
                    ) : (
                      <span className="sf-pill warn">미발행</span>
                    )
                  ) : (
                    <span className="sf-pill ghost">미등록</span>
                  )}
                </TableCell>
                <TableCell><OutboundStatusBadge status={ob.status} /></TableCell>
                <TableCell className="text-right">
                  {onInvoice && ob.status !== 'cancelled' && ['sale', 'sale_spare'].includes(ob.usage_category) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInvoice(ob);
                      }}
                    >
                      {ob.sale ? <Pencil className="mr-1 h-3 w-3" /> : <ReceiptText className="mr-1 h-3 w-3" />}
                      {ob.sale ? '수정' : '등록'}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
