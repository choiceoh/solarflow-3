import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { useLCList } from '@/hooks/useProcurement';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import LCListTable from '@/components/procurement/LCListTable';
import LCForm from '@/components/procurement/LCForm';
import BLForm from '@/components/inbound/BLForm';
import BLDetailView from '@/components/inbound/BLDetailView';
import { LC_STATUS_LABEL, type LCRecord, type LCStatus } from '@/types/procurement';
import type { Bank, Company } from '@/types/masters';
import { saveBLShipmentWithLines } from '@/lib/blShipment';

function FT({ text }: { text: string }) {
  return <span className="flex flex-1 text-left truncate" data-slot="select-value">{text}</span>;
}

export default function LCPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [statusFilter, setStatusFilter] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editLC, setEditLC] = useState<LCRecord | null>(null);
  const [selectedBL, setSelectedBL] = useState<string | null>(null);
  const [blsVersion, setBlsVersion] = useState(0);

  // BL 등록 폼 인라인
  const [blFormOpen, setBlFormOpen] = useState(false);
  const [blPresetPOId, setBlPresetPOId] = useState<string | null>(null);
  const [blPresetLCId, setBlPresetLCId] = useState<string | null>(null);

  const filters: Record<string, string> = {};
  if (statusFilter) filters.status = statusFilter;
  if (bankFilter) filters.bank_id = bankFilter;
  const { data: lcs, loading, reload } = useLCList(filters);

  const filtered = companyFilter ? lcs.filter((l) => l.company_id === companyFilter) : lcs;

  useEffect(() => {
    fetchWithAuth<Company[]>('/api/v1/companies').then((list) => setCompanies(list.filter((c) => c.is_active))).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCompanyId) {
      fetchWithAuth<Bank[]>(`/api/v1/banks?company_id=${selectedCompanyId}`).then((list) => setBanks(list.filter((b) => b.is_active))).catch(() => {});
    }
  }, [selectedCompanyId]);

  if (!selectedCompanyId) {
    return <div className="flex items-center justify-center p-12"><p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p></div>;
  }

  if (selectedBL) {
    return (
      <div className="p-6">
        <BLDetailView blId={selectedBL} onBack={() => { setSelectedBL(null); setBlsVersion(v => v + 1); }} />
      </div>
    );
  }

  const handleCreate = async (d: Record<string, unknown>) => {
    await fetchWithAuth('/api/v1/lcs', { method: 'POST', body: JSON.stringify(d) });
    reload();
  };
  const handleUpdate = async (d: Record<string, unknown>) => {
    if (!editLC) return;
    await fetchWithAuth(`/api/v1/lcs/${editLC.lc_id}`, { method: 'PUT', body: JSON.stringify(d) });
    setEditLC(null); reload();
  };
  const handleDeleteLC = async (lcId: string) => {
    await fetchWithAuth(`/api/v1/lcs/${lcId}`, { method: 'DELETE' });
    reload();
  };
  const handleSettleLC = async (lc: LCRecord, repaymentDate: string) => {
    await fetchWithAuth(`/api/v1/lcs/${lc.lc_id}`, {
      method: 'PUT',
      body: JSON.stringify({ repaid: true, repayment_date: repaymentDate, status: 'settled' }),
    });
    reload();
  };
  const handleNewBLFromLC = (lc: LCRecord) => {
    setBlPresetPOId(lc.po_id);
    setBlPresetLCId(lc.lc_id);
    setBlFormOpen(true);
  };
  const handleCreateBL = async (formData: Record<string, unknown>) => {
    await saveBLShipmentWithLines(formData);
    setBlsVersion(v => v + 1);
  };

  const statusLabel = statusFilter ? (LC_STATUS_LABEL[statusFilter as LCStatus] ?? statusFilter) : '전체 상태';
  const bankLabel = bankFilter ? (banks.find((b) => b.bank_id === bankFilter)?.bank_name ?? '') : '전체 은행';
  const companyLabel = companyFilter ? (companies.find((c) => c.company_id === companyFilter)?.company_name ?? '') : '전체 법인';

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">L/C 개설 관리</h1>
      <div className="flex items-center gap-2">
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-28 text-xs"><FT text={statusLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem>{(Object.entries(LC_STATUS_LABEL) as [LCStatus, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={bankFilter || 'all'} onValueChange={(v) => setBankFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-32 text-xs"><FT text={bankLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 은행</SelectItem>{banks.map((b) => <SelectItem key={b.bank_id} value={b.bank_id}>{b.bank_name}</SelectItem>)}</SelectContent></Select>
        <Select value={companyFilter || 'all'} onValueChange={(v) => setCompanyFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-32 text-xs"><FT text={companyLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 법인</SelectItem>{companies.map((c) => <SelectItem key={c.company_id} value={c.company_id}>{c.company_name}</SelectItem>)}</SelectContent></Select>
        <div className="flex-1" />
        <Button size="sm" onClick={() => { setEditLC(null); setFormOpen(true); }}><Plus className="mr-1 h-4 w-4" />+ LC 개설</Button>
      </div>
      {loading ? <LoadingSpinner /> : (
        <LCListTable
          items={filtered}
          onEdit={(lc) => { setEditLC(lc); setFormOpen(true); }}
          onNew={() => { setEditLC(null); setFormOpen(true); }}
          onDelete={handleDeleteLC}
          onSettle={handleSettleLC}
          onSelectBL={setSelectedBL}
          onNewBL={handleNewBLFromLC}
          blsVersion={blsVersion}
        />
      )}
      <LCForm open={formOpen} onOpenChange={setFormOpen} onSubmit={editLC ? handleUpdate : handleCreate} editData={editLC} />
      <BLForm
        open={blFormOpen}
        onOpenChange={(v) => { setBlFormOpen(v); if (!v) { setBlPresetPOId(null); setBlPresetLCId(null); } }}
        onSubmit={handleCreateBL}
        presetPOId={blPresetPOId}
        presetLCId={blPresetLCId}
      />
    </div>
  );
}
