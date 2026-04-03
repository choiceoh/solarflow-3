import { Separator } from '@/components/ui/separator';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ExecutiveDashboard from './ExecutiveDashboard';
import AlertPanel from './AlertPanel';
import IncomingPreview from './IncomingPreview';
import OrderBacklog from './OrderBacklog';
import OutstandingByCustomer from './OutstandingByCustomer';
import type {
  DashboardSectionState, DashboardSummary, MonthlyRevenue,
  PriceTrend, AlertItem,
} from '@/types/dashboard';
import type { BLShipment } from '@/types/inbound';
import type { Order } from '@/types/orders';

interface CustomerAnalysis {
  customers: {
    customer_name: string;
    outstanding_amount: number;
    outstanding_count: number;
    max_days_overdue: number;
  }[];
  total_outstanding: number;
}

interface Props {
  summary: DashboardSectionState<DashboardSummary>;
  revenue: DashboardSectionState<MonthlyRevenue>;
  priceTrend: DashboardSectionState<PriceTrend>;
  alerts: DashboardSectionState<AlertItem[]>;
  incoming: DashboardSectionState<BLShipment[]>;
  orderBacklog: DashboardSectionState<Order[]>;
  outstanding: DashboardSectionState<CustomerAnalysis>;
  longTermWarning: number;
  longTermCritical: number;
}

function SectionError({ msg }: { msg: string }) {
  return <p className="text-sm text-red-500 text-center py-4">{msg}</p>;
}

export default function ManagerDashboard({
  summary, revenue, priceTrend, alerts,
  incoming, orderBacklog, outstanding,
  longTermWarning, longTermCritical,
}: Props) {
  return (
    <div className="space-y-4">
      {/* 경영진 대시보드 전체 포함 */}
      <ExecutiveDashboard
        summary={summary}
        revenue={revenue}
        priceTrend={priceTrend}
        longTermWarning={longTermWarning}
        longTermCritical={longTermCritical}
      />

      <Separator />

      {/* 관리자 전용 4섹션 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 알림 패널 */}
        {alerts.loading ? <LoadingSpinner /> : alerts.error ? (
          <SectionError msg={alerts.error} />
        ) : (
          <AlertPanel alerts={alerts.data || []} />
        )}

        {/* 미수금 거래처별 */}
        {outstanding.loading ? <LoadingSpinner /> : outstanding.error ? (
          <SectionError msg={outstanding.error} />
        ) : outstanding.data ? (
          <OutstandingByCustomer customers={outstanding.data.customers || []} />
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 미착품 프리뷰 */}
        {incoming.loading ? <LoadingSpinner /> : incoming.error ? (
          <SectionError msg={incoming.error} />
        ) : (
          <IncomingPreview items={incoming.data || []} />
        )}

        {/* 수주 잔량 */}
        {orderBacklog.loading ? <LoadingSpinner /> : orderBacklog.error ? (
          <SectionError msg={orderBacklog.error} />
        ) : (
          <OrderBacklog items={orderBacklog.data || []} />
        )}
      </div>
    </div>
  );
}
