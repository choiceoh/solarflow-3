// 기능 매트릭스 (admin 전용) — 테넌트 × pack/feature 활성 토글 (PR-5a/5b).
//
// 데이터 흐름:
//   - GET /api/v1/admin/feature-wiring/ — 매트릭스 (tenants + features[enabled[tenant]])
//   - PUT /api/v1/admin/feature-wiring/{tenant}/{feature} — 셀 토글
//   - frontend ALL_PACKS (PR-4) 의 navItems 에서 feature id 추출 → pack 별로 features 묶음
//
// PR-5b: 셀 클릭으로 토글 + pack 헤더에 일괄 켜기/끄기 버튼.
//        백엔드는 tenant_features 테이블에 upsert + audit 행 추가, resolver in-memory 캐시 갱신.
//        startup 시 app 패키지가 DB 행을 한 번 로드해 재시작 후에도 유지.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers } from 'lucide-react';

import { fetchWithAuth } from '@/lib/api';
import { ALL_PACKS } from '@/packs';
import type { Pack } from '@/packs';

interface AdminTenantSummary {
  id: string;
  display_name: string;
  is_default?: boolean;
}

interface AdminFeatureSummary {
  id: string;
  name: string;
  description?: string;
  enabled: Record<string, boolean>;
  default_tenants: string[];
}

interface AdminFeatureMatrix {
  tenants: AdminTenantSummary[];
  features: AdminFeatureSummary[];
}

interface SetEnabledResponse {
  tenant: string;
  feature_id: string;
  enabled: boolean;
}

export default function FeatureMatrixPage() {
  const [data, setData] = useState<AdminFeatureMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 진행 중 (tenant, feature) 쌍 — UI 가 깜빡임 없이 토글 진행 표시.
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchWithAuth<AdminFeatureMatrix>('/api/v1/admin/feature-wiring/')
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '매트릭스 로드 실패');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 한 셀 토글. optimistic update 후 실패 시 rollback.
  const toggle = useCallback(async (tenantID: string, featureID: string, nextEnabled: boolean) => {
    const cellKey = `${tenantID}|${featureID}`;
    setPending((p) => new Set(p).add(cellKey));
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        features: prev.features.map((f) =>
          f.id === featureID ? { ...f, enabled: { ...f.enabled, [tenantID]: nextEnabled } } : f,
        ),
      };
    });
    try {
      await fetchWithAuth<SetEnabledResponse>(
        `/api/v1/admin/feature-wiring/${encodeURIComponent(tenantID)}/${encodeURIComponent(featureID)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: nextEnabled }),
        },
      );
    } catch (e) {
      // rollback — 서버 에러 시 직전 값 복원.
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          features: prev.features.map((f) =>
            f.id === featureID ? { ...f, enabled: { ...f.enabled, [tenantID]: !nextEnabled } } : f,
          ),
        };
      });
      setError(e instanceof Error ? e.message : '토글 실패');
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(cellKey);
        return next;
      });
    }
  }, []);

  // pack 일괄 토글 — 그 pack 의 모든 매핑된 feature 를 nextEnabled 로.
  const togglePack = useCallback(
    async (tenantID: string, featureIDs: string[], nextEnabled: boolean) => {
      // 순차 호출 — DB upsert 충돌 방지 (audit 순서 보존). 결과는 toggle 가 setData 에 반영.
      for (const fid of featureIDs) {
        // eslint-disable-next-line no-await-in-loop
        await toggle(tenantID, fid, nextEnabled);
      }
    },
    [toggle],
  );

  // pack 별로 features 분류.
  const packsWithFeatures = useMemo(() => {
    if (!data) return null;
    const byID = new Map(data.features.map((f) => [f.id, f]));
    const used = new Set<string>();
    const grouped = ALL_PACKS.map((pack) => {
      const ids = pack.navItems
        .map((i) => i.feature)
        .filter((f): f is string => Boolean(f));
      const features = ids
        .map((id) => byID.get(id))
        .filter((f): f is AdminFeatureSummary => Boolean(f));
      features.forEach((f) => {
        used.add(f.id);
      });
      return { pack, features };
    });
    const orphans = data.features.filter((f) => !used.has(f.id));
    return { grouped, orphans };
  }, [data]);

  if (error && !data) {
    return (
      <article className="m-6 rounded-lg border bg-card p-7">
        <p className="text-base text-red-600">{error}</p>
      </article>
    );
  }
  if (!data || !packsWithFeatures) {
    return (
      <article className="m-6 rounded-lg border bg-card p-7">
        <p className="text-base text-muted-foreground">불러오는 중…</p>
      </article>
    );
  }

  return (
    <div className="space-y-7 p-6">
      <article className="rounded-lg border bg-card p-7">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 rounded-md bg-muted p-3">
            <Layers className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">기능 매트릭스 (테넌트 × pack)</h1>
            <p className="mt-2 text-base text-muted-foreground leading-7">
              운영 중인 도메인별 기능 활성 상태입니다. 셀을 클릭하거나 pack 헤더의 켜기/끄기 버튼으로 토글할 수 있습니다. 변경 즉시 서버 캐시에 반영되고, 재시작 후에도 유지됩니다.
            </p>
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          </div>
        </div>
      </article>

      {packsWithFeatures.grouped.map(({ pack, features }) => (
        <PackSection
          key={pack.id}
          pack={pack}
          tenants={data.tenants}
          features={features}
          pending={pending}
          onToggle={toggle}
          onTogglePack={togglePack}
        />
      ))}

      {packsWithFeatures.orphans.length > 0 ? (
        <article className="rounded-lg border bg-card p-7">
          <header className="mb-4">
            <h2 className="text-lg font-semibold">기타 (pack 미매핑)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              sidebar 항목과 직접 묶이지 않는 카탈로그 feature 들 (예: 마스터, 계산엔진 프록시).
            </p>
          </header>
          <FeatureTable
            tenants={data.tenants}
            features={packsWithFeatures.orphans}
            pending={pending}
            onToggle={toggle}
          />
        </article>
      ) : null}
    </div>
  );
}

interface PackSectionProps {
  pack: Pack;
  tenants: AdminTenantSummary[];
  features: AdminFeatureSummary[];
  pending: Set<string>;
  onToggle: (tenantID: string, featureID: string, next: boolean) => Promise<void>;
  onTogglePack: (tenantID: string, featureIDs: string[], next: boolean) => Promise<void>;
}

function PackSection({ pack, tenants, features, pending, onToggle, onTogglePack }: PackSectionProps) {
  const featureIDs = features.map((f) => f.id);
  // 한 테넌트가 이 pack 의 모든 feature 를 켰는지 / 일부만인지 / 모두 끔.
  const tenantState = (tenantID: string): 'all' | 'partial' | 'none' => {
    const enabledCount = features.reduce((n, f) => n + (f.enabled[tenantID] ? 1 : 0), 0);
    if (enabledCount === features.length) return 'all';
    if (enabledCount === 0) return 'none';
    return 'partial';
  };

  return (
    <article className="rounded-lg border bg-card p-7">
      <header className="mb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold">{pack.label}</h2>
          <code className="text-sm text-muted-foreground">{pack.id}</code>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{pack.description}</p>
        {features.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>일괄:</span>
            {tenants.map((t) => {
              const state = tenantState(t.id);
              return (
                <div key={t.id} className="flex items-center gap-1 rounded border bg-background px-2 py-1">
                  <span className="font-medium">{t.id}</span>
                  <button
                    type="button"
                    onClick={() => onTogglePack(t.id, featureIDs, true)}
                    disabled={state === 'all'}
                    className="rounded px-1.5 py-0.5 text-green-700 enabled:hover:bg-green-50 disabled:opacity-30"
                    title="모두 켜기"
                  >
                    모두 ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => onTogglePack(t.id, featureIDs, false)}
                    disabled={state === 'none'}
                    className="rounded px-1.5 py-0.5 text-muted-foreground enabled:hover:bg-muted disabled:opacity-30"
                    title="모두 끄기"
                  >
                    모두 —
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </header>
      {features.length === 0 ? (
        <p className="text-sm text-muted-foreground">이 pack 에 매핑된 카탈로그 feature 가 없습니다.</p>
      ) : (
        <FeatureTable tenants={tenants} features={features} pending={pending} onToggle={onToggle} />
      )}
    </article>
  );
}

interface FeatureTableProps {
  tenants: AdminTenantSummary[];
  features: AdminFeatureSummary[];
  pending: Set<string>;
  onToggle: (tenantID: string, featureID: string, next: boolean) => Promise<void>;
}

function FeatureTable({ tenants, features, pending, onToggle }: FeatureTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">Feature</th>
            {tenants.map((t) => (
              <th key={t.id} className="px-3 py-2 text-center font-medium">
                {t.display_name}
                <div className="text-[11px] font-normal text-muted-foreground">{t.id}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {features.map((f) => (
            <tr key={f.id} className="border-b last:border-b-0">
              <td className="px-3 py-2">
                <div className="font-medium">{f.name}</div>
                <code className="text-[11px] text-muted-foreground">{f.id}</code>
              </td>
              {tenants.map((t) => {
                const cellKey = `${t.id}|${f.id}`;
                const isPending = pending.has(cellKey);
                const enabled = Boolean(f.enabled[t.id]);
                return (
                  <td key={t.id} className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => onToggle(t.id, f.id, !enabled)}
                      disabled={isPending}
                      className={
                        'inline-flex h-7 w-9 items-center justify-center rounded border text-base transition ' +
                        (enabled
                          ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                          : 'border-border text-muted-foreground hover:bg-muted') +
                        (isPending ? ' opacity-50' : '')
                      }
                      aria-label={`${f.id} ${t.id} ${enabled ? '끄기' : '켜기'}`}
                    >
                      {enabled ? '✓' : '—'}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
