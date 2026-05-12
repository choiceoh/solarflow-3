import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { useAppStore } from "@/stores/appStore"
import { useDeclarationList, useExpenseList, useExpenseSummary } from "@/hooks/useCustoms"
import { useBLSummary } from "@/hooks/useInbound"
import { fetchWithAuth } from "@/lib/api"
import SkeletonRows from "@/components/common/SkeletonRows"
import DeclarationListTable, {
  DECLARATION_TABLE_ID,
  DECLARATION_COLUMN_META,
} from "@/components/customs/DeclarationListTable"
import ExpenseListTable, {
  EXPENSE_TABLE_ID,
  EXPENSE_COLUMN_META,
} from "@/components/customs/ExpenseListTable"
import { ColumnVisibilityMenu } from "@/components/common/ColumnVisibilityMenu"
import { useColumnVisibility } from "@/lib/columnVisibility"
import { useColumnPinning } from "@/lib/columnPinning"
import ExchangeComparePanel from "@/components/customs/ExchangeComparePanel"
import { EXPENSE_TYPE_LABEL, type ExpenseType } from "@/types/customs"
import type { BLShipment } from "@/types/inbound"
import ExcelToolbar from "@/components/excel/ExcelToolbar"
import {
  CardB,
  CommandTopLine,
  FilterButton,
  FilterChips,
  RailBlock,
  TileB,
  type DateRangeValue,
} from "@/components/command/MockupPrimitives"
import { BreakdownRows } from "@/components/command/BreakdownRows"
import { KpiStrip } from "@/components/command/KpiStrip"
import { flatSpark, monthlyTrend, monthlyCount } from "@/templates/sparkUtils"

function fmtEok(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.00"
  return (value / 100_000_000).toFixed(value >= 10_000_000_000 ? 1 : 2)
}

export default function CustomsPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const navigate = useNavigate()

  // 탭 1: 면장, 탭 2: 부대비용
  const [declBlFilter, setDeclBlFilter] = useState("")
  const [expBlFilter, setExpBlFilter] = useState("")
  const [expDateRange, setExpDateRange] = useState<DateRangeValue>(null)
  const [expTypeFilter, setExpTypeFilter] = useState("")
  const [activeTab, setActiveTab] = useState("declarations")

  // 마스터
  const [bls, setBls] = useState<BLShipment[]>([])

  const expFilters: { bl_id?: string; expense_type?: string; start?: string; end?: string } = {}
  if (expBlFilter) expFilters.bl_id = expBlFilter
  if (expTypeFilter) expFilters.expense_type = expTypeFilter
  if (expDateRange) {
    expFilters.start = expDateRange.start
    expFilters.end = expDateRange.end
  }
  const declFilters: { bl_id?: string } = {}
  if (declBlFilter) declFilters.bl_id = declBlFilter

  const { data: declarations, loading: declLoading } = useDeclarationList(declFilters)
  const { data: expenses, loading: expLoading } = useExpenseList(expFilters)
  const { data: expenseSummary } = useExpenseSummary(expFilters)
  const { data: blSummary } = useBLSummary()
  const declColVis = useColumnVisibility(DECLARATION_TABLE_ID, DECLARATION_COLUMN_META)
  const declColPin = useColumnPinning(DECLARATION_TABLE_ID)
  const expenseColVis = useColumnVisibility(EXPENSE_TABLE_ID, EXPENSE_COLUMN_META)
  const expenseColPin = useColumnPinning(EXPENSE_TABLE_ID)

  useEffect(() => {
    if (selectedCompanyId) {
      fetchWithAuth<BLShipment[]>(`/api/v1/bls?company_id=${selectedCompanyId}`)
        .then(setBls)
        .catch(() => {})
    }
  }, [selectedCompanyId])

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p>
      </div>
    )
  }

  const expenseCount = expenseSummary?.total ?? expenses.length
  const expenseTotal =
    expenseSummary?.total_amount ??
    expenses.reduce((sum, expense) => sum + (expense.total ?? expense.amount ?? 0), 0)
  const expenseVat =
    expenseSummary?.vat_amount ?? expenses.reduce((sum, expense) => sum + (expense.vat ?? 0), 0)
  const linkedExpenseCount =
    expenseSummary?.linked_count ?? expenses.filter((expense) => expense.bl_id).length
  const costedDeclarationCount = declarations.filter((decl) => (
    decl.cost_unit_price_wp != null || decl.cif_krw != null
  )).length
  const totalCapacityWp = declarations.reduce((sum, decl) => sum + (decl.capacity_kw ?? 0) * 1000, 0)
  const totalCapacityKw = totalCapacityWp / 1000
  const avgExpensePerWp = totalCapacityWp > 0 ? expenseTotal / totalCapacityWp : 0
  const unlinkedExpenseCount = Math.max(0, expenseCount - linkedExpenseCount)
  const uncostedDeclarationCount = Math.max(0, declarations.length - costedDeclarationCount)
  const avgExpensePerDecl = declarations.length > 0 ? expenseTotal / declarations.length : 0
  // KPI sparkline — Expense.month 기반 월별 집계 (없는 항목은 무시 → 평행선 대체).
  const declSpark = monthlyCount(declarations, (decl) => decl.declaration_date ?? null)
  const expenseDate = (e: (typeof expenses)[number]) => e.month ?? null
  const totalSpark = monthlyTrend(expenses, expenseDate, (e) => e.total ?? e.amount ?? 0)
  const linkedSpark = monthlyCount(
    expenses.filter((e) => e.bl_id),
    expenseDate,
  )
  const blExpenseMap = expenses.reduce<Record<string, number>>((acc, expense) => {
    const key = expense.bl_number ?? expense.bl_id ?? "미지정"
    acc[key] = (acc[key] ?? 0) + (expense.total ?? expense.amount ?? 0)
    return acc
  }, {})
  const typeExpenseMap = expenseSummary?.by_type_amount
    ? Object.fromEntries(
        Object.entries(expenseSummary.by_type_amount).map(([type, amount]) => [
          EXPENSE_TYPE_LABEL[type as ExpenseType] ?? type,
          amount ?? 0,
        ]),
      )
    : expenses.reduce<Record<string, number>>((acc, expense) => {
        const key = EXPENSE_TYPE_LABEL[expense.expense_type as ExpenseType] ?? expense.expense_type
        acc[key] = (acc[key] ?? 0) + (expense.total ?? expense.amount ?? 0)
        return acc
  }, {})
  const customsTabOptions = [
    { key: "declarations", label: "면장", count: declarations.length },
    { key: "expenses", label: "부대비용", count: expenseCount },
    { key: "exchange", label: "환율 비교" },
  ]
  const customsCardControls = (
    <div
      className="sf-card-controls"
      style={{ flex: 1, minWidth: 0, justifyContent: "flex-start" }}
    >
      {activeTab === "declarations" ? (
        <>
          <FilterButton
            items={[
              {
                label: "B/L",
                value: declBlFilter,
                onChange: setDeclBlFilter,
                options: bls.map((bl) => ({ value: bl.bl_id, label: bl.bl_number })),
              },
            ]}
          />
          <ColumnVisibilityMenu
            tableId={DECLARATION_TABLE_ID}
            columns={DECLARATION_COLUMN_META}
            hidden={declColVis.hidden}
            setHidden={declColVis.setHidden}
            pinning={declColPin.pinning}
            pinLeft={declColPin.pinLeft}
            pinRight={declColPin.pinRight}
            unpin={declColPin.unpin}
          />
          <ExcelToolbar type="declaration" />
        </>
      ) : activeTab === "expenses" ? (
        <>
          <FilterButton
            items={[
              {
                label: "B/L",
                value: expBlFilter,
                onChange: setExpBlFilter,
                options: bls.map((bl) => ({ value: bl.bl_id, label: bl.bl_number })),
              },
              {
                kind: "date_range",
                label: "기간",
                value: expDateRange,
                onChange: setExpDateRange,
              },
              {
                label: "유형",
                value: expTypeFilter,
                onChange: setExpTypeFilter,
                options: (Object.entries(EXPENSE_TYPE_LABEL) as [ExpenseType, string][]).map(
                  ([k, v]) => ({ value: k, label: v }),
                ),
              },
            ]}
          />
          <ColumnVisibilityMenu
            tableId={EXPENSE_TABLE_ID}
            columns={EXPENSE_COLUMN_META}
            hidden={expenseColVis.hidden}
            setHidden={expenseColVis.setHidden}
            pinning={expenseColPin.pinning}
            pinLeft={expenseColPin.pinLeft}
            pinRight={expenseColPin.pinRight}
            unpin={expenseColPin.unpin}
          />
          <ExcelToolbar type="expense" />
        </>
      ) : null}
      <div style={{ flex: 1 }} />
      <FilterChips options={customsTabOptions} value={activeTab} onChange={setActiveTab} />
    </div>
  )
  const pageTitle =
    activeTab === "exchange" ? "환율 비교" : activeTab === "expenses" ? "부대비용" : "면장/원가"
  const pageSub =
    activeTab === "exchange"
      ? "계약 환율과 최신 환율 영향 비교"
      : activeTab === "expenses"
        ? `${expenseCount}건 · ${fmtEok(expenseTotal)}억`
        : `${declarations.length}건 · 원가 ${costedDeclarationCount}건`

  return (
    <>
      <div className="sf-command-surface sf-customs-shell">
        <section className="sf-customs-main">
          <KpiStrip
            metrics={[
              {
                key: "customs.declaration_count",
                lbl: "면장",
                v: String(declarations.length),
                u: "건",
                sub: `원가 ${costedDeclarationCount}건`,
                tone: "solar" as const,
                spark: declSpark,
              },
              {
                lbl: "부대비용",
                v: fmtEok(expenseTotal),
                numericValue: expenseTotal,
                formatter: fmtEok,
                u: "억",
                sub: `${expenseCount}건 · VAT ${fmtEok(expenseVat)}억`,
                tone: "ink" as const,
                spark: totalSpark,
                metricId: "customs.expense_total",
              },
              {
                lbl: "B/L 연결",
                v: String(linkedExpenseCount),
                numericValue: linkedExpenseCount,
                formatter: (n: number) => String(Math.round(n)),
                u: "건",
                sub: `전체 ${blSummary?.total ?? bls.length}개 B/L`,
                tone: "info" as const,
                spark: linkedSpark,
                metricId: "customs.bl_linked",
              },
              {
                lbl: "평균 비용",
                v: avgExpensePerWp.toFixed(2),
                numericValue: avgExpensePerWp,
                formatter: (n: number) => n.toFixed(2),
                u: "원/Wp",
                sub: "Wp당 평균",
                tone: "ink" as const,
                spark: flatSpark(avgExpensePerWp),
                metricId: "customs.avg_expense",
              },
              {
                lbl: "원가 미산정",
                v: String(uncostedDeclarationCount),
                numericValue: uncostedDeclarationCount,
                formatter: (n: number) => String(Math.round(n)),
                u: "건",
                sub: "면장 원가 미입력",
                tone: uncostedDeclarationCount > 0 ? ("warn" as const) : ("pos" as const),
                spark: flatSpark(uncostedDeclarationCount),
                metricId: "customs.uncosted",
              },
              {
                lbl: "B/L 미연결",
                v: String(unlinkedExpenseCount),
                numericValue: unlinkedExpenseCount,
                formatter: (n: number) => String(Math.round(n)),
                u: "건",
                sub: "비용 매칭 필요",
                tone: unlinkedExpenseCount > 0 ? ("warn" as const) : ("pos" as const),
                spark: flatSpark(unlinkedExpenseCount),
                metricId: "customs.unlinked_expense",
              },
              {
                lbl: "수입 용량",
                v: totalCapacityKw.toLocaleString("ko-KR", { maximumFractionDigits: 0 }),
                numericValue: totalCapacityKw,
                formatter: (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 0 }),
                u: "kW",
                sub: "면장 합계 용량",
                tone: "info" as const,
                spark: flatSpark(totalCapacityKw),
                metricId: "customs.capacity",
              },
              {
                lbl: "VAT 합계",
                v: fmtEok(expenseVat),
                numericValue: expenseVat,
                formatter: fmtEok,
                u: "억",
                sub: "면장 비용 부가세",
                tone: "ink" as const,
                spark: flatSpark(expenseVat),
                metricId: "customs.vat",
              },
              {
                lbl: "면장당 평균",
                v: fmtEok(avgExpensePerDecl),
                numericValue: avgExpensePerDecl,
                formatter: fmtEok,
                u: "억",
                sub: "1건당 부대비용",
                tone: "ink" as const,
                spark: flatSpark(avgExpensePerDecl),
                metricId: "customs.avg_per_decl",
              },
            ]}
            scopeId={`customs.${activeTab}`}
            gridClassName="sf-customs-kpis"
          >
            {(metric) => (
              <TileB
                key={metric.lbl}
                lbl={metric.lbl}
                v={metric.v}
                numericValue={metric.numericValue}
                formatter={metric.formatter}
                u={metric.u}
                sub={metric.sub}
                tone={metric.tone}
                spark={metric.spark}
                metricId={metric.metricId}
              />
            )}
          </KpiStrip>

          <CommandTopLine title={pageTitle} sub={pageSub} right={customsCardControls} />

          <CardB title={pageTitle} sub={pageSub} right={customsCardControls} headerless>
            <div className="sf-command-tab-body">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                {/* 탭 1: 면장 */}
                <TabsContent value="declarations" className="mt-0 space-y-3">
                  {declLoading ? (
                    <SkeletonRows rows={6} />
                  ) : (
                    <DeclarationListTable
                      items={declarations}
                      hidden={declColVis.hidden}
                      pinning={declColPin.pinning}
                      onPinningChange={declColPin.setPinning}
                      onSelect={(decl) => navigate(`/procurement?tab=bl&bl_id=${decl.bl_id}`)}
                    />
                  )}
                </TabsContent>

                {/* 탭 2: 부대비용 */}
                <TabsContent value="expenses" className="mt-0 space-y-3">
                  {expLoading ? (
                    <SkeletonRows rows={6} />
                  ) : (
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
        </section>

        <aside className="sf-customs-rail card dark-scroll">
          <RailBlock title="B/L별 비용" count="KRW">
            {Object.entries(blExpenseMap)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([bl, amount], index) => (
                <div key={bl} className={`py-2 ${index ? "border-t border-[var(--line)]" : ""}`}>
                  <div className="flex justify-between gap-2 text-[11.5px]">
                    <span className="mono truncate text-[var(--ink-2)]">{bl}</span>
                    <span className="mono font-semibold text-[var(--ink)]">{fmtEok(amount)}억</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded bg-[var(--line)]">
                    <div
                      className="h-full bg-[var(--solar-2)]"
                      style={{
                        width: `${expenseTotal ? Math.min(100, (amount / expenseTotal) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            {expenses.length === 0 && (
              <div className="text-xs text-[var(--ink-3)]">등록된 비용이 없습니다.</div>
            )}
          </RailBlock>
          <RailBlock title="비용 유형">
            <BreakdownRows
              items={Object.entries(typeExpenseMap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([type, amount]) => ({
                  key: type,
                  label: type,
                  count: `${fmtEok(amount)}억`,
                }))}
            />
          </RailBlock>
          <RailBlock title="면장/OCR 흐름" last>
            <div className="rounded border border-dashed border-[var(--line-2)] bg-[var(--bg-2)] p-3 text-[11px] leading-5 text-[var(--ink-3)]">
              면장번호와 OCR 후보는 엑셀 입력에서 가져오고, 비용은 여기서 B/L 기준으로 누적
              관리합니다.
            </div>
          </RailBlock>
        </aside>
      </div>
    </>
  )
}
