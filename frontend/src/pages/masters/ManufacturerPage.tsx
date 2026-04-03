import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DataTable, { type Column } from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import ManufacturerForm from '@/components/masters/ManufacturerForm';
import { fetchWithAuth } from '@/lib/api';
import type { Manufacturer } from '@/types/masters';

export default function ManufacturerPage() {
  const [data, setData] = useState<Manufacturer[]>([]);
  const [filtered, setFiltered] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Manufacturer | null>(null);

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
    { key: 'domestic_foreign', label: '국내/해외', render: (r) => r.domestic_foreign === 'domestic' ? '국내' : '해외' },
    { key: 'is_active', label: '활성', render: (r) => <StatusBadge isActive={r.is_active} /> },
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
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditTarget(row); setFormOpen(true); }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      />
      <ManufacturerForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleSubmit} editData={editTarget} />
    </div>
  );
}
