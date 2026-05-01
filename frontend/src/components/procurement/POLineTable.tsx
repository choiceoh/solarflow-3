import { memo } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber, formatUSD, formatWp } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import type { POLineItem } from '@/types/procurement';

interface Props { items: POLineItem[]; onEdit: (line: POLineItem) => void; manufacturerName?: string; }

// Go API가 products를 nested로 반환 — flat/nested 둘 다 대응
function pCode(l: POLineItem): string { return l.product_code ?? l.products?.product_code ?? '—'; }
function pName(l: POLineItem): string { return l.product_name ?? l.products?.product_name ?? '—'; }
function pSpec(l: POLineItem): number | undefined { return l.spec_wp ?? l.products?.spec_wp; }

function POLineTable({ items, onEdit, manufacturerName }: Props) {
  if (items.length === 0) return <EmptyState message="발주품목이 없습니다" />;
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="text-xs">
        <TableHeader><TableRow>
          <TableHead>제조사</TableHead><TableHead>품번</TableHead><TableHead>품명</TableHead><TableHead className="text-right">규격</TableHead>
          <TableHead className="text-right">수량</TableHead><TableHead>유/무상</TableHead><TableHead className="text-right">단가(¢/Wp)</TableHead>
          <TableHead className="text-right">총액(USD)</TableHead><TableHead className="w-10"></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {items.map((l) => {
            const spec = pSpec(l);
            // unit_price_usd는 $/EA로 저장됨. ¢/Wp = ($/EA ÷ Wp) × 100
            const cents = (l.unit_price_usd != null && spec)
              ? (l.unit_price_usd / spec) * 100
              : null;
            return (
              <TableRow key={l.po_line_id}>
                <TableCell>{manufacturerName ?? '—'}</TableCell>
                <TableCell className="font-mono">{pCode(l)}</TableCell>
                <TableCell>{pName(l)}</TableCell>
                <TableCell className="text-right">{spec ? formatWp(spec) : '—'}</TableCell>
                <TableCell className="text-right">{formatNumber(l.quantity)}</TableCell>
                <TableCell>
                  {l.payment_type === 'free'
                    ? <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700">무상</span>
                    : <span className="text-[10px] text-muted-foreground">유상</span>}
                </TableCell>
                <TableCell className="text-right">{cents != null ? `${cents.toFixed(2)}¢` : '—'}</TableCell>
                <TableCell className="text-right font-medium">{l.total_amount_usd != null ? formatUSD(l.total_amount_usd) : '—'}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(l)} disabled={l.payment_type === 'free'}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default memo(POLineTable);
