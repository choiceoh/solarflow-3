import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatUSD } from '@/lib/utils';
import type { LCDemandMonthly } from '@/types/banking';

interface Props {
  items: LCDemandMonthly[];
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'shortage') {
    return <Badge className="bg-red-100 text-red-700 border-red-300">부족</Badge>;
  }
  if (status === 'caution') {
    return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300">주의</Badge>;
  }
  return <Badge className="bg-green-100 text-green-700 border-green-300">충분</Badge>;
}

export default function LCDemandMonthlyTable({ items }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">월별 예측 데이터가 없습니다</p>;
  }

  // 부족한 월 경고 메시지
  const shortageMonths = items.filter((m) => m.status === 'shortage');
  const totals = items.reduce(
    (acc, m) => ({
      demand: acc.demand + m.lc_demand_usd,
      recovery: acc.recovery + m.limit_recovery_usd,
      shortage: acc.shortage + m.shortage_usd,
    }),
    { demand: 0, recovery: 0, shortage: 0 },
  );
  const lastProjected = items.at(-1)?.projected_available_usd ?? 0;

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>월</TableHead>
            <TableHead className="text-right">LC 수요</TableHead>
            <TableHead className="text-right">한도 복원</TableHead>
            <TableHead className="text-right">가용한도 (예상)</TableHead>
            <TableHead className="text-right">과부족</TableHead>
            <TableHead>상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((m) => {
            const shortageColor = m.shortage_usd < 0 ? 'text-red-600 font-medium' : m.status === 'caution' ? 'text-yellow-600' : 'text-green-600';
            return (
              <TableRow key={m.month}>
                <TableCell className="text-sm font-medium">{m.month}</TableCell>
                <TableCell className="text-sm text-right">{formatUSD(m.lc_demand_usd)}</TableCell>
                <TableCell className="text-sm text-right">{formatUSD(m.limit_recovery_usd)}</TableCell>
                <TableCell className="text-sm text-right">{formatUSD(m.projected_available_usd)}</TableCell>
                <TableCell className={`text-sm text-right ${shortageColor}`}>
                  {m.shortage_usd >= 0 ? '+' : ''}{formatUSD(m.shortage_usd)}
                </TableCell>
                <TableCell><StatusBadge status={m.status} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-medium">합계</TableCell>
            <TableCell className="text-right font-medium">{formatUSD(totals.demand)}</TableCell>
            <TableCell className="text-right font-medium">{formatUSD(totals.recovery)}</TableCell>
            <TableCell className="text-right font-medium">{formatUSD(lastProjected)}</TableCell>
            <TableCell className="text-right font-medium">
              {totals.shortage >= 0 ? '+' : ''}{formatUSD(totals.shortage)}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{items.length.toLocaleString('ko-KR')}개월</TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      {/* 부족 시 대응방안 안내 */}
      {shortageMonths.map((m) => (
        <Alert key={m.month} variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>{m.month}</strong> LC 수요 {formatUSD(m.lc_demand_usd)}, 가용한도 {formatUSD(m.projected_available_usd)} — {formatUSD(Math.abs(m.shortage_usd))} 부족.
            <br />대응: (1) 은행 한도 증액 (2) 선적 일정 조정 (3) T/T 비율 상향
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
