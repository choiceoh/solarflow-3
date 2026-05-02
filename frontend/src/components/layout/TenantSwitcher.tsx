// Phase 4 PoC: 사이드바 tenant 인디케이터 + 드롭다운 전환
// CompanySelector 와 같은 시각 패턴, 비기본 tenant 일 때 색 강조.

import { useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useTenantStore, TENANT_LABELS, type TenantId } from '@/stores/tenantStore';

const TENANT_IDS: TenantId[] = ['topworks', 'topenergy'];

export default function TenantSwitcher() {
  const tenantId = useTenantStore((s) => s.tenantId);
  const setTenantId = useTenantStore((s) => s.setTenantId);

  // 양방향 URL 동기화: tenantId 변경 → URL ?tenant=... 갱신 (history.replaceState)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get('tenant');
    if (tenantId === 'topworks') {
      // 기본 tenant 면 URL 에서 ?tenant 제거 (깔끔)
      if (current) {
        url.searchParams.delete('tenant');
        window.history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '') + url.hash);
      }
    } else if (current !== tenantId) {
      url.searchParams.set('tenant', tenantId);
      window.history.replaceState(null, '', url.pathname + `?${url.searchParams}` + url.hash);
    }
  }, [tenantId]);

  // popstate (브라우저 뒤로가기/앞으로가기) — URL 의 tenant 와 store 동기화
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      const url = new URL(window.location.href);
      const fromUrl = url.searchParams.get('tenant');
      const next: TenantId = fromUrl === 'topenergy' ? 'topenergy' : 'topworks';
      if (next !== useTenantStore.getState().tenantId) setTenantId(next);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [setTenantId]);

  const isCustom = tenantId !== 'topworks';
  return (
    <div className="sf-company-switcher" style={{ marginTop: 8 }}>
      <div className="sf-eyebrow mb-1.5 flex items-center gap-1.5 text-[var(--sf-dark-ink-3)]">
        <span>TENANT</span>
        {isCustom ? (
          <span className="rounded px-1 py-0.5 text-[8px] font-semibold bg-amber-300 text-amber-900">PoC</span>
        ) : null}
      </div>
      <Select value={tenantId} onValueChange={(v) => setTenantId(v as TenantId)}>
        <SelectTrigger>
          <span className="truncate text-left">{TENANT_LABELS[tenantId]}</span>
        </SelectTrigger>
        <SelectContent>
          {TENANT_IDS.map((id) => (
            <SelectItem key={id} value={id}>{TENANT_LABELS[id]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
