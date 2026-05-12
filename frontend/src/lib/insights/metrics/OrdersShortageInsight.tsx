// 충당 부족 (재고+미착 부족) 드릴다운.
// 활성 수주(received/partial) 를 페이지 500건 한도로 가져온 뒤 useOrderFulfillmentRisk 로 위험 평가.

import { useMemo } from 'react'
import { useOrderList, useOrderFulfillmentRisk } from '@/hooks/useOrders'
import { breakdownBy } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtCount = (n: number) => String(Math.round(n))
const fmtMW = (kw: number) => (kw / 1000).toFixed(kw >= 100_000 ? 1 : 2)

export function OrdersShortageInsight() {
  // 충당 위험은 active(received) + partial 만 계산 대상. 두 status 로 fetch 결합.
  const receivedQ = useOrderList({ status: 'received', pageIndex: 0, pageSize: 500 })
  const partialQ = useOrderList({ status: 'partial', pageIndex: 0, pageSize: 500 })
  const orders = useMemo(
    () => [...receivedQ.items, ...partialQ.items],
    [receivedQ.items, partialQ.items],
  )
  const activeOrderIds = useMemo(
    () =>
      orders
        .filter((o) => (o.remaining_qty ?? o.quantity) > 0)
        .map((o) => o.order_id),
    [orders],
  )
  const { items: riskItems, summary, loading: riskLoading } = useOrderFulfillmentRisk(activeOrderIds)
  const loading = receivedQ.loading || partialQ.loading || riskLoading

  const shortageItems = useMemo(() => riskItems.filter((r) => r.risk === 'shortage'), [riskItems])
  const totalShortageCount = summary?.shortage_count ?? shortageItems.length
  const totalShortageKw = shortageItems.reduce((sum, r) => sum + (r.shortage_kw ?? 0), 0)

  // join shortage → orders for label
  const orderById = useMemo(() => {
    const m = new Map<string, (typeof orders)[number]>()
    for (const o of orders) m.set(o.order_id, o)
    return m
  }, [orders])

  const byCustomer = useMemo(
    () =>
      breakdownBy(
        shortageItems,
        (r) => orderById.get(r.order_id)?.customer_id ?? null,
        (r) => orderById.get(r.order_id)?.customer_name ?? '미지정',
        (r) => r.shortage_kw,
      ).slice(0, 10),
    [shortageItems, orderById],
  )
  const byProduct = useMemo(
    () =>
      breakdownBy(
        shortageItems,
        (r) => r.product_id,
        (r) => {
          const o = orderById.get(r.order_id)
          return o?.product_name ?? o?.product_code ?? '미지정'
        },
        (r) => r.shortage_kw,
      ).slice(0, 10),
    [shortageItems, orderById],
  )
  const bySource = useMemo(
    () =>
      breakdownBy(
        shortageItems,
        (r) => String(r.fulfillment_source),
        (r) => (r.fulfillment_source === 'stock' ? '실재고' : r.fulfillment_source === 'incoming' ? '미착품' : String(r.fulfillment_source)),
        (r) => r.shortage_kw,
      ),
    [shortageItems],
  )

  return (
    <InsightShell
      title="충당 부족"
      subtitle={`shortage 위험 수주 ${fmtCount(totalShortageCount)}건 · 부족 합계 ${fmtMW(totalShortageKw)} MW. (active 수주 ${activeOrderIds.length}건 기준)`}
      unit="MW"
      tone="warn"
      backTo="/orders"
      backLabel="수주 관리로 돌아가기"
      loading={loading}
      totalLabel="부족 합계"
      totalValue={fmtMW(totalShortageKw)}
      trend={[]}
      trendValueLabel="부족"
      breakdowns={[
        { label: '원천', rows: bySource, unit: 'MW', formatValue: fmtMW },
        { label: '거래처 상위 10', rows: byCustomer, unit: 'MW', formatValue: fmtMW },
        { label: '제품 상위 10', rows: byProduct, unit: 'MW', formatValue: fmtMW },
      ]}
    />
  )
}
