import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/stores/appStore';
import { useDashboard } from '@/hooks/useDashboard';
import { useAlerts } from '@/hooks/useAlerts';
import { useTurnover } from '@/hooks/useTurnover';
import { useInventory } from '@/hooks/useInventory';
import { useForecast } from '@/hooks/useForecast';
import { usePermission } from '@/hooks/usePermission';
import CommandDashboard from '@/components/dashboard/CommandDashboard';
import { fetchWithAuth } from '@/lib/api';
import { sortManufacturers } from '@/lib/manufacturerPriority';
import type { Manufacturer, Product } from '@/types/masters';
import {
  canAccessMenu, hasFeature, getDashboardType,
  type Role,
} from '@/config/permissions';

/**
 * DashboardPage — 역할별 대시보드 라우터
 *
 * 비유: "출입구에서 방문자 배지 색을 보고 맞는 방으로 안내"
 *
 * 분기 기준 (permissions.ts 단일 정본):
 *   - dashboardType='strategic' → StrategicDashboard (executive/manager/viewer)
 *       권한 flag로 가격/이익/미수금/드릴다운을 마스킹
 *   - dashboardType='operational' → ManagerDashboard (admin/operator) [Phase D에서 교체 예정]
 *       현행 기존 대시보드 유지 (실무 행위자 뷰)
 *
 * [DEV 전용] ?role=executive|manager|viewer|admin|operator URL 파라미터로
 *   역할을 임시 오버라이드합니다. import.meta.env.DEV=false면 무시.
 */

const VALID_ROLES: readonly Role[] = ['admin', 'operator', 'executive', 'manager', 'viewer'];

function isValidRole(v: string | null): v is Role {
  return !!v && (VALID_ROLES as readonly string[]).includes(v);
}

export default function DashboardPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [searchParams] = useSearchParams();
  const realPerm = usePermission();
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // [DEV 전용] ?role= 오버라이드
  const overrideRoleParam = searchParams.get('role');
  const devOverride =
    import.meta.env.DEV && isValidRole(overrideRoleParam) ? overrideRoleParam : null;

  // 권한 해석: 오버라이드 있으면 그 역할로 permissions.ts 헬퍼 호출, 없으면 실제 훅 값 사용
  const role = devOverride ?? realPerm.role;
  const dashboardType = devOverride ? getDashboardType(devOverride) : realPerm.dashboardType;
  const showPrice      = devOverride ? hasFeature(devOverride, 'showPrice')      : realPerm.showPrice;
  const showMargin     = devOverride ? hasFeature(devOverride, 'showMargin')     : realPerm.showMargin;
  const showSales      = devOverride ? hasFeature(devOverride, 'showSales')      : realPerm.showSales;
  const showDetail     = devOverride ? hasFeature(devOverride, 'showDetail')     : realPerm.showDetail;
  const showReceivable = devOverride ? hasFeature(devOverride, 'showReceivable') : realPerm.showReceivable;
  const showLcLimit    = devOverride ? hasFeature(devOverride, 'showLcLimit')    : realPerm.showLcLimit;
  // canAccessMenu는 현 페이지에서는 직접 쓰지 않지만, 오버라이드 시 일관성 유지용 참조
  void canAccessMenu;

  const userRole = role || 'viewer';

  const {
    summary, revenue, priceTrend, sales, outstanding, incoming, orderBacklog,
    longTermWarning, longTermCritical,
  } = useDashboard(selectedCompanyId, userRole);
  const alertState = useAlerts(selectedCompanyId);

  const turnover = useTurnover(selectedCompanyId, 90);
  const inventory = useInventory();
  const forecast = useForecast();

  useEffect(() => {
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(sortManufacturers(list.filter((m) => m.is_active))))
      .catch(() => {});
    fetchWithAuth<Product[]>('/api/v1/products')
      .then((list) => setProducts(list.filter((p) => p.is_active)))
      .catch(() => {});
  }, []);

  // 현재 모든 정의된 역할의 dashboardType='strategic'으로 통일 (operational은 예비 타입).
  // 추후 운영 뷰가 다시 필요해지면 여기에 분기 추가.
  void dashboardType;

  return (
    <CommandDashboard
      summary={summary}
      revenue={revenue}
      priceTrend={priceTrend}
      inventory={{ data: inventory.data, loading: inventory.loading, error: inventory.error }}
      turnover={{ data: turnover.data, loading: turnover.loading, error: turnover.error }}
      forecast={{ data: forecast.data, loading: forecast.loading, error: forecast.error }}
      sales={sales}
      outstanding={outstanding}
      alerts={{ data: alertState.alerts, loading: alertState.loading, error: null }}
      incoming={incoming}
      orderBacklog={orderBacklog}
      manufacturers={manufacturers}
      products={products}
      longTermWarning={longTermWarning}
      longTermCritical={longTermCritical}
      flags={{ showPrice, showMargin, showSales, showDetail, showReceivable, showLcLimit }}
    />
  );
}
