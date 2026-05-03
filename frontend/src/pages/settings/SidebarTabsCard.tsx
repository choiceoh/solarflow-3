// D-112: 사이트 설정 > 사이드바 탭 카드 — admin이 테넌트별 탭(persona) 정의를 편집한다.
// 탭이 0개면 사이드바에 탭 row 자체가 비활성. "전체" 탭(menus='all')은 신규 메뉴 자동 노출 안전망.
import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, Trash2, Plus } from 'lucide-react';
import { detectTenantScope } from '@/lib/tenantScope';
import { listAllMenusForTenant } from '@/components/layout/CommandShell';
import { useSidebarTabs, type SidebarTab, type SidebarTabsConfig } from '@/hooks/useSidebarTabs';

function emptyConfig(): SidebarTabsConfig {
  return { default_tab: '', tabs: [] };
}

function makeKey(prefix: string, existing: SidebarTab[]): string {
  let i = 1;
  const used = new Set(existing.map((t) => t.key));
  while (used.has(`${prefix}${i}`)) i += 1;
  return `${prefix}${i}`;
}

export default function SidebarTabsCard() {
  const tenant = detectTenantScope();
  const { config, loading, save } = useSidebarTabs(tenant);
  const [draft, setDraft] = useState<SidebarTabsConfig>(emptyConfig);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(config ?? emptyConfig());
  }, [config]);

  const allMenus = useMemo(() => listAllMenusForTenant(tenant), [tenant]);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(config ?? emptyConfig());

  // 분류되지 않은 메뉴 = "all" 탭이 없는 경우만 의미. all 탭이 있으면 자동 노출되므로 표시 불필요.
  const hasAllTab = draft.tabs.some((t) => t.menus === 'all');
  const classifiedKeys = new Set<string>(
    draft.tabs.flatMap((t) => (t.menus === 'all' ? [] : t.menus)),
  );
  const unclassified = hasAllTab ? [] : allMenus.filter((m) => !classifiedKeys.has(m.key));

  const updateTab = (idx: number, patch: Partial<SidebarTab>) => {
    setDraft((d) => ({ ...d, tabs: d.tabs.map((t, i) => (i === idx ? { ...t, ...patch } : t)) }));
  };
  const removeTab = (idx: number) => {
    setDraft((d) => {
      const tabs = d.tabs.filter((_, i) => i !== idx);
      const default_tab = tabs.some((t) => t.key === d.default_tab) ? d.default_tab : (tabs[0]?.key ?? '');
      return { tabs, default_tab };
    });
  };
  const addTab = (allMenusFlag: boolean) => {
    setDraft((d) => {
      const newTab: SidebarTab = allMenusFlag
        ? { key: 'general', label: '전체', menus: 'all' }
        : { key: makeKey('tab', d.tabs), label: '새 탭', menus: [] };
      const tabs = [...d.tabs, newTab];
      const default_tab = d.default_tab || newTab.key;
      return { tabs, default_tab };
    });
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await save(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-muted p-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">사이드바 탭 ({tenant})</h2>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${draft.tabs.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
              {draft.tabs.length > 0 ? '활성' : '비활성'}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-5">
            업무 담당별 사이드바 — 탭을 추가하면 사용자가 자기 업무에 맞는 메뉴만 볼 수 있습니다. "전체" 탭(메뉴 자동 포함)을 두면 신규 메뉴가 자동 노출되어 안전합니다. 변경은 모든 사용자에게 즉시 반영.
          </p>

          {loading ? (
            <p className="mt-3 rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground">불러오는 중…</p>
          ) : draft.tabs.length === 0 ? (
            <p className="mt-3 rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              탭이 없습니다. 아래에서 추가하면 사이드바에 노출됩니다.
            </p>
          ) : (
            <ul className="mt-3 divide-y rounded border">
              {draft.tabs.map((tab, idx) => {
                const isAll = tab.menus === 'all';
                return (
                  <li key={idx} className="space-y-2 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title="기본 탭(신규 사용자가 처음 보는 탭)">
                        <input
                          type="radio"
                          name="default_tab"
                          checked={draft.default_tab === tab.key}
                          onChange={() => setDraft((d) => ({ ...d, default_tab: tab.key }))}
                        />
                        기본
                      </label>
                      <input
                        className="flex-1 rounded border px-2 py-1 text-sm"
                        value={tab.label}
                        onChange={(e) => updateTab(idx, { label: e.target.value })}
                        placeholder="라벨 (예: 수입)"
                      />
                      <input
                        className="w-32 rounded border px-2 py-1 text-xs font-mono text-muted-foreground"
                        value={tab.key}
                        onChange={(e) => updateTab(idx, { key: e.target.value.replace(/\s+/g, '_') })}
                        placeholder="key"
                      />
                      <button
                        type="button"
                        onClick={() => removeTab(idx)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                        title="이 탭 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {isAll ? (
                      <p className="text-[11px] text-muted-foreground">
                        ✓ 모든 메뉴 자동 포함 (신규 메뉴도 즉시 노출)
                      </p>
                    ) : (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          메뉴 선택 ({tab.menus.length}/{allMenus.length})
                        </summary>
                        <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
                          {allMenus.map((m) => {
                            const checked = tab.menus.includes(m.key);
                            return (
                              <label key={m.key} className="flex items-center gap-1.5 text-[11px]">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...(tab.menus as string[]), m.key]
                                      : (tab.menus as string[]).filter((k) => k !== m.key);
                                    updateTab(idx, { menus: next });
                                  }}
                                />
                                {m.label}
                              </label>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => addTab(false)}
              className="inline-flex items-center gap-1 rounded border bg-white px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              <Plus className="h-3 w-3" /> 일반 탭
            </button>
            <button
              type="button"
              onClick={() => addTab(true)}
              disabled={hasAllTab}
              className="inline-flex items-center gap-1 rounded border bg-white px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              title={hasAllTab ? '"전체" 탭은 한 개만' : '모든 메뉴를 자동 포함하는 안전망 탭'}
            >
              <Plus className="h-3 w-3" /> "전체" 탭
            </button>
            <span className="flex-1" />
            <button
              type="button"
              onClick={onSave}
              disabled={!isDirty || saving}
              className="rounded bg-foreground px-3 py-1 text-xs font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>

          {unclassified.length > 0 ? (
            <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              분류되지 않은 메뉴 {unclassified.length}개: {unclassified.map((m) => m.label).join(', ')}
              {' '}— "전체" 탭을 추가하거나 다른 탭에 분류하세요.
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
