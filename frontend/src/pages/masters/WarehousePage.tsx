import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DataTable, { type Column } from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import WarehouseForm from '@/components/masters/WarehouseForm';
import { fetchWithAuth } from '@/lib/api';
import type { Warehouse } from '@/types/masters';

const typeLabel: Record<string, string> = { port: '항구', factory: '공장', vendor: '업체' };

export default function WarehousePage() {
  const [data, setData] = useState<Warehouse[]>([]);
  const [filtered, setFiltered] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Warehouse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const list = await fetchWithAuth<Warehouse[]>('/api/v1/warehouses'); setData(list); setFiltered(list); } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSearch = useCallback((q: string) => {
    if (!q) { setFiltered(data); return; }
    const lower = q.toLowerCase();
    setFiltered(data.filter((w) =>
      w.warehouse_code.toLowerCase().includes(lower) ||
      w.warehouse_name.toLowerCase().includes(lower) ||
      w.location_name.toLowerCase().includes(lower)
    ));
  }, [data]);

  const handleSubmit = async (formData: Record<string, unknown>) => {
    if (editTarget) {
      await fetchWithAuth(`/api/v1/warehouses/${editTarget.warehouse_id}`, { method: 'PUT', body: JSON.stringify(formData) });
    } else {
      await fetchWithAuth('/api/v1/warehouses', { method: 'POST', body: JSON.stringify(formData) });
    }
    setEditTarget(null); load();
  };

  const columns: Column<Warehouse>[] = [
    { key: 'warehouse_code', label: '창고코드', sortable: true },
    { key: 'warehouse_name', label: '창고명', sortable: true },
    { key: 'warehouse_type', label: '유형', render: (r) => typeLabel[r.warehouse_type] ?? r.warehouse_type },
    { key: 'location_code', label: '장소코드' },
    { key: 'location_name', label: '장소명', sortable: true },
    { key: 'is_active', label: '활성', render: (r) => <StatusBadge isActive={r.is_active} /> },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">창고/장소 관리</h1>
        <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />새로 등록</Button>
      </div>
      <DataTable columns={columns} data={filtered} loading={loading} searchable searchPlaceholder="창고코드, 창고명, 장소명 검색" onSearch={handleSearch}
        actions={(row) => (<Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditTarget(row); setFormOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>)} />
      <WarehouseForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleSubmit} editData={editTarget} />
    </div>
  );
}
