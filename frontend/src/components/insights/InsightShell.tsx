// InsightShell — KPI 드릴다운 페이지 공통 레이아웃.
// Header (뒤로가기 + 제목) → 24개월 트렌드 라인차트 → 차원별 breakdown 그리드.

import { Link } from 'react-router-dom'
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import type { BreakdownRow, TrendPoint } from '@/lib/insights/aggregations'
import { monthShort } from '@/lib/insights/aggregations'

type Tone = 'solar' | 'ink' | 'info' | 'warn' | 'pos'

const TONE_COLOR: Record<Tone, string> = {
  solar: 'var(--solar-2)',
  ink: 'var(--ink-3)',
  info: 'var(--info)',
  warn: 'var(--warn)',
  pos: 'var(--pos)',
}

export interface BreakdownPanel {
  label: string
  rows: BreakdownRow[]
  emptyHint?: string
  // value 표기용 (생략 시 toLocaleString)
  formatValue?: (v: number) => string
  unit?: string
}

interface Props {
  title: string
  subtitle?: string
  unit?: string
  tone?: Tone
  backTo: string
  backLabel: string
  loading?: boolean
  totalLabel?: string             // 헤더 우측 큰 숫자 라벨 (예: '24개월 누계')
  totalValue?: string             // 포맷된 totalValue (예: '12,345')
  trend: TrendPoint[]
  trendValueLabel?: string        // tooltip 항목명 (예: '출고 건수')
  formatTrend?: (v: number) => string
  breakdowns: BreakdownPanel[]
}

export default function InsightShell({
  title,
  subtitle,
  unit,
  tone = 'solar',
  backTo,
  backLabel,
  loading = false,
  totalLabel,
  totalValue,
  trend,
  trendValueLabel = '값',
  formatTrend,
  breakdowns,
}: Props) {
  const color = TONE_COLOR[tone]
  const formatNumber = (v: number) => (formatTrend ? formatTrend(v) : v.toLocaleString())

  return (
    <div className="sf-page">
      <div className="sf-page-header">
        <div>
          <div className="sf-eyebrow flex items-center gap-2">
            <Link
              to={backTo}
              className="text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors no-underline"
            >
              ← {backLabel}
            </Link>
          </div>
          <h1 className="sf-page-title">{title}</h1>
          {subtitle ? <p className="sf-page-description">{subtitle}</p> : null}
        </div>
        {totalValue ? (
          <div className="text-right">
            {totalLabel ? (
              <div className="text-[11px] text-[var(--ink-3)] mono uppercase tracking-wider">{totalLabel}</div>
            ) : null}
            <div className="flex items-baseline gap-1 justify-end mt-1">
              <span className="bignum" style={{ fontSize: 28 }}>{totalValue}</span>
              {unit ? <span className="mono text-[12px] text-[var(--ink-3)]">{unit}</span> : null}
            </div>
          </div>
        ) : null}
      </div>

      {loading ? (
        <LoadingSpinner className="h-64" />
      ) : (
        <div className="space-y-4">
          <TrendCard
            trend={trend}
            color={color}
            valueLabel={trendValueLabel}
            unit={unit}
            formatValue={formatNumber}
          />
          {breakdowns.length > 0 ? (
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(breakdowns.length, 3)}, minmax(0, 1fr))` }}>
              {breakdowns.map((panel) => (
                <BreakdownCard
                  key={panel.label}
                  panel={panel}
                  color={color}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function TrendCard({
  trend,
  color,
  valueLabel,
  unit,
  formatValue,
}: {
  trend: TrendPoint[]
  color: string
  valueLabel: string
  unit?: string
  formatValue: (v: number) => string
}) {
  const empty = trend.length === 0 || trend.every((p) => p.value === 0)
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[13px] font-semibold text-[var(--ink-1)]">월별 추이</div>
          <div className="text-[11px] text-[var(--ink-3)] mono">최근 24개월 · 전년 동월 비교 가능</div>
        </div>
      </div>
      {empty ? (
        <div className="h-64 flex items-center justify-center text-[12px] text-[var(--ink-3)]">
          표시할 데이터가 없습니다.
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={monthShort}
                tick={{ fontSize: 10, fill: 'var(--ink-3)' }}
                interval={1}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--ink-3)' }}
                tickFormatter={(v: number) => formatValue(v)}
                width={56}
              />
              <Tooltip
                contentStyle={{ background: 'var(--bg-1)', border: '1px solid var(--line)', fontSize: 11 }}
                labelFormatter={(label: string) => label}
                formatter={(v: number) => [`${formatValue(v)}${unit ?? ''}`, valueLabel]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={1.8}
                dot={{ r: 2, fill: color }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function BreakdownCard({
  panel,
  color,
}: {
  panel: BreakdownPanel
  color: string
}) {
  const fmt = panel.formatValue ?? ((v: number) => v.toLocaleString())
  const max = panel.rows.length > 0 ? panel.rows[0]!.value : 0
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-semibold text-[var(--ink-1)]">{panel.label}별</div>
        <div className="text-[10px] text-[var(--ink-3)] mono">{panel.rows.length}개 차원</div>
      </div>
      {panel.rows.length === 0 ? (
        <div className="text-[12px] text-[var(--ink-3)] py-6 text-center">
          {panel.emptyHint ?? '데이터 없음'}
        </div>
      ) : (
        <div className="space-y-2">
          {panel.rows.map((row) => {
            const widthPct = max > 0 ? Math.max(2, (row.value / max) * 100) : 0
            return (
              <div key={row.key} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[12px] text-[var(--ink-2)] truncate">{row.label}</span>
                    <span className="text-[10px] text-[var(--ink-3)] mono">
                      {(row.share * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded bg-[var(--line)] overflow-hidden">
                    <div
                      className="h-full rounded transition-[width]"
                      style={{ width: `${widthPct}%`, background: color }}
                    />
                  </div>
                </div>
                <div className="text-right text-[12px] mono font-semibold text-[var(--ink-1)] whitespace-nowrap">
                  {fmt(row.value)}
                  {panel.unit ? <span className="text-[var(--ink-3)] ml-0.5">{panel.unit}</span> : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
