import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { useDashboard } from '@/hooks/useDashboard';
import { useAlerts } from '@/hooks/useAlerts';
import ExecutiveDashboard from '@/components/dashboard/ExecutiveDashboard';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';

export default function DashboardPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const user = useAuthStore((s) => s.user);
  const userRole = user?.role || 'viewer';

  const {
    summary, revenue, priceTrend,
    incoming, orderBacklog, outstanding,
    longTermWarning, longTermCritical,
  } = useDashboard(selectedCompanyId, userRole);

  // 알림은 useAlerts에서 독립 조회 (Step 31 감리 지적 3 반영)
  const { alerts, loading: alertsLoading } = useAlerts(selectedCompanyId);

  // D-060: "all"이면 전체 법인 합산 대시보드 표시

  const isManager = userRole === 'admin' || userRole === 'manager';

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">대시보드</h1>

      {isManager ? (
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
