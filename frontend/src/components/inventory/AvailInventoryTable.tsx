import { useState, Fragment, useMemo, memo } from 'react';
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

const isFreeSpare = (a: InventoryAllocation) => a.notes?.startsWith('[무상스페어]') ?? false;
const isSale = (a: InventoryAllocation) => a.purpose === 'sale' || a.purpose === 'other';
const isConstruction = (a: InventoryAllocation) =>
  a.purpose === 'construction' ||
  a.purpose === 'construction_own' ||
  a.purpose === 'construction_epc';

function allocCountLabel(mainCount: number, spareCount: number): string {
  if (mainCount === 0 && spareCount > 0) return `무상 ${spareCount}건`;
  return spareCount > 0 ? `${mainCount}건 · 무상 ${spareCount}건` : `${mainCount}건`;
}

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
/* sf-pill 토큰을 따라가서 웜 팔레트와 조화 — 개별 tailwind 색 직접 쓰지 않음 */

const STATUS_PILL: Record<string, string> = {
  pending:   'warn',
  confirmed: 'pos',
  hold:      'info',
  cancelled: 'ghost',
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

  const mainAllocs  = allocs.filter((a) => !isFreeSpare(a));
  const spareAllocs = allocs.filter(isFreeSpare);
  const claimedIds  = new Set<string>();

  const groups = mainAllocs.map((main) => {
    const spares = spareAllocs.filter(
      (s) => !claimedIds.has(s.alloc_id) &&
        (s.group_id && main.group_id ? s.group_id === main.group_id : s.customer_name === main.customer_name),
    );
    spares.forEach((s) => claimedIds.add(s.alloc_id));
    return { main, spares };
  });
  const standalone = spareAllocs.filter((s) => !claimedIds.has(s.alloc_id));

  const ActionButtons = ({ a, isFreeSpare }: { a: InventoryAllocation; isFreeSpare: boolean }) => (
    <div className="flex items-center justify-center gap-1.5">
      {a.status === 'pending' && (
        <>
          {!isFreeSpare && (
            <button onClick={() => onConfirm(a)} className="inline-flex h-6 items-center gap-1 rounded border border-green-200 px-2 text-[11px] text-green-700 hover:bg-green-50">
              <CheckCircle2 className="h-3 w-3" />
              수주
            </button>
          )}
          {!isFreeSpare && (
            <button onClick={() => onHold(a.alloc_id)} className="inline-flex h-6 items-center gap-1 rounded border border-sky-200 px-2 text-[11px] text-sky-700 hover:bg-sky-50">
              <PauseCircle className="h-3 w-3" />
              보류
            </button>
          )}
        </>
      )}
      {a.status === 'hold' && (
        <button onClick={() => onResume(a.alloc_id)} className="inline-flex h-6 items-center gap-1 rounded border border-amber-200 px-2 text-[11px] text-amber-700 hover:bg-amber-50">
          <PlayCircle className="h-3 w-3" />
          재개
        </button>
      )}
      <button onClick={() => onDelete(a.alloc_id)} className="inline-flex h-6 items-center gap-1 rounded border border-red-200 px-2 text-[11px] text-red-600 hover:bg-red-50">
        <Trash2 className="h-3 w-3" />
        삭제
      </button>
    </div>
  );

  const SourceBadge = ({ a }: { a: InventoryAllocation }) => (
    <span className={`sf-pill ${a.source_type === 'incoming' ? 'info' : 'pos'}`}>
      {a.source_type === 'incoming' ? '미착품' : '현재고'}
    </span>
  );

  return (
    <table className={`w-full ${colorClass}`}>
      <thead>
        <tr className="border-b bg-muted/20">
          <th className="text-left">거래처 / 현장</th>
          <th className="text-right">수량</th>
          <th className="text-center">재고구분</th>
          <th className="text-center">상태</th>
          <th className="text-center">작업</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(({ main, spares }) => {
          const spareQty = spares.reduce((sum, spare) => sum + spare.quantity, 0);
          const spareKw = spares.reduce((sum, spare) => sum + (spare.capacity_kw ?? 0), 0);

          return (
            <tr key={main.alloc_id} className="border-t hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => onEdit(main)}>
              <td>
                <div className="font-medium leading-tight">{main.customer_name ?? main.site_name ?? '—'}</div>
                {main.customer_name && main.site_name && (
                  <div className="text-[11px] text-muted-foreground">{main.site_name}</div>
                )}
                {spareQty > 0 && (
                  <span className="sf-pill warn mt-1">무상 포함</span>
                )}
              </td>
              <td className="text-right whitespace-nowrap tabular-nums">
                <div className="font-medium">{main.quantity.toLocaleString('ko-KR')} EA</div>
                {main.capacity_kw != null && main.capacity_kw > 0 && (
                  <div className="text-[11px] text-muted-foreground">{fmtKw(main.capacity_kw)}</div>
                )}
                {spareQty > 0 && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    + 무상 {spareQty.toLocaleString('ko-KR')} EA
                    {spareKw > 0 ? ` · ${fmtKw(spareKw)}` : ''}
                  </div>
                )}
              </td>
              <td className="text-center" onClick={(e) => e.stopPropagation()}><SourceBadge a={main} /></td>
              <td className="text-center">
                <span className={`sf-pill ${STATUS_PILL[main.status] ?? 'ghost'}`}>
                  {STATUS_LABEL[main.status] ?? main.status}
                </span>
              </td>
              <td className="text-center" onClick={(e) => e.stopPropagation()}>
                <ActionButtons a={main} isFreeSpare={false} />
              </td>
            </tr>
          );
        })}
        {/* 단독 무상스페어 (매칭된 메인 행 없음) */}
        {standalone.map((a) => (
          <tr key={a.alloc_id} className="border-t bg-amber-50/30 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => onEdit(a)}>
            <td>
              <div className="font-medium leading-tight">{a.customer_name ?? a.site_name ?? '—'}</div>
              <span className="sf-pill warn mt-1">무상스페어</span>
            </td>
            <td className="text-right whitespace-nowrap tabular-nums">
              <div className="font-medium">{a.quantity.toLocaleString('ko-KR')} EA</div>
              {a.capacity_kw != null && a.capacity_kw > 0 && (
                <div className="text-[11px] text-muted-foreground">{fmtKw(a.capacity_kw)}</div>
              )}
            </td>
            <td className="text-center" onClick={(e) => e.stopPropagation()}><SourceBadge a={a} /></td>
            <td className="text-center">
              <span className={`sf-pill ${STATUS_PILL[a.status] ?? 'ghost'}`}>
                {STATUS_LABEL[a.status] ?? a.status}
              </span>
            </td>
            <td className="text-center" onClick={(e) => e.stopPropagation()}>
              <ActionButtons a={a} isFreeSpare={true} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── 메인 컴포넌트 ─────────────────────────────── */

function AvailInventoryTable({
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

  const allocAggMap = useMemo(() => {
    const map = new Map<string, { saleKw: number; constKw: number }>();
    for (const it of items) {
      const itemAllocs = allocations.filter((a) =>
        a.product_id === it.product_id &&
        (!it.company_id || a.company_id === it.company_id)
      );
      const saleKw = itemAllocs.filter(isSale).reduce((s, a) => s + (a.capacity_kw ?? 0), 0);
      const constKw = itemAllocs.filter(isConstruction).reduce((s, a) => s + (a.capacity_kw ?? 0), 0);
      map.set(`${it.company_id ?? 'single'}:${it.product_id}`, { saleKw, constKw });
    }
    return map;
  }, [items, allocations]);

  const { sorted, headerProps } = useSort<InventoryItem>(items, (it, f) => {
    const key = `${it.company_id ?? 'single'}:${it.product_id}`;
    const a = allocAggMap.get(key);
    switch (f) {
      case 'manufacturer': return it.manufacturer_name ?? '';
      case 'physical_kw': return it.physical_kw ?? 0;
      case 'incoming_kw': return it.incoming_kw ?? 0;
      case 'total_secured_kw': return it.total_secured_kw ?? 0;
      case 'sale_kw': return a?.saleKw ?? 0;
      case 'const_kw': return a?.constKw ?? 0;
      default: return null;
    }
  });

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

  const totals = sorted.reduce((acc, item) => {
    const key = `${item.company_id ?? 'single'}:${item.product_id}`;
    const a = allocAggMap.get(key);
    return {
      totalSecured: acc.totalSecured + (item.total_secured_kw || 0),
      sale: acc.sale + (a?.saleKw ?? 0),
      construction: acc.construction + (a?.constKw ?? 0),
      physical: acc.physical + (item.physical_kw || 0),
      incoming: acc.incoming + (item.incoming_kw || 0),
    };
  }, { totalSecured: 0, sale: 0, construction: 0, physical: 0, incoming: 0 });

  return (
    <div className="rounded-md border overflow-hidden sf-avail-table">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="w-10" />
            <SortableTH {...headerProps('manufacturer')} className="font-medium">품목</SortableTH>
            <SortableTH {...headerProps('total_secured_kw')} align="right" className="font-medium">
              <span className="inline-flex items-center gap-1.5">
                <span className="sf-dot" style={{ background: 'var(--sf-pos)' }} />
                가용재고
              </span>
            </SortableTH>
            <SortableTH {...headerProps('sale_kw')} align="right" className="font-medium">판매배정</SortableTH>
            <SortableTH {...headerProps('const_kw')} align="right" className="font-medium">공사배정</SortableTH>
            <SortableTH {...headerProps('physical_kw')} align="right" className="font-medium">실재고</SortableTH>
            <SortableTH {...headerProps('incoming_kw')} align="right" className="font-medium">미착품</SortableTH>
            <th className="text-center">작업</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const itemKey = `${item.company_id ?? 'single'}:${item.product_id}`;
            const isOpen = expandedIds.has(itemKey);
            const itemAllocs = allocations.filter((a) =>
              a.product_id === item.product_id &&
              (!item.company_id || a.company_id === item.company_id)
            );
            const saleAllocs = itemAllocs.filter(isSale);
            const constAllocs = itemAllocs.filter(isConstruction);
            const mainAllocs = itemAllocs.filter((a) => !isFreeSpare(a));
            const spareAllocs = itemAllocs.filter(isFreeSpare);
            const saleMainCount = saleAllocs.filter((a) => !isFreeSpare(a)).length;
            const saleSpareCount = saleAllocs.filter(isFreeSpare).length;
            const constMainCount = constAllocs.filter((a) => !isFreeSpare(a)).length;
            const constSpareCount = constAllocs.filter(isFreeSpare).length;

            const saleKw = saleAllocs.reduce((s, a) => s + (a.capacity_kw ?? 0), 0);
            const constKw = constAllocs.reduce((s, a) => s + (a.capacity_kw ?? 0), 0);

            return (
              <Fragment key={itemKey}>
                {/* 품목 행 */}
                <tr
                  key={itemKey}
                  className="border-t hover:bg-muted/20 cursor-pointer transition-colors"
                  onClick={() => toggle(itemKey)}
                >
                  {/* 토글 */}
                  <td className="text-center text-muted-foreground">
                    {isOpen
                      ? <ChevronDown className="h-3.5 w-3.5 mx-auto" />
                      : <ChevronRight className="h-3.5 w-3.5 mx-auto" />
                    }
                  </td>

                  {/* 품목 — 이름 + 회사칩 + 코드 + 배정 인라인 */}
                  <td>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">
                        {moduleLabel(item.manufacturer_name, item.spec_wp)}
                      </span>
                      {item.company_name && (
                        <span className="sf-pill ghost">{item.company_name}</span>
                      )}
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {item.product_code}
                      </span>
                      {mainAllocs.length + spareAllocs.length > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          배정 {allocCountLabel(mainAllocs.length, spareAllocs.length)}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 가용재고 — 컬러만 강조, 폰트는 다른 컬럼과 동일 */}
                  <td className="text-right tabular-nums">
                    <span
                      className="font-semibold"
                      style={{
                        color: item.total_secured_kw > 0 ? 'var(--sf-pos)' : 'var(--sf-ink-4)',
                      }}
                    >
                      {fmtKw(item.total_secured_kw)}
                    </span>
                  </td>

                  {/* 판매배정 */}
                  <td className="text-right tabular-nums">
                    {saleAllocs.length > 0 ? (
                      <span className="font-semibold">{fmtKw(saleKw)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* 공사배정 */}
                  <td className="text-right tabular-nums">
                    {constAllocs.length > 0 ? (
                      <span className="font-semibold">{fmtKw(constKw)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* 실재고 */}
                  <td className="text-right tabular-nums font-semibold">{fmtKw(item.physical_kw)}</td>

                  {/* 미착품 */}
                  <td className="text-right tabular-nums font-semibold">{fmtKw(item.incoming_kw)}</td>

                  {/* 작업 */}
                  <td className="text-center" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs px-2"
                      onClick={() => onNewAlloc(item.product_id)}
                    >
                      <Plus className="h-3 w-3 mr-0.5" />예약
                    </Button>
                  </td>
                </tr>

                {/* 펼침 행 */}
                {isOpen && (
                  <tr key={`${itemKey}-expand`} className="border-t bg-muted/5">
                    <td colSpan={8} className="px-8 py-3">
                      <div className="space-y-3">
                        {/* 모듈 장수 (EA) — 펼침 시에만 표시 */}
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
                          <span>실재고 <span className="font-mono tabular-nums text-foreground">{kwToEa(item.physical_kw, item.spec_wp).toLocaleString('ko-KR')} EA</span></span>
                          <span>미착품 <span className="font-mono tabular-nums text-foreground">{kwToEa(item.incoming_kw, item.spec_wp).toLocaleString('ko-KR')} EA</span></span>
                          <span>가용재고 <span className="font-mono tabular-nums" style={{ color: 'var(--sf-pos)' }}>{kwToEa(item.total_secured_kw, item.spec_wp).toLocaleString('ko-KR')} EA</span></span>
                        </div>

                        {itemAllocs.length === 0 && (
                          <p className="text-xs text-muted-foreground px-2 py-1">등록된 예약 내역이 없습니다.</p>
                        )}

                        {saleAllocs.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="sf-pill warn">
                                판매 예약 {allocCountLabel(saleMainCount, saleSpareCount)}
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
                        )}

                        {constAllocs.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="sf-pill ink">
                                공사 예약 {allocCountLabel(constMainCount, constSpareCount)}
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
                        )}

                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/20">
            <td />
            <td>
              <span className="whitespace-nowrap font-medium">
                합계 · {sorted.length.toLocaleString('ko-KR')}건
              </span>
            </td>
            <td className="text-right tabular-nums font-medium" style={{ color: 'var(--sf-pos)' }}>{fmtKw(totals.totalSecured)}</td>
            <td className="text-right tabular-nums font-medium">{fmtKw(totals.sale)}</td>
            <td className="text-right tabular-nums font-medium">{fmtKw(totals.construction)}</td>
            <td className="text-right tabular-nums font-medium">{fmtKw(totals.physical)}</td>
            <td className="text-right tabular-nums font-medium">{fmtKw(totals.incoming)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default memo(AvailInventoryTable);
