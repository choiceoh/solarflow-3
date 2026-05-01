import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Landmark,
  PackageCheck,
  Shield,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { CardB, RailBlock, Sparkline, TileB } from '@/components/command/MockupPrimitives';
import type { CustomerAnalysis } from '@/hooks/useDashboard';
import type {
  AlertItem,
  DashboardSectionState,
  DashboardSummary,
  MonthlyRevenue,
  PriceTrend,
} from '@/types/dashboard';
import type { ForecastResponse, InventoryItem, InventoryResponse } from '@/types/inventory';
import type { BLShipment } from '@/types/inbound';
import type { Manufacturer, Product } from '@/types/masters';
import type { Order } from '@/types/orders';
import type { SaleListItem } from '@/types/outbound';
import type { TurnoverResponse } from '@/types/turnover';

interface Props {
  summary: DashboardSectionState<DashboardSummary>;
  revenue: DashboardSectionState<MonthlyRevenue>;
  priceTrend: DashboardSectionState<PriceTrend>;
  inventory: { data: InventoryResponse | null; loading: boolean; error: string | null };
  turnover: { data: TurnoverResponse | null; loading: boolean; error: string | null };
  forecast: { data: ForecastResponse | null; loading: boolean; error: string | null };
  sales: DashboardSectionState<SaleListItem[]>;
  outstanding: DashboardSectionState<CustomerAnalysis>;
  alerts: DashboardSectionState<AlertItem[]>;
  incoming: DashboardSectionState<BLShipment[]>;
  orderBacklog: DashboardSectionState<Order[]>;
  manufacturers: Manufacturer[];
  products: Product[];
  longTermWarning: number;
  longTermCritical: number;
  flags: {
    showPrice: boolean;
    showMargin: boolean;
    showSales: boolean;
    showDetail: boolean;
    showReceivable: boolean;
    showLcLimit: boolean;
  };
}

function mw(value: number | undefined | null) {
  const n = value ?? 0;
  return `${n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} MW`;
}

function kwToMw(value: number | undefined | null) {
  return mw((value ?? 0) / 1000);
}

function krwShort(value: number | undefined | null) {
  const n = value ?? 0;
  if (n >= 100_000_000) return `${(n / 100_000_000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`;
  return `${Math.round(n / 10_000).toLocaleString('ko-KR')}만`;
}

function usdShort(value: number | undefined | null) {
  const n = value ?? 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}M$`;
  return `${Math.round(n / 1000).toLocaleString('ko-KR')}K$`;
}

function dateShort(value: string | undefined | null) {
  if (!value) return '일정 없음';
  return value.slice(5, 10).replace('-', '.');
}

function alertToneClass(severity: AlertItem['severity']) {
  if (severity === 'critical') return 'border-[var(--sf-neg)] bg-[var(--sf-neg-bg)] text-[var(--sf-neg)]';
  if (severity === 'warning') return 'border-[var(--sf-warn)] bg-[var(--sf-warn-bg)] text-[var(--sf-warn)]';
  return 'border-[var(--sf-info)] bg-[var(--sf-info-bg)] text-[var(--sf-info)]';
}

function productLabel(item: InventoryItem) {
  return `${item.manufacturer_name} ${item.spec_wp}Wp`;
}

function SparkBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="sf-mini-bars" aria-hidden>
      {values.map((value, index) => (
        <span key={`${value}-${index}`} style={{ height: `${Math.max(8, (value / max) * 44)}px` }} />
      ))}
    </div>
  );
}

function SectionState({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string | null;
  children: React.ReactNode;
}) {
  if (loading) return <div className="p-6"><LoadingSpinner /></div>;
  if (error) return <div className="p-4 text-xs text-[var(--sf-neg)]">{error}</div>;
  return <>{children}</>;
}

export default function CommandDashboard({
  summary,
  revenue,
  priceTrend,
  inventory,
  turnover,
  forecast,
  sales,
  outstanding,
  alerts,
  incoming,
  orderBacklog,
  manufacturers,
  products,
  longTermWarning,
  longTermCritical,
  flags,
}: Props) {
  const summaryData = summary.data;
  const invItems = inventory.data?.items ?? [];
  const topInventory = [...invItems]
    .sort((a, b) => b.total_secured_kw - a.total_secured_kw)
    .slice(0, 8);
  const slowMovers = turnover.data?.slow_movers?.slice(0, 5) ?? [];
  const months = revenue.data?.months?.slice(-6) ?? [];
  const revenueValues = months.map((month) => month.revenue_krw);
  const forecastMonths = forecast.data?.summary?.months?.slice(0, 6) ?? [];
  const latestSales = (sales.data ?? []).slice(0, 6);
  const outstandingItems = outstanding.data?.items?.slice(0, 5) ?? [];
  const alertRows = (alerts.data ?? []).filter((alert) => alert.count > 0).slice(0, 6);
  const incomingRows = (incoming.data ?? []).slice(0, 5);
  const backlogRows = (orderBacklog.data ?? []).slice(0, 5);
  const manufacturerCount = manufacturers.length;
  const productCount = products.length;
  const priceRows = priceTrend.data?.manufacturers?.slice(0, 4) ?? [];

  const kpis = [
    {
      label: '가용재고',
      value: mw(summaryData?.available_mw),
      detail: `${productCount.toLocaleString('ko-KR')}개 품목 · ${manufacturerCount.toLocaleString('ko-KR')}개 제조사`,
      icon: PackageCheck,
      to: '/inventory',
    },
    {
      label: '총확보',
      value: mw(summaryData?.secured_mw),
      detail: `실재고 ${mw(summaryData?.physical_mw)} · 미착 ${mw(summaryData?.incoming_mw)}`,
      icon: Shield,
      to: '/inventory?tab=incoming',
    },
    {
      label: 'L/C 가용',
      value: flags.showLcLimit ? usdShort(summaryData?.lc_available_usd) : '마스킹',
      detail: flags.showLcLimit ? '은행 한도 기준' : '권한에 따라 숨김',
      icon: Landmark,
      to: '/banking',
    },
    {
      label: '미수금',
      value: flags.showReceivable ? krwShort(summaryData?.outstanding_krw) : '마스킹',
      detail: flags.showReceivable ? `${outstandingItems.length.toLocaleString('ko-KR')}개 거래처 주의` : '권한에 따라 숨김',
      icon: Wallet,
      to: '/orders?tab=receipts',
    },
  ];

  return (
    <div className="sf-command-surface sf-dashboard-shell">
      <div className="sf-dashboard-content">
        <div className="sf-command-kpis">
          {kpis.map((kpi, index) => (
            <Link to={kpi.to} key={kpi.label} className="block h-full">
              <TileB
                lbl={kpi.label}
                v={kpi.value.replace(' MW', '').replace('M$', '')}
                u={kpi.value.includes('MW') ? 'MW' : kpi.value.includes('M$') ? 'M$' : ''}
                sub={kpi.detail}
                tone={index === 0 ? 'solar' : index === 1 ? 'ink' : index === 2 ? 'warn' : 'info'}
                delta={index === 0 ? '+2.4%' : undefined}
                spark={
                  index === 0 ? [62, 64, 66, 68, 71, 72, 73, 74, 75, 76, 76, 76] :
                  index === 1 ? [120, 124, 126, 128, 131, 134, 136, 137, 138, 140, 141, 142] :
                  index === 2 ? [3.2, 3.0, 2.8, 3.1, 2.9, 2.7, 2.5, 2.6, 2.4, 2.3, 2.4, 2.5] :
                  index === 3 ? [4.1, 4.3, 4.0, 3.8, 3.9, 3.6, 3.4, 3.5, 3.3, 3.2, 3.0, 2.9] :
                  undefined
                }
              />
            </Link>
          ))}
        </div>

        <div className="sf-dashboard-main">
          <CardB
            title="품목별 가용재고"
            sub="현재고 + 미착품 - 예약 기준"
            right={<Link className="btn xs" to="/inventory">전체 보기 <ArrowUpRight className="h-3.5 w-3.5" /></Link>}
          >
            <SectionState loading={inventory.loading} error={inventory.error}>
              <div className="sf-table-wrap rounded-none border-0">
                <table>
                  <thead>
                    <tr>
                      <th>품목</th>
                      <th className="text-right">실재고</th>
                      <th className="text-right">미착</th>
                      <th className="text-right">가용</th>
                      <th className="text-right">확보</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topInventory.map((item) => (
                      <tr key={item.product_id}>
                        <td>
                          <div className="font-semibold text-[var(--sf-ink)]">{productLabel(item)}</div>
                          <div className="sf-mono mt-0.5 text-[10px] text-[var(--sf-ink-4)]">{item.product_code}</div>
                        </td>
                        <td className="sf-mono text-right">{kwToMw(item.physical_kw)}</td>
                        <td className="sf-mono text-right">{kwToMw(item.incoming_kw)}</td>
                        <td className="sf-mono text-right text-[var(--sf-pos)]">{kwToMw(item.available_kw + item.available_incoming_kw)}</td>
                        <td className="sf-mono text-right font-bold text-[var(--sf-ink)]">{kwToMw(item.total_secured_kw)}</td>
                      </tr>
                    ))}
                    {topInventory.length === 0 ? (
                      <tr><td colSpan={5} className="text-center text-[var(--sf-ink-3)]">재고 데이터가 없습니다.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </SectionState>
          </CardB>

          <div className="sf-dashboard-row">
            <CardB
              title="월별 매출 흐름"
              sub="최근 6개월 출고/판매 기준"
              right={flags.showSales ? <TrendingUp className="h-4 w-4 text-[var(--pos)]" /> : <TrendingDown className="h-4 w-4 text-[var(--ink-4)]" />}
              padded
            >
              <SectionState loading={revenue.loading} error={revenue.error}>
                {flags.showSales ? (
                  <>
                    <SparkBars values={revenueValues.length ? revenueValues : [1, 1, 1, 1, 1, 1]} />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {months.slice(-3).map((month) => (
                        <div className="rounded bg-[var(--bg-2)] px-3 py-2" key={month.month}>
                          <div className="mono text-[10px] text-[var(--ink-3)]">{month.month}</div>
                          <div className="mt-1 text-sm font-bold">{krwShort(month.revenue_krw)}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[var(--ink-3)]">매출 정보는 현재 권한에서 숨겨져 있습니다.</p>
                )}
              </SectionState>
            </CardB>

            <CardB
              title="수급 전망"
              sub="6개월 가용 흐름"
              right={<Link className="text-xs font-bold text-[var(--solar-3)]" to="/inventory?tab=forecast">열기</Link>}
              padded
            >
              <SectionState loading={forecast.loading} error={forecast.error}>
                <div className="flex flex-col gap-2">
                  {forecastMonths.map((month) => (
                    <div className="grid grid-cols-[60px_minmax(0,1fr)_74px] items-center gap-2" key={month.month}>
                      <div className="mono text-[10px] text-[var(--ink-3)]">{month.month.slice(2)}</div>
                      <div className="h-2 overflow-hidden rounded bg-[var(--bg-3)]">
                        <div
                          className="h-full bg-[var(--solar)]"
                          style={{ width: `${Math.min(100, Math.max(6, month.total_available_kw / Math.max(summaryData?.secured_mw ?? 1, 1) / 10))}%` }}
                        />
                      </div>
                      <div className="mono text-right text-[10px]">{kwToMw(month.total_available_kw)}</div>
                    </div>
                  ))}
                </div>
              </SectionState>
            </CardB>
          </div>
        </div>
      </div>

        <aside className="sf-dashboard-rail sf-right-rail">
          <CardB
            title="단가 추이"
            right={<Link className="text-xs font-bold text-[var(--solar-3)]" to="/procurement?tab=prices">상세</Link>}
            padded
          >
            <SectionState loading={priceTrend.loading} error={priceTrend.error}>
              <div className="flex flex-col gap-3">
                {priceRows.map((row) => {
                  const values = row.data_points.slice(-8).map((point) => point.price_usd_wp);
                  const first = values[0] ?? 0;
                  const last = values[values.length - 1] ?? first;
                  const down = last <= first;
                  return (
                    <div key={row.name} className="grid grid-cols-[92px_minmax(0,1fr)_54px] items-center gap-2">
                      <div className="truncate text-xs font-bold">{row.name}</div>
                      <Sparkline data={values.length ? values : [1, 1, 1, 1]} w={96} h={26} color={down ? 'var(--pos)' : 'var(--neg)'} />
                      <div className={`mono text-right text-[10px] ${down ? 'text-[var(--pos)]' : 'text-[var(--neg)]'}`}>
                        {down ? '-' : '+'}{Math.abs(last - first).toFixed(2)}
                      </div>
                    </div>
                  );
                })}
                {priceRows.length === 0 ? <p className="text-xs text-[var(--ink-3)]">단가 데이터가 없습니다.</p> : null}
              </div>
            </SectionState>
          </CardB>

          <CardB
            title="운영 워크큐"
            sub="실제 알림 조건에서 계산"
            right={<Link className="text-xs font-bold text-[var(--solar-3)]" to="/dashboard">동기화</Link>}
          >
            <SectionState loading={alerts.loading} error={alerts.error}>
              <div className="divide-y divide-[var(--line)]">
                {alertRows.map((alert) => (
                  <Link
                    key={`${alert.type}-${alert.title}`}
                    to={alert.link}
                    className="block px-4 py-3 transition hover:bg-[var(--bg-2)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold">{alert.title}</div>
                        <div className="mt-1 truncate text-[10.5px] text-[var(--ink-3)]">{alert.description}</div>
                      </div>
                      <div className={`mono shrink-0 rounded border px-2 py-1 text-[10px] font-bold ${alertToneClass(alert.severity)}`}>
                        {alert.count}
                      </div>
                    </div>
                  </Link>
                ))}
                {alertRows.length === 0 ? <div className="p-4 text-xs text-[var(--ink-3)]">현재 처리할 운영 알림이 없습니다.</div> : null}
              </div>
            </SectionState>
          </CardB>

          <CardB
            title="미착품 · 납기"
            sub="B/L ETA와 수주 잔량 기준"
          >
            <SectionState
              loading={incoming.loading || orderBacklog.loading}
              error={incoming.error ?? orderBacklog.error}
            >
              <RailBlock title="미착품" count={incomingRows.length}>
                <div className="flex flex-col gap-2">
                  {incomingRows.map((bl) => (
                    <Link to="/procurement?tab=bl" key={bl.bl_id} className="rounded bg-[var(--bg-2)] px-3 py-2 transition hover:bg-[var(--bg-3)]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold">{bl.bl_number}</span>
                        <span className="mono text-[10px] text-[var(--ink-3)]">ETA {dateShort(bl.eta)}</span>
                      </div>
                      <div className="mt-1 truncate text-[10.5px] text-[var(--ink-4)]">{bl.manufacturer_name ?? '제조사 미지정'} · {bl.status}</div>
                    </Link>
                  ))}
                  {incomingRows.length === 0 ? <div className="text-xs text-[var(--ink-3)]">진행 중인 미착품이 없습니다.</div> : null}
                </div>
              </RailBlock>

              <RailBlock title="수주 잔량" count={backlogRows.length} last>
                <div className="flex flex-col gap-2">
                  {backlogRows.map((order) => (
                    <Link to="/orders" key={order.order_id} className="rounded bg-[var(--bg-2)] px-3 py-2 transition hover:bg-[var(--bg-3)]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold">{order.customer_name ?? '거래처 미지정'}</span>
                        <span className="mono text-[10px] text-[var(--ink-3)]">납기 {dateShort(order.delivery_due)}</span>
                      </div>
                      <div className="mt-1 truncate text-[10.5px] text-[var(--ink-4)]">
                        {order.product_code ?? order.product_name ?? '품목 미지정'} · 잔량 {(order.remaining_qty ?? 0).toLocaleString('ko-KR')}
                      </div>
                    </Link>
                  ))}
                  {backlogRows.length === 0 ? <div className="text-xs text-[var(--ink-3)]">납기 임박 잔량이 없습니다.</div> : null}
                </div>
              </RailBlock>
            </SectionState>
          </CardB>

          <CardB
            title="최근 판매"
            right={<Link className="text-xs font-bold text-[var(--solar-3)]" to="/orders?tab=sales">전체</Link>}
          >
            <SectionState loading={sales.loading} error={sales.error}>
              <div className="divide-y divide-[var(--line)]">
                {latestSales.map((sale) => (
                  <div className="px-4 py-3" key={sale.sale_id}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold">{sale.customer_name ?? '거래처 미지정'}</div>
                        <div className="mono mt-1 truncate text-[10px] text-[var(--ink-3)]">{sale.product_code ?? sale.product_name ?? '품목 미지정'}</div>
                      </div>
                      <div className="mono shrink-0 text-right text-[10px] font-bold">
                        {flags.showSales ? krwShort(sale.sale?.supply_amount ?? sale.supply_amount ?? 0) : '마스킹'}
                      </div>
                    </div>
                  </div>
                ))}
                {latestSales.length === 0 ? <div className="p-4 text-xs text-[var(--ink-3)]">최근 판매 데이터가 없습니다.</div> : null}
              </div>
            </SectionState>
          </CardB>

          <div className="card">
            <RailBlock title="재고 주의" last>
              <div className="mb-2 rounded bg-[var(--warn-bg)] px-3 py-2 text-xs text-[var(--warn)]">
                장기재고 주의 {longTermWarning.toLocaleString('ko-KR')}건 · 심각 {longTermCritical.toLocaleString('ko-KR')}건
              </div>
              <div className="rounded bg-[var(--info-bg)] px-3 py-2 text-xs text-[var(--info)]">
                저회전 품목 {slowMovers.length.toLocaleString('ko-KR')}건 모니터링 중
              </div>
            </RailBlock>
          </div>
        </aside>
    </div>
  );
}
