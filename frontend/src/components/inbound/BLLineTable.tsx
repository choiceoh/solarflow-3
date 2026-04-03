import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatKw, formatNumber } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import { USAGE_CATEGORIES, type BLLineItem } from '@/types/inbound';

interface Props {
  items: BLLineItem[];
  currency: 'USD' | 'KRW';
  onEdit: (line: BLLineItem) => void;
}

export default function BLLineTable({ items, currency, onEdit }: Props) {
  if (items.length === 0) return <EmptyState message="라인아이템이 없습니다" />;

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>품번</TableHead>
            <TableHead>품명</TableHead>
            <TableHead className="text-right">수량</TableHead>
            <TableHead className="text-right">용량(kW)</TableHead>
            <TableHead>구분</TableHead>
            <TableHead>유/무상</TableHead>
            <TableHead className="text-right">{currency === 'USD' ? '단가(USD/Wp)' : '단가(KRW/Wp)'}</TableHead>
            <TableHead>용도</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((line) => (
            <TableRow key={line.bl_line_id}>
              <TableCell className="font-mono">{line.product_code ?? '—'}</TableCell>
              <TableCell>{line.product_name ?? '—'}</TableCell>
              <TableCell className="text-right">{formatNumber(line.quantity)}</TableCell>
              <TableCell className="text-right">{formatKw(line.capacity_kw)}</TableCell>
              <TableCell>{line.item_type === 'main' ? '본품' : '스페어'}</TableCell>
              <TableCell>{line.payment_type === 'paid' ? '유상' : '무상'}</TableCell>
              <TableCell className="text-right">
                {currency === 'USD'
                  ? (line.unit_price_usd_wp != null ? `$${line.unit_price_usd_wp.toFixed(4)}` : '—')
                  : (line.unit_price_krw_wp != null ? `${formatNumber(line.unit_price_krw_wp)}원` : '—')}
              </TableCell>
              <TableCell>{USAGE_CATEGORIES[line.usage_category] ?? line.usage_category}</TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(line)}>
                  <Pencil className="h-3 w-3" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
