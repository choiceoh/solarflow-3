import EmptyState from '@/components/common/EmptyState';
import SortableTH, { SortIcon } from '@/components/common/SortableTH';
import { moduleLabel } from '@/lib/utils';
import { useSort } from '@/hooks/useSort';
import type { InventoryItem } from '@/types/inventory';

const kwToEa = (kw: number, specWp: number) =>
  specWp > 0 ? Math.round((kw * 1000) / specWp) : 0;

/** kW → 자동 단위 (1,000kW 미만 = kW 표시, 이상 = MW) */
function fmw(kw: number): string {
  if (kw <= 0) return '0 kW';
  if (kw >= 1000) return (kw / 1000).toFixed(2) + ' MW';
  return Math.round(kw).toLocaleString('ko-KR') + ' kW';
}

function LongTermBadge({ status }: { status: string }) {
  if (status === 'warning') return <span className="sf-pill warn">장기 6M+</span>;
  if (status === 'critical') return <span className="sf-pill neg">초장기 12M+</span>;
  return null;
}

/** 재고 수치 셀: 메인값 + EA + 차감내역 + 소계 */
function MetricCell({
  kw, specWp, deductions, mainClassName,
}: {
  kw: number;
  specWp: number;
  deductions?: { label: string; kw: number }[];
  mainClassName?: string;
}) {
  const ea = kwToEa(kw, specWp);
  const activeDeductions = deductions?.filter((d) => d.kw > 0) ?? [];
  const netKw = kw - activeDeductions.reduce((s, d) => s + d.kw, 0);
  const hasDeductions = activeDeductions.length > 0;
  return (
    <td className="p-3 text-right align-top min-w-[130px]">
      <div className={`font-semibold tabular-nums ${mainClassName ?? ''}`}>{fmw(kw)}</div>
      <div className="text-[10px] text-muted-foreground tabular-nums">
        {ea.toLocaleString('ko-KR')} EA
      </div>
      {hasDeductions && (
        <div className="mt-1 space-y-0.5">
          {activeDeductions.map((d) => (
            <div key={d.label} className="text-[10px] text-muted-foreground">
              <span className="text-red-400">− {d.label}</span>{' '}
              <span className="tabular-nums">{fmw(d.kw)}</span>
            </div>
          ))}
          <div className="text-[10px] border-t border-border/60 pt-0.5 mt-0.5 font-medium tabular-nums text-foreground">
            소계 {fmw(netKw)}
          </div>
        </div>
      )}
    </td>
  );
}

/** compact=true: 제품정보 + 가용재고만 표시 (2열 레이아웃 좌측 패널용) */
export default function InventoryTable({ items, compact = false }: { items: InventoryItem[]; compact?: boolean }) {
  const { sorted, sortField, sortDirection, toggle, headerProps } = useSort<InventoryItem>(items, (it, f) => {
    switch (f) {
      case 'manufacturer': return it.manufacturer_name ?? '';
      case 'product_code': return it.product_code ?? '';
      case 'physical_kw': return it.physical_kw ?? 0;
      case 'incoming_kw': return it.incoming_kw ?? 0;
      case 'total_secured_kw': return it.total_secured_kw ?? 0;
      case 'long_term_status': return it.long_term_status;
      default: return null;
    }
  });

  if (items.length === 0) return <EmptyState message="등록된 재고 데이터가 없습니다" />;

  /* ── compact 모드: 제품 + 가용재고만 ── */
  if (compact) {
    const totals = items.reduce(
      (acc, it) => ({
        available:         acc.available         + (it.available_kw          || 0),
        availableIncoming: acc.availableIncoming + (it.available_incoming_kw || 0),
        totalSecured:      acc.totalSecured      + (it.total_secured_kw      || 0),
      }),
      { available: 0, availableIncoming: 0, totalSecured: 0 },
    );
    return (
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <SortableTH {...headerProps('manufacturer')} className="p-2 font-medium text-muted-foreground">제품</SortableTH>
              <th
                className="p-2 text-right font-medium cursor-pointer select-none hover:bg-muted/70 transition-colors"
                onClick={() => toggle('total_secured_kw')}
              >
                <div className="flex items-center justify-end gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                  가용재고
                  <SortIcon direction={sortField === 'total_secured_kw' ? sortDirection : null} />
                </div>
                <div className="text-[10px] text-muted-foreground font-normal">현재고+미착</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.product_id} className="border-t hover:bg-muted/20 transition-colors">
                <td className="p-2 align-middle">
                  <div className="font-semibold text-[11px]">{moduleLabel(item.manufacturer_name, item.spec_wp)}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{item.product_code}</div>
                </td>
                <td className="p-2 text-right align-middle">
                  <div className="font-bold tabular-nums text-green-600">{fmw(item.total_secured_kw)}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {kwToEa(item.total_secured_kw, item.spec_wp).toLocaleString('ko-KR')} EA
                  </div>
                  {item.available_incoming_kw > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      미착 <span className="tabular-nums">{fmw(item.available_incoming_kw)}</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {/* 합계 */}
            <tr className="border-t-2 bg-muted/50">
              <td className="p-2 text-right text-muted-foreground font-semibold text-[11px]">합계</td>
              <td className="p-2 text-right">
                <div className="font-bold tabular-nums text-green-600">{fmw(totals.totalSecured)}</div>
                <div className="text-[10px] text-muted-foreground">
                  현재고 <span className="tabular-nums">{fmw(totals.available)}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  미착 <span className="tabular-nums">{fmw(totals.availableIncoming)}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  /* ── 풀 모드 ── */
  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-xs">
        {/* ── 헤더 ── */}
        <thead>
          <tr className="bg-muted/50 border-b">
            <SortableTH {...headerProps('product_code')} className="p-3 font-medium text-muted-foreground w-[220px]">제품 정보</SortableTH>
            {/* 가용재고 */}
            <th
              className="p-3 text-right font-medium cursor-pointer select-none hover:bg-muted/70 transition-colors"
              onClick={() => toggle('total_secured_kw')}
            >
              <div className="flex items-center justify-end gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                가용재고
                <SortIcon direction={sortField === 'total_secured_kw' ? sortDirection : null} />
              </div>
              <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
                현재고 가용 + 미착 가용
              </div>
            </th>
            {/* 실재고 */}
            <th
              className="p-3 text-right font-medium cursor-pointer select-none hover:bg-muted/70 transition-colors"
              onClick={() => toggle('physical_kw')}
            >
              <div className="flex items-center justify-end gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-400 inline-block" />
                실재고
                <SortIcon direction={sortField === 'physical_kw' ? sortDirection : null} />
              </div>
              <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
                창고 보유 현재고
              </div>
            </th>
            {/* 미착품 */}
            <th
              className="p-3 text-right font-medium cursor-pointer select-none hover:bg-muted/70 transition-colors"
              onClick={() => toggle('incoming_kw')}
            >
              <div className="flex items-center justify-end gap-1.5">
                <span className="h-2 w-2 rounded-full bg-yellow-400 inline-block" />
                미착품
                <SortIcon direction={sortField === 'incoming_kw' ? sortDirection : null} />
              </div>
              <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
                L/C 개설 기준
              </div>
            </th>
            <SortableTH {...headerProps('long_term_status')} align="center" className="p-3 font-medium text-muted-foreground w-[80px]">장기</SortableTH>
          </tr>
        </thead>

        {/* ── 데이터 행 ── */}
        <tbody>
          {sorted.map((item) => (
            <tr key={item.product_id} className="border-t hover:bg-muted/20 transition-colors">
              {/* 제품 정보 */}
              <td className="p-3 align-top">
                <div className="font-semibold">{moduleLabel(item.manufacturer_name, item.spec_wp)}</div>
                <div className="font-mono text-[11px] text-muted-foreground mt-0.5 leading-tight">
                  {item.product_code}
                </div>
                {(item.module_width_mm && item.module_height_mm) && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {item.module_width_mm}×{item.module_height_mm}mm
                  </div>
                )}
              </td>

              {/* 가용재고 = available_kw + available_incoming_kw = total_secured_kw */}
              <td className="p-3 text-right align-top min-w-[130px]">
                <div className="font-bold tabular-nums text-green-600">
                  {fmw(item.total_secured_kw)}
                </div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  {kwToEa(item.total_secured_kw, item.spec_wp).toLocaleString('ko-KR')} EA
                </div>
                <div className="mt-1 space-y-0.5">
                  <div className="text-[10px] text-muted-foreground">
                    현재고{' '}
                    <span className="tabular-nums text-foreground">
                      {fmw(item.available_kw)}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    미착{' '}
                    <span className="tabular-nums text-foreground">
                      {fmw(item.available_incoming_kw)}
                    </span>
                  </div>
                </div>
              </td>

              {/* 실재고 */}
              <MetricCell
                kw={item.physical_kw}
                specWp={item.spec_wp}
                deductions={[
                  { label: '수주예약', kw: item.reserved_kw },
                  { label: '배정',    kw: item.allocated_kw },
                ]}
              />

              {/* 미착품 */}
              <MetricCell
                kw={item.incoming_kw}
                specWp={item.spec_wp}
                deductions={[
                  { label: '미착예약', kw: item.incoming_reserved_kw },
                ]}
              />

              {/* 장기재고 */}
              <td className="p-3 text-center align-top">
                <LongTermBadge status={item.long_term_status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
