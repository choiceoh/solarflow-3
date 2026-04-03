import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatUSD, formatPercent } from '@/lib/utils';
import type { BankSummary } from '@/types/banking';

interface Props {
  bankSummaries: BankSummary[];
}

export default function BankLimitTable({ bankSummaries }: Props) {
  if (bankSummaries.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">은행 한도 정보가 없습니다</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>은행</TableHead>
          <TableHead className="text-right">한도 (USD)</TableHead>
          <TableHead className="text-right">개설잔액</TableHead>
          <TableHead className="text-right">가용한도</TableHead>
          <TableHead className="text-right">사용률</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bankSummaries.map((b) => {
          const rateColor = b.usage_rate >= 90 ? 'text-red-600' : b.usage_rate >= 70 ? 'text-yellow-600' : 'text-green-600';
          return (
            <TableRow key={b.bank_name}>
              <TableCell className="font-medium text-sm">{b.bank_name}</TableCell>
              <TableCell className="text-right text-sm">{formatUSD(b.limit)}</TableCell>
              <TableCell className="text-right text-sm">{formatUSD(b.used)}</TableCell>
              <TableCell className="text-right text-sm">{formatUSD(b.available)}</TableCell>
              <TableCell className={`text-right text-sm font-medium ${rateColor}`}>
                {formatPercent(b.usage_rate)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
