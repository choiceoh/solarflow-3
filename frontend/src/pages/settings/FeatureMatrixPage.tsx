// 기능 매트릭스 (admin 전용, PR-5a) — 테넌트 × pack/feature 활성 상태 read-only.
//
// 데이터 흐름:
//   - 백엔드 GET /api/v1/admin/feature-wiring/ 응답: tenants + features (각 셀 enabled 맵)
//   - frontend ALL_PACKS (PR-4) 의 navItems 에서 feature id 추출 → pack 별로 features 묶음
//   - 표는 pack 섹션마다 테넌트 열 + feature 행 + 셀 = 활성 여부
//
// 토글은 PR-5b 후속에서 추가 예정. 현재는 운영자가 "어느 도메인이 무엇을 켰는지"
// 한 화면에서 확인하는 수단.
import { useEffect, useMemo, useState } from 'react';
import { Layers } from 'lucide-react';

import { fetchWithAuth } from '@/lib/api';
import { ALL_PACKS } from '@/lib/navigation/packs';

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

export default function FeatureMatrixPage() {
  const [data, setData] = useState<AdminFeatureMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // pack 별로 feature 들을 분류. ALL_PACKS 의 navItems 중 feature 매핑이 있는 항목만 사용.
  const packsWithFeatures = useMemo(() => {
    if (!data) return [];
    const byID = new Map(data.features.map((f) => [f.id, f]));
    const used = new Set<string>();
    const grouped = ALL_PACKS.map((pack) => {
      const ids = pack.navItems
        .map((i) => i.feature)
        .filter((f): f is string => Boolean(f));
      const features = ids
        .map((id) => byID.get(id))
        .filter((f): f is AdminFeatureSummary => Boolean(f));
      features.forEach((f) => used.add(f.id));
      return { pack, features };
    });
    // pack 매핑이 없는 잔여 features (예: master.* 같은 sidebar 외 카탈로그 항목)
    const orphans = data.features.filter((f) => !used.has(f.id));
    return { grouped, orphans };
  }, [data]);

  if (error) {
    return (
      <article className="m-6 rounded-lg border bg-card p-7">
        <p className="text-base text-red-600">{error}</p>
      </article>
    );
  }
  if (!data) {
    return (
      <article className="m-6 rounded-lg border bg-card p-7">
        <p className="text-base text-muted-foreground">불러오는 중…</p>
      </article>
    );
  }

  const { grouped, orphans } = packsWithFeatures as {
    grouped: { pack: (typeof ALL_PACKS)[number]; features: AdminFeatureSummary[] }[];
    orphans: AdminFeatureSummary[];
  };

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
              운영 중인 도메인별 기능 활성 상태입니다. pack 단위로 묶여 있고, 각 셀은 카탈로그 default + DB override 가 합쳐진 결과입니다. 토글 편집은 후속 PR 예정 — 현재는 read-only.
            </p>
          </div>
        </div>
      </article>

      {grouped.map(({ pack, features }) => (
        <article key={pack.id} className="rounded-lg border bg-card p-7">
          <header className="mb-4">
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-semibold">{pack.label}</h2>
              <code className="text-sm text-muted-foreground">{pack.id}</code>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{pack.description}</p>
          </header>
          {features.length === 0 ? (
            <p className="text-sm text-muted-foreground">이 pack 에 매핑된 카탈로그 feature 가 없습니다.</p>
          ) : (
            <FeatureTable tenants={data.tenants} features={features} />
          )}
        </article>
      ))}

      {orphans.length > 0 ? (
        <article className="rounded-lg border bg-card p-7">
          <header className="mb-4">
            <h2 className="text-lg font-semibold">기타 (pack 미매핑)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              sidebar 항목과 직접 묶이지 않는 카탈로그 feature 들 (예: 마스터, 계산엔진 프록시).
            </p>
          </header>
          <FeatureTable tenants={data.tenants} features={orphans} />
        </article>
      ) : null}
    </div>
  );
}

interface FeatureTableProps {
  tenants: AdminTenantSummary[];
  features: AdminFeatureSummary[];
}

function FeatureTable({ tenants, features }: FeatureTableProps) {
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
              {tenants.map((t) => (
                <td key={t.id} className="px-3 py-2 text-center">
                  {f.enabled[t.id] ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
