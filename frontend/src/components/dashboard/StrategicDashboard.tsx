/**
 * StrategicDashboard — 전략/요약 뷰 (executive · manager · viewer 공용)
 *
 * 비유: "경영 관점 대시보드 — 역할에 따라 가리개(mask)가 다름"
 *
 * 권한 매트릭스 (permissions.ts 단일 정본):
 *   - executive:
 *       showPrice=true · showMargin=true · showSales=true · showDetail=true · showReceivable=true · showLcLimit=true
 *       → 전체 노출 (요약카드 전체, 이익 포함 매출, 단가 추이, Movers 상세 제품명)
 *   - manager:
 *       showPrice=false · showMargin=false · showSales=true · showDetail=false · showReceivable=false · showLcLimit=false
 *       → 매출 총액 가능, 이익/단가/미수/LC 한도 마스킹, 드릴다운 억제
 *   - viewer:
 *       showPrice=false · showMargin=false · showSales=false · showDetail=false
 *       → 재고·가용재고만. 매출/가격 전부 마스킹
 *
 * 쇼룸 원칙: 벤치마크·변화 화살표·부정적 알림 없음. 잘 돌아가고 있음을 담담히.
 */
import { Separator } from '@/components/ui/separator';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import StrategicSummaryCards from './StrategicSummaryCards';
import MonthlyRevenueChart from './MonthlyRevenueChart';
import PriceTrendChart from './PriceTrendChart';
import LongTermStockWarning from './LongTermStockWarning';
import InventoryHealthCard from './InventoryHealthCard';
import ManufacturerMatrix from './ManufacturerMatrix';
import MoverListCard from './MoverListCard';
import CustomerRevenueTable from './CustomerRevenueTable';
import OutstandingByCustomer from './OutstandingByCustomer';
import type {
  DashboardSectionState, DashboardSummary, MonthlyRevenue, PriceTrend,
} from '@/types/dashboard';
import type { InventoryResponse } from '@/types/inventory';
import type { TurnoverResponse } from '@/types/turnover';
import type { CustomerAnalysis } from '@/hooks/useDashboard';

interface StrategicFlags {
  showPrice: boolean;      // 단가/재고금액
  showMargin: boolean;     // 이익/이익률
  showSales: boolean;      // 매출 총액
  showDetail: boolean;     // 제품명/거래처 드릴다운
  showReceivable: boolean; // 미수금
  showLcLimit: boolean;    // LC 가용한도
}

interface Props {
  summary: DashboardSectionState<DashboardSummary>;
  revenue: DashboardSectionState<MonthlyRevenue>;
  priceTrend: DashboardSectionState<PriceTrend>;
  inventory: { data: InventoryResponse | null; loading: boolean; error: string | null };
  turnover: { data: TurnoverResponse | null; loading: boolean; error: string | null };
  outstanding: DashboardSectionState<CustomerAnalysis>;
  longTermWarning: number;
  longTermCritical: number;
  flags: StrategicFlags;
}

function SectionError({ msg }: { msg: string }) {
  return <p className="text-sm text-red-500 text-center py-4">{msg}</p>;
}

export default function StrategicDashboard({
  summary, revenue, priceTrend, inventory, turnover, outstanding,
  longTermWarning, longTermCritical, flags,
}: Props) {
  return (
    <div className="space-y-4">
      {/* 1. 요약 카드 — flag=false면 해당 카드 제거 (마스킹 없이 아예 비표시) */}
      {summary.loading ? <LoadingSpinner /> : summary.error ? (
        <SectionError msg={summary.error} />
      ) : summary.data ? (
        <StrategicSummaryCards
          summary={summary.data}
          revenue={revenue.data}
          flags={{ showSales: flags.showSales, showReceivable: flags.showReceivable, showLcLimit: flags.showLcLimit }}
        />
      ) : null}

      {/* 2. 재고 건강검진 (회전율·DIO·MW) — 전 역할 공통 */}
      {turnover.loading ? <LoadingSpinner /> : turnover.error ? (
        <SectionError msg={turnover.error} />
      ) : turnover.data ? (
        <InventoryHealthCard total={turnover.data.total} windowDays={turnover.data.window_days} />
      ) : null}

      {/* 3. 장기재고 경고 — 수치만 (개수), 금액 없음 */}
      <LongTermStockWarning warningCount={longTermWarning} criticalCount={longTermCritical} />

      <Separator />

      {/* 4. 매트릭스: 제조사 × 출력 (+ 모듈크기 토글) — 전 역할 공통 (MW만) */}
      {inventory.loading || turnover.loading ? <LoadingSpinner /> :
        inventory.error ? <SectionError msg={inventory.error} /> :
        inventory.data && turnover.data ? (
          <ManufacturerMatrix inventory={inventory.data.items} matrix={turnover.data.matrix} />
        ) : null}

      {/* 5. 매출·단가 차트 — flag 기반 조건부 */}
      {(flags.showSales || flags.showPrice) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 매출/마진: showSales 필요, showMargin=false면 차트는 표시하되 마진 레이어 숨김
              현행 MonthlyRevenueChart는 매출+마진 모두 한 번에 그리므로,
              manager(showSales=true,showMargin=false) → 매출 차트를 대체/축약할 필요 존재
              단순화: showMargin=false면 비표시 (manager는 텍스트 총액으로만 보게 됨) */}
          {flags.showSales && flags.showMargin && (
            revenue.loading ? <LoadingSpinner /> : revenue.error ? (
              <SectionError msg={revenue.error} />
            ) : revenue.data ? (
              <MonthlyRevenueChart data={revenue.data} />
            ) : null
          )}

          {/* 단가 추이 — showPrice 필요 (본부장/뷰어 차단) */}
          {flags.showPrice && (
            priceTrend.loading ? <LoadingSpinner /> : priceTrend.error ? (
              <SectionError msg={priceTrend.error} />
            ) : priceTrend.data ? (
              <PriceTrendChart data={priceTrend.data} />
            ) : null
          )}
        </div>
      )}

      {/* 6. Top/Slow Movers — MW·회전율만 (가격 없음) → 전 역할 공통
             showDetail=false: 제품명 마스킹, 제조사·출력만 */}
      {turnover.data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MoverListCard kind="top" items={turnover.data.top_movers} showDetail={flags.showDetail} />
          <MoverListCard kind="slow" items={turnover.data.slow_movers} showDetail={flags.showDetail} />
        </div>
      )}

      {/* 7. 거래처별 매출·이익 + 미수금 거래처별
             - 거래처 매출 테이블: showSales=true (manager도 매출만, executive는 이익 포함)
             - 미수금 거래처별: showReceivable=true (매출·드릴다운과 별도 축) */}
      {(flags.showSales || flags.showReceivable) && outstanding.data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {flags.showSales && (
            <CustomerRevenueTable
              customers={(outstanding.data.items || []).map((c) => ({
                customer_id: c.customer_id,
                customer_name: c.customer_name,
                revenue_krw: c.total_sales_krw,
                margin_krw: c.total_margin_krw ?? undefined,
                margin_rate: c.avg_margin_rate ?? undefined,
              })).filter((c) => (c.revenue_krw ?? 0) > 0)}
              showMargin={flags.showMargin}
              showDetail={flags.showDetail}
            />
          )}
          {flags.showReceivable && (
            <OutstandingByCustomer
              customers={(outstanding.data.items || []).filter((c) => c.outstanding_krw > 0)}
            />
          )}
        </div>
      )}
    </div>
  );
}
