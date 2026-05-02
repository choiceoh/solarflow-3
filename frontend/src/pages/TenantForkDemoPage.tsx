// Phase 4 PoC: 계열사 포크 시뮬레이션 데모 페이지
// 같은 코드 베이스에서 tenant 별 config override 만으로 다른 도메인 라벨/컬럼/필드를 표현.
// '탑웍스(기본)' / '탑에너지(계열사 PoC)' 토글하면서 v2 마스터 페이지 확인.

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useTenantStore, TENANT_LABELS, type TenantId } from '@/stores/tenantStore';

const V2_ROUTES: Array<{ path: string; label: string; tenantOverride?: boolean }> = [
  { path: '/masters/companies-v2', label: '법인 → 계열사 마스터', tenantOverride: true },
  { path: '/masters/banks-v2', label: '은행 → 계열사 은행', tenantOverride: true },
  { path: '/masters/construction-sites-v2', label: '발전소 → 에너지 자산', tenantOverride: true },
  { path: '/masters/partners-v2', label: '거래처 (오버레이 없음)', tenantOverride: false },
  { path: '/masters/products-v2', label: '품번 (오버레이 없음)', tenantOverride: false },
];

export default function TenantForkDemoPage() {
  const { tenantId, setTenantId } = useTenantStore();

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <h1 className="text-base font-semibold mb-2">PoC · 계열사 포크 시뮬레이션</h1>
        <p>
          메타 인프라 (Phase 4 누적 14 PR)로 만든 v2 마스터 페이지에 <b>tenant override</b> 레이어를 얹어,
          같은 코드 베이스로 다른 계열사의 도메인 라벨/컬럼/메트릭을 표현할 수 있는지 검증합니다.
        </p>
        <ul className="mt-2 list-disc pl-5 space-y-0.5 text-xs">
          <li><code>config/tenants/topenergy.ts</code> — 탑에너지 계열사용 오버레이 (제목·컬럼·폼 제목 변경)</li>
          <li><code>stores/tenantStore.ts</code> — URL <code>?tenant=topenergy</code> 또는 localStorage 로 전환</li>
          <li><code>applyTenantToScreen / applyTenantToForm</code> — base config 에 shallow merge (page/title 만 deep, 배열은 교체)</li>
          <li>운영 흐름: <code>useResolvedConfig</code> 가 tenant 적용된 base 위에 DB override 를 한 층 더 얹음</li>
        </ul>
      </div>

      <section className="rounded-md border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">현재 tenant</h2>
        <div className="flex items-center gap-3">
          <span className="rounded-full px-3 py-1 text-xs font-medium border border-amber-300 bg-amber-50 text-amber-900">
            {TENANT_LABELS[tenantId]}
          </span>
          <div className="flex gap-2">
            {(Object.keys(TENANT_LABELS) as TenantId[]).map((id) => (
              <Button
                key={id}
                size="sm"
                variant={tenantId === id ? 'default' : 'outline'}
                onClick={() => setTenantId(id)}
              >
                {TENANT_LABELS[id]}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          전환 즉시 모든 v2 화면/폼이 해당 tenant 의 라벨/컬럼으로 재렌더링됩니다.
          localStorage 에 저장되어 새로고침 후에도 유지.
        </p>
      </section>

      <section className="rounded-md border bg-card p-5 space-y-2">
        <h2 className="text-sm font-semibold">v2 마스터 페이지 (탭에서 열어 비교)</h2>
        <ul className="space-y-1 text-sm">
          {V2_ROUTES.map((r) => (
            <li key={r.path} className="flex items-center gap-2">
              <Link to={r.path} className="text-blue-600 hover:underline font-mono">{r.path}</Link>
              <span className="text-muted-foreground">— {r.label}</span>
              {r.tenantOverride ? (
                <span className="rounded px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-700">override 있음</span>
              ) : (
                <span className="rounded px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600">override 없음</span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground mt-3">
          override 가 있는 페이지는 tenant 전환 시 제목·컬럼·폼 제목이 즉시 바뀝니다.
          없는 페이지는 base config 그대로 표시 (안전하게 기본값 사용).
        </p>
      </section>

      <section className="rounded-md border bg-card p-5 space-y-2">
        <h2 className="text-sm font-semibold">topenergy 오버레이 내용</h2>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground border-b">
            <tr>
              <th className="text-left py-1.5 pr-3 font-medium">대상</th>
              <th className="text-left py-1.5 pr-3 font-medium">기본 (탑웍스)</th>
              <th className="text-left py-1.5 font-medium">탑에너지 오버레이</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/40">
              <td className="py-1.5 pr-3 font-mono text-[11px]">screens.companies.page.title</td>
              <td className="py-1.5 pr-3">법인 관리</td>
              <td className="py-1.5">계열사 관리</td>
            </tr>
            <tr className="border-b border-border/40">
              <td className="py-1.5 pr-3 font-mono text-[11px]">screens.companies.columns</td>
              <td className="py-1.5 pr-3">법인명 / 법인코드</td>
              <td className="py-1.5">계열사명 / 계열코드</td>
            </tr>
            <tr className="border-b border-border/40">
              <td className="py-1.5 pr-3 font-mono text-[11px]">screens.banks.page.title</td>
              <td className="py-1.5 pr-3">은행 관리</td>
              <td className="py-1.5">계열사 은행 관리</td>
            </tr>
            <tr className="border-b border-border/40">
              <td className="py-1.5 pr-3 font-mono text-[11px]">screens.construction_sites.page.title</td>
              <td className="py-1.5 pr-3">발전소 관리</td>
              <td className="py-1.5">에너지 자산 관리</td>
            </tr>
            <tr className="border-b border-border/40">
              <td className="py-1.5 pr-3 font-mono text-[11px]">forms.company_form_v2.title.create</td>
              <td className="py-1.5 pr-3">법인 등록</td>
              <td className="py-1.5">계열사 등록</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3 font-mono text-[11px]">forms.construction_site_form_v2.title.create</td>
              <td className="py-1.5 pr-3">새 현장 등록</td>
              <td className="py-1.5">에너지 자산 등록</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
