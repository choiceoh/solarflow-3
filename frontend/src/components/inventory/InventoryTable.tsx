import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatKw, formatWp, formatSize } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import type { InventoryItem } from '@/types/inventory';

function LongTermBadge({ status }: { status: string }) {
  if (status === 'warning') return <Badge variant="outline" className="border-yellow-500 text-yellow-600 text-[10px]">장기(6M+)</Badge>;
  if (status === 'critical') return <Badge variant="destructive" className="text-[10px]">초장기(12M+)</Badge>;
  return null;
}

export default function InventoryTable({ items }: { items: InventoryItem[] }) {
  if (items.length === 0) return <EmptyState message="등록된 재고 데이터가 없습니다" />;

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">제조사</TableHead>
            <TableHead className="whitespace-nowrap">품번</TableHead>
            <TableHead className="whitespace-nowrap">품명</TableHead>
            <TableHead className="whitespace-nowrap text-right">규격</TableHead>
            <TableHead className="whitespace-nowrap text-right">크기</TableHead>
            <TableHead className="whitespace-nowrap text-right">물리적</TableHead>
            <TableHead className="whitespace-nowrap text-right">예약</TableHead>
            <TableHead className="whitespace-nowrap text-right">배정</TableHead>
            <TableHead className="whitespace-nowrap text-right">가용</TableHead>
            <TableHead className="whitespace-nowrap text-right">미착품</TableHead>
            <TableHead className="whitespace-nowrap text-right">미착예약</TableHead>
            <TableHead className="whitespace-nowrap text-right">가용미착</TableHead>
            <TableHead className="whitespace-nowrap text-right">총확보</TableHead>
            <TableHead className="whitespace-nowrap">장기재고</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.product_id}>
              <TableCell className="whitespace-nowrap">{item.manufacturer_name}</TableCell>
              <TableCell className="whitespace-nowrap font-mono">{item.product_code}</TableCell>
              <TableCell className="whitespace-nowrap">{item.product_name}</TableCell>
              <TableCell className="text-right">{formatWp(item.spec_wp)}</TableCell>
              <TableCell className="text-right whitespace-nowrap">{formatSize(item.module_width_mm, item.module_height_mm)}</TableCell>
              <TableCell className="text-right font-medium">{formatKw(item.physical_kw)}</TableCell>
              <TableCell className="text-right">{formatKw(item.reserved_kw)}</TableCell>
              <TableCell className="text-right">{formatKw(item.allocated_kw)}</TableCell>
              <TableCell className="text-right font-medium text-green-600">{formatKw(item.available_kw)}</TableCell>
              <TableCell className="text-right">{formatKw(item.incoming_kw)}</TableCell>
              <TableCell className="text-right">{formatKw(item.incoming_reserved_kw)}</TableCell>
              <TableCell className="text-right">{formatKw(item.available_incoming_kw)}</TableCell>
              <TableCell className="text-right font-medium text-purple-600">{formatKw(item.total_secured_kw)}</TableCell>
              <TableCell><LongTermBadge status={item.long_term_status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
