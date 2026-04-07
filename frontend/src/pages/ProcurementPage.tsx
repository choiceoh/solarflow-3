import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { usePOList, useLCList, useTTList, usePriceHistoryList } from '@/hooks/useProcurement';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import POListTable from '@/components/procurement/POListTable';
import PODetailView from '@/components/procurement/PODetailView';
import POForm from '@/components/procurement/POForm';
import LCListTable from '@/components/procurement/LCListTable';
import LCForm from '@/components/procurement/LCForm';
import TTListTable from '@/components/procurement/TTListTable';
import TTForm from '@/components/procurement/TTForm';
import PriceHistoryTable from '@/components/procurement/PriceHistoryTable';
import PriceHistoryForm from '@/components/procurement/PriceHistoryForm';
import { PO_STATUS_LABEL, CONTRACT_TYPE_LABEL, LC_STATUS_LABEL, TT_STATUS_LABEL } from '@/types/procurement';
import type { PurchaseOrder, LCRecord, TTRemittance, PriceHistory, POStatus, ContractType, LCStatus, TTStatus } from '@/types/procurement';
import type { Manufacturer, Bank } from '@/types/masters';

function FT({ text }: { text: string }) {
  return <span className="flex flex-1 text-left truncate" data-slot="select-value">{text}</span>;
}

export default function ProcurementPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [poList, setPoList] = useState<PurchaseOrder[]>([]);

  const [poStatusFilter, setPoStatusFilter] = useState('');
  const [poMfgFilter, setPoMfgFilter] = useState('');
  const [poTypeFilter, setPoTypeFilter] = useState('');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [poFormOpen, setPoFormOpen] = useState(false);
  const poFilters: Record<string, string> = {};
  if (poStatusFilter) poFilters.status = poStatusFilter;
  if (poMfgFilter) poFilters.manufacturer_id = poMfgFilter;
  if (poTypeFilter) poFilters.contract_type = poTypeFilter;
  const { data: pos, loading: poLoading, reload: reloadPO } = usePOList(poFilters);

  const [lcStatusFilter, setLcStatusFilter] = useState('');
  const [lcBankFilter, setLcBankFilter] = useState('');
  const [lcFormOpen, setLcFormOpen] = useState(false);
  const [editLC, setEditLC] = useState<LCRecord | null>(null);
  const lcFilters: Record<string, string> = {};
  if (lcStatusFilter) lcFilters.status = lcStatusFilter;
  if (lcBankFilter) lcFilters.bank_id = lcBankFilter;
  const { data: lcs, loading: lcLoading, reload: reloadLC } = useLCList(lcFilters);

  const [ttStatusFilter, setTtStatusFilter] = useState('');
  const [ttPoFilter, setTtPoFilter] = useState('');
  const [ttFormOpen, setTtFormOpen] = useState(false);
  const [editTT, setEditTT] = useState<TTRemittance | null>(null);
  const ttFilters: Record<string, string> = {};
  if (ttStatusFilter) ttFilters.status = ttStatusFilter;
  if (ttPoFilter) ttFilters.po_id = ttPoFilter;
  const { data: tts, loading: ttLoading, reload: reloadTT } = useTTList(ttFilters);

  const [phMfgFilter, setPhMfgFilter] = useState('');
  const [phFormOpen, setPhFormOpen] = useState(false);
  const [editPH, setEditPH] = useState<PriceHistory | null>(null);
  const { data: phs, loading: phLoading, reload: reloadPH } = usePriceHistoryList(phMfgFilter ? { manufacturer_id: phMfgFilter } : {});

  useEffect(() => {
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list.filter((m) => m.is_active))).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCompanyId) {
      fetchWithAuth<Bank[]>(`/api/v1/banks?company_id=${selectedCompanyId}`)
        .then((list) => setBanks(list.filter((b) => b.is_active))).catch(() => {});
      fetchWithAuth<PurchaseOrder[]>(`/api/v1/pos?company_id=${selectedCompanyId}`)
        .then(setPoList).catch(() => {});
    }
  }, [selectedCompanyId]);

  if (!selectedCompanyId) {
    return <div className="flex items-center justify-center p-12"><p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p></div>;
  }

  if (selectedPO) {
    return (
      <div className="p-6">
        <PODetailView po={selectedPO} onBack={() => { setSelectedPO(null); reloadPO(); }} onReload={reloadPO} />
      </div>
    );
  }

  const handleCreatePO = async (d: Record<string, unknown>) => {
    // 발주품목(po_lines)을 PO 본체와 분리하여 등록 (입고관리와 동일 패턴)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { lines, ...poData } = d as any;
    try {
      const created = await fetchWithAuth<{ po_id: string }>('/api/v1/pos', { method: 'POST', body: JSON.stringify(poData) });
      if (Array.isArray(lines) && lines.length > 0 && created?.po_id) {
        const failures: string[] = [];
        for (const line of lines) {
          try {
            await fetchWithAuth(`/api/v1/pos/${created.po_id}/lines`, {
              method: 'POST', body: JSON.stringify({ ...line, po_id: created.po_id }),
            });
          } catch (err) {
            failures.push(err instanceof Error ? err.message : '알 수 없는 오류');
          }
        }
        if (failures.length > 0) {
          throw new Error(`발주품목 ${failures.length}건 등록 실패: ${failures.join('; ')}`);
        }
      }
    } finally {
      reloadPO();
    }
  };
  const handleCreateLC = async (d: Record<string, unknown>) => { await fetchWithAuth('/api/v1/lcs', { method: 'POST', body: JSON.stringify(d) }); reloadLC(); };
  const handleUpdateLC = async (d: Record<string, unknown>) => { if (!editLC) return; await fetchWithAuth(`/api/v1/lcs/${editLC.lc_id}`, { method: 'PUT', body: JSON.stringify(d) }); setEditLC(null); reloadLC(); };
  const handleCreateTT = async (d: Record<string, unknown>) => { await fetchWithAuth('/api/v1/tts', { method: 'POST', body: JSON.stringify(d) }); reloadTT(); };
  const handleUpdateTT = async (d: Record<string, unknown>) => { if (!editTT) return; await fetchWithAuth(`/api/v1/tts/${editTT.tt_id}`, { method: 'PUT', body: JSON.stringify(d) }); setEditTT(null); reloadTT(); };
  const handleCreatePH = async (d: Record<string, unknown>) => { await fetchWithAuth('/api/v1/price-histories', { method: 'POST', body: JSON.stringify(d) }); reloadPH(); };
  const handleUpdatePH = async (d: Record<string, unknown>) => { if (!editPH) return; await fetchWithAuth(`/api/v1/price-histories/${editPH.price_history_id}`, { method: 'PUT', body: JSON.stringify(d) }); setEditPH(null); reloadPH(); };

  // 필터 라벨 (한글 보장)
  const poStatusLabel = poStatusFilter ? (PO_STATUS_LABEL[poStatusFilter as POStatus] ?? poStatusFilter) : '전체 상태';
  const poMfgLabel = poMfgFilter ? (manufacturers.find(m => m.manufacturer_id === poMfgFilter)?.name_kr ?? '') : '전체 제조사';
  const poTypeLabel = poTypeFilter ? (CONTRACT_TYPE_LABEL[poTypeFilter as ContractType] ?? poTypeFilter) : '전체 유형';
  const lcStatusLabel = lcStatusFilter ? (LC_STATUS_LABEL[lcStatusFilter as LCStatus] ?? lcStatusFilter) : '전체 상태';
  const lcBankLabel = lcBankFilter ? (banks.find(b => b.bank_id === lcBankFilter)?.bank_name ?? '') : '전체 은행';
  const ttStatusLabel = ttStatusFilter ? (TT_STATUS_LABEL[ttStatusFilter as TTStatus] ?? ttStatusFilter) : '전체 상태';
  const ttPoLabel = ttPoFilter ? (poList.find(p => p.po_id === ttPoFilter)?.po_number ?? '') : '전체 PO';
  const phMfgLabel = phMfgFilter ? (manufacturers.find(m => m.manufacturer_id === phMfgFilter)?.name_kr ?? '') : '전체 제조사';

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">발주 / 결제</h1>

      <Tabs defaultValue="po">
        <TabsList>
          <TabsTrigger value="po">PO</TabsTrigger>
          <TabsTrigger value="lc">LC</TabsTrigger>
          <TabsTrigger value="tt">TT</TabsTrigger>
          <TabsTrigger value="price">단가이력</TabsTrigger>
        </TabsList>

        <TabsContent value="po">
          <div className="flex items-center gap-2 mb-3">
            <Select value={poStatusFilter || 'all'} onValueChange={(v) => setPoStatusFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-28 text-xs"><FT text={poStatusLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem>{(Object.entries(PO_STATUS_LABEL) as [POStatus, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            <Select value={poMfgFilter || 'all'} onValueChange={(v) => setPoMfgFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-32 text-xs"><FT text={poMfgLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 제조사</SelectItem>{manufacturers.map((m) => <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>)}</SelectContent></Select>
            <Select value={poTypeFilter || 'all'} onValueChange={(v) => setPoTypeFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-28 text-xs"><FT text={poTypeLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 유형</SelectItem>{(Object.entries(CONTRACT_TYPE_LABEL) as [ContractType, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            <div className="flex-1" />
            <Button size="sm" onClick={() => setPoFormOpen(true)}><Plus className="mr-1 h-4 w-4" />새로 등록</Button>
          </div>
          {poLoading ? <LoadingSpinner /> : <POListTable items={pos} onSelect={setSelectedPO} onNew={() => setPoFormOpen(true)} />}
          <POForm open={poFormOpen} onOpenChange={setPoFormOpen} onSubmit={handleCreatePO} />
        </TabsContent>

        <TabsContent value="lc">
          <div className="flex items-center gap-2 mb-3">
            <Select value={lcStatusFilter || 'all'} onValueChange={(v) => setLcStatusFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-28 text-xs"><FT text={lcStatusLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem>{(Object.entries(LC_STATUS_LABEL) as [LCStatus, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            <Select value={lcBankFilter || 'all'} onValueChange={(v) => setLcBankFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-32 text-xs"><FT text={lcBankLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 은행</SelectItem>{banks.map((b) => <SelectItem key={b.bank_id} value={b.bank_id}>{b.bank_name}</SelectItem>)}</SelectContent></Select>
            <div className="flex-1" />
            <Button size="sm" onClick={() => { setEditLC(null); setLcFormOpen(true); }}><Plus className="mr-1 h-4 w-4" />새로 등록</Button>
          </div>
          {lcLoading ? <LoadingSpinner /> : <LCListTable items={lcs} onEdit={(lc) => { setEditLC(lc); setLcFormOpen(true); }} onNew={() => { setEditLC(null); setLcFormOpen(true); }} />}
          <LCForm open={lcFormOpen} onOpenChange={setLcFormOpen} onSubmit={editLC ? handleUpdateLC : handleCreateLC} editData={editLC} />
        </TabsContent>

        <TabsContent value="tt">
          <div className="flex items-center gap-2 mb-3">
            <Select value={ttStatusFilter || 'all'} onValueChange={(v) => setTtStatusFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-28 text-xs"><FT text={ttStatusLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem>{(Object.entries(TT_STATUS_LABEL) as [TTStatus, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            <Select value={ttPoFilter || 'all'} onValueChange={(v) => setTtPoFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-36 text-xs"><FT text={ttPoLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 PO</SelectItem>{poList.map((p) => <SelectItem key={p.po_id} value={p.po_id}>{p.po_number || p.po_id.slice(0, 8)}</SelectItem>)}</SelectContent></Select>
            <div className="flex-1" />
            <Button size="sm" onClick={() => { setEditTT(null); setTtFormOpen(true); }}><Plus className="mr-1 h-4 w-4" />새로 등록</Button>
          </div>
          {ttLoading ? <LoadingSpinner /> : <TTListTable items={tts} onEdit={(tt) => { setEditTT(tt); setTtFormOpen(true); }} onNew={() => { setEditTT(null); setTtFormOpen(true); }} />}
          <TTForm open={ttFormOpen} onOpenChange={setTtFormOpen} onSubmit={editTT ? handleUpdateTT : handleCreateTT} editData={editTT} />
        </TabsContent>

        <TabsContent value="price">
          <div className="flex items-center gap-2 mb-3">
            <Select value={phMfgFilter || 'all'} onValueChange={(v) => setPhMfgFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-32 text-xs"><FT text={phMfgLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 제조사</SelectItem>{manufacturers.map((m) => <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>)}</SelectContent></Select>
            <div className="flex-1" />
            <Button size="sm" onClick={() => { setEditPH(null); setPhFormOpen(true); }}><Plus className="mr-1 h-4 w-4" />새로 등록</Button>
          </div>
          {phLoading ? <LoadingSpinner /> : <PriceHistoryTable items={phs} onEdit={(ph) => { setEditPH(ph); setPhFormOpen(true); }} onNew={() => { setEditPH(null); setPhFormOpen(true); }} />}
          <PriceHistoryForm open={phFormOpen} onOpenChange={setPhFormOpen} onSubmit={editPH ? handleUpdatePH : handleCreatePH} editData={editPH} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
