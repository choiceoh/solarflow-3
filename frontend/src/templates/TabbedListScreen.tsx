// Phase 1+1.5 PoC: 탭 묶음 리스트 화면
// 여러 ListScreen을 탭으로 묶고 KPI 메트릭/Rail은 공통(상단)으로 공유.
// 행 액션·편집·헤더 액션·confirm은 ListScreen과 동일한 helpers 재사용.

import { useState, type ReactNode } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/appStore';
import { MasterConsole, type MasterConsoleMetric } from '@/components/command/MasterConsole';
import { FilterChips } from '@/components/command/MockupPrimitives';
import type { TabbedListConfig } from './types';
import {
  buildMetric, useTabState, ToolbarBar, TableArea,
  usePageActions, makeRowActionHandler, FormsMounted, ConfirmDialogMounted, HeaderActions,
} from './ListScreen';
import { railBlocks, contentBlocks, detailComponents } from './registry';
import { useResolvedConfig } from './configOverride';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useColumnPinning } from '@/lib/columnPinning';

export default function TabbedListScreen({ config: defaultConfig }: { config: TabbedListConfig }) {
  // Phase 3: localStorage override 우선
  const config = useResolvedConfig(defaultConfig, 'screen');
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [activeKey, setActiveKey] = useState(config.tabs[0]?.key ?? '');
  const [selected, setSelected] = useState<{ tabKey: string; id: string } | null>(null);
  const pageActions = usePageActions();

  // 모든 탭의 상태를 동시에 유지 (메트릭이 비활성 탭 데이터도 사용할 수 있게)
  // config.tabs는 컴포넌트 인스턴스 수명 동안 길이가 변하지 않는다는 전제로 hook을 map 안에서 호출.
  // 길이가 변하면 React state가 깨지므로 향후 per-tab 컴포넌트 분리로 리팩터 예정.
  // useColumnVisibility 도 같은 전제 하에 탭마다 호출.
  // biome-ignore lint/correctness/useHookAtTopLevel: 위 전제 하에 의도된 사용
  const tabStates = config.tabs.map((t) => ({
    tab: t,
    state: useTabState(t.list),
    vis: useColumnVisibility(t.list.id, t.list.columns),
    pin: useColumnPinning(t.list.id),
  }));
  const activeTabIdx = config.tabs.findIndex((t) => t.key === activeKey);
  const active = tabStates[activeTabIdx] ?? tabStates[0];

  // 활성 탭 기준 — 법인 가드 (활성 탭 list의 requiresCompany 적용)
  const activeRequiresCompany = active.tab.list.requiresCompany ?? true;
  if (activeRequiresCompany && !selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p>
      </div>
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
        <div className="p-6">
          <Detail
            id={selected.id}
            onBack={() => { setSelected(null); tabState.state.reload(); }}
          />
        </div>
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
