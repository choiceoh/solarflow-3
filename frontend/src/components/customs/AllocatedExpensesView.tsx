import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatKRW } from '@/lib/utils';
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs';

interface Props {
  allocatedExpenses: Record<string, number>;
}

// 비유: Landed Cost 계산 시 배분된 부대비용 내역을 보여주는 패널 (D-026)
export default function AllocatedExpensesView({ allocatedExpenses }: Props) {
  const entries = Object.entries(allocatedExpenses);

  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">배분된 부대비용이 없습니다</p>;
  }

  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs">배분된 부대비용 내역</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">비용유형</TableHead>
              <TableHead className="text-xs text-right">배분액</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(([key, value]) => (
              <TableRow key={key}>
                <TableCell className="text-xs">
                  {EXPENSE_TYPE_LABEL[key as ExpenseType] || key}
                </TableCell>
                <TableCell className="text-xs text-right">{formatKRW(value)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t bg-muted/20 font-medium">
              <TableCell className="text-xs">합계</TableCell>
              <TableCell className="text-xs text-right">{formatKRW(total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
