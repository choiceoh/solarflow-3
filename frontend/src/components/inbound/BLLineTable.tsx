import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCapacity, formatNumber } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import { type BLLineItem } from '@/types/inbound';

interface Props {
  items: BLLineItem[];
  currency: 'USD' | 'KRW';
  manufacturerName?: string;
  onEdit: (line: BLLineItem) => void;
}

// Go API가 products를 nested로 반환 — flat/nested 모두 대응
function pCode(l: BLLineItem) { return l.product_code ?? l.products?.product_code ?? '—'; }
function pName(l: BLLineItem) { return l.product_name ?? l.products?.product_name ?? '—'; }
function pSpec(l: BLLineItem) { return l.products?.spec_wp; }

export default function BLLineTable({ items, currency, manufacturerName, onEdit }: Props) {
  if (items.length === 0) return <EmptyState message="입고품목이 없습니다" />;

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>제조사/규격</TableHead>
            <TableHead>품번</TableHead>
            <TableHead>품명</TableHead>
            <TableHead className="text-right">수량</TableHead>
            <TableHead className="text-right">용량(kW)</TableHead>
            <TableHead className="text-right">용량(MW)</TableHead>
            <TableHead>구분</TableHead>
            <TableHead>유/무상</TableHead>
            <TableHead className="text-right">{currency === 'USD' ? '단가(USD/Wp)' : '단가(KRW/Wp)'}</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((line) => (
            <TableRow key={line.bl_line_id}>
              <TableCell>
                {manufacturerName && pSpec(line) != null
                  ? `${manufacturerName} ${pSpec(line)}W`
                  : manufacturerName ?? (pSpec(line) != null ? `${pSpec(line)}W` : '—')}
              </TableCell>
              <TableCell className="font-mono">{pCode(line)}</TableCell>
              <TableCell>{pName(line)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(line.quantity)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCapacity(line.capacity_kw, line.quantity)}</TableCell>
              <TableCell className="text-right tabular-nums">{line.capacity_kw != null ? (line.capacity_kw / 1000).toFixed(3) : '—'}</TableCell>
              <TableCell>
                <span className={line.item_type === 'main' ? 'sf-pill ghost' : 'sf-pill solar'}>
                  {line.item_type === 'main' ? '본품' : '스페어'}
                </span>
              </TableCell>
              <TableCell>
                <span className={line.payment_type === 'paid' ? 'sf-pill ghost' : 'sf-pill pos'}>
                  {line.payment_type === 'paid' ? '유상' : '무상'}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {currency === 'USD'
                  ? (line.unit_price_usd_wp != null ? `$${line.unit_price_usd_wp.toFixed(4)}` : '—')
                  : (line.unit_price_krw_wp != null ? `${formatNumber(line.unit_price_krw_wp)}원` : '—')}
              </TableCell>
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
