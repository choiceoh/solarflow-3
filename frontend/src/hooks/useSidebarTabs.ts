// D-112: 사이드바 탭(persona) 정의 — admin이 system_settings에서 자유 정의.
// key: sidebar_tabs.{tenant} — 테넌트별로 독립 (module/cable/BARO가 다른 탭 구성 가능).
// key 자체 미존재 또는 enabled 의미 ⇒ 탭 UI 비활성, 사이드바는 기존 동작 그대로.
import { useCallback, useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';
import type { TenantScope } from '@/lib/tenantScope';

export interface SidebarTab {
  key: string;
  label: string;
  /** 메뉴 key 배열 또는 "all" (= NAV_GROUPS 평탄화 결과 전부 — 신규 메뉴 자동 노출 안전망) */
  menus: string[] | 'all';
}

export interface SidebarTabsConfig {
  default_tab: string;
  tabs: SidebarTab[];
}

function tabsKey(tenant: TenantScope): string {
  return `sidebar_tabs.${tenant}`;
}

export function useSidebarTabs(tenant: TenantScope) {
  const [config, setConfig] = useState<SidebarTabsConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth<SidebarTabsConfig | null>(`/api/v1/system-settings/${tabsKey(tenant)}`);
      if (res && Array.isArray(res.tabs) && res.tabs.length > 0) {
        setConfig(res);
      } else {
        setConfig(null);
      }
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (next: SidebarTabsConfig) => {
      await fetchWithAuth(`/api/v1/system-settings/${tabsKey(tenant)}`, {
        method: 'PUT',
        body: JSON.stringify(next),
      });
      setConfig(next);
    },
    [tenant],
  );

  return { config, loading, refresh, save };
}
