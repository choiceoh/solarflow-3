import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import DataTable, { type Column } from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import ConfirmDialog from '@/components/common/ConfirmDialog';
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
  const [toggleTarget, setToggleTarget] = useState<Partner | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Partner | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetchWithAuth(`/api/v1/partners/${deleteTarget.partner_id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      load();
    } catch { /* empty */ }
    setDeleting(false);
  };

  const handleToggle = async () => {
    if (!toggleTarget) return;
    await fetchWithAuth(`/api/v1/partners/${toggleTarget.partner_id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !toggleTarget.is_active }),
    });
    setToggleTarget(null);
    load();
  };

  const columns: Column<Partner>[] = [
    { key: 'partner_name', label: '거래처명', sortable: true },
    { key: 'partner_type', label: '유형', render: (r) => <Badge variant={typeVariant[r.partner_type] ?? 'secondary'}>{typeLabel[r.partner_type] ?? r.partner_type}</Badge> },
    { key: 'erp_code', label: 'ERP코드' },
    { key: 'contact_name', label: '담당자' },
    { key: 'contact_phone', label: '연락처' },
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
        <h1 className="text-lg font-semibold">거래처 관리</h1>
        <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />새로 등록</Button>
      </div>
      <DataTable columns={columns} data={filtered} loading={loading} searchable searchPlaceholder="거래처명, ERP코드, 담당자 검색" onSearch={handleSearch}
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
      <PartnerForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleSubmit} editData={editTarget} />
      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={() => setToggleTarget(null)}
        title="상태 변경"
        description={`${toggleTarget?.partner_name}을(를) ${toggleTarget?.is_active ? '비활성' : '활성'}으로 변경하시겠습니까?`}
        onConfirm={handleToggle}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="거래처 삭제"
        description={`"${deleteTarget?.partner_name}"을(를) 삭제하시겠습니까? 연결된 데이터가 있으면 삭제가 실패할 수 있습니다.`}
        onConfirm={handleDelete}
        confirmLabel={deleting ? '삭제 중...' : '삭제'}
        variant="destructive"
      />
    </div>
  );
}
