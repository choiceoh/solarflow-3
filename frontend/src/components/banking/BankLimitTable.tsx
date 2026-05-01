import { useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatUSD, formatPercent, formatDate } from '@/lib/utils';
import type { BankLimitRow } from '@/types/banking';

interface Props {
  rows: BankLimitRow[];
}

function ExpiryCell({ date, now }: { date?: string; now: number }) {
  if (!date) return <span style={{ color: 'var(--sf-ink-4)' }}>—</span>;
  const daysLeft = Math.ceil((new Date(date).getTime() - now) / 86400000);
  if (daysLeft < 0) {
    return <span className="font-semibold" style={{ color: 'var(--sf-neg)' }}>{formatDate(date)} <span className="sf-pill neg ml-1">만료</span></span>;
  }
  if (daysLeft <= 30) {
    return <span className="font-semibold" style={{ color: 'var(--sf-warn)' }}>{formatDate(date)} <span className="sf-pill warn ml-1">D-{daysLeft}</span></span>;
  }
  if (daysLeft <= 90) {
    return <span style={{ color: 'var(--sf-warn)' }}>{formatDate(date)} <span className="sf-pill warn ml-1">D-{daysLeft}</span></span>;
  }
  return <span>{formatDate(date)}</span>;
}

export default function BankLimitTable({ rows }: Props) {
  // 렌더 중 Date.now() 호출은 react-hooks/purity 위반 → useState lazy init으로 1회만 캡처
  const [now] = useState(() => Date.now());

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">은행 한도 정보가 없습니다</p>;
  }

  const totalLimit = rows.reduce((s, r) => s + r.lc_limit_usd, 0);
  const totalUsed  = rows.reduce((s, r) => s + r.used, 0);
  const totalAvail = rows.reduce((s, r) => s + r.available, 0);

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>은행</TableHead>
            <TableHead>승인일</TableHead>
            <TableHead>승인기한</TableHead>
            <TableHead className="text-right">승인한도(USD)</TableHead>
            <TableHead className="text-right">실행금액(USD)</TableHead>
            <TableHead className="text-right">잔여한도(USD)</TableHead>
            <TableHead className="text-right">사용률</TableHead>
            <TableHead className="text-right">개설수수료율</TableHead>
            <TableHead className="text-right">인수수수료율</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const rateStyle = r.usage_rate >= 90
              ? { color: 'var(--sf-neg)', fontWeight: 700 }
              : r.usage_rate >= 70
              ? { color: 'var(--sf-warn)', fontWeight: 600 }
              : { color: 'var(--sf-pos)' };
            return (
              <TableRow key={r.bank_name}>
                <TableCell className="font-medium">{r.bank_name}</TableCell>
                <TableCell>{formatDate(r.limit_approve_date ?? '')}</TableCell>
                <TableCell><ExpiryCell date={r.limit_expiry_date} now={now} /></TableCell>
                <TableCell className="text-right font-mono">{formatUSD(r.lc_limit_usd)}</TableCell>
                <TableCell className="text-right font-mono">{formatUSD(r.used)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{formatUSD(r.available)}</TableCell>
                <TableCell className="text-right tabular-nums" style={rateStyle}>
                  {r.usage_rate > 0 ? `${r.usage_rate.toFixed(1)}%` : '—'}
                </TableCell>
                <TableCell className="text-right">
                  {r.opening_fee_rate != null ? formatPercent(r.opening_fee_rate) : '—'}
                  {r.fee_calc_method ? <span className="text-muted-foreground ml-1">({r.fee_calc_method})</span> : null}
                </TableCell>
                <TableCell className="text-right">
                  {r.acceptance_fee_rate != null ? formatPercent(r.acceptance_fee_rate) : '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {rows.length > 1 && (
          <tfoot>
            <TableRow className="bg-muted/40 font-semibold">
              <TableCell colSpan={3} className="font-semibold">합계</TableCell>
              <TableCell className="text-right font-mono">{formatUSD(totalLimit)}</TableCell>
              <TableCell className="text-right font-mono">{formatUSD(totalUsed)}</TableCell>
              <TableCell className="text-right font-mono">{formatUSD(totalAvail)}</TableCell>
              <TableCell className="text-right">
                {totalLimit > 0 ? `${((totalUsed / totalLimit) * 100).toFixed(1)}%` : '—'}
              </TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </tfoot>
        )}
      </Table>
    </div>
  );
}
