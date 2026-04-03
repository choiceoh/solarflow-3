import { Separator } from '@/components/ui/separator';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import SummaryCards from './SummaryCards';
import MonthlyRevenueChart from './MonthlyRevenueChart';
import PriceTrendChart from './PriceTrendChart';
import LongTermStockWarning from './LongTermStockWarning';
import type { DashboardSectionState, DashboardSummary, MonthlyRevenue, PriceTrend } from '@/types/dashboard';

interface Props {
  summary: DashboardSectionState<DashboardSummary>;
  revenue: DashboardSectionState<MonthlyRevenue>;
  priceTrend: DashboardSectionState<PriceTrend>;
  longTermWarning: number;
  longTermCritical: number;
}

function SectionError({ msg }: { msg: string }) {
  return <p className="text-sm text-red-500 text-center py-4">{msg}</p>;
}

export default function ExecutiveDashboard({ summary, revenue, priceTrend, longTermWarning, longTermCritical }: Props) {
  return (
    <div className="space-y-4">
      {/* 요약 카드 6개 */}
      {summary.loading ? <LoadingSpinner /> : summary.error ? (
        <SectionError msg={summary.error} />
      ) : summary.data ? (
        <SummaryCards summary={summary.data} />
      ) : null}

      {/* 장기재고 경고 */}
      <LongTermStockWarning warningCount={longTermWarning} criticalCount={longTermCritical} />

      <Separator />

      {/* 차트 2개 가로 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 매출/마진 BarChart */}
        {revenue.loading ? <LoadingSpinner /> : revenue.error ? (
          <SectionError msg={revenue.error} />
        ) : revenue.data ? (
          <MonthlyRevenueChart data={revenue.data} />
        ) : null}

        {/* 단가 추이 LineChart */}
        {priceTrend.loading ? <LoadingSpinner /> : priceTrend.error ? (
          <SectionError msg={priceTrend.error} />
        ) : priceTrend.data ? (
          <PriceTrendChart data={priceTrend.data} />
        ) : null}
      </div>
    </div>
  );
}
