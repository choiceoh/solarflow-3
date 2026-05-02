import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useAppStore } from '@/stores/appStore';
import { useExpenseList } from '@/hooks/useCustoms';
import { fetchWithAuth } from '@/lib/api';
import SkeletonRows from '@/components/common/SkeletonRows';
import DeclarationDetailView from '@/components/customs/DeclarationDetailView';
import DeclarationForm from '@/components/customs/DeclarationForm';
import ExpenseListTable, { EXPENSE_TABLE_ID, EXPENSE_COLUMN_META } from '@/components/customs/ExpenseListTable';
import { ColumnVisibilityMenu } from '@/components/common/ColumnVisibilityMenu';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useColumnPinning } from '@/lib/columnPinning';
import ExpenseForm from '@/components/customs/ExpenseForm';
import ExchangeComparePanel from '@/components/customs/ExchangeComparePanel';
import { EXPENSE_TYPE_LABEL, type ExpenseType, type Expense } from '@/types/customs';
import type { BLShipment } from '@/types/inbound';
import ExcelToolbar from '@/components/excel/ExcelToolbar';
import { CardB, FilterButton, FilterChips, RailBlock, TileB } from '@/components/command/MockupPrimitives';
import { BreakdownRows } from '@/components/command/BreakdownRows';
import { autoSpark } from '@/templates/autoSpark';

function fmtEok(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0.00';
  return (value / 100_000_000).toFixed(value >= 10_000_000_000 ? 1 : 2);
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
  const [activeTab, setActiveTab] = useState('expenses');

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
  const expenseColVis = useColumnVisibility(EXPENSE_TABLE_ID, EXPENSE_COLUMN_META);
  const expenseColPin = useColumnPinning(EXPENSE_TABLE_ID);
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

  const expenseTotal = expenses.reduce((sum, expense) => sum + (expense.total ?? expense.amount ?? 0), 0);
  const expenseVat = expenses.reduce((sum, expense) => sum + (expense.vat ?? 0), 0);
  const linkedExpenseCount = expenses.filter((expense) => expense.bl_id).length;
  const blExpenseMap = expenses.reduce<Record<string, number>>((acc, expense) => {
    const key = expense.bl_number ?? expense.bl_id ?? '미지정';
    acc[key] = (acc[key] ?? 0) + (expense.total ?? expense.amount ?? 0);
    return acc;
  }, {});
  const typeExpenseMap = expenses.reduce<Record<string, number>>((acc, expense) => {
    const key = EXPENSE_TYPE_LABEL[expense.expense_type as ExpenseType] ?? expense.expense_type;
    acc[key] = (acc[key] ?? 0) + (expense.total ?? expense.amount ?? 0);
    return acc;
  }, {});
  const customsTabOptions = [
    { key: 'expenses', label: '부대비용', count: expenses.length },
    { key: 'exchange', label: '환율 비교' },
  ];
  const customsCardControls = (
    <div className="sf-card-controls" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}>
      {activeTab === 'expenses' ? (
        <>
          <FilterButton items={[
            {
              label: 'B/L',
              value: expBlFilter,
              onChange: setExpBlFilter,
              options: bls.map((bl) => ({ value: bl.bl_id, label: bl.bl_number })),
            },
            {
              label: '기간',
              value: expMonthFilter,
              onChange: setExpMonthFilter,
              options: months.map((m) => ({ value: m, label: m })),
            },
            {
              label: '유형',
              value: expTypeFilter,
              onChange: setExpTypeFilter,
              options: (Object.entries(EXPENSE_TYPE_LABEL) as [ExpenseType, string][]).map(([k, v]) => ({ value: k, label: v })),
            },
          ]} />
          <ColumnVisibilityMenu tableId={EXPENSE_TABLE_ID} columns={EXPENSE_COLUMN_META} hidden={expenseColVis.hidden} setHidden={expenseColVis.setHidden} pinning={expenseColPin.pinning} pinLeft={expenseColPin.pinLeft} pinRight={expenseColPin.pinRight} unpin={expenseColPin.unpin} />
          <ExcelToolbar type="expense" onNew={() => { setEditExpense(null); setExpFormOpen(true); }} />
        </>
      ) : null}
      <div style={{ flex: 1 }} />
      <FilterChips options={customsTabOptions} value={activeTab} onChange={setActiveTab} />
    </div>
  );

  return (
    <>
      <div className="sf-command-surface sf-customs-shell">
        <section className="sf-customs-main">
          <div className="sf-command-kpis sf-customs-kpis">
            <TileB lbl="부대비용" v={fmtEok(expenseTotal)} u="억" sub={`${expenses.length}건 · VAT ${fmtEok(expenseVat)}억`} tone="solar" spark={autoSpark('부대비용')} />
            <TileB lbl="B/L 연결" v={String(linkedExpenseCount)} u="건" sub={`전체 ${bls.length}개 B/L`} tone="info" spark={autoSpark('B/L 연결')} />
            <TileB lbl="비용 유형" v={String(Object.keys(typeExpenseMap).length)} u="종" sub="운송·통관·LC 수수료" tone="warn" spark={autoSpark('비용 유형')} />
            <TileB lbl="평균 비용" v={expenses.length ? fmtEok(expenseTotal / expenses.length) : '0.00'} u="억" sub="건당 평균" tone="ink" spark={autoSpark('평균 비용')} />
          </div>

          <CardB
            title={activeTab === 'exchange' ? '환율 비교' : '부대비용'}
            sub={activeTab === 'exchange' ? '계약 환율과 최신 환율 영향 비교' : `${expenses.length}건 · ${fmtEok(expenseTotal)}억`}
            right={customsCardControls}
          >
            <div className="sf-command-tab-body">
              <Tabs value={activeTab} onValueChange={setActiveTab}>

        {/* F20: 수입면장 탭 삭제됨 — 면장번호는 BLForm에서 직접 입력 */}

        {/* 탭 2: 부대비용 */}
        <TabsContent value="expenses" className="mt-0 space-y-3">
          {expLoading ? <SkeletonRows rows={6} /> : (
            <ExpenseListTable
              items={expenses}
              hidden={expenseColVis.hidden}
              pinning={expenseColPin.pinning}
              onPinningChange={expenseColPin.setPinning}
              onEdit={(e) => { setEditExpense(e); setExpFormOpen(true); }}
              onNew={() => { setEditExpense(null); setExpFormOpen(true); }}
              onDelete={(e) => { setDeleteError(''); setDeletingExpense(e); }}
            />
          )}
          {deleteError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{deleteError}</div>}
        </TabsContent>

        {/* 탭 3: 환율 비교 */}
        <TabsContent value="exchange" className="mt-0">
          <ExchangeComparePanel />
        </TabsContent>
              </Tabs>
            </div>
          </CardB>
        </section>

        <aside className="sf-customs-rail card dark-scroll">
          <RailBlock title="B/L별 비용" count="KRW">
            {Object.entries(blExpenseMap).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([bl, amount], index) => (
              <div key={bl} className={`py-2 ${index ? 'border-t border-[var(--line)]' : ''}`}>
                <div className="flex justify-between gap-2 text-[11.5px]">
                  <span className="mono truncate text-[var(--ink-2)]">{bl}</span>
                  <span className="mono font-semibold text-[var(--ink)]">{fmtEok(amount)}억</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded bg-[var(--line)]">
                  <div className="h-full bg-[var(--solar-2)]" style={{ width: `${expenseTotal ? Math.min(100, (amount / expenseTotal) * 100) : 0}%` }} />
                </div>
              </div>
            ))}
            {expenses.length === 0 && <div className="text-xs text-[var(--ink-3)]">등록된 비용이 없습니다.</div>}
          </RailBlock>
          <RailBlock title="비용 유형">
            <BreakdownRows
              items={Object.entries(typeExpenseMap).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([type, amount]) => ({
                key: type,
                label: type,
                count: `${fmtEok(amount)}억`,
              }))}
            />
          </RailBlock>
          <RailBlock title="면장/OCR 흐름" last>
            <div className="rounded border border-dashed border-[var(--line-2)] bg-[var(--bg-2)] p-3 text-[11px] leading-5 text-[var(--ink-3)]">
              면장번호와 OCR 후보는 B/L 입고등록에서 먼저 확인하고, 비용은 여기서 B/L 기준으로 누적 관리합니다.
            </div>
          </RailBlock>
        </aside>
      </div>

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
    </>
  );
}
