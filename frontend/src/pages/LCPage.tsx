import { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useLCList } from '@/hooks/useProcurement';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import LCListTable from '@/components/procurement/LCListTable';
import BLDetailView from '@/components/inbound/BLDetailView';
import { MasterConsole } from '@/components/command/MasterConsole';
import { FilterButton, RailBlock, Sparkline } from '@/components/command/MockupPrimitives';
import { LC_STATUS_LABEL, type LCRecord, type LCStatus } from '@/types/procurement';
import type { Bank, Company } from '@/types/masters';

export default function LCPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [statusFilter, setStatusFilter] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');

  const [selectedBL, setSelectedBL] = useState<string | null>(null);
  const [blsVersion, setBlsVersion] = useState(0);

  const filters: Record<string, string> = {};
  if (statusFilter) filters.status = statusFilter;
  if (bankFilter) filters.bank_id = bankFilter;
  const { data: lcs, loading, reload } = useLCList(filters);

  const filtered = companyFilter ? lcs.filter((l) => l.company_id === companyFilter) : lcs;

  useEffect(() => {
    fetchWithAuth<Company[]>('/api/v1/companies').then((list) => setCompanies(list.filter((c) => c.is_active))).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCompanyId) {
      fetchWithAuth<Bank[]>(`/api/v1/banks?company_id=${selectedCompanyId}`).then((list) => setBanks(list.filter((b) => b.is_active))).catch(() => {});
    }
  }, [selectedCompanyId]);

  if (!selectedCompanyId) {
    return <div className="flex items-center justify-center p-12"><p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p></div>;
  }

  if (selectedBL) {
    return (
      <div className="p-6">
        <BLDetailView blId={selectedBL} onBack={() => { setSelectedBL(null); setBlsVersion(v => v + 1); }} />
      </div>
    );
  }

  const handleSettleLC = async (lc: LCRecord, repaymentDate: string) => {
    await fetchWithAuth(`/api/v1/lcs/${lc.lc_id}`, {
      method: 'PUT',
      body: JSON.stringify({ repaid: true, repayment_date: repaymentDate, status: 'settled' }),
    });
    reload();
  };

  const statusLabel = statusFilter ? (LC_STATUS_LABEL[statusFilter as LCStatus] ?? statusFilter) : '전체 상태';
  const bankLabel = bankFilter ? (banks.find((b) => b.bank_id === bankFilter)?.bank_name ?? '') : '전체 은행';
  const companyLabel = companyFilter ? (companies.find((c) => c.company_id === companyFilter)?.company_name ?? '') : '전체 법인';
  const openedCount = filtered.filter((lc) => lc.status === 'opened').length;
  const settledCount = filtered.filter((lc) => lc.status === 'settled').length;
  const totalUsd = filtered.reduce((sum, lc) => sum + (lc.amount_usd ?? 0), 0);
  const maturityRows = filtered
    .filter((lc) => lc.maturity_date)
    .slice()
    .sort((a, b) => String(a.maturity_date).localeCompare(String(b.maturity_date)))
    .slice(0, 4);

  return (
    <>
      <MasterConsole
        eyebrow="IMPORT FINANCE"
        title="L/C 개설 관리"
        description="신용장 개설, 상환, B/L 생성 흐름을 수입금융 콘솔 기준으로 관리합니다."
        tableTitle="L/C 목록"
        tableSub={`${filtered.length.toLocaleString()} / ${lcs.length.toLocaleString()}건 표시`}
        toolbar={
          <div className="sf-card-controls" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}>
            <FilterButton items={[
              {
                label: '상태',
                value: statusFilter,
                onChange: setStatusFilter,
                options: (Object.entries(LC_STATUS_LABEL) as [LCStatus, string][]).map(([k, v]) => ({ value: k, label: v })),
              },
              {
                label: '은행',
                value: bankFilter,
                onChange: setBankFilter,
                options: banks.map((b) => ({ value: b.bank_id, label: b.bank_name })),
              },
              {
                label: '법인',
                value: companyFilter,
                onChange: setCompanyFilter,
                options: companies.map((c) => ({ value: c.company_id, label: c.company_name })),
              },
            ]} />
          </div>
        }
        metrics={[
          { label: 'L/C 건수', value: filtered.length.toLocaleString(), sub: statusLabel, tone: 'solar', spark: [8, 10, 9, 12, filtered.length || 1] },
          { label: '개설 진행', value: openedCount.toLocaleString(), sub: bankLabel, tone: 'info' },
          { label: '상환 완료', value: settledCount.toLocaleString(), sub: companyLabel, tone: 'pos' },
          { label: '총 금액', value: (totalUsd / 1_000_000).toFixed(2), unit: 'M$', sub: '필터 기준', tone: 'warn' },
        ]}
        rail={
          <>
            <RailBlock title="만기 순서" accent="var(--solar-3)" count={maturityRows.length}>
              <div className="space-y-2">
                {maturityRows.map((lc) => (
                  <div key={lc.lc_id} className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-2">
                    <div className="truncate text-[12px] font-semibold text-[var(--ink)]">{lc.lc_number}</div>
                    <div className="mono mt-1 text-[10px] text-[var(--ink-4)]">{lc.maturity_date ?? '만기 없음'} · {LC_STATUS_LABEL[lc.status] ?? lc.status}</div>
                  </div>
                ))}
              </div>
            </RailBlock>
            <RailBlock title="필터 흐름" count={statusLabel}>
              <Sparkline data={[22, 28, 25, 34, 32, 39]} color="var(--solar-3)" area />
              <div className="mt-2 text-[11px] leading-5 text-[var(--ink-3)]">은행·법인·상태 필터는 목록과 KPI를 동시에 좁힙니다.</div>
            </RailBlock>
          </>
        }
      >
        {loading ? <LoadingSpinner /> : (
          <LCListTable
            items={filtered}
            onSettle={handleSettleLC}
            onSelectBL={setSelectedBL}
            blsVersion={blsVersion}
          />
        )}
      </MasterConsole>
    </>
  );
}
