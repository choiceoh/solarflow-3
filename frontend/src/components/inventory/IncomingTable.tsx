import { useState, useMemo, memo } from 'react';
import { ChevronRight, ChevronDown, Plus, CheckCircle2, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/common/EmptyState';
import SortableTH from '@/components/common/SortableTH';
import { moduleLabel } from '@/lib/utils';
import { useSort } from '@/hooks/useSort';
import type { InventoryAllocation } from './AllocationForm';
import type { InventoryItem } from '@/types/inventory';

/* ─── 헬퍼 ─────────────────────────────────────── */

function fmtKw(kw: number): string {
  if (kw <= 0) return '0 kW';
  if (kw >= 1000) return (kw / 1000).toFixed(2) + ' MW';
  return Math.round(kw).toLocaleString('ko-KR') + ' kW';
}

const kwToEa = (kw: number, specWp: number): number =>
  specWp > 0 ? Math.round((kw * 1000) / specWp) : 0;

/* ─── Props ────────────────────────────────────── */

interface Props {
  items: InventoryItem[];
  allocations: InventoryAllocation[];
  onNewAlloc: (productId: string) => void;
  onEdit: (alloc: InventoryAllocation) => void;
  onConfirm: (alloc: InventoryAllocation) => void;
  onHold: (allocId: string) => void;
  onResume: (allocId: string) => void;
  onDelete: (allocId: string) => void;
}

/* ─── 상태 뱃지 ─────────────────────────────────── */

const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-800',
  confirmed: 'bg-green-100 text-green-800',
  hold:      'bg-sky-100 text-sky-700',
  cancelled: 'bg-gray-100 text-gray-500',
};
const STATUS_LABEL: Record<string, string> = {
  pending:   '예약중',
  confirmed: '확정됨',
  hold:      '보류',
  cancelled: '취소됨',
};

/* ─── 서브테이블 (펼침 행) ──────────────────────── */

function AllocSubTable({
  allocs,
  onEdit,
  onConfirm,
  onHold,
  onResume,
  onDelete,
}: {
  allocs: InventoryAllocation[];
  onEdit: (a: InventoryAllocation) => void;
  onConfirm: (a: InventoryAllocation) => void;
  onHold: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (allocs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-2 py-1">등록된 내역 없음</p>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b bg-muted/20">
          <th className="text-left p-2 font-medium text-muted-foreground">거래처 / 현장</th>
          <th className="text-right p-2 font-medium text-muted-foreground">수량</th>
          <th className="text-center p-2 font-medium text-muted-foreground">상태</th>
          <th className="text-center p-2 font-medium text-muted-foreground">작업</th>
        </tr>
      </thead>
      <tbody>
        {allocs.map((a) => {
          const isFreeSpare = a.notes?.startsWith('[무상스페어]') ?? false;
          return (
            <tr
              key={a.alloc_id}
              className={`border-t hover:bg-muted/30 cursor-pointer transition-colors ${isFreeSpare ? 'bg-orange-50/40' : ''}`}
              onClick={() => onEdit(a)}
            >
              {/* 거래처/현장 */}
              <td className="p-2">
                <div className="font-medium leading-tight">
                  {a.customer_name ?? a.site_name ?? '—'}
                </div>
                {a.customer_name && a.site_name && (
                  <div className="text-[10px] text-muted-foreground">{a.site_name}</div>
                )}
                {isFreeSpare && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-orange-100 text-orange-700">무상스페어</span>
                )}
              </td>

              {/* 수량 */}
              <td className="p-2 text-right font-mono whitespace-nowrap">
                <div>{a.quantity.toLocaleString('ko-KR')} EA</div>
                {a.capacity_kw != null && a.capacity_kw > 0 && (
                  <div className="text-[10px] text-muted-foreground">{fmtKw(a.capacity_kw)}</div>
                )}
              </td>

              {/* 상태 */}
              <td className="p-2 text-center">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLE[a.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {STATUS_LABEL[a.status] ?? a.status}
                </span>
              </td>

              {/* 작업 */}
              <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-center gap-1">
                  {a.status === 'pending' && (
                    <>
                      <button
                        onClick={() => onConfirm(a)}
                        title="수주 등록"
                        className="p-1 rounded hover:bg-green-100 text-green-600"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </button>
                      {!isFreeSpare && (
                        <button
                          onClick={() => onHold(a.alloc_id)}
                          title="보류"
                          className="p-1 rounded hover:bg-sky-100 text-sky-600"
                        >
                          <PauseCircle className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </>
                  )}
                  {a.status === 'hold' && (
                    <button
                      onClick={() => onResume(a.alloc_id)}
                      title="재개"
                      className="p-1 rounded hover:bg-amber-100 text-amber-600"
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(a.alloc_id)}
                    title="삭제"
                    className="p-1 rounded hover:bg-red-100 text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ─── 메인 컴포넌트 ─────────────────────────────── */

function IncomingTable({
  items,
  allocations,
  onNewAlloc,
  onEdit,
  onConfirm,
  onHold,
  onResume,
  onDelete,
}: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (productId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const incoming = useMemo(() => items.filter((i) => i.incoming_kw > 0), [items]);

  const allocCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of incoming) {
      map.set(it.product_id, allocations.filter(
        (a) => a.product_id === it.product_id && a.source_type === 'incoming'
      ).length);
    }
    return map;
  }, [incoming, allocations]);

  const { sorted, headerProps } = useSort<InventoryItem>(incoming, (it, f) => {
    switch (f) {
      case 'product_code': return it.product_code ?? '';
      case 'incoming_kw': return it.incoming_kw ?? 0;
      case 'incoming_reserved_kw': return it.incoming_reserved_kw ?? 0;
      case 'available_incoming_kw': return it.available_incoming_kw ?? 0;
      case 'alloc_count': return allocCountMap.get(it.product_id) ?? 0;
      default: return null;
    }
  });

  if (incoming.length === 0) {
    return <EmptyState message="미착품이 없습니다" />;
  }

  const totals = sorted.reduce(
    (acc, item) => ({
      incoming: acc.incoming + (item.incoming_kw || 0),
      reserved: acc.reserved + (item.incoming_reserved_kw || 0),
      available: acc.available + (item.available_incoming_kw || 0),
      allocCount: acc.allocCount + (allocCountMap.get(item.product_id) ?? 0),
    }),
    { incoming: 0, reserved: 0, available: 0, allocCount: 0 },
  );

  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th className="w-8 p-2" />
            <SortableTH {...headerProps('product_code')} className="p-2 font-medium text-muted-foreground">품목</SortableTH>
            <SortableTH {...headerProps('incoming_kw')} align="right" className="p-2 font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-yellow-500 inline-block" />
                미착품
              </span>
            </SortableTH>
            <SortableTH {...headerProps('incoming_reserved_kw')} align="right" className="p-2 font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-400 inline-block" />
                미착예약
              </span>
            </SortableTH>
            <SortableTH {...headerProps('available_incoming_kw')} align="right" className="p-2 font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                가용미착
              </span>
            </SortableTH>
            <SortableTH {...headerProps('alloc_count')} align="right" className="p-2 font-medium text-muted-foreground">배정</SortableTH>
            <th className="text-center p-2 font-medium text-muted-foreground">작업</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const isOpen = expandedIds.has(item.product_id);
            const itemAllocs = allocations.filter(
              (a) => a.product_id === item.product_id && a.source_type === 'incoming'
            );

            return (
              <>
                {/* 품목 행 */}
                <tr
                  key={item.product_id}
                  className="border-t hover:bg-muted/20 cursor-pointer transition-colors"
                  onClick={() => toggle(item.product_id)}
                >
                  {/* 토글 */}
                  <td className="p-2 text-center text-muted-foreground">
                    {isOpen
                      ? <ChevronDown className="h-3.5 w-3.5 mx-auto" />
                      : <ChevronRight className="h-3.5 w-3.5 mx-auto" />
                    }
                  </td>

                  {/* 품목 */}
                  <td className="p-2">
                    <div className="font-medium leading-tight">
                      {moduleLabel(item.manufacturer_name, item.spec_wp)}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {item.product_code}
                      </span>
                    </div>
                  </td>

                  {/* 미착품 */}
                  <td className="p-2 text-right tabular-nums">
                    <div className="font-semibold text-yellow-600">{fmtKw(item.incoming_kw)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {kwToEa(item.incoming_kw, item.spec_wp).toLocaleString('ko-KR')} EA
                    </div>
                  </td>

                  {/* 미착예약 */}
                  <td className="p-2 text-right tabular-nums">
                    {item.incoming_reserved_kw > 0 ? (
                      <>
                        <div className="font-semibold text-red-500">{fmtKw(item.incoming_reserved_kw)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {kwToEa(item.incoming_reserved_kw, item.spec_wp).toLocaleString('ko-KR')} EA
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* 가용미착 */}
                  <td className="p-2 text-right tabular-nums">
                    <div className={`font-semibold ${item.available_incoming_kw > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {fmtKw(item.available_incoming_kw)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {kwToEa(item.available_incoming_kw, item.spec_wp).toLocaleString('ko-KR')} EA
                    </div>
                  </td>

                  {/* 배정 */}
                  <td className="p-2 text-right tabular-nums">
                    {itemAllocs.length > 0 ? (
                      <span className="text-muted-foreground">{itemAllocs.length}건</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* 작업 */}
                  <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[11px] px-2"
                      onClick={() => onNewAlloc(item.product_id)}
                    >
                      <Plus className="h-3 w-3 mr-0.5" />예약
                    </Button>
                  </td>
                </tr>

                {/* 펼침 행 */}
                {isOpen && (
                  <tr key={`${item.product_id}-expand`} className="border-t bg-muted/5">
                    <td colSpan={7} className="px-8 py-3">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                            미착품 배정 ({itemAllocs.length}건)
                          </span>
                        </div>
                        <AllocSubTable
                          allocs={itemAllocs}
                          onEdit={onEdit}
                          onConfirm={onConfirm}
                          onHold={onHold}
                          onResume={onResume}
                          onDelete={onDelete}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/50">
            <td />
            <td className="p-2">
              <div className="font-semibold">합계</div>
              <div className="text-[10px] text-muted-foreground">{sorted.length.toLocaleString('ko-KR')}건</div>
            </td>
            <td className="p-2 text-right tabular-nums font-semibold text-yellow-600">{fmtKw(totals.incoming)}</td>
            <td className="p-2 text-right tabular-nums font-semibold text-red-500">{fmtKw(totals.reserved)}</td>
            <td className="p-2 text-right tabular-nums font-semibold text-green-600">{fmtKw(totals.available)}</td>
            <td className="p-2 text-right tabular-nums font-semibold">{totals.allocCount.toLocaleString('ko-KR')}건</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default memo(IncomingTable);
