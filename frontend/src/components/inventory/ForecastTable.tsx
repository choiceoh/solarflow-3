import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn, formatKw, formatWp } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import type { ProductForecast } from '@/types/inventory';

function ForecastCell({ value, insufficient }: { value: number; insufficient?: boolean }) {
  return (
    <TableCell className={cn(
      'text-right whitespace-nowrap',
      insufficient && 'bg-red-50 text-red-600 font-medium'
    )}>
      {insufficient && <AlertTriangle className="mr-0.5 inline h-3 w-3" />}
      {formatKw(value)}
    </TableCell>
  );
}

function ProductForecastBlock({ product }: { product: ProductForecast }) {
  const [open, setOpen] = useState(true);
  const hasUnscheduled = product.unscheduled.sale_kw > 0 || product.unscheduled.construction_kw > 0 || product.unscheduled.incoming_kw > 0;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-medium hover:text-foreground text-muted-foreground"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {product.manufacturer_name} — {product.product_name} ({formatWp(product.spec_wp)})
      </button>

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
                    <TableCell className="text-right">{formatKw(m.opening_kw)}</TableCell>
                    <TableCell className="text-right">{formatKw(m.incoming_kw)}</TableCell>
                    <TableCell className="text-right">{formatKw(m.outgoing_sale_kw)}</TableCell>
                    <TableCell className="text-right">{formatKw(m.outgoing_construction_kw)}</TableCell>
                    <ForecastCell value={m.closing_kw} insufficient={m.insufficient} />
                    <TableCell className="text-right">{formatKw(m.reserved_kw)}</TableCell>
                    <TableCell className="text-right">{formatKw(m.allocated_kw)}</TableCell>
                    <TableCell className="text-right font-medium text-green-600">{formatKw(m.available_kw)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {hasUnscheduled && (
            <Card className="border-dashed">
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-xs text-muted-foreground">미배정 물량 (날짜 미정)</CardTitle>
              </CardHeader>
              <CardContent className="pb-3 text-xs space-y-0.5">
                {product.unscheduled.incoming_kw > 0 && (
                  <p>입고 미배정: <span className="font-medium">{formatKw(product.unscheduled.incoming_kw)}</span></p>
                )}
                {product.unscheduled.sale_kw > 0 && (
                  <p>판매 미배정: <span className="font-medium">{formatKw(product.unscheduled.sale_kw)}</span></p>
                )}
                {product.unscheduled.construction_kw > 0 && (
                  <p>공사 미배정: <span className="font-medium">{formatKw(product.unscheduled.construction_kw)}</span></p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function ForecastTable({ products }: { products: ProductForecast[] }) {
  if (products.length === 0) return <EmptyState message="수급 전망 데이터가 없습니다" />;

  return (
    <div className="space-y-4">
      {products.map((p) => (
        <ProductForecastBlock key={p.product_id} product={p} />
      ))}
    </div>
  );
}
