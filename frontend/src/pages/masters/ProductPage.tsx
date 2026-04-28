import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import DataTable, { type Column } from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import ProductForm from '@/components/masters/ProductForm';
import { fetchWithAuth } from '@/lib/api';
import { formatWp, formatSize } from '@/lib/utils';
import type { Product, Manufacturer } from '@/types/masters';

// 기본 정렬: 제조사→규격(Wp)→크기(mm) ascending
function sortProducts(items: Product[]): Product[] {
  return [...items].sort((a, b) => {
    const mfgCmp = (a.manufacturer_name ?? '').localeCompare(b.manufacturer_name ?? '', 'ko');
    if (mfgCmp !== 0) return mfgCmp;
    if (a.spec_wp !== b.spec_wp) return a.spec_wp - b.spec_wp;
    if (a.module_width_mm !== b.module_width_mm) return a.module_width_mm - b.module_width_mm;
    return a.module_height_mm - b.module_height_mm;
  });
}

export default function ProductPage() {
  const [data, setData] = useState<Product[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [filterMfg, setFilterMfg] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [products, mfgs] = await Promise.all([
        fetchWithAuth<Product[]>('/api/v1/products'),
        fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers'),
      ]);
      setData(products.map((p) => ({
        ...p,
        manufacturer_name: mfgs.find((m) => m.manufacturer_id === p.manufacturer_id)?.name_kr ?? '',
      })));
      setManufacturers(mfgs.filter((m) => m.is_active));
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  // 초기 로드 — 마운트 시 1회만 비동기 fetch (load 함수는 갱신용으로 유지)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [products, mfgs] = await Promise.all([
          fetchWithAuth<Product[]>('/api/v1/products'),
          fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers'),
        ]);
        if (cancelled) return;
        setData(products.map((p) => ({
          ...p,
          manufacturer_name: mfgs.find((m) => m.manufacturer_id === p.manufacturer_id)?.name_kr ?? '',
        })));
        setManufacturers(mfgs.filter((m) => m.is_active));
      } catch { /* empty */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let items = data;
    if (filterMfg) {
      items = items.filter((p) => p.manufacturer_id === filterMfg);
    }
    if (search) {
      const lower = search.toLowerCase();
      items = items.filter((p) =>
        p.product_code.toLowerCase().includes(lower) ||
        p.product_name.toLowerCase().includes(lower) ||
        (p.manufacturer_name ?? '').toLowerCase().includes(lower)
      );
    }
    return sortProducts(items);
  }, [data, search, filterMfg]);

  const handleSubmit = async (formData: Record<string, unknown>) => {
    if (editTarget) {
      await fetchWithAuth(`/api/v1/products/${editTarget.product_id}`, { method: 'PUT', body: JSON.stringify(formData) });
    } else {
      await fetchWithAuth('/api/v1/products', { method: 'POST', body: JSON.stringify(formData) });
    }
    setEditTarget(null);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetchWithAuth(`/api/v1/products/${deleteTarget.product_id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      load();
    } catch { /* empty */ }
    setDeleting(false);
  };

  const handleToggle = async () => {
    if (!toggleTarget) return;
    await fetchWithAuth(`/api/v1/products/${toggleTarget.product_id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !toggleTarget.is_active }),
    });
    setToggleTarget(null);
    load();
  };

  const columns: Column<Product>[] = [
    { key: 'product_code', label: '품번코드', sortable: true },
    { key: 'manufacturer_name', label: '제조사', sortable: true },
    { key: 'product_name', label: '품명', sortable: true },
    { key: 'spec_wp', label: '규격(Wp)', sortable: true, render: (r) => formatWp(r.spec_wp) },
    { key: 'module_width_mm', label: '크기(mm)', sortable: true, render: (r) => formatSize(r.module_width_mm, r.module_height_mm) },
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
        <h1 className="text-lg font-semibold">품번 관리</h1>
        <div className="flex items-center gap-2">
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={filterMfg}
            onChange={(e) => setFilterMfg(e.target.value)}
          >
            <option value="">전체 제조사</option>
            {manufacturers.map((m) => (
              <option key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</option>
            ))}
          </select>
          <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" />새로 등록
          </Button>
        </div>
      </div>
      <DataTable
        columns={columns} data={filtered} loading={loading}
        searchable searchPlaceholder="품번코드, 품명, 제조사 검색" onSearch={setSearch}
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
      <ProductForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleSubmit} editData={editTarget} />
      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={() => setToggleTarget(null)}
        title="상태 변경"
        description={`${toggleTarget?.product_code} ${toggleTarget?.product_name}을(를) ${toggleTarget?.is_active ? '비활성' : '활성'}으로 변경하시겠습니까?`}
        onConfirm={handleToggle}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="품번 삭제"
        description={`"${deleteTarget?.product_code}"을(를) 삭제하시겠습니까? 연결된 데이터가 있으면 삭제가 실패할 수 있습니다.`}
        onConfirm={handleDelete}
        confirmLabel={deleting ? '삭제 중...' : '삭제'}
        variant="destructive"
      />
    </div>
  );
}
