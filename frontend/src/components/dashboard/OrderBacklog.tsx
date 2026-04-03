import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatNumber, formatDate } from '@/lib/utils';
import type { Order } from '@/types/orders';

interface Props {
  items: Order[];
}

export default function OrderBacklog({ items }: Props) {
  const navigate = useNavigate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <CardTitle className="text-sm">수주 잔량</CardTitle>
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate('/orders')}>전체 보기</Button>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">잔량이 있는 수주가 없습니다</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>거래처</TableHead>
                <TableHead>품명</TableHead>
                <TableHead className="text-right">수주량</TableHead>
                <TableHead className="text-right">출고량</TableHead>
                <TableHead className="text-right">잔량</TableHead>
                <TableHead>납기</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((o) => {
                const isDueSoon = o.delivery_due && (() => {
                  const due = new Date(o.delivery_due!);
                  const diff = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  return diff >= 0 && diff <= 7;
                })();
                return (
                  <TableRow key={o.order_id}>
                    <TableCell className="text-xs">{o.customer_name || '—'}</TableCell>
                    <TableCell className="text-xs">{o.product_name || '—'}</TableCell>
                    <TableCell className="text-xs text-right">{formatNumber(o.quantity)}</TableCell>
                    <TableCell className="text-xs text-right">{formatNumber(o.shipped_qty ?? 0)}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{formatNumber(o.remaining_qty ?? 0)}</TableCell>
                    <TableCell className={`text-xs ${isDueSoon ? 'text-red-600 font-medium' : ''}`}>
                      {o.delivery_due ? formatDate(o.delivery_due) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
