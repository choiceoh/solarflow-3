import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { fetchWithAuth } from '@/lib/api';
import { formatDate, formatKw, formatNumber } from '@/lib/utils';
import type { BLLineItem } from '@/types/inbound';
import { OUTBOUND_STATUS_LABEL, USAGE_CATEGORY_LABEL, type Outbound } from '@/types/outbound';

interface Props {
  blId: string;
  companyId: string;
  lines: BLLineItem[];
}

function lineName(line: BLLineItem) {
  return line.product_name || line.products?.product_name || line.product_code || line.products?.product_code || line.product_id.slice(0, 8);
}

function lineCode(line: BLLineItem) {
  return line.product_code || line.products?.product_code || '';
}

function allocatedQuantity(outbound: Outbound, blId: string) {
  return (outbound.bl_items ?? [])
    .filter((item) => item.bl_id === blId)
    .reduce((sum, item) => sum + item.quantity, 0);
}

export default function BLOutboundTrackingTab({ blId, companyId, lines }: Props) {
  const [outbounds, setOutbounds] = useState<Outbound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- companyId/blId 변경 시 외부 API에서 데이터 fetch (loading 상태 동기화)
    setLoading(true);
    setError('');
    fetchWithAuth<Outbound[]>(`/api/v1/outbounds?company_id=${companyId}`)
      .then((list) => {
        if (cancelled) return;
        setOutbounds(list.filter((outbound) => allocatedQuantity(outbound, blId) > 0));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '출고추적 데이터를 불러오지 못했습니다');
        setOutbounds([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [blId, companyId]);

  const activeOutbounds = useMemo(
    () => outbounds.filter((outbound) => outbound.status !== 'cancelled'),
    [outbounds],
  );

  const totalInboundQty = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines],
  );
  const totalOutboundQty = useMemo(
    () => activeOutbounds.reduce((sum, outbound) => sum + allocatedQuantity(outbound, blId), 0),
    [activeOutbounds, blId],
  );

  const productRows = useMemo(() => {
    return lines.map((line) => {
      const shippedQty = activeOutbounds
        .filter((outbound) => outbound.product_id === line.product_id)
        .reduce((sum, outbound) => sum + allocatedQuantity(outbound, blId), 0);
      return {
        key: line.bl_line_id,
        name: lineName(line),
        code: lineCode(line),
        inboundQty: line.quantity,
        inboundKw: line.capacity_kw ?? 0,
        shippedQty,
        remainingQty: Math.max(line.quantity - shippedQty, 0),
      };
    });
  }, [activeOutbounds, blId, lines]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">B/L 출고추적</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-md border p-3">
              <p className="text-[10px] text-muted-foreground">입고수량</p>
              <p className="font-semibold">{formatNumber(totalInboundQty)} EA</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-[10px] text-muted-foreground">출고수량</p>
              <p className="font-semibold">{formatNumber(totalOutboundQty)} EA</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-[10px] text-muted-foreground">잔량</p>
              <p className="font-semibold">{formatNumber(Math.max(totalInboundQty - totalOutboundQty, 0))} EA</p>
            </div>
          </div>

          {error && <p className="text-[11px] text-destructive">{error}</p>}

          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">품목</th>
                  <th className="px-3 py-2 text-right">입고</th>
                  <th className="px-3 py-2 text-right">출고</th>
                  <th className="px-3 py-2 text-right">잔량</th>
                  <th className="px-3 py-2 text-right">입고용량</th>
                </tr>
              </thead>
              <tbody>
                {productRows.map((row) => (
                  <tr key={row.key} className="border-t">
                    <td className="px-3 py-2">
                      <p className="font-medium">{row.name}</p>
                      {row.code && <p className="text-[10px] text-muted-foreground">{row.code}</p>}
                    </td>
                    <td className="px-3 py-2 text-right">{formatNumber(row.inboundQty)} EA</td>
                    <td className="px-3 py-2 text-right">{formatNumber(row.shippedQty)} EA</td>
                    <td className="px-3 py-2 text-right font-medium">{formatNumber(row.remainingQty)} EA</td>
                    <td className="px-3 py-2 text-right">{formatKw(row.inboundKw)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">출고 내역</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {outbounds.length === 0 ? (
            <div className="rounded-md border py-8 text-center text-sm text-muted-foreground">연결된 출고가 없습니다</div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">출고일</th>
                    <th className="px-3 py-2 text-left">용도</th>
                    <th className="px-3 py-2 text-left">품목</th>
                    <th className="px-3 py-2 text-left">출고처</th>
                    <th className="px-3 py-2 text-right">B/L 출고수량</th>
                    <th className="px-3 py-2 text-right">용량</th>
                    <th className="px-3 py-2 text-center">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {outbounds.map((outbound) => {
                    const qty = allocatedQuantity(outbound, blId);
                    const capacityKw = outbound.spec_wp ? qty * outbound.spec_wp / 1000 : undefined;
                    const target = outbound.customer_name || outbound.site_name || outbound.target_company_name || '—';
                    return (
                      <tr key={outbound.outbound_id} className="border-t">
                        <td className="px-3 py-2">{formatDate(outbound.outbound_date)}</td>
                        <td className="px-3 py-2">{USAGE_CATEGORY_LABEL[outbound.usage_category] ?? outbound.usage_category}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium">{outbound.product_name ?? outbound.product_code}</p>
                          {outbound.product_code && <p className="text-[10px] text-muted-foreground">{outbound.product_code}</p>}
                        </td>
                        <td className="px-3 py-2">{target}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(qty)} EA</td>
                        <td className="px-3 py-2 text-right">{capacityKw != null ? formatKw(capacityKw) : '—'}</td>
                        <td className="px-3 py-2 text-center">{OUTBOUND_STATUS_LABEL[outbound.status] ?? outbound.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
