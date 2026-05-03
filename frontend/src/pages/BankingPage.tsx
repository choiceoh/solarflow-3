import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/appStore';
import { useAllBankLimitGroups, useLCMaturityAlert, useLimitChangeList } from '@/hooks/useBanking';
import { fetchWithAuth } from '@/lib/api';
import SkeletonRows from '@/components/common/SkeletonRows';
import BankLimitTable from '@/components/banking/BankLimitTable';
import LCMaturityTable from '@/components/banking/LCMaturityTable';
import LimitChangeTable from '@/components/banking/LimitChangeTable';
import LimitChangeForm from '@/components/banking/LimitChangeForm';
import LCDemandForecast from '@/components/banking/LCDemandForecast';
import { formatUSD } from '@/lib/utils';
import { CardB, CommandTopLine, FilterChips, RailBlock, Sparkline, TileB } from '@/components/command/MockupPrimitives';
import { flatSpark } from '@/templates/sparkUtils';

const BANKING_TAB_OPTIONS = [
  { key: 'limits', label: '한도 현황' },
  { key: 'maturity', label: '만기 알림' },
  { key: 'changes', label: '변경 이력' },
  { key: 'demand', label: '수요 예측' },
];
const BANKING_TABS = new Set(BANKING_TAB_OPTIONS.map((tab) => tab.key));

function getBankingTab(search: string) {
  const tab = new URLSearchParams(search).get('tab') ?? 'limits';
  return BANKING_TABS.has(tab) ? tab : 'limits';
}

function fmtUsdM(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0.00';
  return (value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2);
}

export default function BankingPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => getBankingTab(location.search));

  useEffect(() => {
    setActiveTab(getBankingTab(location.search));
  }, [location.search]);

  const handleTabChange = (tab: string) => {
    const nextTab = BANKING_TABS.has(tab) ? tab : 'limits';
    setActiveTab(nextTab);
    const params = new URLSearchParams(location.search);
    params.delete('alert');
    if (nextTab === 'limits') params.delete('tab');
    else params.set('tab', nextTab);
    const next = params.toString();
    navigate(`/banking${next ? `?${next}` : ''}`, { replace: true });
  };

  // 탭 1: 한도 현황 — Go API 직접 집계 (Rust 의존 제거)
  const { groups, loading: groupsLoading } = useAllBankLimitGroups();

  // 탭 2: 만기 알림 (Rust)
  const { data: maturityData, loading: matLoading, error: matError } = useLCMaturityAlert(30);

  // 탭 3: 한도 변경 이력
  const { data: limitChanges, loading: lcLoading, reload: reloadLC } = useLimitChangeList();
  const [lcFormOpen, setLcFormOpen] = useState(false);

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p>
      </div>
    );
  }

  const handleCreateLimitChange = async (data: Record<string, unknown>) => {
    await fetchWithAuth('/api/v1/limit-changes', { method: 'POST', body: JSON.stringify(data) });
    reloadLC();
  };

  // 선택 법인 필터 (전체='all' 이면 그대로)
  const visibleGroups = (selectedCompanyId && selectedCompanyId !== 'all')
    ? groups.filter((g) => g.company_id === selectedCompanyId)
    : groups;

  // 전체 합산 (표시용)
  const totalLimit   = visibleGroups.flatMap((g) => g.rows).reduce((s, r) => s + r.lc_limit_usd, 0);
  const totalUsed    = visibleGroups.flatMap((g) => g.rows).reduce((s, r) => s + r.used, 0);
  const totalAvail   = visibleGroups.flatMap((g) => g.rows).reduce((s, r) => s + r.available, 0);
  const totalUsageRate = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0;
  const allLimitRows = visibleGroups.flatMap((g) => g.rows);
  const alertRows = maturityData?.alerts ?? [];
  const pageTitle =
    activeTab === 'maturity' ? 'L/C 만기 알림' :
    activeTab === 'changes' ? '한도 변경 이력' :
    activeTab === 'demand' ? 'L/C 수요 예측' :
    'L/C 한도 현황';
  const pageSub =
    activeTab === 'maturity' ? `${alertRows.length}건 · 30일 이내` :
    activeTab === 'changes' ? `${limitChanges.length}건 · 승인한도 변경` :
    activeTab === 'demand' ? 'PO 기반 한도 소요 전망' :
    `${visibleGroups.length}개 법인 · ${allLimitRows.length}개 은행`;

  const bankingCardControls = (
    <div className="sf-card-controls" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}>
      {activeTab === 'changes' && (
        <Button size="xs" onClick={() => setLcFormOpen(true)}>
          <Plus className="mr-1 h-3 w-3" />변경 등록
        </Button>
      )}
      <div style={{ flex: 1 }} />
      <FilterChips options={BANKING_TAB_OPTIONS} value={activeTab} onChange={handleTabChange} />
    </div>
  );

  return (
    <div className="sf-page">
      <div className="sf-procurement-layout">
        <section className="sf-procurement-main">
          <div className="sf-command-kpis">
            <TileB lbl="총 한도" v={fmtUsdM(totalLimit)} u="M$" sub={`${allLimitRows.length}개 은행`} tone="ink" spark={flatSpark(totalLimit / 1_000_000)} />
            <TileB lbl="사용중" v={fmtUsdM(totalUsed)} u="M$" sub={`${totalUsageRate.toFixed(1)}% · 활성 L/C`} tone="warn" spark={flatSpark(totalUsed / 1_000_000)} />
            <TileB lbl="가용" v={fmtUsdM(totalAvail)} u="M$" sub="추가 개설 가능" tone="solar" spark={flatSpark(totalAvail / 1_000_000)} />
            <TileB lbl="만기 알림" v={String(alertRows.length)} u="건" sub="30일 이내" tone={alertRows.length > 0 ? 'info' : 'pos'} spark={flatSpark(alertRows.length)} />
          </div>

          <CommandTopLine title={pageTitle} sub={pageSub} right={bankingCardControls} />

          <CardB
            title={pageTitle}
            sub={pageSub}
            right={bankingCardControls}
            headerless
          >
            <div className="sf-command-tab-body">
              <Tabs value={activeTab} onValueChange={handleTabChange}>

        {/* 탭 1: LC 한도 현황 — 법인별 그룹 */}
        <TabsContent value="limits" className="space-y-6">
          {groupsLoading ? <SkeletonRows rows={6} /> : (
            <>
              {/* 법인별 섹션 */}
              {visibleGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">등록된 은행 정보가 없습니다</p>
              ) : (
                visibleGroups.map((group) => {
                  const gLimit = group.rows.reduce((s, r) => s + r.lc_limit_usd, 0);
                  const gUsed  = group.rows.reduce((s, r) => s + Math.min(r.used, r.lc_limit_usd), 0);
                  const gAvail = group.rows.reduce((s, r) => s + r.available, 0);
                  const gRate  = gLimit > 0 ? Math.min(100, (gUsed / gLimit) * 100) : 0;
                  const rateColor = gRate >= 90 ? 'text-red-600' : gRate >= 70 ? 'text-orange-500' : 'text-green-600';

                  return (
                    <div key={group.company_id} className="space-y-2">
                      {/* 법인 헤더 */}
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-semibold">{group.company_name}</h3>
                        <span className="text-xs text-muted-foreground">
                          한도 {formatUSD(gLimit)} | 실행 {formatUSD(gUsed)} | 잔여 {formatUSD(gAvail)}
                          {gLimit > 0 && <span className={` ml-2 font-medium ${rateColor}`}>({gRate.toFixed(1)}%)</span>}
                        </span>
                      </div>
                      <BankLimitTable rows={group.rows} />
                    </div>
                  );
                })
              )}
            </>
          )}
        </TabsContent>

        {/* 탭 2: LC 만기 알림 */}
        <TabsContent value="maturity" className="space-y-4">
          {matLoading ? <SkeletonRows rows={6} /> : matError ? (
            <p className="text-sm text-red-500 text-center py-6">{matError}</p>
          ) : maturityData ? (
            <LCMaturityTable alertData={maturityData} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">Rust 엔진에서 데이터를 불러올 수 없습니다</p>
          )}
        </TabsContent>

        {/* 탭 3: 한도 변경 이력 */}
        <TabsContent value="changes" className="space-y-4">
          {lcLoading ? <SkeletonRows rows={6} /> : (
            <LimitChangeTable items={limitChanges} />
          )}
        </TabsContent>

        {/* 탭 4: LC 수요 예측 */}
        <TabsContent value="demand">
          <LCDemandForecast />
        </TabsContent>
              </Tabs>
            </div>
          </CardB>
        </section>

        <aside className="sf-procurement-rail card">
          <RailBlock title="총 한도 사용률" count="live">
            <div className="bignum text-[30px] text-[var(--solar-3)]">{totalUsageRate.toFixed(1)}<span className="mono text-sm text-[var(--ink-3)]">%</span></div>
            <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">{formatUSD(totalUsed)} / {formatUSD(totalLimit)}</div>
            <div className="mt-3 h-2 overflow-hidden rounded bg-[var(--bg-2)]">
              <div className="h-full bg-[var(--solar-2)]" style={{ width: `${Math.min(100, totalUsageRate)}%` }} />
            </div>
          </RailBlock>
          <RailBlock title="은행별 사용률" count="M$">
            {allLimitRows.slice(0, 6).map((row, index) => (
              <div key={`${row.bank_id ?? row.bank_name}-${index}`} className={`py-2 ${index ? 'border-t border-[var(--line)]' : ''}`}>
                <div className="flex items-baseline justify-between text-[11.5px]">
                  <span className="font-semibold text-[var(--ink-2)]">{row.bank_name}</span>
                  <span className="mono text-[var(--ink-3)]">{fmtUsdM(row.used)} / {fmtUsdM(row.lc_limit_usd)}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded bg-[var(--line)]">
                  <div className="h-full bg-[var(--solar-2)]" style={{ width: `${Math.min(100, row.usage_rate)}%` }} />
                </div>
              </div>
            ))}
          </RailBlock>
          <RailBlock title="만기 임박" count={alertRows.length} last>
            {alertRows.slice(0, 5).map((alert, index) => (
              <div key={alert.lc_id} className={`grid grid-cols-[auto_1fr_auto] gap-2 py-2 text-[11.5px] ${index ? 'border-t border-[var(--line)]' : ''}`}>
                <span className="mono font-bold text-[var(--warn)]">D-{alert.days_remaining}</span>
                <span className="mono truncate text-[var(--ink-2)]">{alert.lc_number ?? alert.lc_id.slice(0, 8)}</span>
                <span className="mono text-[var(--ink-3)]">{fmtUsdM(alert.amount_usd)}M$</span>
              </div>
            ))}
            {alertRows.length === 0 && <div className="text-xs text-[var(--ink-3)]">임박 만기가 없습니다.</div>}
            <Sparkline data={[62, 64, 65, 67, 69, 70, totalUsageRate]} w={220} h={34} color="var(--solar-2)" area />
          </RailBlock>
        </aside>
      </div>

      <LimitChangeForm open={lcFormOpen} onOpenChange={setLcFormOpen} onSubmit={handleCreateLimitChange} />
    </div>
  );
}
