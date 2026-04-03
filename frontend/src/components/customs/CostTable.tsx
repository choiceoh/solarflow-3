import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatNumber, formatUSD, formatKRW } from '@/lib/utils';
import type { DeclarationCost } from '@/types/customs';

interface Props {
  items: DeclarationCost[];
  onEdit: (c: DeclarationCost) => void;
  // 미리보기 상태: 파란 배경 / 저장완료 상태: 초록 배경
  landedStatus?: 'preview' | 'saved' | null;
}

export default function CostTable({ items, onEdit, landedStatus }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">원가 항목이 없습니다</p>;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <span>회계 원가 = 면장 CIF Wp단가 (장부, 회계팀 보고용)</span>
        <span className="mx-1">|</span>
        <span>실무 원가 = CIF + 부대비용 (판매 의사결정, 마진 계산용)</span>
      </div>
      <p className="text-[10px] text-muted-foreground mb-1">VAT(부가세)는 매입세액공제 대상이므로 원가에 불포함</p>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead rowSpan={2} className="align-bottom">품목</TableHead>
              <TableHead rowSpan={2} className="align-bottom text-right">수량</TableHead>
              <TableHead rowSpan={2} className="align-bottom text-right">환율</TableHead>
              {/* Stage 1 FOB */}
              <TableHead colSpan={3} className="text-center border-b-0 bg-orange-50 text-orange-700">
                Stage 1: FOB
              </TableHead>
              {/* Stage 2 CIF */}
              <TableHead colSpan={4} className="text-center border-b-0 bg-blue-50 text-blue-700">
                Stage 2: CIF <Badge variant="outline" className="ml-1 text-[9px] bg-blue-100 text-blue-700 border-blue-300">회계 원가</Badge>
              </TableHead>
              {/* Stage 3 Landed */}
              <TableHead colSpan={5} className="text-center border-b-0 bg-green-50 text-green-700">
                Stage 3: Landed <Badge variant="outline" className="ml-1 text-[9px] bg-green-100 text-green-700 border-green-300">실무 원가</Badge>
              </TableHead>
            </TableRow>
            <TableRow>
              {/* FOB */}
              <TableHead className="text-right text-[10px] bg-orange-50">cent/Wp</TableHead>
              <TableHead className="text-right text-[10px] bg-orange-50">합계 USD</TableHead>
              <TableHead className="text-right text-[10px] bg-orange-50">원/Wp</TableHead>
              {/* CIF */}
              <TableHead className="text-right text-[10px] bg-blue-50">합계 KRW</TableHead>
              <TableHead className="text-right text-[10px] bg-blue-50">단가 USD</TableHead>
              <TableHead className="text-right text-[10px] bg-blue-50">합계 USD</TableHead>
              <TableHead className="text-right text-[10px] bg-blue-50">원/Wp</TableHead>
              {/* Landed */}
              <TableHead className="text-right text-[10px] bg-green-50">관세율</TableHead>
              <TableHead className="text-right text-[10px] bg-green-50">관세액</TableHead>
              <TableHead className="text-right text-[10px] bg-green-50">부대비용</TableHead>
              <TableHead className="text-right text-[10px] bg-green-50">합계 KRW</TableHead>
              <TableHead className="text-right text-[10px] bg-green-50">원/Wp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => {
              const rowBg = landedStatus === 'preview'
                ? 'bg-blue-50/50' : landedStatus === 'saved'
                ? 'bg-green-50/50' : '';

              return (
                <TableRow
                  key={c.cost_id}
                  className={`cursor-pointer hover:bg-muted/50 ${rowBg}`}
                  onClick={() => onEdit(c)}
                >
                  <TableCell className="text-xs">
                    {c.product_name || c.product_code || c.product_id.slice(0, 8)}
                    {c.spec_wp ? ` (${c.spec_wp}Wp)` : ''}
                  </TableCell>
                  <TableCell className="text-right text-xs">{formatNumber(c.quantity)}</TableCell>
                  <TableCell className="text-right text-xs">{formatNumber(c.exchange_rate)}</TableCell>
                  {/* FOB */}
                  <TableCell className="text-right text-xs bg-orange-50/30">{c.fob_unit_usd != null ? c.fob_unit_usd.toFixed(4) : '—'}</TableCell>
                  <TableCell className="text-right text-xs bg-orange-50/30">{c.fob_total_usd != null ? formatUSD(c.fob_total_usd) : '—'}</TableCell>
                  <TableCell className="text-right text-xs bg-orange-50/30">{c.fob_wp_krw != null ? formatNumber(c.fob_wp_krw) : '—'}</TableCell>
                  {/* CIF */}
                  <TableCell className="text-right text-xs bg-blue-50/30">{formatKRW(c.cif_total_krw)}</TableCell>
                  <TableCell className="text-right text-xs bg-blue-50/30">{c.cif_unit_usd != null ? formatUSD(c.cif_unit_usd) : '—'}</TableCell>
                  <TableCell className="text-right text-xs bg-blue-50/30">{c.cif_total_usd != null ? formatUSD(c.cif_total_usd) : '—'}</TableCell>
                  <TableCell className="text-right text-xs font-medium bg-blue-50/30">{formatNumber(c.cif_wp_krw)}</TableCell>
                  {/* Landed */}
                  <TableCell className="text-right text-xs bg-green-50/30">{c.tariff_rate != null ? `${c.tariff_rate}%` : '—'}</TableCell>
                  <TableCell className="text-right text-xs bg-green-50/30">{c.tariff_amount != null ? formatKRW(c.tariff_amount) : '—'}</TableCell>
                  <TableCell className="text-right text-xs bg-green-50/30">{c.incidental_cost != null ? formatKRW(c.incidental_cost) : '—'}</TableCell>
                  <TableCell className="text-right text-xs bg-green-50/30">{c.landed_total_krw != null ? formatKRW(c.landed_total_krw) : '—'}</TableCell>
                  <TableCell className="text-right text-xs font-medium bg-green-50/30">{c.landed_wp_krw != null ? formatNumber(c.landed_wp_krw) : '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
