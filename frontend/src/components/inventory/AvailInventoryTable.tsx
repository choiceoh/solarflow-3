import { useState } from 'react';
import { ChevronRight, ChevronDown, Plus, CheckCircle2, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/common/EmptyState';
import { moduleLabel } from '@/lib/utils';
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

const isSale = (a: InventoryAllocation) => a.purpose === 'sale' || a.purpose === 'other';
const isConstruction = (a: InventoryAllocation) =>
  a.purpose === 'construction' ||
  a.purpose === 'construction_own' ||
  a.purpose === 'construction_epc';

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
  colorClass,
  onEdit,
  onConfirm,
  onHold,
  onResume,
  onDelete,
}: {
  allocs: InventoryAllocation[];
  colorClass: string;
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
    <table className={`w-full text-xs ${colorClass}`}>
      <thead>
        <tr className="border-b bg-muted/20">
          <th className="text-left p-2 font-medium text-muted-foreground">거래처 / 현장</th>
          <th className="text-right p-2 font-medium text-muted-foreground">수량</th>
          <th className="text-center p-2 font-medium text-muted-foreground">재원</th>
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

              {/* 재원 */}
              <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    a.source_type === 'incoming'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {a.source_type === 'incoming' ? '미착품' : '현재고'}
                </span>
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

export default function AvailInventoryTable({
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

  if (items.length === 0) {
    return <EmptyState message="품목 재고 데이터가 없습니다" />;
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th className="w-8 p-2" />
            <th className="text-left p-2 font-medium text-muted-foreground">품목</th>
            <th className="text-right p-2 font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
                실재고
              </span>
            </th>
            <th className="text-right p-2 font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-yellow-500 inline-block" />
                미착품
              </span>
            </th>
            <th className="text-right p-2 font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                가용재고
              </span>
            </th>
            <th className="text-right p-2 font-medium text-muted-foreground">판매배정</th>
            <th className="text-right p-2 font-medium text-muted-foreground">공사배정</th>
            <th className="text-center p-2 font-medium text-muted-foreground">작업</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isOpen = expandedIds.has(item.product_id);
            const itemAllocs = allocations.filter((a) => a.product_id === item.product_id);
            const saleAllocs = itemAllocs.filter(isSale);
            const constAllocs = itemAllocs.filter(isConstruction);

            const saleKw = saleAllocs.reduce((s, a) => s + (a.capacity_kw ?? 0), 0);
            const constKw = constAllocs.reduce((s, a) => s + (a.capacity_kw ?? 0), 0);

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
                      {itemAllocs.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          배정 {itemAllocs.length}건
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 실재고 */}
                  <td className="p-2 text-right tabular-nums">
                    <div className="font-semibold text-blue-600">{fmtKw(item.physical_kw)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {kwToEa(item.physical_kw, item.spec_wp).toLocaleString('ko-KR')} EA
                    </div>
                  </td>

                  {/* 미착품 */}
                  <td className="p-2 text-right tabular-nums">
                    <div className="font-semibold text-yellow-600">{fmtKw(item.incoming_kw)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {kwToEa(item.incoming_kw, item.spec_wp).toLocaleString('ko-KR')} EA
                    </div>
                  </td>

                  {/* 가용재고 */}
                  <td className="p-2 text-right tabular-nums">
                    <div className={`font-semibold ${item.total_secured_kw > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {fmtKw(item.total_secured_kw)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {kwToEa(item.total_secured_kw, item.spec_wp).toLocaleString('ko-KR')} EA
                    </div>
                  </td>

                  {/* 판매배정 */}
                  <td className="p-2 text-right tabular-nums">
                    {saleAllocs.length > 0 ? (
                      <>
                        <div className="font-semibold text-orange-600">{fmtKw(saleKw)}</div>
                        <div className="text-[10px] text-muted-foreground">{saleAllocs.length}건</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* 공사배정 */}
                  <td className="p-2 text-right tabular-nums">
                    {constAllocs.length > 0 ? (
                      <>
                        <div className="font-semibold text-purple-600">{fmtKw(constKw)}</div>
                        <div className="text-[10px] text-muted-foreground">{constAllocs.length}건</div>
                      </>
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
                    <td colSpan={8} className="px-8 py-3">
                      <div className="space-y-4">

                        {/* 판매 예정 섹션 */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-orange-50 text-orange-700">
                              판매 예정 ({saleAllocs.length}건)
                            </span>
                          </div>
                          <AllocSubTable
                            allocs={saleAllocs}
                            colorClass=""
                            onEdit={onEdit}
                            onConfirm={onConfirm}
                            onHold={onHold}
                            onResume={onResume}
                            onDelete={onDelete}
                          />
                        </div>

                        {/* 공사 내역 섹션 */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-700">
                              공사 내역 ({constAllocs.length}건)
                            </span>
                          </div>
                          <AllocSubTable
                            allocs={constAllocs}
                            colorClass=""
                            onEdit={onEdit}
                            onConfirm={onConfirm}
                            onHold={onHold}
                            onResume={onResume}
                            onDelete={onDelete}
                          />
                        </div>

                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
