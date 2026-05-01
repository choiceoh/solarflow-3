import { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DataTable, { type Column } from '@/components/common/DataTable';
import { activeToggleColumn } from '@/components/common/activeToggleColumn';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import ManufacturerForm from '@/components/masters/ManufacturerForm';
import { MasterConsole } from '@/components/command/MasterConsole';
import { RailBlock } from '@/components/command/MockupPrimitives';
import { fetchWithAuth } from '@/lib/api';
import { sortManufacturers } from '@/lib/manufacturerPriority';
import { useAppStore } from '@/stores/appStore';
import type { Manufacturer } from '@/types/masters';

export default function ManufacturerPage() {
  const [data, setData] = useState<Manufacturer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Manufacturer | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Manufacturer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Manufacturer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const invalidateManufacturers = useAppStore((s) => s.invalidateManufacturers);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers');
      setData(sortManufacturers(list));
      invalidateManufacturers();
    } catch { /* empty */ }
    setLoading(false);
  }, [invalidateManufacturers]);

  // 초기 로드 — 마운트 시 1회만 비동기 fetch (load는 갱신용으로 유지)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers');
        if (!cancelled) setData(sortManufacturers(list));
      } catch { /* empty */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // 검색어를 파생 값으로 계산
  const filtered = useMemo(() => {
    if (!searchQuery) return data;
    const lower = searchQuery.toLowerCase();
    return data.filter((m) =>
      m.name_kr.toLowerCase().includes(lower) ||
      (m.name_en ?? '').toLowerCase().includes(lower) ||
      m.country.toLowerCase().includes(lower)
    );
  }, [data, searchQuery]);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
  }, []);

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
    { key: 'priority_rank', label: '순위', sortable: true },
    { key: 'tier', label: 'Tier', sortable: true, render: (r) => `Tier${r.tier ?? 3}` },
    { key: 'name_kr', label: '제조사명(한)', sortable: true },
    { key: 'name_en', label: '제조사명(영)', sortable: true },
    { key: 'country', label: '국가', sortable: true },
    { key: 'domestic_foreign', label: '국내/해외', sortable: true },
    activeToggleColumn<Manufacturer>(setToggleTarget),
  ];

  const activeCount = data.filter((manufacturer) => manufacturer.is_active).length;
  const overseasCount = data.filter((manufacturer) => manufacturer.domestic_foreign === '해외').length;
  const tier1Count = data.filter((manufacturer) => manufacturer.tier === 1).length;
  const priorityRows = filtered.slice(0, 4);

  return (
    <>
      <MasterConsole
        title="제조사 관리"
        description="품번, 재고, 구매 단가의 상위 축이 되는 제조사 우선순위와 활성 상태입니다."
        tableTitle="제조사 마스터"
        tableSub={`${filtered.length.toLocaleString()} / ${data.length.toLocaleString()}개 표시`}
        actions={
          <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" />새로 등록
          </Button>
        }
        metrics={[
          { label: '전체 제조사', value: data.length.toLocaleString(), sub: '정렬 우선순위 포함', tone: 'solar', spark: [5, 6, 7, 8, data.length || 1] },
          { label: '활성', value: activeCount.toLocaleString(), sub: '발주/재고 선택 가능', tone: 'pos' },
          { label: '해외', value: overseasCount.toLocaleString(), sub: '직수입 대상', tone: 'info' },
          { label: 'Tier 1', value: tier1Count.toLocaleString(), sub: '우선 검토군', tone: 'warn' },
        ]}
        rail={
          <>
            <RailBlock title="우선순위" accent="var(--solar-3)" count={priorityRows.length}>
              <div className="space-y-2">
                {priorityRows.map((manufacturer) => (
                  <div key={manufacturer.manufacturer_id} className="flex items-center justify-between gap-2 rounded border border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold text-[var(--ink)]">{manufacturer.name_kr}</div>
                      <div className="mono mt-1 text-[10px] text-[var(--ink-4)]">{manufacturer.country} · Tier{manufacturer.tier ?? 3}</div>
                    </div>
                    <span className="mono text-[11px] font-bold text-[var(--solar-3)]">#{manufacturer.priority_rank ?? '-'}</span>
                  </div>
                ))}
              </div>
            </RailBlock>
            <RailBlock title="구성" count={`${overseasCount} 해외`}>
              <div className="space-y-2 text-[12px]">
                <div className="flex justify-between"><span className="text-[var(--ink-3)]">국내</span><span className="mono font-semibold">{data.length - overseasCount}</span></div>
                <div className="flex justify-between"><span className="text-[var(--ink-3)]">해외</span><span className="mono font-semibold">{overseasCount}</span></div>
              </div>
            </RailBlock>
          </>
        }
      >
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
      </MasterConsole>
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
    </>
  );
}
