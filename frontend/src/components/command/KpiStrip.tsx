import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
  kpiMetricKey,
  useKpiVisibility,
  type KpiMetricLike,
} from '@/hooks/useKpiVisibility';
import { saveKpiOptions } from '@/lib/kpiOptionsCache';
import { KpiVisibilityMenu } from './KpiVisibilityMenu';

interface KpiStripProps<T extends KpiMetricLike> {
  metrics: T[];
  scopeId?: string;
  gridClassName?: string;
  children: (metric: T) => ReactNode;
}

export function KpiStrip<T extends KpiMetricLike>({
  metrics,
  scopeId,
  gridClassName,
  children,
}: KpiStripProps<T>) {
  const visibility = useKpiVisibility(scopeId, metrics);
  const [actionsTarget, setActionsTarget] = useState<HTMLElement | null>(() => (
    typeof document === 'undefined' ? null : document.getElementById('sf-kpi-actions-slot')
  ));

  useEffect(() => {
    if (typeof document === 'undefined') return;
    setActionsTarget(document.getElementById('sf-kpi-actions-slot'));
  }, []);

  // 운영자 UI 페이지가 metric 라벨을 보여줄 수 있게 캐시. 페이지가 한 번이라도
  // 렌더되면 그 시점의 옵션이 localStorage 에 남는다.
  useEffect(() => {
    if (!scopeId || visibility.options.length === 0) return;
    saveKpiOptions(scopeId, visibility.options);
  }, [scopeId, visibility.options]);

  const visibilityMenu = visibility.configurable ? (
    <KpiVisibilityMenu
      options={visibility.options}
      hidden={visibility.hidden}
      onToggle={visibility.setMetricVisible}
      onReset={visibility.reset}
      saving={visibility.saving}
      isDefault={visibility.isDefault}
      defaultVisibleCount={visibility.defaultVisibleCount}
    />
  ) : null;

  return (
    <>
      {actionsTarget && visibilityMenu ? createPortal(visibilityMenu, actionsTarget) : null}
      <div className="sf-kpi-strip">
        {!actionsTarget && visibilityMenu ? (
          <div className="sf-kpi-strip-toolbar">
            {visibilityMenu}
          </div>
        ) : null}
        <div className={cn('sf-command-kpis', gridClassName)}>
          {visibility.visibleMetrics.map((metric) => (
            <Fragment key={kpiMetricKey(metric, visibility.options)}>
              {children(metric)}
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}

export default KpiStrip;
