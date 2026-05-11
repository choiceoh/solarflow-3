import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
  kpiMetricKey,
  useKpiVisibility,
  type KpiMetricLike,
} from '@/hooks/useKpiVisibility';
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

  const visibilityMenu = visibility.configurable ? (
    <KpiVisibilityMenu
      options={visibility.options}
      hidden={visibility.hidden}
      onToggle={visibility.setMetricVisible}
      onReset={visibility.reset}
      saving={visibility.saving}
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
