import { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DataTable, { type Column } from '@/components/common/DataTable';
import { activeToggleColumn } from '@/components/common/activeToggleColumn';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import BankForm from '@/components/masters/BankForm';
import { MasterConsole } from '@/components/command/MasterConsole';
import { FilterChips, RailBlock } from '@/components/command/MockupPrimitives';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { formatUSD, formatPercent, formatDate } from '@/lib/utils';
import type { Bank } from '@/types/masters';

export default function BankPage() {
  const [data, setData] = useState<Bank[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Bank | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Bank | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bank | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [localFilter, setLocalFilter] = useState<string>('all');

  const companies = useAppStore((s) => s.companies);
  const loadCompanies = useAppStore((s) => s.loadCompanies);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 항상 전체 로드 — 법인 필터는 클라이언트에서 처리
      const list = await fetchWithAuth<Bank[]>('/api/v1/banks');
      setData(list);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  // 초기 로드 — 마운트 시 1회만 비동기 fetch (load는 갱신용으로 유지)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchWithAuth<Bank[]>('/api/v1/banks');
        if (!cancelled) setData(list);
      } catch { /* empty */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // 법인 필터 + 텍스트 검색은 파생 값으로 계산
  const filtered = useMemo(() => {
    let result = data;
    if (localFilter !== 'all') {
      result = result.filter((b) => b.company_id === localFilter);
    }
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      result = result.filter((b) =>
        b.bank_name.toLowerCase().includes(lower) ||
        (b.companies?.company_name ?? b.company_name ?? '').toLowerCase().includes(lower)
      );
    }
    return result;
  }, [data, localFilter, searchQuery]);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
  }, []);

  const handleSubmit = async (formData: Record<string, unknown>) => {
    if (editTarget) {
      await fetchWithAuth(`/api/v1/banks/${editTarget.bank_id}`, { method: 'PUT', body: JSON.stringify(formData) });
    } else {
      await fetchWithAuth('/api/v1/banks', { method: 'POST', body: JSON.stringify(formData) });
    }
    setEditTarget(null); load();
  };

  const handleToggle = async () => {
    if (!toggleTarget) return;
    await fetchWithAuth(`/api/v1/banks/${toggleTarget.bank_id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !toggleTarget.is_active }),
    });
    setToggleTarget(null);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetchWithAuth(`/api/v1/banks/${deleteTarget.bank_id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      load();
    } catch { /* empty */ }
    setDeleting(false);
  };

  const columns: Column<Bank>[] = [
    {
      key: 'bank_name', label: '은행명', sortable: true,
      render: (r) => (
        <span>
          {r.bank_name}
          {!r.is_active && <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 rounded px-1">비활성</span>}
        </span>
      ),
    },
    {
      key: 'company_name', label: '법인', sortable: true,
      render: (r) => r.companies?.company_name ?? r.company_name ?? '—',
    },
    { key: 'lc_limit_usd', label: '승인한도(USD)', sortable: true, render: (r) => formatUSD(r.lc_limit_usd) },
    { key: 'limit_approve_date', label: '승인일', render: (r) => formatDate(r.limit_approve_date ?? '') },
    {
      key: 'limit_expiry_date', label: '승인기한', render: (r) => {
        if (!r.limit_expiry_date) return <span className="text-muted-foreground">—</span>;
        const daysLeft = Math.ceil((new Date(r.limit_expiry_date).getTime() - Date.now()) / 86400000);
        if (daysLeft < 0) return <span className="text-red-600 font-semibold">{formatDate(r.limit_expiry_date)} <span className="text-[10px] bg-red-100 text-red-700 rounded px-1">만료</span></span>;
        if (daysLeft <= 30) return <span className="text-orange-500 font-semibold">{formatDate(r.limit_expiry_date)} <span className="text-[10px] bg-orange-100 text-orange-700 rounded px-1">D-{daysLeft}</span></span>;
        if (daysLeft <= 90) return <span className="text-yellow-600">{formatDate(r.limit_expiry_date)} <span className="text-[10px] bg-yellow-100 text-yellow-700 rounded px-1">D-{daysLeft}</span></span>;
        return <span>{formatDate(r.limit_expiry_date)}</span>;
      },
    },
    { key: 'opening_fee_rate', label: '개설수수료율', render: (r) => r.opening_fee_rate != null ? formatPercent(r.opening_fee_rate) : '—' },
    { key: 'acceptance_fee_rate', label: '인수수수료율', render: (r) => r.acceptance_fee_rate != null ? formatPercent(r.acceptance_fee_rate) : '—' },
    activeToggleColumn<Bank>(setToggleTarget),
  ];

  const activeCount = data.filter((bank) => bank.is_active).length;
  const totalLimit = data.reduce((sum, bank) => sum + (bank.lc_limit_usd ?? 0), 0);
  const expiringRows = data
    .filter((bank) => {
      if (!bank.limit_expiry_date) return false;
      const daysLeft = Math.ceil((new Date(bank.limit_expiry_date).getTime() - Date.now()) / 86400000);
      return daysLeft <= 90;
    })
    .slice(0, 4);
  const companyOptions = [{ key: 'all', label: '전체', count: data.length }, ...companies.map((company) => ({
    key: company.company_id,
    label: company.company_name,
    count: data.filter((bank) => bank.company_id === company.company_id).length,
  }))];

  return (
    <>
      <MasterConsole
        title="은행 관리"
        description="L/C 한도, 승인기한, 수수료율을 수입금융 화면과 공유하는 은행 기준정보입니다."
        tableTitle="은행 마스터"
        tableSub={`${filtered.length.toLocaleString()} / ${data.length.toLocaleString()}개 표시`}
        actions={
          <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" />새로 등록
          </Button>
        }
        toolbar={<FilterChips options={companyOptions} value={localFilter} onChange={setLocalFilter} />}
        metrics={[
          { label: '은행 수', value: data.length.toLocaleString(), sub: '법인별 한도 계좌', tone: 'solar', spark: [4, 5, 6, data.length || 1] },
          { label: '활성', value: activeCount.toLocaleString(), sub: 'L/C 연결 가능', tone: 'pos' },
          { label: '총 한도', value: formatUSD(totalLimit), sub: '승인 한도 합계', tone: 'info' },
          { label: '만기 주의', value: expiringRows.length.toLocaleString(), sub: '90일 이내/만료', tone: expiringRows.length > 0 ? 'warn' : 'ink' },
        ]}
        rail={
          <>
            <RailBlock title="법인 필터" accent="var(--solar-3)" count={companyOptions.find((option) => option.key === localFilter)?.label}>
              <div className="text-[11px] leading-5 text-[var(--ink-3)]">
                법인별 은행 한도를 좁혀 보고, 수입금융의 사용률 계산 기준을 점검합니다.
              </div>
            </RailBlock>
            <RailBlock title="승인기한" count={expiringRows.length}>
              <div className="space-y-2">
                {expiringRows.length === 0 ? (
                  <div className="text-[11px] text-[var(--ink-4)]">90일 이내 만기 은행 없음</div>
                ) : expiringRows.map((bank) => (
                  <div key={bank.bank_id} className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-2">
                    <div className="truncate text-[12px] font-semibold text-[var(--ink)]">{bank.bank_name}</div>
                    <div className="mono mt-1 text-[10px] text-[var(--ink-4)]">{bank.limit_expiry_date ? formatDate(bank.limit_expiry_date) : '기한 없음'} · {formatUSD(bank.lc_limit_usd)}</div>
                  </div>
                ))}
              </div>
            </RailBlock>
          </>
        }
      >
        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          searchable
          searchPlaceholder="은행명, 법인 검색"
          onSearch={handleSearch}
          actions={(row) => (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditTarget(row); setFormOpen(true); }}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTarget(row)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        />
      </MasterConsole>

      <BankForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleSubmit} editData={editTarget} />

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={() => setToggleTarget(null)}
        title="상태 변경"
        description={`${toggleTarget?.bank_name}을(를) ${toggleTarget?.is_active ? '비활성' : '활성'}으로 변경하시겠습니까?`}
        onConfirm={handleToggle}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="은행 삭제"
        description={`"${deleteTarget?.bank_name}"을(를) 삭제하시겠습니까? 이 은행에 연결된 LC가 있으면 삭제가 실패할 수 있습니다.`}
        onConfirm={handleDelete}
        confirmLabel={deleting ? '삭제 중...' : '삭제'}
        variant="destructive"
      />
    </>
  );
}
