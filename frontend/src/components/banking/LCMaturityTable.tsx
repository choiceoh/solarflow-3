import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatUSD, formatDate } from '@/lib/utils';
import LCFeeDetail from './LCFeeDetail';
import { useLCFeeCalc } from '@/hooks/useBanking';
import type { LCMaturityAlert } from '@/types/banking';

interface Props {
  alertData: LCMaturityAlert;
}

function DDayBadge({ days }: { days: number }) {
  // <0: 만기 경과 (negative), <=7: 임박 (negative), <=14: 주의 (warn), 그 외 (info)
  const tone = days < 0 || days <= 7 ? 'neg' : days <= 14 ? 'warn' : 'info';
  const label = days < 0 ? `D+${Math.abs(days)}` : `D-${days}`;
  return <span className={`sf-pill ${tone}`}>{label}</span>;
}

export default function LCMaturityTable({ alertData }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: feeData, loading: feeLoading, calc: calcFee } = useLCFeeCalc();

  const alerts = alertData.alerts || [];

  if (alerts.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">30일 이내 만기 LC가 없습니다</p>;
  }

  const handleExpand = (lcId: string) => {
    if (expandedId === lcId) {
      setExpandedId(null);
    } else {
      setExpandedId(lcId);
      calcFee(lcId);
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>D-Day</TableHead>
          <TableHead>만기일</TableHead>
          <TableHead>LC번호</TableHead>
          <TableHead>은행</TableHead>
          <TableHead className="text-right">금액 (USD)</TableHead>
          <TableHead>PO번호</TableHead>
          <TableHead>상태</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((a) => (
          <>
            <TableRow
              key={a.lc_id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => handleExpand(a.lc_id)}
            >
              <TableCell className="px-2">
                {expandedId === a.lc_id
                  ? <ChevronDown className="h-3.5 w-3.5" />
                  : <ChevronRight className="h-3.5 w-3.5" />}
              </TableCell>
              <TableCell><DDayBadge days={a.days_remaining} /></TableCell>
              <TableCell className="text-sm">{formatDate(a.maturity_date)}</TableCell>
              <TableCell className="text-sm font-medium">{a.lc_number || a.lc_id.slice(0, 8)}</TableCell>
              <TableCell className="text-sm">{a.bank_name}</TableCell>
              <TableCell className="text-sm text-right">{formatUSD(a.amount_usd)}</TableCell>
              <TableCell className="text-sm">{a.po_number || '—'}</TableCell>
              <TableCell className="text-sm">{a.status}</TableCell>
            </TableRow>
            {expandedId === a.lc_id && (
              <TableRow key={`${a.lc_id}-fee`}>
                <TableCell colSpan={8} className="p-2">
                  {feeLoading
                    ? <p className="text-xs text-muted-foreground">수수료 계산 중...</p>
                    : feeData
                    ? <LCFeeDetail fee={feeData} />
                    : <p className="text-xs text-muted-foreground">수수료 정보를 불러올 수 없습니다</p>}
                </TableCell>
              </TableRow>
            )}
          </>
        ))}
      </TableBody>
    </Table>
  );
}
