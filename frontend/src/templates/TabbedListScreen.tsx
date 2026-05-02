// Phase 1+1.5 PoC: 탭 묶음 리스트 화면
// 여러 ListScreen을 탭으로 묶고 KPI 메트릭/Rail은 공통(상단)으로 공유.
// 행 액션·편집·헤더 액션·confirm은 ListScreen과 동일한 helpers 재사용.

import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/appStore';
import { MasterConsole, type MasterConsoleMetric } from '@/components/command/MasterConsole';
import { FilterChips } from '@/components/command/MockupPrimitives';
import type { ListScreenConfig, TabbedListConfig } from './types';
import {
  buildMetric, useTabState, type TabState, ToolbarBar, TableArea,
  usePageActions, makeRowActionHandler, FormsMounted, ConfirmDialogMounted, HeaderActions,
} from './ListScreen';
import { railBlocks, contentBlocks, detailComponents } from './registry';
import { useResolvedConfig } from './configOverride';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useColumnPinning } from '@/lib/columnPinning';

type VisState = ReturnType<typeof useColumnVisibility>;
type PinState = ReturnType<typeof useColumnPinning>;
type TabSlot = { state: TabState; vis: VisState; pin: PinState };

// bridge가 첫 publish 하기 전(첫 paint) 사용할 placeholder.
// useTabState 자체도 fetch 동안 loading=true / data=[] 로 시작하므로 시각적으로 동일.
const EMPTY_PINNING = { left: [] as string[], right: [] as string[] };
const PLACEHOLDER_SLOT: TabSlot = {
  state: {
    filters: {},
    setFilters: () => {},
    filterOptions: {},
    data: [],
    loading: true,
    reload: () => {},
    metrics: [],
  },
  vis: {
    hidden: new Set(),
    setHidden: () => {},
  },
  pin: {
    pinning: EMPTY_PINNING,
    setPinning: () => {},
    pinLeft: () => {},
    pinRight: () => {},
    unpin: () => {},
    getPinSide: () => undefined,
    EMPTY: EMPTY_PINNING,
  },
};

// 각 탭의 useTabState / useColumnVisibility / useColumnPinning을 top-level에서 호출하고 부모로 lifting.
// key={tabKey}로 인스턴스가 유지되므로 hook 내부 state(필터/데이터/숨김컬럼/고정컬럼)는 탭 lifecycle 동안 보존된다.
// memo로 부모 재렌더(activeKey 변경 등) 시 불필요한 fan-out 재렌더 차단 — props(tabKey/list/onSlot) 전부 stable ref.
const TabStateBridge = memo(function TabStateBridge({
  tabKey,
  list,
  onSlot,
}: {
  tabKey: string;
  list: ListScreenConfig;
  onSlot: (key: string, slot: TabSlot) => void;
}) {
  const state = useTabState(list);
  const vis = useColumnVisibility(list.id, list.columns);
  const pin = useColumnPinning(list.id);
  useEffect(() => {
    onSlot(tabKey, { state, vis, pin });
  }, [tabKey, state, vis, pin, onSlot]);
  return null;
});

export default function TabbedListScreen({ config: defaultConfig }: { config: TabbedListConfig }) {
  // Phase 3: localStorage override 우선
  const config = useResolvedConfig(defaultConfig, 'screen');
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [activeKey, setActiveKey] = useState(config.tabs[0]?.key ?? '');
  const [selected, setSelected] = useState<{ tabKey: string; id: string } | null>(null);
  const [slotByKey, setSlotByKey] = useState<Record<string, TabSlot>>({});
  const pageActions = usePageActions();

  // bridge가 publish할 때 의미있는 필드만 비교해 stateMap 갱신.
  // hook들은 매 렌더 새 wrapping object를 반환하므로 객체 ref 비교로 setState하면 무한 렌더 → 필드 비교로 차단.
  // state.reload는 매 렌더 새 closure지만 동일한 setTick을 호출 → stale ref여도 동작 동일 → 비교 제외.
  // pin의 derived helpers(pinLeft/pinRight/unpin/getPinSide)도 pinning에 의존하므로 pinning 비교만으로 충분.
  const handleSlotUpdate = useCallback((key: string, next: TabSlot) => {
    setSlotByKey((prev) => {
      const cur = prev[key];
      if (
        cur
        && cur.state.data === next.state.data
        && cur.state.loading === next.state.loading
        && cur.state.filters === next.state.filters
        && cur.state.filterOptions === next.state.filterOptions
        && cur.state.setFilters === next.state.setFilters
        && cur.state.metrics === next.state.metrics
        && cur.vis.hidden === next.vis.hidden
        && cur.vis.setHidden === next.vis.setHidden
        && cur.pin.pinning === next.pin.pinning
        && cur.pin.setPinning === next.pin.setPinning
      ) {
        return prev;
      }
      return { ...prev, [key]: next };
    });
  }, []);

  // 모든 탭의 상태를 동시에 유지 (메트릭이 비활성 탭 데이터도 사용할 수 있게)
  const tabStates = config.tabs.map((t) => {
    const slot = slotByKey[t.key] ?? PLACEHOLDER_SLOT;
    return { tab: t, state: slot.state, vis: slot.vis, pin: slot.pin };
  });
  const activeTabIdx = config.tabs.findIndex((t) => t.key === activeKey);
  const active = tabStates[activeTabIdx] ?? tabStates[0];

  // bridges는 어떤 분기를 타든 항상 마운트되어야 탭 state가 보존된다.
  const bridges = (
    <>
      {config.tabs.map((t) => (
        <TabStateBridge key={t.key} tabKey={t.key} list={t.list} onSlot={handleSlotUpdate} />
      ))}
    </>
  );

  // 활성 탭 기준 — 법인 가드 (활성 탭 list의 requiresCompany 적용)
  const activeRequiresCompany = active.tab.list.requiresCompany ?? true;
  if (activeRequiresCompany && !selectedCompanyId) {
    return (
      <>
        {bridges}
        <div className="flex items-center justify-center p-12">
          <p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p>
        </div>
      </>
    );
  }

  // 상세 화면 swap
  if (selected) {
    const tabIdx = config.tabs.findIndex((t) => t.key === selected.tabKey);
    const tabState = tabStates[tabIdx];
    const onRowClick = tabState.tab.list.onRowClick;
    if (onRowClick?.kind === 'detail') {
      const Detail = detailComponents[onRowClick.detailId];
      if (!Detail) throw new Error(`[TabbedListScreen] detail not registered: ${onRowClick.detailId}`);
      return (
        <>
          {bridges}
          <div className="p-6">
            <Detail
              id={selected.id}
              onBack={() => { setSelected(null); tabState.state.reload(); }}
            />
          </div>
        </>
      );
    }
  }

  // 공통 메트릭 (각 메트릭이 어느 탭의 데이터를 쓸지는 sourceTabKey로 명시)
  const metrics: MasterConsoleMetric[] = (config.metrics ?? []).map((m) => {
    const src = tabStates.find((t) => t.tab.key === m.sourceTabKey);
    if (!src) return { label: m.label, value: '' };
    return buildMetric(m, src.state.data, src.state.filters, src.tab.list.filters, src.state.filterOptions);
  });

  // 공통 Rail
  const rail: ReactNode | undefined = config.rail?.length ? (
    <>
      {config.rail.map((b, idx) => {
        const Block = railBlocks[b.blockId];
        if (!Block) return null;
        const src = b.sourceTabKey
          ? tabStates.find((t) => t.tab.key === b.sourceTabKey)
          : active;
        if (!src) return null;
        return <Block key={idx} items={src.state.data} filters={src.state.filters} config={(b.props ?? {}) as Record<string, unknown>} />;
      })}
    </>
  ) : undefined;

  const activeTotalCount = active.state.data.length.toLocaleString();
  const tableTitle = active.tab.label;

  // 활성 탭의 헤더 액션 (탭 전환 시 따라감)
  const activeHeaderActions = active.tab.list.actions?.filter((a) => a.trigger === 'header') ?? [];

  return (
    <>
    {bridges}
    <MasterConsole
      eyebrow={config.page.eyebrow}
      title={config.page.title}
      description={config.page.description}
      tableTitle={tableTitle}
      tableSub={`${activeTotalCount}건`}
      actions={activeHeaderActions.length > 0
        ? <HeaderActions actions={activeHeaderActions} openForm={(id) => pageActions.openForm(id)} />
        : undefined}
      metrics={metrics}
      toolbar={
        <div className="sf-card-controls" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}>
          <ToolbarBar
            list={active.tab.list}
            state={active.state}
            searchQuery=""
            setSearchQuery={() => {}}
            openForm={(id) => pageActions.openForm(id)}
          />
          <div style={{ flex: 1 }} />
          <FilterChips
            options={config.tabs.map((t, idx) => ({
              key: t.key,
              label: t.label,
              count: tabStates[idx].state.data.length,
            }))}
            value={activeKey}
            onChange={setActiveKey}
          />
        </div>
      }
      rail={rail}
    >
      <Tabs value={activeKey} onValueChange={setActiveKey}>
        {config.tabs.map((t, idx) => {
          const ts = tabStates[idx];
          const above = t.aboveTable ? contentBlocks[t.aboveTable.blockId] : null;
          return (
            <TabsContent key={t.key} value={t.key} className="space-y-4 mt-4">
              {above ? above({ items: ts.state.data, config: t.aboveTable!.props ?? {} }) : null}
              <TableArea
                list={t.list}
                state={ts.state}
                displayItems={ts.state.data}
                setFormOpenId={(id) => { if (id) pageActions.openForm(id); }}
                onRowAction={makeRowActionHandler(pageActions, ts.state.reload)}
                onRowSelect={(id) => setSelected({ tabKey: t.key, id })}
                hidden={ts.vis.hidden}
                pinning={ts.pin.pinning}
                onPinningChange={ts.pin.setPinning}
              />
            </TabsContent>
          );
        })}
      </Tabs>
    </MasterConsole>

    {/* 모든 탭의 폼을 외부에 마운트 (각 탭의 reload에 바인드) */}
    {tabStates.map((ts) => (
      ts.tab.list.forms
        ? <FormsMounted key={ts.tab.key} forms={ts.tab.list.forms} reload={ts.state.reload} actions={pageActions} />
        : null
    ))}
    <ConfirmDialogMounted actions={pageActions} />
    </>
  );
}
