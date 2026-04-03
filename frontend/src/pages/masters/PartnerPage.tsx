import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DataTable, { type Column } from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import PartnerForm from '@/components/masters/PartnerForm';
import { fetchWithAuth } from '@/lib/api';
import type { Partner } from '@/types/masters';

const typeLabel: Record<string, string> = { supplier: '공급사', customer: '고객사', both: '공급+고객' };
const typeVariant: Record<string, 'default' | 'secondary' | 'outline'> = { supplier: 'secondary', customer: 'default', both: 'outline' };

export default function PartnerPage() {
  const [data, setData] = useState<Partner[]>([]);
  const [filtered, setFiltered] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Partner | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const list = await fetchWithAuth<Partner[]>('/api/v1/partners'); setData(list); setFiltered(list); } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSearch = useCallback((q: string) => {
    if (!q) { setFiltered(data); return; }
    const lower = q.toLowerCase();
    setFiltered(data.filter((p) =>
      p.partner_name.toLowerCase().includes(lower) ||
      (p.erp_code ?? '').toLowerCase().includes(lower) ||
      (p.contact_name ?? '').toLowerCase().includes(lower)
    ));
  }, [data]);

  const handleSubmit = async (formData: Record<string, unknown>) => {
    if (editTarget) {
      await fetchWithAuth(`/api/v1/partners/${editTarget.partner_id}`, { method: 'PUT', body: JSON.stringify(formData) });
    } else {
      await fetchWithAuth('/api/v1/partners', { method: 'POST', body: JSON.stringify(formData) });
    }
    setEditTarget(null); load();
  };

  const columns: Column<Partner>[] = [
    { key: 'partner_name', label: '거래처명', sortable: true },
    { key: 'partner_type', label: '유형', render: (r) => <Badge variant={typeVariant[r.partner_type] ?? 'secondary'}>{typeLabel[r.partner_type] ?? r.partner_type}</Badge> },
    { key: 'erp_code', label: 'ERP코드' },
    { key: 'contact_name', label: '담당자' },
    { key: 'contact_phone', label: '연락처' },
    { key: 'is_active', label: '활성', render: (r) => <StatusBadge isActive={r.is_active} /> },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">거래처 관리</h1>
        <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />새로 등록</Button>
      </div>
      <DataTable columns={columns} data={filtered} loading={loading} searchable searchPlaceholder="거래처명, ERP코드, 담당자 검색" onSearch={handleSearch}
        actions={(row) => (<Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditTarget(row); setFormOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>)} />
      <PartnerForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleSubmit} editData={editTarget} />
    </div>
  );
}
