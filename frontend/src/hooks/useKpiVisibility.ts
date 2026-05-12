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

export const DEFAULT_VISIBLE_KPI_COUNT = 4;

export interface UseKpiVisibilityOptions {
  defaultVisibleCount?: number;
}

export function useKpiVisibility<T extends KpiMetricLike>(
  scopeId: string | undefined,
  metrics: T[],
  options?: UseKpiVisibilityOptions,
) {
  const defaultVisibleCount = options?.defaultVisibleCount ?? DEFAULT_VISIBLE_KPI_COUNT;
  const prefs = usePreferencesStore((s) => s.prefs);
  const setPrefs = usePreferencesStore((s) => s.setPrefs);
  const [saving, setSaving] = useState(false);

  const kpiOptions = useMemo(() => resolveKpiOptions(metrics), [metrics]);
  const optionIds = useMemo(() => new Set(kpiOptions.map((option) => option.id)), [kpiOptions]);

  // 사용자가 한 번도 설정하지 않은 섹션은 첫 N개만 노출. 페이지가 metrics 를 늘려도 기본 레이아웃 유지.
  const defaultHidden = useMemo(() => {
    if (kpiOptions.length <= defaultVisibleCount) return new Set<string>();
    return new Set(kpiOptions.slice(defaultVisibleCount).map((option) => option.id));
  }, [kpiOptions, defaultVisibleCount]);

  const rawUserPref = scopeId ? prefs.kpi_hidden?.[scopeId] : undefined;
  const hasUserPref = Array.isArray(rawUserPref);

  const hidden = useMemo(() => {
    if (!scopeId) return new Set<string>();
    return hasUserPref ? normalizeHidden(rawUserPref, optionIds) : defaultHidden;
  }, [scopeId, hasUserPref, rawUserPref, optionIds, defaultHidden]);

  const visibleMetrics = useMemo(() => {
    if (!scopeId || kpiOptions.length === 0) return metrics;
    return metrics.filter((metric) => !hidden.has(kpiMetricKey(metric, kpiOptions)));
  }, [hidden, metrics, kpiOptions, scopeId]);

  const persistHidden = useCallback(
    async (nextHidden: Set<string> | null) => {
      if (!scopeId) return;

      const nextHiddenByScope = { ...(prefs.kpi_hidden ?? {}) };
      if (nextHidden === null) {
        // null = 기본 상태로 복귀 (key 제거 → defaultHidden 적용)
        delete nextHiddenByScope[scopeId];
      } else {
        const cleanedHidden = [...nextHidden].filter((id) => optionIds.has(id));
        nextHiddenByScope[scopeId] = cleanedHidden;
      }

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
    },
    [optionIds, prefs, scopeId, setPrefs],
  );

  const setMetricVisible = useCallback(
    (id: string, visible: boolean) => {
      if (!scopeId) return;
      const nextHidden = new Set(hidden);
      if (visible) {
        nextHidden.delete(id);
      } else {
        if (kpiOptions.length - nextHidden.size <= 1) {
          notify.warning('KPI는 최소 1개 이상 표시해야 합니다');
          return;
        }
        nextHidden.add(id);
      }
      void persistHidden(nextHidden);
    },
    [hidden, kpiOptions.length, persistHidden, scopeId],
  );

  const reset = useCallback(() => {
    if (!scopeId) return;
    void persistHidden(null);
  }, [persistHidden, scopeId]);

  return {
    options: kpiOptions,
    hidden,
    visibleMetrics,
    setMetricVisible,
    reset,
    saving,
    isDefault: !hasUserPref,
    defaultVisibleCount,
    configurable: !!scopeId && kpiOptions.length > 1,
  };
}
