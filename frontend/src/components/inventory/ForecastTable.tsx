import { useState, memo } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatKw, formatWp } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import type { ProductForecast } from '@/types/inventory';

interface Props {
  products: ProductForecast[];
  onReserve?: (productId: string) => void;
}

function ForecastCell({ value, insufficient }: { value: number; insufficient?: boolean }) {
  return (
    <TableCell
      className="whitespace-nowrap text-right tabular-nums"
      style={insufficient ? { background: 'var(--sf-neg-bg)', color: 'var(--sf-neg)', fontWeight: 600 } : undefined}
    >
      {insufficient && <AlertTriangle className="mr-0.5 inline h-3 w-3" />}
      {formatKw(value)}
    </TableCell>
  );
}

function ProductForecastBlock({
  product,
  onReserve,
}: {
  product: ProductForecast;
  onReserve?: (productId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasUnscheduled = product.unscheduled.sale_kw > 0 || product.unscheduled.construction_kw > 0 || product.unscheduled.incoming_kw > 0;
  const currentAvailable = product.months[0]?.available_kw ?? 0;
  const minAvailable = product.months.reduce((min, month) => Math.min(min, month.available_kw), currentAvailable);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="truncate">
            {product.manufacturer_name} — {product.product_name} ({formatWp(product.spec_wp)}, {product.module_width_mm}x{product.module_height_mm}mm)
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right text-[11px] leading-tight">
            <div className="sf-mono font-semibold tabular-nums" style={{ color: 'var(--sf-pos)' }}>
              현재 가용 {formatKw(currentAvailable)}
            </div>
            <div
              className="sf-mono tabular-nums"
              style={{ color: minAvailable < 0 ? 'var(--sf-neg)' : 'var(--sf-ink-3)', fontWeight: minAvailable < 0 ? 600 : 400 }}
            >
              6개월 최저 {formatKw(minAvailable)}
            </div>
          </div>
          {onReserve && (
            <Button
              type="button"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => onReserve(product.product_id)}
            >
              <Plus className="mr-0.5 h-3 w-3" />
              예약
            </Button>
          )}
        </div>
      </div>

      {open && (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">월</TableHead>
                  <TableHead className="text-right whitespace-nowrap">기초</TableHead>
                  <TableHead className="text-right whitespace-nowrap">입고예정</TableHead>
                  <TableHead className="text-right whitespace-nowrap">출고(판매)</TableHead>
                  <TableHead className="text-right whitespace-nowrap">출고(공사)</TableHead>
                  <TableHead className="text-right whitespace-nowrap">기말</TableHead>
                  <TableHead className="text-right whitespace-nowrap">예약</TableHead>
                  <TableHead className="text-right whitespace-nowrap">배정</TableHead>
                  <TableHead className="text-right whitespace-nowrap">가용</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium whitespace-nowrap">{m.month}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatKw(m.opening_kw)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatKw(m.incoming_kw)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatKw(m.outgoing_sale_kw)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatKw(m.outgoing_construction_kw)}</TableCell>
                    <ForecastCell value={m.closing_kw} insufficient={m.insufficient} />
                    <TableCell className="text-right tabular-nums">{formatKw(m.reserved_kw)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatKw(m.allocated_kw)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums" style={{ color: 'var(--sf-pos)' }}>{formatKw(m.available_kw)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {hasUnscheduled && (
            <div
              className="rounded-md p-3"
              style={{ background: 'var(--sf-bg-2)', border: '1px dashed var(--sf-line-2)' }}
            >
              <div className="sf-eyebrow mb-2">미배정 물량 · 날짜 미정</div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                {product.unscheduled.incoming_kw > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <span className="sf-eyebrow" style={{ color: 'var(--sf-info)' }}>입고</span>
                    <span className="sf-mono font-semibold tabular-nums" style={{ color: 'var(--sf-ink)' }}>
                      {formatKw(product.unscheduled.incoming_kw)}
                    </span>
                  </div>
                )}
                {product.unscheduled.sale_kw > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <span className="sf-eyebrow" style={{ color: 'var(--sf-warn)' }}>판매</span>
                    <span className="sf-mono font-semibold tabular-nums" style={{ color: 'var(--sf-ink)' }}>
                      {formatKw(product.unscheduled.sale_kw)}
                    </span>
                  </div>
                )}
                {product.unscheduled.construction_kw > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <span className="sf-eyebrow" style={{ color: 'var(--sf-pos)' }}>공사</span>
                    <span className="sf-mono font-semibold tabular-nums" style={{ color: 'var(--sf-ink)' }}>
                      {formatKw(product.unscheduled.construction_kw)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ForecastTable({ products, onReserve }: Props) {
  if (products.length === 0) return <EmptyState message="수급 전망 데이터가 없습니다" />;

  return (
    <div className="space-y-4">
      {products.map((p) => (
        <ProductForecastBlock key={p.product_id} product={p} onReserve={onReserve} />
      ))}
    </div>
  );
}

export default memo(ForecastTable);
