import { useEffect, useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn, formatDate, formatNumber, formatUSD } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import { fetchWithAuth } from '@/lib/api';
import { PO_STATUS_LABEL, PO_STATUS_COLOR, CONTRACT_TYPE_LABEL, type PurchaseOrder, type POLineItem, type LCRecord, type TTRemittance } from '@/types/procurement';

interface Props {
  items: PurchaseOrder[];
  onSelect: (po: PurchaseOrder) => void;
  onNew: () => void;
}

interface Agg { totalUsd: number; ttUsd: number; lcUsd: number; lcRemainUsd: number; avgCentsPerWp: number; totalMw: number; firstLine?: { name: string; spec: string }; extraCount: number; }

export default function POListTable({ items, onSelect, onNew }: Props) {
  // 결제 컬럼 집계 — 프론트 계산 (TODO: Rust 계산엔진 연동)
  const [agg, setAgg] = useState<Record<string, Agg>>({});
  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) { setAgg({}); return; }
    (async () => {
      try {
        const result: Record<string, Agg> = {};
        await Promise.all(items.map(async (po) => {
          try {
            const [lines, lcs, tts] = await Promise.all([
              fetchWithAuth<POLineItem[]>(`/api/v1/pos/${po.po_id}/lines`).catch(() => [] as POLineItem[]),
              fetchWithAuth<LCRecord[]>(`/api/v1/lcs?po_id=${po.po_id}`).catch(() => [] as LCRecord[]),
              fetchWithAuth<TTRemittance[]>(`/api/v1/tts?po_id=${po.po_id}`).catch(() => [] as TTRemittance[]),
            ]);
            const totalUsd = (lines ?? []).reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
            const ttUsd = (tts ?? []).reduce((s, t) => s + (t.amount_usd ?? 0), 0);
            const lcUsd = (lcs ?? []).reduce((s, l) => s + (l.amount_usd ?? 0), 0);
            // 가중평균 단가(¢/Wp) = 총금액USD / 총Wp × 100
            const totalWp = (lines ?? []).reduce((s, l) => s + (l.quantity ?? 0) * (l.products?.spec_wp ?? l.spec_wp ?? 0), 0);
            const avgCentsPerWp = totalWp > 0 ? (totalUsd / totalWp) * 100 : 0;
            const totalMw = totalWp / 1_000_000;
            const first = (lines ?? [])[0];
            const firstLine = first ? {
              name: first.products?.product_name ?? first.product_name ?? '—',
              spec: first.products?.product_code ?? first.product_code ?? '—',
            } : undefined;
            result[po.po_id] = { totalUsd, ttUsd, lcUsd, lcRemainUsd: totalUsd - lcUsd, avgCentsPerWp, totalMw, firstLine, extraCount: Math.max(0, (lines?.length ?? 0) - 1) };
          } catch { /* skip */ }
        }));
        if (!cancelled) setAgg(result);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((p) => p.po_id).join(',')]);

  if (items.length === 0) return <EmptyState message="등록된 PO가 없습니다" actionLabel="새로 등록" onAction={onNew} />;

  return (
    <div className="rounded-md border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>PO번호</TableHead>
            <TableHead>제조사</TableHead>
            <TableHead>품명/규격</TableHead>
            <TableHead className="text-right">단가(¢/Wp)</TableHead>
            <TableHead className="text-right">용량(MW)</TableHead>
            <TableHead>계약유형</TableHead>
            <TableHead>계약일</TableHead>
            <TableHead>Incoterms</TableHead>
            <TableHead className="text-right">총수량</TableHead>
            <TableHead className="text-right">총금액(USD)</TableHead>
            <TableHead className="text-right">T/T납부(USD)</TableHead>
            <TableHead className="text-right">LC개설(USD)</TableHead>
            <TableHead className="text-right">미개설잔액(USD)</TableHead>
            <TableHead>상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((po) => {
            const a = agg[po.po_id];
            return (
            <TableRow key={po.po_id} className="cursor-pointer hover:bg-accent/50" onClick={() => onSelect(po)}>
              <TableCell className="font-mono">
                <div className="flex items-center gap-1.5">
                  {po.po_number || '—'}
                  {po.parent_po_id && (
                    <span className="rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[9px] font-medium whitespace-nowrap">
                      변경계약
                    </span>
                  )}
                </div>
                {po.parent_po_id && (() => {
                  const parentPo = items.find((x) => x.po_id === po.parent_po_id);
                  return parentPo ? (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      원계약: {parentPo.po_number ?? po.parent_po_id.slice(0, 8)}
                    </div>
                  ) : null;
                })()}
              </TableCell>
              <TableCell>{po.manufacturer_name ?? '—'}</TableCell>
              <TableCell className="text-xs">
                {a?.firstLine ? (
                  <>
                    <div className="truncate max-w-[200px]">{a.firstLine.name}</div>
                    <div className="text-muted-foreground truncate max-w-[200px]">{a.firstLine.spec}{a.extraCount > 0 ? ` 외 ${a.extraCount}건` : ''}</div>
                  </>
                ) : '—'}
              </TableCell>
              <TableCell className="text-right font-mono">{a && a.avgCentsPerWp > 0 ? a.avgCentsPerWp.toFixed(2) : '—'}</TableCell>
              <TableCell className="text-right font-mono">{a && a.totalMw > 0 ? a.totalMw.toFixed(2) : '—'}</TableCell>
              <TableCell>{CONTRACT_TYPE_LABEL[po.contract_type]}</TableCell>
              <TableCell>{formatDate(po.contract_date ?? '')}</TableCell>
              <TableCell>{po.incoterms ?? '—'}</TableCell>
              <TableCell className="text-right">{po.total_qty != null ? formatNumber(po.total_qty) : '—'}</TableCell>
              <TableCell className="text-right font-mono">{a ? formatUSD(a.totalUsd) : '—'}</TableCell>
              <TableCell className="text-right font-mono">{a ? formatUSD(a.ttUsd) : '—'}</TableCell>
              <TableCell className="text-right font-mono">{a ? formatUSD(a.lcUsd) : '—'}</TableCell>
              <TableCell className="text-right font-mono">{a ? formatUSD(a.lcRemainUsd) : '—'}</TableCell>
              <TableCell>
                <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium', PO_STATUS_COLOR[po.status])}>
                  {PO_STATUS_LABEL[po.status]}
                </span>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
