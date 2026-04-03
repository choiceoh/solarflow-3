import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import DataTable, { type Column } from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import CompanyForm from '@/components/masters/CompanyForm';
import { fetchWithAuth } from '@/lib/api';
import type { Company } from '@/types/masters';

export default function CompanyPage() {
  const [data, setData] = useState<Company[]>([]);
  const [filtered, setFiltered] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Company | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Company | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchWithAuth<Company[]>('/api/v1/companies');
      setData(list);
      setFiltered(list);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSearch = useCallback((q: string) => {
    if (!q) { setFiltered(data); return; }
    const lower = q.toLowerCase();
    setFiltered(data.filter((c) =>
      c.company_name.toLowerCase().includes(lower) ||
      c.company_code.toLowerCase().includes(lower) ||
      (c.business_number ?? '').includes(lower)
    ));
  }, [data]);

  const handleCreate = async (formData: Record<string, unknown>) => {
    await fetchWithAuth('/api/v1/companies', { method: 'POST', body: JSON.stringify(formData) });
    load();
  };

  const handleUpdate = async (formData: Record<string, unknown>) => {
    if (!editTarget) return;
    await fetchWithAuth(`/api/v1/companies/${editTarget.company_id}`, { method: 'PUT', body: JSON.stringify(formData) });
    setEditTarget(null);
    load();
  };

  const handleToggle = async () => {
    if (!toggleTarget) return;
    await fetchWithAuth(`/api/v1/companies/${toggleTarget.company_id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !toggleTarget.is_active }),
    });
    setToggleTarget(null);
    load();
  };

  const columns: Column<Company>[] = [
    { key: 'company_name', label: '법인명', sortable: true },
    { key: 'company_code', label: '법인코드', sortable: true },
    { key: 'business_number', label: '사업자번호' },
    {
      key: 'is_active', label: '활성', render: (row) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={row.is_active}
            onCheckedChange={() => setToggleTarget(row)}
          />
          <StatusBadge isActive={row.is_active} />
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">법인 관리</h1>
        <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" />새로 등록
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchable
        searchPlaceholder="법인명, 코드, 사업자번호 검색"
        onSearch={handleSearch}
        actions={(row) => (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditTarget(row); setFormOpen(true); }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      />
      <CompanyForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={editTarget ? handleUpdate : handleCreate}
        editData={editTarget}
      />
      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={() => setToggleTarget(null)}
        title="상태 변경"
        description={`${toggleTarget?.company_name}을(를) ${toggleTarget?.is_active ? '비활성' : '활성'}으로 변경하시겠습니까?`}
        onConfirm={handleToggle}
      />
    </div>
  );
}
