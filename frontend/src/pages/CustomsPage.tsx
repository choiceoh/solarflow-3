import { useState, useEffect } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/appStore';
import { useExpenseList } from '@/hooks/useCustoms';
import { fetchWithAuth } from '@/lib/api';
import SkeletonRows from '@/components/common/SkeletonRows';
import ExpenseListTable, { EXPENSE_TABLE_ID, EXPENSE_COLUMN_META } from '@/components/customs/ExpenseListTable';
import { ColumnVisibilityMenu } from '@/components/common/ColumnVisibilityMenu';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useColumnPinning } from '@/lib/columnPinning';
import ExchangeComparePanel from '@/components/customs/ExchangeComparePanel';
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs';
import type { BLShipment } from '@/types/inbound';
import ExcelToolbar from '@/components/excel/ExcelToolbar';
import { CardB, CommandTopLine, FilterButton, FilterChips, RailBlock, TileB } from '@/components/command/MockupPrimitives';
import { BreakdownRows } from '@/components/command/BreakdownRows';
import { flatSpark, monthlyTrend, monthlyCount } from '@/templates/sparkUtils';

function fmtEok(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0.00';
  return (value / 100_000_000).toFixed(value >= 10_000_000_000 ? 1 : 2);
}

export default function CustomsPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  // 탭 1: 부대비용
  const [expBlFilter, setExpBlFilter] = useState('');
  const [expMonthFilter, setExpMonthFilter] = useState('');
  const [expTypeFilter, setExpTypeFilter] = useState('');
  const [activeTab, setActiveTab] = useState('expenses');

  // 마스터
  const [bls, setBls] = useState<BLShipment[]>([]);

  const expFilters: { bl_id?: string; month?: string; expense_type?: string } = {};
  if (expBlFilter) expFilters.bl_id = expBlFilter;
  if (expMonthFilter) expFilters.month = expMonthFilter;
  if (expTypeFilter) expFilters.expense_type = expTypeFilter;

  const { data: expenses, loading: expLoading } = useExpenseList(expFilters);
  const expenseColVis = useColumnVisibility(EXPENSE_TABLE_ID, EXPENSE_COLUMN_META);
  const expenseColPin = useColumnPinning(EXPENSE_TABLE_ID);

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
  // KPI sparkline — Expense.month 기반 월별 집계 (없는 항목은 무시 → 평행선 대체).
  const expenseDate = (e: typeof expenses[number]) => e.month ?? null;
  const totalSpark = monthlyTrend(expenses, expenseDate, (e) => e.total ?? e.amount ?? 0);
  const linkedSpark = monthlyCount(expenses.filter((e) => e.bl_id), expenseDate);
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
          <ExcelToolbar type="expense" />
        </>
      ) : null}
      <div style={{ flex: 1 }} />
      <FilterChips options={customsTabOptions} value={activeTab} onChange={setActiveTab} />
    </div>
  );
  const pageTitle = activeTab === 'exchange' ? '환율 비교' : '부대비용';
  const pageSub = activeTab === 'exchange' ? '계약 환율과 최신 환율 영향 비교' : `${expenses.length}건 · ${fmtEok(expenseTotal)}억`;

  return (
    <>
      <div className="sf-command-surface sf-customs-shell">
        <section className="sf-customs-main">
          <CommandTopLine title={pageTitle} sub={pageSub} right={customsCardControls} />

          <div className="sf-command-kpis sf-customs-kpis">
            <TileB lbl="부대비용" v={fmtEok(expenseTotal)} u="억" sub={`${expenses.length}건 · VAT ${fmtEok(expenseVat)}억`} tone="solar" spark={totalSpark} />
            <TileB lbl="B/L 연결" v={String(linkedExpenseCount)} u="건" sub={`전체 ${bls.length}개 B/L`} tone="info" spark={linkedSpark} />
            <TileB lbl="비용 유형" v={String(Object.keys(typeExpenseMap).length)} u="종" sub="운송·통관·LC 수수료" tone="warn" spark={flatSpark(Object.keys(typeExpenseMap).length)} />
            <TileB lbl="평균 비용" v={expenses.length ? fmtEok(expenseTotal / expenses.length) : '0.00'} u="억" sub="건당 평균" tone="ink" spark={flatSpark(expenses.length ? expenseTotal / expenses.length / 1e8 : 0)} />
          </div>

          <div data-onboarding-step="customs.declaration.attach">
          <CardB
            title={pageTitle}
            sub={pageSub}
            right={customsCardControls}
            headerless
          >
            <div className="sf-command-tab-body">
              <Tabs value={activeTab} onValueChange={setActiveTab}>

        {/* 탭 1: 부대비용 */}
        <TabsContent value="expenses" className="mt-0 space-y-3">
          {expLoading ? <SkeletonRows rows={6} /> : (
            <ExpenseListTable
              items={expenses}
              hidden={expenseColVis.hidden}
              pinning={expenseColPin.pinning}
              onPinningChange={expenseColPin.setPinning}
            />
          )}
        </TabsContent>

        {/* 탭 3: 환율 비교 */}
        <TabsContent value="exchange" className="mt-0">
          <ExchangeComparePanel />
        </TabsContent>
              </Tabs>
            </div>
          </CardB>
          </div>
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
              면장번호와 OCR 후보는 엑셀 입력에서 가져오고, 비용은 여기서 B/L 기준으로 누적 관리합니다.
            </div>
          </RailBlock>
        </aside>
      </div>
    </>
  );
}
