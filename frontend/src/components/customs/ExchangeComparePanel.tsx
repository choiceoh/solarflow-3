import { ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatNumber, formatKRW } from '@/lib/utils';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useExchangeCompare } from '@/hooks/useExchange';

// 비유: 최근 면장 환율로 과거 면장 단가를 다시 비춰보는 환율 영향판
export default function ExchangeComparePanel() {
  const { result, loading, error, compare } = useExchangeCompare();
  const items = result?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="sf-exchange-summary">
        <div>
          <div className="text-[12px] font-semibold text-[var(--ink)]">환율 영향 비교</div>
          <div className="sf-mono mt-1 text-[10.5px]">
            {result ? (
              <span>
                기준 환율 {result.latest_rate > 0 ? formatNumber(result.latest_rate) : '법인별 적용'} · {result.latest_rate_source}
              </span>
            ) : (
              <span>최근 면장 환율로 기존 원가 영향을 계산합니다.</span>
            )}
          </div>
        </div>
        <Button onClick={compare} disabled={loading} size="xs" className="btn xs solar">
          <ArrowRightLeft className="h-3 w-3" />조회
        </Button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading && <LoadingSpinner />}

      {result && items.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>면장</TableHead>
                <TableHead>품목</TableHead>
                <TableHead className="text-right">계약환율</TableHead>
                <TableHead className="text-right">계약 CIF</TableHead>
                <TableHead className="text-right">최근환율 CIF</TableHead>
                <TableHead className="text-right">영향</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => {
                // 양수=빨간(원화부담 증가), 음수=초록(감소)
                const diffColor = item.rate_impact_krw > 0
                  ? 'text-red-600 font-medium'
                  : item.rate_impact_krw < 0
                  ? 'text-green-600 font-medium'
                  : '';

                return (
                  <TableRow key={`${item.declaration_number}-${item.product_name}-${index}`}>
                    <TableCell className="text-xs">
                      <div className="font-medium">{item.declaration_number}</div>
                      <div className="sf-mono text-[10px] text-[var(--ink-3)]">{item.declaration_date}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{item.product_name}</div>
                      <div className="text-[10px] text-[var(--ink-3)]">{item.manufacturer_name}</div>
                    </TableCell>
                    <TableCell className="sf-mono text-right text-xs">{formatNumber(item.contract_rate)}</TableCell>
                    <TableCell className="sf-mono text-right text-xs">{formatKRW(item.cif_wp_at_contract)}</TableCell>
                    <TableCell className="sf-mono text-right text-xs">{formatKRW(item.cif_wp_at_latest)}</TableCell>
                    <TableCell className={`sf-mono text-right text-xs ${diffColor}`}>
                      {item.rate_impact_krw > 0 ? '+' : ''}{formatKRW(item.rate_impact_krw)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {result && items.length === 0 && (
        <div className="sf-exchange-empty">환율 비교 대상 면장 원가가 없습니다.</div>
      )}
    </div>
  );
}
