import { useOutboundFifoMatches } from '@/hooks/useOutbound';
import { DetailSection } from '@/components/common/detail';
import { formatDate, formatNumber } from '@/lib/utils';
import type { FifoMatch } from '@/types/fifo';

interface Props {
  outboundId: string;
}

// D-064 PR 29: 출고 한 건의 FIFO 매칭 (입고 LOT ↔ 출고 배분 + 원가/이익).
// 영업이 "이 출고 얼마 남겼나" 를 출고 상세에서 즉시 확인.
export default function OutboundFifoMatchesPanel({ outboundId }: Props) {
  const { data, loading } = useOutboundFifoMatches(outboundId);
  if (loading) return null;
  if (!data || data.matches.length === 0) return null;

  const { matches, summary } = data;

  return (
    <DetailSection
      title="원가 매칭 (FIFO)"
      badges={
        <>
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {summary.match_count}개 LOT
          </span>
          {summary.avg_profit_ratio > 0 && (
            <span className={`rounded px-2 py-0.5 text-xs ${
              summary.avg_profit_ratio >= 15 ? 'bg-green-100 text-green-700'
              : summary.avg_profit_ratio >= 5 ? 'bg-blue-100 text-blue-700'
              : summary.avg_profit_ratio > 0 ? 'bg-amber-100 text-amber-700'
              : 'bg-red-100 text-red-700'
            }`}>
              이익률 {summary.avg_profit_ratio.toFixed(1)}%
            </span>
          )}
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">입고일</th>
              <th className="px-2 py-1.5 text-left font-medium">입고번호 / LOT</th>
              <th className="px-2 py-1.5 text-left font-medium">공급사</th>
              <th className="px-2 py-1.5 text-right font-medium">배분수량</th>
              <th className="px-2 py-1.5 text-right font-medium">EA 원가</th>
              <th className="px-2 py-1.5 text-right font-medium">원가합계</th>
              <th className="px-2 py-1.5 text-right font-medium">매출합계</th>
              <th className="px-2 py-1.5 text-right font-medium">이익</th>
              <th className="px-2 py-1.5 text-right font-medium">이익률</th>
              <th className="px-2 py-1.5 text-left font-medium">면장 / B/L</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {matches.map((m) => renderRow(m))}
            <tr className="bg-muted/30 font-medium">
              <td className="px-2 py-1.5" colSpan={3}>합계</td>
              <td className="px-2 py-1.5 text-right">{formatNumber(summary.total_allocated_qty)} EA</td>
              <td className="px-2 py-1.5 text-right">—</td>
              <td className="px-2 py-1.5 text-right">{formatNumber(summary.total_cost_amount)}원</td>
              <td className="px-2 py-1.5 text-right">{formatNumber(summary.total_sales_amount)}원</td>
              <td className={`px-2 py-1.5 text-right ${summary.total_profit_amount >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatNumber(summary.total_profit_amount)}원
              </td>
              <td className={`px-2 py-1.5 text-right ${summary.avg_profit_ratio >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {summary.avg_profit_ratio.toFixed(1)}%
              </td>
              <td className="px-2 py-1.5"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </DetailSection>
  );
}

function renderRow(m: FifoMatch) {
  const profitClass = m.profit_amount != null
    ? m.profit_amount >= 0 ? 'text-green-700' : 'text-red-700'
    : 'text-muted-foreground';
  return (
    <tr key={m.match_id} className="hover:bg-muted/40">
      <td className="px-2 py-1.5">{m.inbound_date ? formatDate(m.inbound_date) : '—'}</td>
      <td className="px-2 py-1.5 font-mono">
        {m.erp_inbound_no ?? '—'}
        {m.erp_inbound_line_no != null ? <span className="text-muted-foreground"> / {m.erp_inbound_line_no}</span> : null}
      </td>
      <td className="px-2 py-1.5">{m.supplier_name ?? '—'}</td>
      <td className="px-2 py-1.5 text-right">{m.allocated_qty != null ? formatNumber(m.allocated_qty) : '—'}</td>
      <td className="px-2 py-1.5 text-right">{m.ea_unit_cost != null ? formatNumber(m.ea_unit_cost) : '—'}</td>
      <td className="px-2 py-1.5 text-right">{m.cost_amount != null ? formatNumber(m.cost_amount) : '—'}</td>
      <td className="px-2 py-1.5 text-right">{m.sales_amount != null ? formatNumber(m.sales_amount) : '—'}</td>
      <td className={`px-2 py-1.5 text-right ${profitClass}`}>
        {m.profit_amount != null ? formatNumber(m.profit_amount) : '—'}
      </td>
      <td className={`px-2 py-1.5 text-right ${profitClass}`}>
        {m.profit_ratio != null ? `${m.profit_ratio.toFixed(1)}%` : '—'}
      </td>
      <td className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
        {m.declaration_number ? <div>{m.declaration_number}</div> : null}
        {m.bl_number ? <div>{m.bl_number}</div> : null}
        {!m.declaration_number && !m.bl_number ? '—' : null}
      </td>
    </tr>
  );
}
