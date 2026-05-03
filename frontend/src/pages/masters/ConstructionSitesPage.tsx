import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Pencil, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EmptyState from '@/components/common/EmptyState';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { MasterConsole } from '@/components/command/MasterConsole';
import { FilterChips, RailBlock } from '@/components/command/MockupPrimitives';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import type { ConstructionSite } from '@/types/masters';
import type { InventoryAllocation } from '@/components/inventory/AllocationForm';

/* ─── 헬퍼 ──────────────────────────────────────── */
function SiteTypeBadge({ type }: { type: string }) {
  return type === 'own'
    ? <Badge variant="outline" className="border-purple-400 text-purple-700 text-[10px]">자체</Badge>
    : <Badge variant="outline" className="border-orange-400 text-orange-700 text-[10px]">EPC</Badge>;
}

function PurposeBadge({ purpose }: { purpose: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    sale:             { label: '판매',    cls: 'bg-blue-100 text-blue-700' },
    construction_own: { label: '자체공사', cls: 'bg-purple-100 text-purple-700' },
    construction_epc: { label: 'EPC공사', cls: 'bg-orange-100 text-orange-700' },
    construction:     { label: '공사',    cls: 'bg-gray-100 text-gray-700' },
    other:            { label: '기타',    cls: 'bg-gray-100 text-gray-600' },
  };
  const { label, cls } = map[purpose] ?? { label: purpose, cls: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{label}</span>;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:   'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    hold:      'bg-gray-100 text-gray-600',
  };
  const labels: Record<string, string> = {
    pending: '대기', confirmed: '확정', cancelled: '취소', hold: '보류',
  };
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[status] ?? status}
    </span>
  );
}

/* ─── 현장 수정 폼 다이얼로그 ─────────────────────── */
interface SiteFormData {
  name: string;
  location: string;
  site_type: 'own' | 'epc';
  capacity_mw: string;
  started_at: string;
  completed_at: string;
  notes: string;
}
const emptySiteForm = (): SiteFormData => ({
  name: '', location: '', site_type: 'own',
  capacity_mw: '', started_at: '', completed_at: '', notes: '',
});

interface SiteFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  editData?: ConstructionSite;
  onSaved: () => void;
}
function SiteFormDialog({ open, onOpenChange, companyId, editData, onSaved }: SiteFormDialogProps) {
  const [form, setForm] = useState<SiteFormData>(emptySiteForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (editData) {
      setForm({
        name:         editData.name,
        location:     editData.location ?? '',
        site_type:    editData.site_type,
        capacity_mw:  editData.capacity_mw != null ? String(editData.capacity_mw) : '',
        started_at:   editData.started_at ?? '',
        completed_at: editData.completed_at ?? '',
        notes:        editData.notes ?? '',
      });
    } else {
      setForm(emptySiteForm());
    }
  }, [open, editData]);

  const set = (field: keyof SiteFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('발전소명은 필수입니다'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        company_id:   companyId,
        name:         form.name.trim(),
        location:     form.location.trim() || undefined,
        site_type:    form.site_type,
        capacity_mw:  form.capacity_mw ? parseFloat(form.capacity_mw) : undefined,
        started_at:   form.started_at || undefined,
        completed_at: form.completed_at || undefined,
        notes:        form.notes.trim() || undefined,
      };
      if (editData) {
        await fetchWithAuth(`/api/v1/construction-sites/${editData.site_id}`, {
          method: 'PUT', body: JSON.stringify(payload),
        });
      } else {
        await fetchWithAuth('/api/v1/construction-sites', {
          method: 'POST', body: JSON.stringify(payload),
        });
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editData ? '현장 수정' : '새 현장 등록'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>발전소명 *</Label>
            <Input value={form.name} onChange={set('name')} placeholder="예) 영광 갈동 태양광 1호기" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>지명</Label>
              <Input value={form.location} onChange={set('location')} placeholder="예) 전남 영광군 갈동리" />
            </div>
            <div className="space-y-1.5">
              <Label>현장 유형</Label>
              <Select
                value={form.site_type}
                onValueChange={(v) => setForm((prev) => ({ ...prev, site_type: v as 'own' | 'epc' }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="own">자체 현장</SelectItem>
                  <SelectItem value="epc">타사 EPC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>설비용량 (MW)</Label>
              <Input
                type="number" step="0.001"
                value={form.capacity_mw}
                onChange={set('capacity_mw')}
                placeholder="예) 5.0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>착공일</Label>
              <Input type="date" value={form.started_at} onChange={set('started_at')} />
            </div>
            <div className="space-y-1.5">
              <Label>준공일</Label>
              <Input type="date" value={form.completed_at} onChange={set('completed_at')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>메모</Label>
            <Input value={form.notes} onChange={set('notes')} placeholder="특이사항 등" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : (editData ? '수정 저장' : '등록')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 현장 공급 이력 (인라인 펼치기) ──────────────── */
function AllocationHistory({ siteId }: { siteId: string }) {
  const [loading, setLoading] = useState(true);
  const [allocs, setAllocs] = useState<InventoryAllocation[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchWithAuth<{ site: ConstructionSite; allocations: InventoryAllocation[] }>(
      `/api/v1/construction-sites/${siteId}`,
    )
      .then((res) => { if (!cancelled) setAllocs(res.allocations ?? []); })
      .catch(() => { if (!cancelled) setAllocs([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId]);

  if (loading) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground">이력 불러오는 중...</div>
    );
  }
  if (allocs.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground">공급 이력이 없습니다</div>
    );
  }

  const totalKw = allocs.reduce((s, a) => s + (a.capacity_kw ?? 0), 0);
  const totalQty = allocs.reduce((s, a) => s + a.quantity, 0);

  return (
    <div className="bg-muted/20 border-t px-4 py-3">
      <div className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
        공급 이력 ({allocs.length}건 · {totalKw >= 1000 ? (totalKw / 1000).toFixed(2) + ' MW' : Math.round(totalKw) + ' kW'})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-1.5 pr-4 font-medium">품목</th>
              <th className="text-right py-1.5 pr-4 font-medium">수량</th>
              <th className="text-right py-1.5 pr-4 font-medium">용량</th>
              <th className="text-left py-1.5 pr-4 font-medium">용도</th>
              <th className="text-left py-1.5 pr-4 font-medium">상태</th>
              <th className="text-left py-1.5 font-medium">등록일</th>
            </tr>
          </thead>
          <tbody>
            {allocs.map((a) => (
              <tr key={a.alloc_id} className="border-b border-border/40 last:border-0">
                <td className="py-1.5 pr-4">
                  {a.product_code
                    ? <span className="font-mono">{a.product_code}</span>
                    : <span className="text-muted-foreground">{a.product_id.slice(0, 8)}…</span>}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums">
                  {a.quantity.toLocaleString('ko-KR')} EA
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums">
                  {a.capacity_kw != null
                    ? (a.capacity_kw >= 1000
                        ? (a.capacity_kw / 1000).toFixed(2) + ' MW'
                        : Math.round(a.capacity_kw) + ' kW')
                    : '—'}
                </td>
                <td className="py-1.5 pr-4"><PurposeBadge purpose={a.purpose} /></td>
                <td className="py-1.5 pr-4"><StatusPill status={a.status} /></td>
                <td className="py-1.5 text-muted-foreground">
                  {a.created_at ? a.created_at.slice(0, 10) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/20">
              <td className="py-1.5 pr-4 font-medium">합계</td>
              <td className="py-1.5 pr-4 text-right font-medium tabular-nums">
                {totalQty.toLocaleString('ko-KR')} EA
              </td>
              <td className="py-1.5 pr-4 text-right font-medium tabular-nums">
                {totalKw >= 1000 ? (totalKw / 1000).toFixed(2) + ' MW' : Math.round(totalKw) + ' kW'}
              </td>
              <td colSpan={3} className="py-1.5 text-xs text-muted-foreground">
                {allocs.length.toLocaleString('ko-KR')}건
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ─── 메인 페이지 ───────────────────────────────── */
export default function ConstructionSitesPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const companies         = useAppStore((s) => s.companies);
  const noCompany = !selectedCompanyId || selectedCompanyId === 'all';

  const [sites,      setSites]      = useState<ConstructionSite[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'own' | 'epc'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formOpen,      setFormOpen]      = useState(false);
  const [editTarget,    setEditTarget]    = useState<ConstructionSite | undefined>(undefined);
  const [deleteTarget,  setDeleteTarget]  = useState<ConstructionSite | null>(null);
  const [deleting,      setDeleting]      = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (!noCompany) params.set('company_id', selectedCompanyId!);
      if (typeFilter !== 'all') params.set('site_type', typeFilter);
      if (search.trim()) params.set('q', search.trim());
      const list = await fetchWithAuth<ConstructionSite[]>(`/api/v1/construction-sites?${params}`);
      setSites(list);
    } catch { setSites([]); }
    setLoading(false);
  }, [selectedCompanyId, typeFilter, search, noCompany]);

  // 검색어 debounce (500ms)
  useEffect(() => {
    const t = setTimeout(load, 500);
    return () => clearTimeout(t);
  }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetchWithAuth(`/api/v1/construction-sites/${deleteTarget.site_id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      load();
    } catch { /* empty */ }
    setDeleting(false);
  };

  const handleToggleActive = async (site: ConstructionSite) => {
    await fetchWithAuth(`/api/v1/construction-sites/${site.site_id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !site.is_active }),
    });
    load();
  };

  const companyName = useMemo(() => {
    if (noCompany) return null;
    return companies.find((c) => c.company_id === selectedCompanyId)?.company_name;
  }, [companies, selectedCompanyId, noCompany]);

  const activeCount = sites.filter((site) => site.is_active).length;
  const ownCount = sites.filter((site) => site.site_type === 'own').length;
  const epcCount = sites.filter((site) => site.site_type === 'epc').length;
  const totalCapacity = sites.reduce((sum, site) => sum + (site.capacity_mw ?? 0), 0);
  const recentSites = sites.slice(0, 4);

  return (
    <>
      <MasterConsole
        title="공사 현장 관리"
        description={companyName ? `${companyName} 현장과 공급 이력을 연결합니다.` : '법인 선택 후 현장, 용량, 공급 이력을 관리합니다.'}
        tableTitle="현장 목록"
        tableSub={`${sites.length.toLocaleString()}개 · ${typeFilter === 'all' ? '전체' : typeFilter.toUpperCase()}`}
        actions={
          <Button
            size="sm"
            onClick={() => { setEditTarget(undefined); setFormOpen(true); }}
            disabled={noCompany}
          >
            <Plus className="mr-1.5 h-4 w-4" />새 현장 등록
          </Button>
        }
        toolbar={
          <FilterChips
            options={[
              { key: 'all', label: '전체', count: sites.length },
              { key: 'own', label: '자체', count: ownCount },
              { key: 'epc', label: 'EPC', count: epcCount },
            ]}
            value={typeFilter}
            onChange={(value) => setTypeFilter(value as 'all' | 'own' | 'epc')}
          />
        }
        metrics={[
          { label: '현장 수', value: sites.length.toLocaleString(), sub: companyName ?? '법인 미선택', tone: 'solar', spark: [2, 3, 5, sites.length || 1] },
          { label: '활성', value: activeCount.toLocaleString(), sub: '공급 가능', tone: 'pos' },
          { label: '자체/EPC', value: `${ownCount}/${epcCount}`, sub: '현장 유형', tone: 'info' },
          { label: '총 용량', value: totalCapacity.toFixed(2), unit: 'MW', sub: '등록 용량 합계', tone: 'warn' },
        ]}
        rail={
          <>
            <RailBlock title="선택 법인" accent="var(--solar-3)" count={companyName ?? '미선택'}>
              <div className="text-[11px] leading-5 text-[var(--ink-3)]">
                {noCompany ? '좌측 상단에서 법인을 선택하면 현장 등록과 조회가 활성화됩니다.' : '현장 공급 이력은 선택 법인의 재고 배정과 연결됩니다.'}
              </div>
            </RailBlock>
            <RailBlock title="최근 현장" count={recentSites.length}>
              <div className="space-y-2">
                {recentSites.map((site) => (
                  <div key={site.site_id} className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-2">
                    <div className="truncate text-[12px] font-semibold text-[var(--ink)]">{site.name}</div>
                    <div className="mono mt-1 text-[10px] text-[var(--ink-4)]">{site.location ?? '위치 없음'} · {site.capacity_mw ?? 0}MW</div>
                  </div>
                ))}
              </div>
            </RailBlock>
          </>
        }
      >
        <div className="space-y-3">
          {noCompany && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              좌측 상단에서 법인을 선택하면 해당 법인의 공사 현장을 관리할 수 있습니다
            </div>
          )}

          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-sm"
              placeholder="발전소명, 지명 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>
          ) : sites.length === 0 ? (
            <EmptyState message="등록된 공사 현장이 없습니다" />
          ) : (
            <div className="overflow-hidden rounded-md border divide-y">
              {sites.map((site) => (
                <div key={site.site_id}>
                  <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/20">
                    <button
                      type="button"
                      onClick={() => setExpandedId((prev) => (prev === site.site_id ? null : site.site_id))}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {expandedId === site.site_id
                        ? <ChevronDown className="size-4" />
                        : <ChevronRight className="size-4" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{site.name}</span>
                        <SiteTypeBadge type={site.site_type} />
                        {!site.is_active && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">비활성</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {site.location && <span>{site.location}</span>}
                        {site.capacity_mw != null && <span>{site.capacity_mw} MW</span>}
                        {site.started_at && <span>착공 {site.started_at}</span>}
                        {site.completed_at && <span>준공 {site.completed_at}</span>}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <Switch
                        checked={site.is_active}
                        onCheckedChange={() => handleToggleActive(site)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => { setEditTarget(site); setFormOpen(true); }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-red-500 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setDeleteTarget(site)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {expandedId === site.site_id && (
                    <AllocationHistory siteId={site.site_id} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </MasterConsole>

      <SiteFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        companyId={selectedCompanyId ?? ''}
        editData={editTarget}
        onSaved={load}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="현장 삭제"
        description={`"${deleteTarget?.name}"을(를) 삭제하시겠습니까? 연결된 데이터가 있으면 삭제가 실패할 수 있습니다.`}
        onConfirm={handleDelete}
        confirmLabel={deleting ? '삭제 중...' : '삭제'}
        variant="destructive"
      />
    </>
  );
}
