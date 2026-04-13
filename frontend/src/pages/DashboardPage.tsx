import { useAppStore } from '@/stores/appStore';
import { useDashboard } from '@/hooks/useDashboard';
import { useAlerts } from '@/hooks/useAlerts';
import { usePermission } from '@/hooks/usePermission';
import ExecutiveDashboard from '@/components/dashboard/ExecutiveDashboard';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';

export default function DashboardPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const { role, showFullDashboard } = usePermission();
  const userRole = role || 'viewer';

  const {
    summary, revenue, priceTrend,
    incoming, orderBacklog, outstanding,
    longTermWarning, longTermCritical,
  } = useDashboard(selectedCompanyId, userRole);

  const { alerts, loading: alertsLoading } = useAlerts(selectedCompanyId);

  // showFullDashboard: admin·operator·executive → ManagerDashboard(전체 KPI + 입출고 + 미수금)
  // manager·viewer → ExecutiveDashboard(재고·가용재고 요약만)
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">대시보드</h1>

      {showFullDashboard ? (
        <ManagerDashboard
          summary={summary}
          revenue={revenue}
          priceTrend={priceTrend}
          alerts={{ data: alerts, loading: alertsLoading, error: null }}
          incoming={incoming}
          orderBacklog={orderBacklog}
          outstanding={outstanding}
          longTermWarning={longTermWarning}
          longTermCritical={longTermCritical}
        />
      ) : (
        <ExecutiveDashboard
          summary={summary}
          revenue={revenue}
          priceTrend={priceTrend}
          longTermWarning={longTermWarning}
          longTermCritical={longTermCritical}
        />
      )}
    </div>
  );
}
