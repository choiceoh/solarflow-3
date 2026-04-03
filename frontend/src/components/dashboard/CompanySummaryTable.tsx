import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatUSD, formatKRW } from '@/lib/utils';
import type { CompanySummaryRow } from '@/types/dashboard';

interface Props {
  items: CompanySummaryRow[];
}

export default function CompanySummaryTable({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm">법인별 요약</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>법인</TableHead>
              <TableHead className="text-right">재고 (MW)</TableHead>
              <TableHead className="text-right">가용 (MW)</TableHead>
              <TableHead className="text-right">월매출</TableHead>
              <TableHead className="text-right">미수금</TableHead>
              <TableHead className="text-right">LC가용</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.company_id}>
                <TableCell className="text-sm font-medium">{r.company_name}</TableCell>
                <TableCell className="text-sm text-right">{r.physical_mw.toFixed(1)}</TableCell>
                <TableCell className="text-sm text-right">{r.available_mw.toFixed(1)}</TableCell>
                <TableCell className="text-sm text-right">{formatKRW(r.monthly_revenue_krw)}</TableCell>
                <TableCell className="text-sm text-right">{formatKRW(r.outstanding_krw)}</TableCell>
                <TableCell className="text-sm text-right">{formatUSD(r.lc_available_usd)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
