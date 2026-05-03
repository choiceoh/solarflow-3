import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatUSD, formatDate, shortMfgName } from '@/lib/utils';
import type { LCDemandByPO } from '@/types/banking';

interface Props {
  items: LCDemandByPO[];
}

function UrgencyBadge({ urgency, date }: { urgency: string; date?: string }) {
  if (urgency === 'immediate') {
    return <Badge className="bg-red-100 text-red-700 border-red-300">즉시</Badge>;
  }
  if (urgency === 'soon') {
    return <Badge className="bg-orange-100 text-orange-700 border-orange-300">{date ? formatDate(date) : '30일 이내'}</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">{date ? formatDate(date) : '—'}</Badge>;
}

export default function LCDemandByPOTable({ items }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">LC 개설 수요가 없습니다</p>;
  }

  const totals = items.reduce(
    (acc, d) => ({
      lcNeeded: acc.lcNeeded + d.lc_needed_usd,
      poTotal: acc.poTotal + d.po_total_usd,
      ttPaid: acc.ttPaid + d.tt_paid_usd,
      lcOpened: acc.lcOpened + d.lc_opened_usd,
    }),
    { lcNeeded: 0, poTotal: 0, ttPaid: 0, lcOpened: 0 },
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>PO번호</TableHead>
          <TableHead>개설필요시점</TableHead>
          <TableHead className="text-right">LC미개설</TableHead>
          <TableHead>제조사</TableHead>
          <TableHead className="text-right">PO총액 (USD)</TableHead>
          <TableHead className="text-right">TT입금</TableHead>
          <TableHead className="text-right">LC개설</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((d) => (
          <TableRow key={d.po_id}>
            <TableCell className="text-sm font-medium">{d.po_number || d.po_id.slice(0, 8)}</TableCell>
            <TableCell>
              <UrgencyBadge urgency={d.urgency} date={d.lc_due_date} />
            </TableCell>
            <TableCell className="text-sm text-right font-medium">
              {d.lc_needed_usd > 0 ? formatUSD(d.lc_needed_usd) : '—'}
            </TableCell>
            <TableCell className="text-sm">{shortMfgName(d.manufacturer_name)}</TableCell>
            <TableCell className="text-sm text-right">{formatUSD(d.po_total_usd)}</TableCell>
            <TableCell className="text-sm text-right">{formatUSD(d.tt_paid_usd)}</TableCell>
            <TableCell className="text-sm text-right">{formatUSD(d.lc_opened_usd)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-semibold">합계</TableCell>
          <TableCell className="text-xs text-muted-foreground">{items.length.toLocaleString('ko-KR')}건</TableCell>
          <TableCell className="text-right font-semibold">{totals.lcNeeded > 0 ? formatUSD(totals.lcNeeded) : '—'}</TableCell>
          <TableCell />
          <TableCell className="text-right font-semibold">{formatUSD(totals.poTotal)}</TableCell>
          <TableCell className="text-right font-semibold">{formatUSD(totals.ttPaid)}</TableCell>
          <TableCell className="text-right font-semibold">{formatUSD(totals.lcOpened)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
