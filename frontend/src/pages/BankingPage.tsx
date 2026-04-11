import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/stores/appStore';
import { useAllBankLimitGroups, useLCMaturityAlert, useLimitChangeList } from '@/hooks/useBanking';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import BankLimitTable from '@/components/banking/BankLimitTable';
import LCMaturityTable from '@/components/banking/LCMaturityTable';
import LimitChangeTable from '@/components/banking/LimitChangeTable';
import LimitChangeForm from '@/components/banking/LimitChangeForm';
import LCDemandForecast from '@/components/banking/LCDemandForecast';
import { formatUSD } from '@/lib/utils';

export default function BankingPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

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

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">은행 / LC</h1>

      <Tabs defaultValue="limits">
        <TabsList>
          <TabsTrigger value="limits">한도 현황</TabsTrigger>
          <TabsTrigger value="maturity">만기 알림</TabsTrigger>
          <TabsTrigger value="changes">한도 변경 이력</TabsTrigger>
          <TabsTrigger value="demand">LC 수요 예측</TabsTrigger>
        </TabsList>

        {/* 탭 1: LC 한도 현황 — 법인별 그룹 */}
        <TabsContent value="limits" className="space-y-6 mt-4">
          {groupsLoading ? <LoadingSpinner /> : (
            <>
              {/* 전체 요약 카드 */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '전체 승인한도', value: formatUSD(totalLimit), color: 'text-blue-700' },
                  { label: '전체 실행금액', value: formatUSD(totalUsed), color: 'text-orange-600' },
                  { label: '전체 잔여한도', value: formatUSD(totalAvail), color: 'text-green-600' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg border bg-card p-4">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              <Separator />

              {/* 법인별 섹션 */}
              {visibleGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">등록된 은행 정보가 없습니다</p>
              ) : (
                visibleGroups.map((group) => {
                  const gLimit = group.rows.reduce((s, r) => s + r.lc_limit_usd, 0);
                  const gUsed  = group.rows.reduce((s, r) => s + r.used, 0);
                  const gAvail = group.rows.reduce((s, r) => s + r.available, 0);
                  const gRate  = gLimit > 0 ? (gUsed / gLimit) * 100 : 0;
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
        <TabsContent value="maturity" className="space-y-4 mt-4">
          {matLoading ? <LoadingSpinner /> : matError ? (
            <p className="text-sm text-red-500 text-center py-6">{matError}</p>
          ) : maturityData ? (
            <LCMaturityTable alertData={maturityData} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">Rust 엔진에서 데이터를 불러올 수 없습니다</p>
          )}
        </TabsContent>

        {/* 탭 3: 한도 변경 이력 */}
        <TabsContent value="changes" className="space-y-4 mt-4">
          <div className="flex items-center justify-end">
            <Button size="sm" onClick={() => setLcFormOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />변경 등록
            </Button>
          </div>
          {lcLoading ? <LoadingSpinner /> : (
            <LimitChangeTable items={limitChanges} />
          )}
        </TabsContent>

        {/* 탭 4: LC 수요 예측 */}
        <TabsContent value="demand" className="mt-4">
          <LCDemandForecast />
        </TabsContent>
      </Tabs>

      <LimitChangeForm open={lcFormOpen} onOpenChange={setLcFormOpen} onSubmit={handleCreateLimitChange} />
    </div>
  );
}
