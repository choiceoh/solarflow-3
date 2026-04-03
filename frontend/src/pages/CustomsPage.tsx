import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/appStore';
import { useDeclarationList, useExpenseList } from '@/hooks/useCustoms';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import DeclarationListTable from '@/components/customs/DeclarationListTable';
import DeclarationDetailView from '@/components/customs/DeclarationDetailView';
import DeclarationForm from '@/components/customs/DeclarationForm';
import ExpenseListTable from '@/components/customs/ExpenseListTable';
import ExpenseForm from '@/components/customs/ExpenseForm';
import ExchangeComparePanel from '@/components/customs/ExchangeComparePanel';
import { EXPENSE_TYPE_LABEL, type ExpenseType, type Expense } from '@/types/customs';
import type { BLShipment } from '@/types/inbound';
import ExcelToolbar from '@/components/excel/ExcelToolbar';

export default function CustomsPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  // 탭 1: 수입면장
  const [declBlFilter, setDeclBlFilter] = useState('');
  const [selectedDecl, setSelectedDecl] = useState<string | null>(null);
  const [declFormOpen, setDeclFormOpen] = useState(false);

  // 탭 2: 부대비용
  const [expBlFilter, setExpBlFilter] = useState('');
  const [expMonthFilter, setExpMonthFilter] = useState('');
  const [expTypeFilter, setExpTypeFilter] = useState('');
  const [expFormOpen, setExpFormOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);

  // 마스터
  const [bls, setBls] = useState<BLShipment[]>([]);

  const declFilters: { bl_id?: string } = {};
  if (declBlFilter) declFilters.bl_id = declBlFilter;

  const expFilters: { bl_id?: string; month?: string; expense_type?: string } = {};
  if (expBlFilter) expFilters.bl_id = expBlFilter;
  if (expMonthFilter) expFilters.month = expMonthFilter;
  if (expTypeFilter) expFilters.expense_type = expTypeFilter;

  const { data: declarations, loading: declLoading, reload: reloadDecl } = useDeclarationList(declFilters);
  const { data: expenses, loading: expLoading, reload: reloadExp } = useExpenseList(expFilters);

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

  // 월 목록 (최근 12개월)
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">면장 / 원가</h1>

      <Tabs defaultValue="declarations">
        <TabsList>
          <TabsTrigger value="declarations">수입면장</TabsTrigger>
          <TabsTrigger value="expenses">부대비용</TabsTrigger>
          <TabsTrigger value="exchange">환율 비교</TabsTrigger>
        </TabsList>

        {/* 탭 1: 수입면장 */}
        <TabsContent value="declarations" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Select value={declBlFilter || 'all'} onValueChange={(v) => setDeclBlFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="B/L" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 B/L</SelectItem>
                  {bls.map((bl) => (
                    <SelectItem key={bl.bl_id} value={bl.bl_id}>{bl.bl_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <ExcelToolbar type="declaration" />
              <Button size="sm" onClick={() => setDeclFormOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />새로 등록
              </Button>
            </div>
          </div>

          {declLoading ? <LoadingSpinner /> : (
            <DeclarationListTable
              items={declarations}
              onSelect={(d) => setSelectedDecl(d.declaration_id)}
              onNew={() => setDeclFormOpen(true)}
            />
          )}
        </TabsContent>

        {/* 탭 2: 부대비용 */}
        <TabsContent value="expenses" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Select value={expBlFilter || 'all'} onValueChange={(v) => setExpBlFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="B/L" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 B/L</SelectItem>
                  {bls.map((bl) => (
                    <SelectItem key={bl.bl_id} value={bl.bl_id}>{bl.bl_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={expMonthFilter || 'all'} onValueChange={(v) => setExpMonthFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="월" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 기간</SelectItem>
                  {months.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={expTypeFilter || 'all'} onValueChange={(v) => setExpTypeFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="비용유형" /></SelectTrigger>
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
            />
          )}
        </TabsContent>

        {/* 탭 3: 환율 비교 */}
        <TabsContent value="exchange" className="mt-4">
          <ExchangeComparePanel />
        </TabsContent>
      </Tabs>

      <DeclarationForm open={declFormOpen} onOpenChange={setDeclFormOpen} onSubmit={handleCreateDecl} />
      <ExpenseForm
        open={expFormOpen}
        onOpenChange={setExpFormOpen}
        onSubmit={editExpense ? handleUpdateExp : handleCreateExp}
        editData={editExpense}
      />
    </div>
  );
}
