import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import DataTable, { type Column } from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import BankForm from '@/components/masters/BankForm';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { formatUSD, formatPercent, formatDate } from '@/lib/utils';
import type { Bank } from '@/types/masters';

export default function BankPage() {
  const [data, setData] = useState<Bank[]>([]);
  const [filtered, setFiltered] = useState<Bank[]>([]);
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

  useEffect(() => { load(); }, [load]);

  // 법인 필터 + 텍스트 검색 적용
  useEffect(() => {
    let result = data;
    if (localFilter !== 'all') {
      result = result.filter((b) => b.company_id === localFilter);
    }
    setFiltered(result);
  }, [data, localFilter]);

  const handleSearch = useCallback((q: string) => {
    let result = data;
    if (localFilter !== 'all') {
      result = result.filter((b) => b.company_id === localFilter);
    }
    if (q) {
      const lower = q.toLowerCase();
      result = result.filter((b) =>
        b.bank_name.toLowerCase().includes(lower) ||
        (b.companies?.company_name ?? b.company_name ?? '').toLowerCase().includes(lower)
      );
    }
    setFiltered(result);
  }, [data, localFilter]);

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
    {
      key: 'is_active', label: '활성', render: (r) => (
        <div className="flex items-center gap-2">
          <Switch checked={r.is_active} onCheckedChange={() => setToggleTarget(r)} />
          <StatusBadge isActive={r.is_active} />
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">은행 관리</h1>
        <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" />새로 등록
        </Button>
      </div>

      {/* 법인 필터 토글 */}
      <div className="flex items-center gap-2 flex-wrap">
        {[{ id: 'all', name: '전체' }, ...companies.map((c) => ({ id: c.company_id, name: c.company_name }))].map(({ id, name }) => (
          <Button
            key={id}
            size="sm"
            variant={localFilter === id ? 'default' : 'outline'}
            onClick={() => setLocalFilter(id)}
            className="h-7 text-xs"
          >
            {name}
          </Button>
        ))}
      </div>

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
    </div>
  );
}
