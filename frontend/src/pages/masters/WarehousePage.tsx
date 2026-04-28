import { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import DataTable, { type Column } from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import WarehouseForm from '@/components/masters/WarehouseForm';
import { fetchWithAuth } from '@/lib/api';
import type { Warehouse } from '@/types/masters';

const typeLabel: Record<string, string> = { port: '항구', factory: '공장', vendor: '업체' };

export default function WarehousePage() {
  const [data, setData] = useState<Warehouse[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Warehouse | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Warehouse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const list = await fetchWithAuth<Warehouse[]>('/api/v1/warehouses'); setData(list); } catch { /* empty */ }
    setLoading(false);
  }, []);

  // 초기 로드 — 마운트 시 1회만 비동기 fetch (load는 갱신용으로 유지)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchWithAuth<Warehouse[]>('/api/v1/warehouses');
        if (!cancelled) setData(list);
      } catch { /* empty */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // 검색어를 파생 값으로 계산
  const filtered = useMemo(() => {
    if (!searchQuery) return data;
    const lower = searchQuery.toLowerCase();
    return data.filter((w) =>
      w.warehouse_code.toLowerCase().includes(lower) ||
      w.warehouse_name.toLowerCase().includes(lower) ||
      w.location_name.toLowerCase().includes(lower)
    );
  }, [data, searchQuery]);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
  }, []);

  const handleSubmit = async (formData: Record<string, unknown>) => {
    if (editTarget) {
      await fetchWithAuth(`/api/v1/warehouses/${editTarget.warehouse_id}`, { method: 'PUT', body: JSON.stringify(formData) });
    } else {
      await fetchWithAuth('/api/v1/warehouses', { method: 'POST', body: JSON.stringify(formData) });
    }
    setEditTarget(null); load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetchWithAuth(`/api/v1/warehouses/${deleteTarget.warehouse_id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      load();
    } catch { /* empty */ }
    setDeleting(false);
  };

  const handleToggle = async () => {
    if (!toggleTarget) return;
    await fetchWithAuth(`/api/v1/warehouses/${toggleTarget.warehouse_id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !toggleTarget.is_active }),
    });
    setToggleTarget(null);
    load();
  };

  const columns: Column<Warehouse>[] = [
    { key: 'warehouse_code', label: '창고코드', sortable: true },
    { key: 'warehouse_name', label: '창고명', sortable: true },
    { key: 'warehouse_type', label: '유형', render: (r) => typeLabel[r.warehouse_type] ?? r.warehouse_type },
    { key: 'location_code', label: '장소코드' },
    { key: 'location_name', label: '장소명', sortable: true },
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
        <h1 className="text-lg font-semibold">창고/장소 관리</h1>
        <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />새로 등록</Button>
      </div>
      <DataTable columns={columns} data={filtered} loading={loading} searchable searchPlaceholder="창고코드, 창고명, 장소명 검색" onSearch={handleSearch}
        actions={(row) => (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditTarget(row); setFormOpen(true); }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTarget(row)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )} />
      <WarehouseForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleSubmit} editData={editTarget} />
      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={() => setToggleTarget(null)}
        title="상태 변경"
        description={`${toggleTarget?.warehouse_name}을(를) ${toggleTarget?.is_active ? '비활성' : '활성'}으로 변경하시겠습니까?`}
        onConfirm={handleToggle}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="창고 삭제"
        description={`"${deleteTarget?.warehouse_name}"을(를) 삭제하시겠습니까? 연결된 데이터가 있으면 삭제가 실패할 수 있습니다.`}
        onConfirm={handleDelete}
        confirmLabel={deleting ? '삭제 중...' : '삭제'}
        variant="destructive"
      />
    </div>
  );
}
