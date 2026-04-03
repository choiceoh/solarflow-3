import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/stores/appStore';
import { useLCLimitTimeline, useLCMaturityAlert, useLimitChangeList } from '@/hooks/useBanking';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import LCLimitSummaryCards from '@/components/banking/LCLimitSummaryCards';
import BankLimitTable from '@/components/banking/BankLimitTable';
import LimitTimelineView from '@/components/banking/LimitTimelineView';
import LCMaturityTable from '@/components/banking/LCMaturityTable';
import LimitChangeTable from '@/components/banking/LimitChangeTable';
import LimitChangeForm from '@/components/banking/LimitChangeForm';
import LCDemandForecast from '@/components/banking/LCDemandForecast';

export default function BankingPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  // 탭 1: 한도 현황 (Rust)
  const { data: timelineData, loading: tlLoading, error: tlError } = useLCLimitTimeline(3);

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

        {/* 탭 1: LC 한도 현황 */}
        <TabsContent value="limits" className="space-y-4 mt-4">
          {tlLoading ? <LoadingSpinner /> : tlError ? (
            <p className="text-sm text-red-500 text-center py-6">{tlError}</p>
          ) : timelineData ? (
            <>
              <LCLimitSummaryCards bankSummaries={timelineData.bank_summaries || []} />
              <Separator />
              <h3 className="text-sm font-semibold">은행별 한도</h3>
              <BankLimitTable bankSummaries={timelineData.bank_summaries || []} />
              <Separator />
              <LimitTimelineView
                events={timelineData.timeline_events || []}
                monthlyProjection={timelineData.monthly_projection || []}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">Rust 엔진에서 데이터를 불러올 수 없습니다</p>
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
