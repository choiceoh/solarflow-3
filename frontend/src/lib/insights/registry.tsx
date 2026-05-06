// Insights 드릴다운 페이지 메트릭 레지스트리.
//
// 각 metricId 는 한 KPI 타일에 1:1 매핑되며, 자체 React 컴포넌트로 렌더된다.
// 컴포넌트 내부에서 hook 으로 데이터를 가져와 InsightShell 에 trend + breakdowns 를 넘긴다.
//
// 신규 metric 추가 절차:
//   1) 페이지 KPI 타일에 metricId='outbound.count' 식 prop 부여
//   2) 이 파일에 InsightEntry 추가 (component + breadcrumb 메타)
//   3) GUI 편집기 picker (있으면) 에도 자동 노출 — REGISTRY 키 enumerate

import type { ReactNode } from 'react'
import { OutboundCountInsight } from './metrics/OutboundCountInsight'
import { OutboundKwInsight } from './metrics/OutboundKwInsight'
import { OutboundKwYearInsight } from './metrics/OutboundKwYearInsight'
import { SaleConversionInsight } from './metrics/SaleConversionInsight'
import { OrdersActiveInsight } from './metrics/OrdersActiveInsight'
import { OrdersCustomersInsight } from './metrics/OrdersCustomersInsight'
import { OrdersPartialInsight } from './metrics/OrdersPartialInsight'
import { OrdersUnitPriceInsight } from './metrics/OrdersUnitPriceInsight'
import { SalesTotalInsight } from './metrics/SalesTotalInsight'
import { SalesInvoicePendingInsight } from './metrics/SalesInvoicePendingInsight'
import { SalesCustomersInsight } from './metrics/SalesCustomersInsight'
import { SalesUnitPriceInsight } from './metrics/SalesUnitPriceInsight'
import { ReceiptsTotalInsight } from './metrics/ReceiptsTotalInsight'
import { ReceiptsRemainingInsight } from './metrics/ReceiptsRemainingInsight'
import { ReceiptsPartialMatchInsight } from './metrics/ReceiptsPartialMatchInsight'
import { ReceiptsRecoveryRateInsight } from './metrics/ReceiptsRecoveryRateInsight'
import { CustomsExpenseTotalInsight } from './metrics/CustomsExpenseTotalInsight'
import { CustomsBlLinkedInsight } from './metrics/CustomsBlLinkedInsight'
import { CustomsTypeCountInsight } from './metrics/CustomsTypeCountInsight'
import { CustomsAvgExpenseInsight } from './metrics/CustomsAvgExpenseInsight'
import { BankingTotalLimitInsight } from './metrics/BankingTotalLimitInsight'
import { BankingUsedInsight } from './metrics/BankingUsedInsight'
import { BankingAvailableInsight } from './metrics/BankingAvailableInsight'
import { BankingMaturityAlertInsight } from './metrics/BankingMaturityAlertInsight'
import { PurchaseChainsInsight } from './metrics/PurchaseChainsInsight'
import { PurchaseVariantsInsight } from './metrics/PurchaseVariantsInsight'
import { PurchasePriceChangesInsight } from './metrics/PurchasePriceChangesInsight'
import { PurchaseRecentEventsInsight } from './metrics/PurchaseRecentEventsInsight'
import { SalesAnalysisSupplyInsight } from './metrics/SalesAnalysisSupplyInsight'
import { SalesAnalysisTotalInsight } from './metrics/SalesAnalysisTotalInsight'
import { SalesAnalysisIssueRateInsight } from './metrics/SalesAnalysisIssueRateInsight'
import { SalesAnalysisMarginRateInsight } from './metrics/SalesAnalysisMarginRateInsight'

export interface InsightEntry {
  // KPI 타일이 보낼 식별자 (예: 'outbound.count') — URL 에 그대로 들어감.
  id: string
  // 사이드바/breadcrumb 표기용 짧은 라벨.
  shortLabel: string
  // 실제 페이지 본문 컴포넌트 — InsightShell 호출.
  render: () => ReactNode
}

export const INSIGHT_REGISTRY: Record<string, InsightEntry> = {
  'outbound.count': {
    id: 'outbound.count',
    shortLabel: '출고 전체',
    render: () => <OutboundCountInsight />,
  },
  'outbound.kw_prev_month': {
    id: 'outbound.kw_prev_month',
    shortLabel: '전월 출고 용량',
    render: () => <OutboundKwInsight />,
  },
  'outbound.kw_year': {
    id: 'outbound.kw_year',
    shortLabel: '금년 출고 용량',
    render: () => <OutboundKwYearInsight />,
  },
  'outbound.sale_conversion': {
    id: 'outbound.sale_conversion',
    shortLabel: '계산서 연결률',
    render: () => <SaleConversionInsight />,
  },

  // Orders 탭
  'orders.active': {
    id: 'orders.active',
    shortLabel: '진행 수주',
    render: () => <OrdersActiveInsight />,
  },
  'orders.customers': {
    id: 'orders.customers',
    shortLabel: '거래처',
    render: () => <OrdersCustomersInsight />,
  },
  'orders.partial': {
    id: 'orders.partial',
    shortLabel: '분할출고',
    render: () => <OrdersPartialInsight />,
  },
  'orders.unit_price_wp': {
    id: 'orders.unit_price_wp',
    shortLabel: '평균 단가',
    render: () => <OrdersUnitPriceInsight />,
  },

  // Sales 탭
  'sales.total': {
    id: 'sales.total',
    shortLabel: '매출 합계',
    render: () => <SalesTotalInsight />,
  },
  'sales.invoice_pending': {
    id: 'sales.invoice_pending',
    shortLabel: '계산서 미발행',
    render: () => <SalesInvoicePendingInsight />,
  },
  'sales.customers': {
    id: 'sales.customers',
    shortLabel: '매출처',
    render: () => <SalesCustomersInsight />,
  },
  'sales.unit_price_wp': {
    id: 'sales.unit_price_wp',
    shortLabel: '매출 평균 단가',
    render: () => <SalesUnitPriceInsight />,
  },

  // Receipts 탭
  'receipts.total': {
    id: 'receipts.total',
    shortLabel: '입금 합계',
    render: () => <ReceiptsTotalInsight />,
  },
  'receipts.remaining': {
    id: 'receipts.remaining',
    shortLabel: '미정산',
    render: () => <ReceiptsRemainingInsight />,
  },
  'receipts.partial_match': {
    id: 'receipts.partial_match',
    shortLabel: '부분 매칭',
    render: () => <ReceiptsPartialMatchInsight />,
  },
  'receipts.recovery_rate': {
    id: 'receipts.recovery_rate',
    shortLabel: '회수율',
    render: () => <ReceiptsRecoveryRateInsight />,
  },

  // Customs
  'customs.expense_total': {
    id: 'customs.expense_total',
    shortLabel: '부대비용',
    render: () => <CustomsExpenseTotalInsight />,
  },
  'customs.bl_linked': {
    id: 'customs.bl_linked',
    shortLabel: 'B/L 연결',
    render: () => <CustomsBlLinkedInsight />,
  },
  'customs.type_count': {
    id: 'customs.type_count',
    shortLabel: '비용 유형',
    render: () => <CustomsTypeCountInsight />,
  },
  'customs.avg_expense': {
    id: 'customs.avg_expense',
    shortLabel: '평균 비용',
    render: () => <CustomsAvgExpenseInsight />,
  },

  // Banking
  'banking.total_limit': {
    id: 'banking.total_limit',
    shortLabel: '총 한도',
    render: () => <BankingTotalLimitInsight />,
  },
  'banking.used': {
    id: 'banking.used',
    shortLabel: '사용중',
    render: () => <BankingUsedInsight />,
  },
  'banking.available': {
    id: 'banking.available',
    shortLabel: '가용',
    render: () => <BankingAvailableInsight />,
  },
  'banking.maturity_alert': {
    id: 'banking.maturity_alert',
    shortLabel: '만기 알림',
    render: () => <BankingMaturityAlertInsight />,
  },

  // Purchase History
  'purchase.chains': {
    id: 'purchase.chains',
    shortLabel: '계약 체인',
    render: () => <PurchaseChainsInsight />,
  },
  'purchase.variants': {
    id: 'purchase.variants',
    shortLabel: '변경계약',
    render: () => <PurchaseVariantsInsight />,
  },
  'purchase.price_changes': {
    id: 'purchase.price_changes',
    shortLabel: '단가 변동',
    render: () => <PurchasePriceChangesInsight />,
  },
  'purchase.recent_events': {
    id: 'purchase.recent_events',
    shortLabel: '최근 이벤트',
    render: () => <PurchaseRecentEventsInsight />,
  },

  // Sales Analysis
  'sales_analysis.supply_amount': {
    id: 'sales_analysis.supply_amount',
    shortLabel: '공급가 매출',
    render: () => <SalesAnalysisSupplyInsight />,
  },
  'sales_analysis.total_amount': {
    id: 'sales_analysis.total_amount',
    shortLabel: '부가세 포함',
    render: () => <SalesAnalysisTotalInsight />,
  },
  'sales_analysis.issue_rate': {
    id: 'sales_analysis.issue_rate',
    shortLabel: '계산서 발행률',
    render: () => <SalesAnalysisIssueRateInsight />,
  },
  'sales_analysis.margin_rate': {
    id: 'sales_analysis.margin_rate',
    shortLabel: '이익률',
    render: () => <SalesAnalysisMarginRateInsight />,
  },
}

export function getInsight(metricId: string | undefined): InsightEntry | null {
  if (!metricId) return null
  return INSIGHT_REGISTRY[metricId] ?? null
}
