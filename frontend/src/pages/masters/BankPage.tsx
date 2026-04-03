import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DataTable, { type Column } from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import BankForm from '@/components/masters/BankForm';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { formatUSD, formatPercent } from '@/lib/utils';
import type { Bank } from '@/types/masters';

export default function BankPage() {
  const [data, setData] = useState<Bank[]>([]);
  const [filtered, setFiltered] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Bank | null>(null);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = selectedCompanyId ? `?company_id=${selectedCompanyId}` : '';
      const list = await fetchWithAuth<Bank[]>(`/api/v1/banks${params}`);
      setData(list); setFiltered(list);
    } catch { /* empty */ }
    setLoading(false);
  }, [selectedCompanyId]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = useCallback((q: string) => {
    if (!q) { setFiltered(data); return; }
    const lower = q.toLowerCase();
    setFiltered(data.filter((b) =>
      b.bank_name.toLowerCase().includes(lower) ||
      (b.company_name ?? '').toLowerCase().includes(lower)
    ));
  }, [data]);

  const handleSubmit = async (formData: Record<string, unknown>) => {
    if (editTarget) {
      await fetchWithAuth(`/api/v1/banks/${editTarget.bank_id}`, { method: 'PUT', body: JSON.stringify(formData) });
    } else {
      await fetchWithAuth('/api/v1/banks', { method: 'POST', body: JSON.stringify(formData) });
    }
    setEditTarget(null); load();
  };

  const columns: Column<Bank>[] = [
    { key: 'bank_name', label: '은행명', sortable: true },
    { key: 'company_name', label: '법인', sortable: true },
    { key: 'lc_limit_usd', label: 'LC한도(USD)', sortable: true, render: (r) => formatUSD(r.lc_limit_usd) },
    { key: 'opening_fee_rate', label: '개설수수료율', render: (r) => r.opening_fee_rate != null ? formatPercent(r.opening_fee_rate) : '—' },
    { key: 'acceptance_fee_rate', label: '인수수수료율', render: (r) => r.acceptance_fee_rate != null ? formatPercent(r.acceptance_fee_rate) : '—' },
    { key: 'is_active', label: '활성', render: (r) => <StatusBadge isActive={r.is_active} /> },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">은행 관리</h1>
        <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />새로 등록</Button>
      </div>
      <DataTable columns={columns} data={filtered} loading={loading} searchable searchPlaceholder="은행명, 법인 검색" onSearch={handleSearch}
        actions={(row) => (<Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditTarget(row); setFormOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>)} />
      <BankForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleSubmit} editData={editTarget} />
    </div>
  );
}
