import { useCallback, useMemo, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { notify } from '@/lib/notify';
import { usePreferencesStore } from '@/stores/preferencesStore';
import type { UserPreferences } from '@/types/models';

export interface KpiMetricLike {
  key?: string;
  metricId?: string;
  label?: string;
  lbl?: string;
}

export interface KpiVisibilityOption {
  id: string;
  label: string;
}

function labelOf(metric: KpiMetricLike): string {
  return metric.label ?? metric.lbl ?? metric.metricId ?? metric.key ?? 'KPI';
}

function baseIdOf(metric: KpiMetricLike): string {
  return metric.key ?? metric.metricId ?? labelOf(metric);
}

function metricIdFor(metric: KpiMetricLike, duplicatedBaseIds: Set<string>): string {
  const baseId = baseIdOf(metric);
  if (!duplicatedBaseIds.has(baseId)) return baseId;
  return metric.key ?? labelOf(metric);
}

function normalizeHidden(value: unknown, validIds: Set<string>): Set<string> {
  if (!Array.isArray(value)) return new Set();
  const hidden = new Set<string>();
  for (const item of value) {
    if (typeof item === 'string' && validIds.has(item)) hidden.add(item);
  }
  return hidden;
}

export function resolveKpiOptions<T extends KpiMetricLike>(metrics: T[]): KpiVisibilityOption[] {
  const baseCounts = new Map<string, number>();
  for (const metric of metrics) {
    const baseId = baseIdOf(metric);
    baseCounts.set(baseId, (baseCounts.get(baseId) ?? 0) + 1);
  }
  const duplicatedBaseIds = new Set(
    [...baseCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id),
  );

  const seen = new Set<string>();
  const options: KpiVisibilityOption[] = [];
  for (const metric of metrics) {
    const id = metricIdFor(metric, duplicatedBaseIds);
    if (seen.has(id)) continue;
    seen.add(id);
    options.push({ id, label: labelOf(metric) });
  }
  return options;
}

export function kpiMetricKey(metric: KpiMetricLike, options: KpiVisibilityOption[]): string {
  const optionIds = new Set(options.map((option) => option.id));
  const directIds = [metric.key, metric.metricId, labelOf(metric)].filter(Boolean) as string[];
  return directIds.find((id) => optionIds.has(id)) ?? labelOf(metric);
}

export function useKpiVisibility<T extends KpiMetricLike>(scopeId: string | undefined, metrics: T[]) {
  const prefs = usePreferencesStore((s) => s.prefs);
  const setPrefs = usePreferencesStore((s) => s.setPrefs);
  const [saving, setSaving] = useState(false);

  const options = useMemo(() => resolveKpiOptions(metrics), [metrics]);
  const optionIds = useMemo(() => new Set(options.map((option) => option.id)), [options]);
  const hidden = useMemo(() => {
    if (!scopeId) return new Set<string>();
    return normalizeHidden(prefs.kpi_hidden?.[scopeId], optionIds);
  }, [optionIds, prefs.kpi_hidden, scopeId]);

  const visibleMetrics = useMemo(() => {
    if (!scopeId || options.length === 0) return metrics;
    return metrics.filter((metric) => !hidden.has(kpiMetricKey(metric, options)));
  }, [hidden, metrics, options, scopeId]);

  const persistHidden = useCallback(async (nextHidden: Set<string>) => {
    if (!scopeId) return;

    const cleanedHidden = [...nextHidden].filter((id) => optionIds.has(id));
    const nextHiddenByScope = { ...(prefs.kpi_hidden ?? {}) };
    if (cleanedHidden.length > 0) nextHiddenByScope[scopeId] = cleanedHidden;
    else delete nextHiddenByScope[scopeId];

    const nextPrefs: UserPreferences = { ...prefs, kpi_hidden: nextHiddenByScope };
    const prevPrefs = prefs;
    setPrefs(nextPrefs);
    setSaving(true);
    try {
      await fetchWithAuth('/api/v1/users/me/preferences', {
        method: 'PUT',
        body: JSON.stringify({ preferences: nextPrefs }),
      });
    } catch (err) {
      setPrefs(prevPrefs);
      notify.error(err instanceof Error ? err.message : 'KPI 설정 저장에 실패했습니다');
    } finally {
      setSaving(false);
    }
  }, [optionIds, prefs, scopeId, setPrefs]);

  const setMetricVisible = useCallback((id: string, visible: boolean) => {
    if (!scopeId) return;
    const nextHidden = new Set(hidden);
    if (visible) {
      nextHidden.delete(id);
    } else {
      if (options.length - nextHidden.size <= 1) {
        notify.warning('KPI는 최소 1개 이상 표시해야 합니다');
        return;
      }
      nextHidden.add(id);
    }
    void persistHidden(nextHidden);
  }, [hidden, options.length, persistHidden, scopeId]);

  const reset = useCallback(() => {
    if (!scopeId) return;
    void persistHidden(new Set());
  }, [persistHidden, scopeId]);

  return {
    options,
    hidden,
    visibleMetrics,
    setMetricVisible,
    reset,
    saving,
    configurable: !!scopeId && options.length > 1,
  };
}
