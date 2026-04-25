import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import DataTable, { type Column } from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import ManufacturerForm from '@/components/masters/ManufacturerForm';
import { fetchWithAuth } from '@/lib/api';
import type { Manufacturer } from '@/types/masters';

export default function ManufacturerPage() {
  const [data, setData] = useState<Manufacturer[]>([]);
  const [filtered, setFiltered] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Manufacturer | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Manufacturer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Manufacturer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers');
      setData(list); setFiltered(list);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSearch = useCallback((q: string) => {
    if (!q) { setFiltered(data); return; }
    const lower = q.toLowerCase();
    setFiltered(data.filter((m) =>
      m.name_kr.toLowerCase().includes(lower) ||
      (m.name_en ?? '').toLowerCase().includes(lower) ||
      m.country.toLowerCase().includes(lower)
    ));
  }, [data]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetchWithAuth(`/api/v1/manufacturers/${deleteTarget.manufacturer_id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      load();
    } catch { /* empty */ }
    setDeleting(false);
  };

  const handleToggle = async () => {
    if (!toggleTarget) return;
    await fetchWithAuth(`/api/v1/manufacturers/${toggleTarget.manufacturer_id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !toggleTarget.is_active }),
    });
    setToggleTarget(null);
    load();
  };

  const handleSubmit = async (formData: Record<string, unknown>) => {
    if (editTarget) {
      await fetchWithAuth(`/api/v1/manufacturers/${editTarget.manufacturer_id}`, { method: 'PUT', body: JSON.stringify(formData) });
    } else {
      await fetchWithAuth('/api/v1/manufacturers', { method: 'POST', body: JSON.stringify(formData) });
    }
    setEditTarget(null);
    load();
  };

  const columns: Column<Manufacturer>[] = [
    { key: 'name_kr', label: '제조사명(한)', sortable: true },
    { key: 'name_en', label: '제조사명(영)', sortable: true },
    { key: 'country', label: '국가', sortable: true },
    { key: 'domestic_foreign', label: '국내/해외', sortable: true },
    { key: 'is_active', label: '활성', render: (r) => (
      <div className="flex items-center gap-2">
        <Switch checked={r.is_active} onCheckedChange={() => setToggleTarget(r)} />
        <StatusBadge isActive={r.is_active} />
      </div>
    ) },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">제조사 관리</h1>
        <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" />새로 등록
        </Button>
      </div>
      <DataTable
        columns={columns} data={filtered} loading={loading}
        searchable searchPlaceholder="제조사명, 국가 검색" onSearch={handleSearch}
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
      <ManufacturerForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleSubmit} editData={editTarget} />
      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={() => setToggleTarget(null)}
        title="상태 변경"
        description={`${toggleTarget?.name_kr}을(를) ${toggleTarget?.is_active ? '비활성' : '활성'}으로 변경하시겠습니까?`}
        onConfirm={handleToggle}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="제조사 삭제"
        description={`"${deleteTarget?.name_kr}"을(를) 삭제하시겠습니까? 연결된 데이터가 있으면 삭제가 실패할 수 있습니다.`}
        onConfirm={handleDelete}
        confirmLabel={deleting ? '삭제 중...' : '삭제'}
        variant="destructive"
      />
    </div>
  );
}
