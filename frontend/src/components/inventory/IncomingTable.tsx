import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatKw, formatWp } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import type { InventoryItem, InventorySummary } from '@/types/inventory';

interface Props {
  items: InventoryItem[];
  summary: InventorySummary;
}

export default function IncomingTable({ items, summary }: Props) {
  const incoming = items.filter((i) => i.incoming_kw > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3"><CardTitle className="text-xs text-muted-foreground">미착품 총량</CardTitle></CardHeader>
          <CardContent className="pb-3"><p className="text-lg font-semibold">{formatKw(summary.total_incoming_kw)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3"><CardTitle className="text-xs text-muted-foreground">미착품 예약</CardTitle></CardHeader>
          <CardContent className="pb-3"><p className="text-lg font-semibold">{formatKw(incoming.reduce((s, i) => s + i.incoming_reserved_kw, 0))}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3"><CardTitle className="text-xs text-muted-foreground">가용 미착품</CardTitle></CardHeader>
          <CardContent className="pb-3"><p className="text-lg font-semibold">{formatKw(incoming.reduce((s, i) => s + i.available_incoming_kw, 0))}</p></CardContent>
        </Card>
      </div>

      {incoming.length === 0 ? (
        <EmptyState message="미착품이 없습니다" />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>제조사</TableHead>
                <TableHead>품번</TableHead>
                <TableHead>품명</TableHead>
                <TableHead className="text-right">규격</TableHead>
                <TableHead className="text-right">미착품</TableHead>
                <TableHead className="text-right">미착예약</TableHead>
                <TableHead className="text-right">가용미착</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incoming.map((item) => (
                <TableRow key={item.product_id}>
                  <TableCell>{item.manufacturer_name}</TableCell>
                  <TableCell className="font-mono">{item.product_code}</TableCell>
                  <TableCell>{item.product_name}</TableCell>
                  <TableCell className="text-right">{formatWp(item.spec_wp)}</TableCell>
                  <TableCell className="text-right font-medium">{formatKw(item.incoming_kw)}</TableCell>
                  <TableCell className="text-right">{formatKw(item.incoming_reserved_kw)}</TableCell>
                  <TableCell className="text-right font-medium text-green-600">{formatKw(item.available_incoming_kw)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
