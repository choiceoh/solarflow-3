import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DataTable, { type Column } from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import ProductForm from '@/components/masters/ProductForm';
import { fetchWithAuth } from '@/lib/api';
import { formatWp, formatSize } from '@/lib/utils';
import type { Product } from '@/types/masters';

// 감리 지적 2번: 제조사→크기→규격 다중 키 정렬
function sortProducts(items: Product[]): Product[] {
  return [...items].sort((a, b) => {
    if ((a.manufacturer_name ?? '') !== (b.manufacturer_name ?? ''))
      return (a.manufacturer_name ?? '').localeCompare(b.manufacturer_name ?? '', 'ko');
    if (a.module_width_mm !== b.module_width_mm) return a.module_width_mm - b.module_width_mm;
    if (a.module_height_mm !== b.module_height_mm) return a.module_height_mm - b.module_height_mm;
    return a.spec_wp - b.spec_wp;
  });
}

export default function ProductPage() {
  const [data, setData] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchWithAuth<Product[]>('/api/v1/products');
      setData(list);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let items = data;
    if (search) {
      const lower = search.toLowerCase();
      items = items.filter((p) =>
        p.product_code.toLowerCase().includes(lower) ||
        p.product_name.toLowerCase().includes(lower) ||
        (p.manufacturer_name ?? '').toLowerCase().includes(lower)
      );
    }
    return sortProducts(items);
  }, [data, search]);

  const handleSubmit = async (formData: Record<string, unknown>) => {
    if (editTarget) {
      await fetchWithAuth(`/api/v1/products/${editTarget.product_id}`, { method: 'PUT', body: JSON.stringify(formData) });
    } else {
      await fetchWithAuth('/api/v1/products', { method: 'POST', body: JSON.stringify(formData) });
    }
    setEditTarget(null);
    load();
  };

  const columns: Column<Product>[] = [
    { key: 'product_code', label: '품번코드', sortable: true },
    { key: 'product_name', label: '품명', sortable: true },
    { key: 'manufacturer_name', label: '제조사', sortable: true },
    { key: 'spec_wp', label: '규격(Wp)', sortable: true, render: (r) => formatWp(r.spec_wp) },
    { key: 'module_width_mm', label: '크기(mm)', render: (r) => formatSize(r.module_width_mm, r.module_height_mm) },
    { key: 'is_active', label: '활성', render: (r) => <StatusBadge isActive={r.is_active} /> },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">품번 관리</h1>
        <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" />새로 등록
        </Button>
      </div>
      <DataTable
        columns={columns} data={filtered} loading={loading}
        searchable searchPlaceholder="품번코드, 품명, 제조사 검색" onSearch={setSearch}
        actions={(row) => (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditTarget(row); setFormOpen(true); }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      />
      <ProductForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleSubmit} editData={editTarget} />
    </div>
  );
}
