import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatKRW, formatNumber } from '@/lib/utils';

interface CustomerRow {
  customer_name: string;
  outstanding_amount: number;
  outstanding_count: number;
  max_days_overdue: number;
}

interface Props {
  customers: CustomerRow[];
}

export default function OutstandingByCustomer({ customers }: Props) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <CardTitle className="text-sm">미수금 거래처별</CardTitle>
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate('/orders')}>전체 보기</Button>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {customers.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">미수금이 없습니다</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>거래처</TableHead>
                <TableHead className="text-right">미수금액</TableHead>
                <TableHead className="text-right">건수</TableHead>
                <TableHead className="text-right">최장일수</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.customer_name}>
                  <TableCell className="text-xs font-medium">{c.customer_name}</TableCell>
                  <TableCell className="text-xs text-right">{formatKRW(c.outstanding_amount)}</TableCell>
                  <TableCell className="text-xs text-right">{formatNumber(c.outstanding_count)}</TableCell>
                  <TableCell className={`text-xs text-right ${c.max_days_overdue >= 60 ? 'text-red-600 font-medium' : ''}`}>
                    {c.max_days_overdue}일
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
