// SalesAnalysisPage 의 외부판매(sale/sale_spare) 한정 KPI 와 달리, 이 페이지는
// 모든 usage_category (공사현장·리파워링·유지관리·창고이동 포함) 를 합친 출고 흐름을 본다.
// 데이터는 useOutboundDashboard 단일 호출로 totals/trend24/by_usage/by_manufacturer_top10/
// by_customer_top10/sale_conversion 을 한 번에 받는다 — 추가 백엔드 작업 없음.
import { useEffect, useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { DateInput } from "@/components/ui/date-input"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import { useAppStore } from "@/stores/appStore"
import { useOutboundDashboard, type OutboundDashboardPeriod } from "@/hooks/useOutbound"
import { formatNumber } from "@/lib/utils"
import { USAGE_CATEGORY_LABEL, type UsageCategory } from "@/types/outbound"
import { CardB, FilterChips, RailBlock, TileB } from "@/components/command/MockupPrimitives"
import { KpiStrip } from "@/components/command/KpiStrip"

type PeriodFilter = "all" | "year" | "prev_month" | "custom"
type OutboundAnalysisTab = "summary" | "usage" | "partner"

const periodOptions: { key: PeriodFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "year", label: "금년" },
  { key: "prev_month", label: "전월" },
  { key: "custom", label: "직접지정" },
]

const tabOptions: { key: OutboundAnalysisTab; label: string }[] = [
  { key: "summary", label: "요약" },
  { key: "usage", label: "용도별" },
  { key: "partner", label: "제조사·거래처" },
]

function resolveServerPeriod(period: PeriodFilter): OutboundDashboardPeriod {
  if (period === "year") return "year"
  if (period === "prev_month") return "prev_month"
  return "lifetime"
}

function toMW(kw: number): number {
  return kw / 1000
}

function pct(num: number, denom: number): number {
  if (!denom) return 0
  return Math.round((num / denom) * 1000) / 10
}

export default function OutboundAnalysisPage() {
  const manufacturers = useAppStore((s) => s.manufacturers)
  const loadManufacturers = useAppStore((s) => s.loadManufacturers)
  const [activeTab, setActiveTab] = useState<OutboundAnalysisTab>("summary")
  const [period, setPeriod] = useState<PeriodFilter>("all")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [usageFilter, setUsageFilter] = useState<UsageCategory | "">("")
  const [manufacturerFilter, setManufacturerFilter] = useState("")

  useEffect(() => {
    loadManufacturers()
  }, [loadManufacturers])

  const filters = useMemo(
    () => ({
      period: resolveServerPeriod(period),
      usage_category: usageFilter || undefined,
      manufacturer_id: manufacturerFilter || undefined,
      start: period === "custom" && customFrom ? customFrom : undefined,
      end: period === "custom" && customTo ? customTo : undefined,
    }),
    [period, customFrom, customTo, usageFilter, manufacturerFilter],
  )

  const { dashboard, loading, isFetching, error, reload } = useOutboundDashboard(filters)

  const manufacturerLabel = useMemo(() => {
    if (!manufacturerFilter) return "전체 제조사"
    const found = manufacturers.find((m) => m.manufacturer_id === manufacturerFilter)
    return found ? found.short_name || found.name_kr : "전체 제조사"
  }, [manufacturerFilter, manufacturers])

  const trend24 = dashboard?.trend24 ?? []
  const trendChartData = useMemo(
    () =>
      trend24.map((p) => ({
        month: p.month.slice(2), // YY-MM
        count: p.count,
        mw: Number(toMW(p.kw_sum).toFixed(2)),
      })),
    [trend24],
  )
  const countSpark = trend24.slice(-6).map((p) => p.count)
  const kwSpark = trend24.slice(-6).map((p) => p.kw_sum)

  const totals = dashboard?.totals
  const saleConv = dashboard?.sale_conversion
  const saleEligible = saleConv?.eligible_count ?? 0
  const saleLinked = saleConv?.linked_count ?? 0
  const saleUnregistered = Math.max(0, saleEligible - saleLinked)
  const saleConversionDenom = saleEligible || (totals?.count ?? 0)
  const saleConversionRate = pct(saleLinked, saleConversionDenom)
  const saleConversionSpark = (saleConv?.monthly ?? [])
    .slice(-6)
    .map((p) =>
      p.eligible_count > 0 ? Math.round((p.linked_count / p.eligible_count) * 100) : 0,
    )

  // YoY 카드 — yoy3y 의 last_year_same 과 yoy_pct 를 그대로 사용.
  const yoy = dashboard?.yoy3y
  const yoyPctLabel =
    yoy && yoy.yoy_pct != null
      ? `${yoy.yoy_pct >= 0 ? "+" : ""}${yoy.yoy_pct.toFixed(1)}%`
      : "—"

  const fmtCount = (n: number) => String(Math.round(n))
  const fmtMW = (n: number) => toMW(n).toFixed(1)
  const fmtFixed1 = (n: number) => n.toFixed(1)
  const fmtEok = (n: number) => (n / 100000000).toFixed(2)

  if (loading) {
    return (
      <div className="sf-page">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="sf-page">
      <div className="sf-procurement-layout">
        <section className="sf-procurement-main">
          <div className="flex flex-wrap items-center gap-2">
            <FilterChips
              options={periodOptions}
              value={period}
              onChange={(value) => setPeriod(value as PeriodFilter)}
            />
            {period === "custom" && (
              <>
                <DateInput
                  value={customFrom}
                  onChange={setCustomFrom}
                  className="h-8 w-36 text-xs"
                  placeholder="시작일"
                />
                <DateInput
                  value={customTo}
                  onChange={setCustomTo}
                  className="h-8 w-36 text-xs"
                  placeholder="종료일"
                />
              </>
            )}
            <Select
              value={usageFilter || "all"}
              onValueChange={(v) => setUsageFilter(v === "all" ? "" : (v as UsageCategory))}
            >
              <SelectTrigger className="h-8 w-40 text-xs">
                <span className="truncate">
                  {usageFilter ? USAGE_CATEGORY_LABEL[usageFilter] : "전체 용도"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 용도</SelectItem>
                {(Object.keys(USAGE_CATEGORY_LABEL) as UsageCategory[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {USAGE_CATEGORY_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={manufacturerFilter || "all"}
              onValueChange={(v) => setManufacturerFilter(v === "all" ? "" : (v ?? ""))}
            >
              <SelectTrigger className="h-8 w-40 text-xs">
                <span className="truncate">{manufacturerLabel}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 제조사</SelectItem>
                {manufacturers.map((m) => (
                  <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>
                    {m.short_name || m.name_kr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              {isFetching && (
                <span className="mono text-[10px] text-muted-foreground">갱신 중…</span>
              )}
              <button type="button" className="btn xs" onClick={() => reload()}>
                새로고침
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <FilterChips
              options={tabOptions}
              value={activeTab}
              onChange={(value) => setActiveTab(value as OutboundAnalysisTab)}
            />
          </div>

          {activeTab === "summary" && (
            <>
              <KpiStrip
                scopeId="outbound-analysis"
                metrics={[
                  {
                    lbl: "출고 건수",
                    v: fmtCount(totals?.count ?? 0),
                    numericValue: totals?.count ?? 0,
                    formatter: fmtCount,
                    u: "건",
                    sub: `${fmtMW(totals?.kw_sum ?? 0)} MW`,
                    tone: "solar" as const,
                    spark: countSpark,
                    metricId: "outbound.count",
                  },
                  {
                    lbl: "출고 용량",
                    v: fmtMW(totals?.kw_sum ?? 0),
                    numericValue: totals?.kw_sum ?? 0,
                    formatter: fmtMW,
                    u: "MW",
                    sub: "필터 기준 누계",
                    tone: "info" as const,
                    spark: kwSpark,
                    metricId: "outbound.kw_year",
                  },
                  {
                    lbl: "매출등록률",
                    v: saleConversionRate.toFixed(1),
                    numericValue: saleConversionRate,
                    formatter: fmtFixed1,
                    u: "%",
                    sub: `${formatNumber(saleLinked)} / ${formatNumber(saleConversionDenom)}건`,
                    tone:
                      saleConversionRate >= 90
                        ? ("pos" as const)
                        : saleConversionRate >= 60
                          ? ("info" as const)
                          : ("warn" as const),
                    spark: saleConversionSpark,
                    metricId: "outbound.sale_conversion",
                  },
                  {
                    lbl: "매출 미등록",
                    v: fmtCount(saleUnregistered),
                    numericValue: saleUnregistered,
                    formatter: fmtCount,
                    u: "건",
                    sub: "출고 후 sale 미연결",
                    tone: saleUnregistered > 0 ? ("warn" as const) : ("pos" as const),
                    metricId: "outbound.sale_unregistered",
                  },
                  {
                    lbl: "활성 출고",
                    v: fmtCount(totals?.active_count ?? 0),
                    numericValue: totals?.active_count ?? 0,
                    formatter: fmtCount,
                    u: "건",
                    sub: "처리 중",
                    tone: "info" as const,
                  },
                  {
                    lbl: "취소 대기",
                    v: fmtCount(totals?.cancel_pending_count ?? 0),
                    numericValue: totals?.cancel_pending_count ?? 0,
                    formatter: fmtCount,
                    u: "건",
                    sub: "승인 대기",
                    tone:
                      (totals?.cancel_pending_count ?? 0) > 0
                        ? ("warn" as const)
                        : ("ink" as const),
                  },
                  {
                    lbl: "취소 완료",
                    v: fmtCount(totals?.cancelled_count ?? 0),
                    numericValue: totals?.cancelled_count ?? 0,
                    formatter: fmtCount,
                    u: "건",
                    sub: "필터 기준",
                    tone: "ink" as const,
                  },
                  {
                    lbl: "외부 매출",
                    v: fmtEok(totals?.sale_amount_sum ?? 0),
                    numericValue: totals?.sale_amount_sum ?? 0,
                    formatter: fmtEok,
                    u: "억",
                    sub: "sale 연결분만",
                    tone: "ink" as const,
                  },
                ]}
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

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.6fr]">
                <CardB title="24개월 출고 추이" sub="월별 건수 + MW">
                  <div className="h-64 px-3 py-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis
                          yAxisId="count"
                          orientation="left"
                          tick={{ fontSize: 10 }}
                          width={32}
                        />
                        <YAxis
                          yAxisId="mw"
                          orientation="right"
                          tick={{ fontSize: 10 }}
                          width={32}
                        />
                        <Tooltip
                          formatter={(value, name) =>
                            name === "건수"
                              ? [formatNumber(Number(value)), "건수"]
                              : [`${value} MW`, "용량"]
                          }
                        />
                        <Bar yAxisId="count" dataKey="count" name="건수" fill="var(--solar-2)" />
                        <Bar yAxisId="mw" dataKey="mw" name="MW" fill="var(--info)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardB>
                <CardB title="전년 동기 대비" sub="누계 건수 기반">
                  <div className="space-y-3 px-4 py-3 text-xs">
                    <div className="flex items-baseline gap-2">
                      <span className="bignum text-[26px] text-[var(--solar-3)]">{yoyPctLabel}</span>
                      <span className="mono text-[10px] text-[var(--ink-3)]">전년比</span>
                    </div>
                    <div className="space-y-1.5 text-[11.5px] text-[var(--ink-2)]">
                      <div className="flex justify-between">
                        <span>금년 누계</span>
                        <span className="mono">
                          {formatNumber(
                            (yoy?.current_year ?? []).reduce((a, b) => a + b, 0),
                          )}{" "}
                          건
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>전년 동기</span>
                        <span className="mono">{formatNumber(yoy?.last_year_same ?? 0)} 건</span>
                      </div>
                      <div className="flex justify-between">
                        <span>전년 연간</span>
                        <span className="mono">
                          {formatNumber((yoy?.last_year ?? []).reduce((a, b) => a + b, 0))} 건
                        </span>
                      </div>
                    </div>
                  </div>
                </CardB>
              </div>
            </>
          )}

          {activeTab === "usage" && (
            <CardB title="분포" sub="건수 · MW · 매출등록률">
              <Table className="sf-motion-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>용도</TableHead>
                    <TableHead className="text-right">건수</TableHead>
                    <TableHead className="text-right">용량 (MW)</TableHead>
                    <TableHead className="text-right">점유율</TableHead>
                    <TableHead className="text-right">매출등록률</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(dashboard?.by_usage ?? []).map((row) => {
                    const conv = saleConv?.by_usage.find((c) => c.key === row.key)
                    return (
                      <TableRow key={row.key}>
                        <TableCell className="text-xs font-medium">{row.label}</TableCell>
                        <TableCell className="text-right text-xs">
                          {formatNumber(row.count)}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {toMW(row.kw_sum).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {(row.share * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {conv ? (
                            <span
                              className={`sf-status-pill ${
                                conv.rate >= 90
                                  ? "sf-tone-pos"
                                  : conv.rate >= 60
                                    ? "sf-tone-info"
                                    : "sf-tone-warn"
                              }`}
                            >
                              {conv.rate.toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="text-xs font-semibold">합계</TableCell>
                    <TableCell className="text-right text-xs font-semibold">
                      {formatNumber(totals?.count ?? 0)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold">
                      {fmtMW(totals?.kw_sum ?? 0)}
                    </TableCell>
                    <TableCell className="text-right text-xs">—</TableCell>
                    <TableCell className="text-right text-xs font-semibold">
                      {saleConversionRate.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardB>
          )}

          {activeTab === "partner" && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <CardB title="제조사별 Top 10" sub="건수 기준 상위 + 매출등록률">
                <PartnerBreakdownTable
                  rows={dashboard?.by_manufacturer_top10 ?? []}
                  saleConv={saleConv?.by_manufacturer_top10 ?? []}
                />
              </CardB>
              <CardB title="거래처별 Top 10" sub="건수 기준 상위 + 매출등록률">
                <PartnerBreakdownTable
                  rows={dashboard?.by_customer_top10 ?? []}
                  saleConv={saleConv?.by_customer_top10 ?? []}
                />
              </CardB>
            </div>
          )}
        </section>

        <aside className="sf-procurement-rail card">
          <RailBlock title="주간 출고" count="최근 12주">
            <WeeklyMiniBars weeks={dashboard?.weekly12 ?? []} />
            <div className="mono mt-2 text-center text-[10.5px] text-[var(--ink-3)]">
              총 {formatNumber((dashboard?.weekly12 ?? []).reduce((a, b) => a + b.count, 0))}건
            </div>
          </RailBlock>
          <RailBlock title="매출등록 상태">
            <div className="bignum text-[30px] text-[var(--solar-3)]">
              {saleConversionRate.toFixed(0)}
              <span className="mono text-sm text-[var(--ink-3)]">%</span>
            </div>
            <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
              연결 {formatNumber(saleLinked)} · 미연결 {formatNumber(saleUnregistered)}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded bg-[var(--bg-2)]">
              <div
                className="h-full bg-[var(--solar-2)]"
                style={{ width: `${Math.min(100, saleConversionRate)}%` }}
              />
            </div>
          </RailBlock>
          <RailBlock title="상위 제조사" last>
            {(dashboard?.by_manufacturer_top10 ?? []).slice(0, 5).map((row, index) => (
              <div
                key={row.key}
                className={`py-2 ${index ? "border-t border-[var(--line)]" : ""}`}
              >
                <div className="flex justify-between gap-2 text-[11.5px]">
                  <span className="truncate text-[var(--ink-2)]">{row.label}</span>
                  <span className="mono font-semibold text-[var(--ink)]">
                    {formatNumber(row.count)}건
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded bg-[var(--line)]">
                  <div
                    className="h-full bg-[var(--solar-2)]"
                    style={{ width: `${Math.min(100, row.share * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {!(dashboard?.by_manufacturer_top10 ?? []).length && (
              <div className="mono text-[10.5px] text-[var(--ink-3)]">데이터 없음</div>
            )}
          </RailBlock>
        </aside>
      </div>
    </div>
  )
}

function WeeklyMiniBars({
  weeks,
}: {
  weeks: { week_start: string; count: number; kw_sum: number }[]
}) {
  const max = useMemo(
    () => Math.max(...weeks.map((w) => w.kw_sum), 1),
    [weeks],
  )
  return (
    <div className="sf-mini-bars">
      {weeks.map((w) => (
        <span
          key={w.week_start}
          title={`${w.week_start} · ${toMW(w.kw_sum).toFixed(2)} MW · ${w.count}건`}
          style={{ height: `${(w.kw_sum / max) * 100}%` }}
        />
      ))}
    </div>
  )
}

interface BreakdownRow {
  key: string
  label: string
  count: number
  kw_sum: number
  share: number
}

interface SaleConvRow {
  key: string
  label: string
  eligible_count: number
  linked_count: number
  rate: number
}

function PartnerBreakdownTable({
  rows,
  saleConv,
}: {
  rows: BreakdownRow[]
  saleConv: SaleConvRow[]
}) {
  return (
    <Table className="sf-motion-table">
      <TableHeader>
        <TableRow>
          <TableHead>이름</TableHead>
          <TableHead className="text-right">건수</TableHead>
          <TableHead className="text-right">MW</TableHead>
          <TableHead className="text-right">점유율</TableHead>
          <TableHead className="text-right">매출등록률</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const conv = saleConv.find((c) => c.key === row.key)
          return (
            <TableRow key={row.key}>
              <TableCell className="truncate text-xs font-medium">{row.label}</TableCell>
              <TableCell className="text-right text-xs">{formatNumber(row.count)}</TableCell>
              <TableCell className="text-right text-xs">
                {(row.kw_sum / 1000).toFixed(2)}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {(row.share * 100).toFixed(1)}%
              </TableCell>
              <TableCell className="text-right text-xs">
                {conv && conv.eligible_count > 0 ? (
                  <span
                    className={`sf-status-pill ${
                      conv.rate >= 90
                        ? "sf-tone-pos"
                        : conv.rate >= 60
                          ? "sf-tone-info"
                          : "sf-tone-warn"
                    }`}
                  >
                    {conv.rate.toFixed(0)}%
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          )
        })}
        {!rows.length && (
          <TableRow>
            <TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
              데이터 없음
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
