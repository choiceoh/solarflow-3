import { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DataTable, { type Column } from '@/components/common/DataTable';
import { activeToggleColumn } from '@/components/common/activeToggleColumn';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import PartnerForm from '@/components/masters/PartnerForm';
import { MasterConsole } from '@/components/command/MasterConsole';
import { RailBlock } from '@/components/command/MockupPrimitives';
import { fetchWithAuth } from '@/lib/api';
import type { Partner } from '@/types/masters';

const typeLabel: Record<string, string> = { supplier: '공급사', customer: '고객사', both: '공급+고객' };
const typeVariant: Record<string, 'default' | 'secondary' | 'outline'> = { supplier: 'secondary', customer: 'default', both: 'outline' };

export default function PartnerPage() {
  const [data, setData] = useState<Partner[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Partner | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Partner | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Partner | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const list = await fetchWithAuth<Partner[]>('/api/v1/partners'); setData(list); } catch { /* empty */ }
    setLoading(false);
  }, []);

  // 초기 로드 — 마운트 시 1회만 비동기 fetch (load는 갱신용으로 유지)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchWithAuth<Partner[]>('/api/v1/partners');
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
    return data.filter((p) =>
      p.partner_name.toLowerCase().includes(lower) ||
      (p.erp_code ?? '').toLowerCase().includes(lower) ||
      (p.contact_name ?? '').toLowerCase().includes(lower)
    );
  }, [data, searchQuery]);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
  }, []);

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
    activeToggleColumn<Partner>(setToggleTarget),
  ];

  const activeCount = data.filter((partner) => partner.is_active).length;
  const customerCount = data.filter((partner) => partner.partner_type === 'customer' || partner.partner_type === 'both').length;
  const supplierCount = data.filter((partner) => partner.partner_type === 'supplier' || partner.partner_type === 'both').length;
  const recentRows = filtered.slice(0, 4);

  return (
    <>
      <MasterConsole
        title="거래처 관리"
        description="고객사, 공급사, 양방향 거래처를 판매·구매·수금 흐름에 연결합니다."
        tableTitle="거래처 마스터"
        tableSub={`${filtered.length.toLocaleString()} / ${data.length.toLocaleString()}개 표시`}
        actions={
          <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />새로 등록</Button>
        }
        metrics={[
          { label: '전체 거래처', value: data.length.toLocaleString(), sub: 'ERP 코드 포함', tone: 'solar', spark: [24, 28, 31, 36, data.length || 1] },
          { label: '고객사', value: customerCount.toLocaleString(), sub: '수주/매출 대상', tone: 'info' },
          { label: '공급사', value: supplierCount.toLocaleString(), sub: '구매/물류 대상', tone: 'warn' },
          { label: '활성', value: activeCount.toLocaleString(), sub: '거래 가능', tone: 'pos' },
        ]}
        rail={
          <>
            <RailBlock title="거래 유형" accent="var(--solar-3)" count={`${customerCount + supplierCount}`}>
              <div className="space-y-2 text-[12px]">
                <div className="flex justify-between"><span className="text-[var(--ink-3)]">고객사</span><span className="mono font-semibold">{customerCount}</span></div>
                <div className="flex justify-between"><span className="text-[var(--ink-3)]">공급사</span><span className="mono font-semibold">{supplierCount}</span></div>
                <div className="flex justify-between"><span className="text-[var(--ink-3)]">양방향</span><span className="mono font-semibold">{data.filter((partner) => partner.partner_type === 'both').length}</span></div>
              </div>
            </RailBlock>
            <RailBlock title="최근 표시" count={recentRows.length}>
              <div className="space-y-2">
                {recentRows.map((partner) => (
                  <div key={partner.partner_id} className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-2">
                    <div className="truncate text-[12px] font-semibold text-[var(--ink)]">{partner.partner_name}</div>
                    <div className="mono mt-1 text-[10px] text-[var(--ink-4)]">{typeLabel[partner.partner_type] ?? partner.partner_type} · {partner.erp_code ?? 'ERP 미지정'}</div>
                  </div>
                ))}
              </div>
            </RailBlock>
          </>
        }
      >
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
      </MasterConsole>
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
    </>
  );
}
