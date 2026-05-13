// 공급가 매출 (억) 드릴다운 — sale.supply_amount 기준. 거래처/제조사별 분해.
// SalesAnalysisPage 의 KPI '공급가 매출'.

import { useMemo } from "react"
import { useSaleListAll } from "@/hooks/useOutbound"
import type { SaleListItem } from "@/types/outbound"
import { breakdownBy, trend24 } from "@/lib/insights/aggregations"
import { isExternalSale } from "@/lib/saleCategory"
import InsightShell from "@/components/insights/InsightShell"

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)
const fmtEokTick = (v: number) => (v / 100_000_000).toFixed(0)
const supplyAmount = (s: SaleListItem) => s.supply_amount ?? s.sale?.supply_amount ?? 0
const saleDate = (s: SaleListItem) => s.tax_invoice_date ?? s.outbound_date ?? s.order_date ?? null

export function SalesAnalysisSupplyInsight() {
  const { data: rawData, loading } = useSaleListAll()
  // SalesAnalysisPage 와 의미를 맞춤 — 외부 판매(sale/sale_spare)만. 비매출 출고
  // (공사사용 등) 와 연결된 sale 은 supply_amount=0 이라 누계/거래처별 합계를
  // 인위적으로 깎아낸다. 술어 정의는 lib/saleCategory.
  const data = useMemo(() => rawData.filter(isExternalSale), [rawData])

  const trend = useMemo(() => trend24(data, saleDate, supplyAmount), [data])
  const totalSupply = data.reduce((sum, s) => sum + supplyAmount(s), 0)

  const byCustomer = useMemo(
    () =>
      breakdownBy(
        data,
        (s) => s.customer_id,
        (s) => s.customer_name ?? "미지정",
        supplyAmount,
      ).slice(0, 10),
    [data],
  )
  const byManufacturer = useMemo(
    () =>
      breakdownBy(
        data,
        (s) => s.manufacturer_id ?? null,
        (s) => s.manufacturer_name ?? "미지정",
        supplyAmount,
      ).slice(0, 10),
    [data],
  )

  return (
    <InsightShell
      title="공급가 매출"
      subtitle="sale.supply_amount 기준 24개월 월별 추이 (단위 억) · 거래처/제조사 Top10"
      unit="억"
      tone="solar"
      backTo="/sales-analysis"
      backLabel="매출 분석으로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={fmtEok(totalSupply)}
      trend={trend}
      trendValueLabel="공급가"
      formatTrend={fmtEokTick}
      breakdowns={[
        { label: "거래처 상위 10", rows: byCustomer, unit: "억", formatValue: fmtEok },
        { label: "제조사 상위 10", rows: byManufacturer, unit: "억", formatValue: fmtEok },
      ]}
    />
  )
}
