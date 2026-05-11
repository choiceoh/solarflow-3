import { Fragment, type ReactNode } from 'react';
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

  return (
    <div className="sf-kpi-strip">
      {visibility.configurable ? (
        <div className="sf-kpi-strip-toolbar">
          <KpiVisibilityMenu
            options={visibility.options}
            hidden={visibility.hidden}
            onToggle={visibility.setMetricVisible}
            onReset={visibility.reset}
            saving={visibility.saving}
          />
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
  );
}

export default KpiStrip;
