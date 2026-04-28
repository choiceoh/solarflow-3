import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Receipt, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useAppStore } from '@/stores/appStore';
import { useExpenseList } from '@/hooks/useCustoms';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import DeclarationDetailView from '@/components/customs/DeclarationDetailView';
import DeclarationForm from '@/components/customs/DeclarationForm';
import ExpenseListTable from '@/components/customs/ExpenseListTable';
import ExpenseForm from '@/components/customs/ExpenseForm';
import ExchangeComparePanel from '@/components/customs/ExchangeComparePanel';
import { EXPENSE_TYPE_LABEL, type ExpenseType, type Expense } from '@/types/customs';
import type { BLShipment } from '@/types/inbound';
import ExcelToolbar from '@/components/excel/ExcelToolbar';

function FT({ text }: { text: string }) {
  return <span className="flex flex-1 text-left truncate" data-slot="select-value">{text}</span>;
}

export default function CustomsPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  // 탭 1: 수입면장
  const [declBlFilter] = useState('');
  const [selectedDecl, setSelectedDecl] = useState<string | null>(null);
  const [declFormOpen, setDeclFormOpen] = useState(false);
  const [presetBLId, setPresetBLId] = useState<string | null>(null);
  const location = useLocation();
  // R1-1: 사이드바 "면장/원가" 클릭 시 상세에서 목록 복귀 — URL → 상태 동기화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSelectedDecl(null); }, [location.key]);
  // D-085: ?bl=xxx 쿼리 → 면장 등록 폼 자동 열기 — URL → 상태 동기화
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const bl = params.get('bl');
    if (bl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPresetBLId(bl);
      setDeclFormOpen(true);
    }
  }, [location.search]);

  // 탭 2: 부대비용
  const [expBlFilter, setExpBlFilter] = useState('');
  const [expMonthFilter, setExpMonthFilter] = useState('');
  const [expTypeFilter, setExpTypeFilter] = useState('');
  const [expFormOpen, setExpFormOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // 마스터
  const [bls, setBls] = useState<BLShipment[]>([]);

  const declFilters: { bl_id?: string } = {};
  if (declBlFilter) declFilters.bl_id = declBlFilter;

  const expFilters: { bl_id?: string; month?: string; expense_type?: string } = {};
  if (expBlFilter) expFilters.bl_id = expBlFilter;
  if (expMonthFilter) expFilters.month = expMonthFilter;
  if (expTypeFilter) expFilters.expense_type = expTypeFilter;

  const reloadDecl = () => {};
  const { data: expenses, loading: expLoading, reload: reloadExp } = useExpenseList(expFilters);
  void declFilters;

  useEffect(() => {
    if (selectedCompanyId) {
      fetchWithAuth<BLShipment[]>(`/api/v1/bls?company_id=${selectedCompanyId}`)
        .then(setBls).catch(() => {});
    }
  }, [selectedCompanyId]);

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p>
      </div>
    );
  }

  // 면장 상세
  if (selectedDecl) {
    return (
      <div className="p-6">
        <DeclarationDetailView
          declarationId={selectedDecl}
          onBack={() => { setSelectedDecl(null); reloadDecl(); }}
        />
      </div>
    );
  }

  const handleCreateDecl = async (data: Record<string, unknown>) => {
    await fetchWithAuth('/api/v1/declarations', { method: 'POST', body: JSON.stringify(data) });
    reloadDecl();
  };

  const handleCreateExp = async (data: Record<string, unknown>) => {
    await fetchWithAuth('/api/v1/expenses', { method: 'POST', body: JSON.stringify(data) });
    reloadExp();
  };

  const handleUpdateExp = async (data: Record<string, unknown>) => {
    if (!editExpense) return;
    await fetchWithAuth(`/api/v1/expenses/${editExpense.expense_id}`, { method: 'PUT', body: JSON.stringify(data) });
    setEditExpense(null);
    reloadExp();
  };

  const handleDeleteExpense = async () => {
    if (!deletingExpense) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await fetchWithAuth(`/api/v1/expenses/${deletingExpense.expense_id}`, { method: 'DELETE' });
      setDeletingExpense(null);
      reloadExp();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '삭제에 실패했습니다');
    }
    setDeleteLoading(false);
  };

  // 월 목록 (최근 12개월)
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">부대비용 / 환율비교</h1>

      <Tabs defaultValue="expenses">
        <TabsList>
          {/* F20: 수입면장 탭 삭제 — 면장번호는 입고등록에서 직접 입력 */}
          <TabsTrigger value="expenses"><Receipt className="h-3.5 w-3.5" />부대비용</TabsTrigger>
          <TabsTrigger value="exchange"><ArrowLeftRight className="h-3.5 w-3.5" />환율 비교</TabsTrigger>
        </TabsList>

        {/* F20: 수입면장 탭 삭제됨 — 면장번호는 BLForm에서 직접 입력 */}

        {/* 탭 2: 부대비용 */}
        <TabsContent value="expenses" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Select value={expBlFilter || 'all'} onValueChange={(v) => setExpBlFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-40 text-xs"><FT text={expBlFilter ? (bls.find(b => b.bl_id === expBlFilter)?.bl_number ?? '') : '전체 B/L'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 B/L</SelectItem>
                  {bls.map((bl) => (
                    <SelectItem key={bl.bl_id} value={bl.bl_id}>{bl.bl_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={expMonthFilter || 'all'} onValueChange={(v) => setExpMonthFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-28 text-xs"><FT text={expMonthFilter || '전체 기간'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 기간</SelectItem>
                  {months.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={expTypeFilter || 'all'} onValueChange={(v) => setExpTypeFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-32 text-xs"><FT text={expTypeFilter ? (EXPENSE_TYPE_LABEL[expTypeFilter as ExpenseType] ?? '') : '전체 유형'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 유형</SelectItem>
                  {(Object.entries(EXPENSE_TYPE_LABEL) as [ExpenseType, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <ExcelToolbar type="expense" />
              <Button size="sm" onClick={() => { setEditExpense(null); setExpFormOpen(true); }}>
                <Plus className="mr-1.5 h-4 w-4" />새로 등록
              </Button>
            </div>
          </div>

          {expLoading ? <LoadingSpinner /> : (
            <ExpenseListTable
              items={expenses}
              onEdit={(e) => { setEditExpense(e); setExpFormOpen(true); }}
              onNew={() => { setEditExpense(null); setExpFormOpen(true); }}
              onDelete={(e) => { setDeleteError(''); setDeletingExpense(e); }}
            />
          )}
          {deleteError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{deleteError}</div>}
        </TabsContent>

        {/* 탭 3: 환율 비교 */}
        <TabsContent value="exchange" className="mt-4">
          <ExchangeComparePanel />
        </TabsContent>
      </Tabs>

      <DeclarationForm
        open={declFormOpen}
        onOpenChange={(v) => { setDeclFormOpen(v); if (!v) setPresetBLId(null); }}
        onSubmit={handleCreateDecl}
        presetBLId={presetBLId}
      />
      <ExpenseForm
        open={expFormOpen}
        onOpenChange={setExpFormOpen}
        onSubmit={editExpense ? handleUpdateExp : handleCreateExp}
        editData={editExpense}
      />
      <ConfirmDialog
        open={!!deletingExpense}
        onOpenChange={(o) => { if (!o) setDeletingExpense(null); }}
        title="부대비용 삭제"
        description={deletingExpense ? `${EXPENSE_TYPE_LABEL[deletingExpense.expense_type as ExpenseType] || deletingExpense.expense_type} ${deletingExpense.amount.toLocaleString()}원 부대비용을 삭제합니다.` : ''}
        onConfirm={handleDeleteExpense}
        loading={deleteLoading}
      />
    </div>
  );
}
