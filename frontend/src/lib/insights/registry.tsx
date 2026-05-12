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
import { ProcurementPoActiveInsight } from './metrics/ProcurementPoActiveInsight'
import { ProcurementLcLinkedInsight } from './metrics/ProcurementLcLinkedInsight'
import { ProcurementShippingInsight } from './metrics/ProcurementShippingInsight'
import { ProcurementContractTypesInsight } from './metrics/ProcurementContractTypesInsight'
import { ProcurementLcTotalInsight } from './metrics/ProcurementLcTotalInsight'
import { ProcurementLcAmountInsight } from './metrics/ProcurementLcAmountInsight'
import { ProcurementLcMaturityInsight } from './metrics/ProcurementLcMaturityInsight'
import { ProcurementLcBanksInsight } from './metrics/ProcurementLcBanksInsight'
import { ProcurementTtTotalInsight } from './metrics/ProcurementTtTotalInsight'
import { ProcurementTtCompletedInsight } from './metrics/ProcurementTtCompletedInsight'
import { ProcurementTtPlannedInsight } from './metrics/ProcurementTtPlannedInsight'
import { ProcurementTtPoLinkedInsight } from './metrics/ProcurementTtPoLinkedInsight'
import { ProcurementBlTotalInsight } from './metrics/ProcurementBlTotalInsight'
import { ProcurementBlShippingInsight } from './metrics/ProcurementBlShippingInsight'
import { ProcurementBlCustomsInsight } from './metrics/ProcurementBlCustomsInsight'
import { ProcurementBlImportInsight } from './metrics/ProcurementBlImportInsight'
import { InventoryTotalSecuredInsight } from './metrics/InventoryTotalSecuredInsight'
import { InventoryPhysicalInsight } from './metrics/InventoryPhysicalInsight'
import { InventoryIncomingInsight } from './metrics/InventoryIncomingInsight'
import { InventoryAllocationsInsight } from './metrics/InventoryAllocationsInsight'
import { InventorySalePendingInsight } from './metrics/InventorySalePendingInsight'
import { InventoryHoldInsight } from './metrics/InventoryHoldInsight'
import { InventoryProductCountInsight } from './metrics/InventoryProductCountInsight'
import { InventoryIncomingShareInsight } from './metrics/InventoryIncomingShareInsight'
import { InventoryInsufficientInsight } from './metrics/InventoryInsufficientInsight'
import { InventoryLongTermInsight } from './metrics/InventoryLongTermInsight'
import { OutboundActiveInsight } from './metrics/OutboundActiveInsight'
import { OutboundCancelPendingInsight } from './metrics/OutboundCancelPendingInsight'
import { OutboundCancelledInsight } from './metrics/OutboundCancelledInsight'
import { OutboundSaleUnregisteredInsight } from './metrics/OutboundSaleUnregisteredInsight'
import { SalesSupplyInsight } from './metrics/SalesSupplyInsight'
import { SalesVatInsight } from './metrics/SalesVatInsight'
import { SalesInvoiceIssuedInsight } from './metrics/SalesInvoiceIssuedInsight'
import { SalesErpOpenInsight } from './metrics/SalesErpOpenInsight'
import { ReceiptsCountInsight } from './metrics/ReceiptsCountInsight'
import { ReceiptsOpenSaleInsight } from './metrics/ReceiptsOpenSaleInsight'
import { ReceiptsAvgAmountInsight } from './metrics/ReceiptsAvgAmountInsight'
import { OrdersReceivedInsight } from './metrics/OrdersReceivedInsight'
import { OrdersCompletedInsight } from './metrics/OrdersCompletedInsight'
import { OrdersCancelledInsight } from './metrics/OrdersCancelledInsight'
import { OrdersAvgUnitPriceWpInsight } from './metrics/OrdersAvgUnitPriceWpInsight'
import { OrdersShortageInsight } from './metrics/OrdersShortageInsight'
import { ProcurementLcSettledInsight } from './metrics/ProcurementLcSettledInsight'
import { ProcurementLcAvgAmountInsight } from './metrics/ProcurementLcAvgAmountInsight'
import { ProcurementLcProgressInsight } from './metrics/ProcurementLcProgressInsight'
import { ProcurementBlArrivedInsight } from './metrics/ProcurementBlArrivedInsight'
import { ProcurementBlScheduledInsight } from './metrics/ProcurementBlScheduledInsight'
import { ProcurementBlCompletedInsight } from './metrics/ProcurementBlCompletedInsight'
import { ProcurementBlErpDoneInsight } from './metrics/ProcurementBlErpDoneInsight'
import { ProcurementTtCompletedCountInsight } from './metrics/ProcurementTtCompletedCountInsight'
import { ProcurementTtAvgAmountInsight } from './metrics/ProcurementTtAvgAmountInsight'
import { ProcurementTtOrphanInsight } from './metrics/ProcurementTtOrphanInsight'
import { ProcurementPoAvgMwInsight } from './metrics/ProcurementPoAvgMwInsight'
import { ProcurementPoChangedInsight } from './metrics/ProcurementPoChangedInsight'
import { ProcurementPoTotalInsight } from './metrics/ProcurementPoTotalInsight'
import { ProcurementPoShippingRatioInsight } from './metrics/ProcurementPoShippingRatioInsight'
import { CustomsUncostedInsight } from './metrics/CustomsUncostedInsight'
import { CustomsUnlinkedExpenseInsight } from './metrics/CustomsUnlinkedExpenseInsight'
import { CustomsCapacityInsight } from './metrics/CustomsCapacityInsight'
import { CustomsVatInsight } from './metrics/CustomsVatInsight'
import { CustomsAvgPerDeclInsight } from './metrics/CustomsAvgPerDeclInsight'

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

  // Procurement PO 탭
  'procurement.po_active': {
    id: 'procurement.po_active',
    shortLabel: '진행 P/O',
    render: () => <ProcurementPoActiveInsight />,
  },
  'procurement.lc_linked': {
    id: 'procurement.lc_linked',
    shortLabel: 'L/C 연결',
    render: () => <ProcurementLcLinkedInsight />,
  },
  'procurement.shipping': {
    id: 'procurement.shipping',
    shortLabel: '운송중',
    render: () => <ProcurementShippingInsight />,
  },
  'procurement.contract_types': {
    id: 'procurement.contract_types',
    shortLabel: '계약 유형',
    render: () => <ProcurementContractTypesInsight />,
  },

  // Procurement LC 탭
  'procurement.lc_total': {
    id: 'procurement.lc_total',
    shortLabel: 'L/C 전체',
    render: () => <ProcurementLcTotalInsight />,
  },
  'procurement.lc_amount': {
    id: 'procurement.lc_amount',
    shortLabel: 'L/C 개설 금액',
    render: () => <ProcurementLcAmountInsight />,
  },
  'procurement.lc_maturity': {
    id: 'procurement.lc_maturity',
    shortLabel: 'L/C 만기 30일',
    render: () => <ProcurementLcMaturityInsight />,
  },
  'procurement.lc_banks': {
    id: 'procurement.lc_banks',
    shortLabel: 'L/C 은행',
    render: () => <ProcurementLcBanksInsight />,
  },

  // Procurement TT 탭
  'procurement.tt_total': {
    id: 'procurement.tt_total',
    shortLabel: 'T/T 이력',
    render: () => <ProcurementTtTotalInsight />,
  },
  'procurement.tt_completed': {
    id: 'procurement.tt_completed',
    shortLabel: 'T/T 완료 금액',
    render: () => <ProcurementTtCompletedInsight />,
  },
  'procurement.tt_planned': {
    id: 'procurement.tt_planned',
    shortLabel: 'T/T 대기',
    render: () => <ProcurementTtPlannedInsight />,
  },
  'procurement.tt_po_linked': {
    id: 'procurement.tt_po_linked',
    shortLabel: 'T/T PO 연결',
    render: () => <ProcurementTtPoLinkedInsight />,
  },

  // Procurement BL 탭
  'procurement.bl_total': {
    id: 'procurement.bl_total',
    shortLabel: 'B/L 전체',
    render: () => <ProcurementBlTotalInsight />,
  },
  'procurement.bl_shipping': {
    id: 'procurement.bl_shipping',
    shortLabel: 'B/L 선적/입항',
    render: () => <ProcurementBlShippingInsight />,
  },
  'procurement.bl_customs': {
    id: 'procurement.bl_customs',
    shortLabel: 'B/L 통관중',
    render: () => <ProcurementBlCustomsInsight />,
  },
  'procurement.bl_import': {
    id: 'procurement.bl_import',
    shortLabel: 'B/L 해외직수입',
    render: () => <ProcurementBlImportInsight />,
  },

  // Inventory
  'inventory.total_secured': {
    id: 'inventory.total_secured',
    shortLabel: '가용 재고',
    render: () => <InventoryTotalSecuredInsight />,
  },
  'inventory.physical': {
    id: 'inventory.physical',
    shortLabel: '실재고',
    render: () => <InventoryPhysicalInsight />,
  },
  'inventory.incoming': {
    id: 'inventory.incoming',
    shortLabel: '미착품',
    render: () => <InventoryIncomingInsight />,
  },
  'inventory.allocations': {
    id: 'inventory.allocations',
    shortLabel: '예약 차감',
    render: () => <InventoryAllocationsInsight />,
  },
  'inventory.sale_pending': {
    id: 'inventory.sale_pending',
    shortLabel: '판매 예약',
    render: () => <InventorySalePendingInsight />,
  },
  'inventory.hold': {
    id: 'inventory.hold',
    shortLabel: '보류',
    render: () => <InventoryHoldInsight />,
  },
  'inventory.product_count': {
    id: 'inventory.product_count',
    shortLabel: '활성 품목',
    render: () => <InventoryProductCountInsight />,
  },
  'inventory.incoming_share': {
    id: 'inventory.incoming_share',
    shortLabel: '미착 비중',
    render: () => <InventoryIncomingShareInsight />,
  },
  'inventory.insufficient': {
    id: 'inventory.insufficient',
    shortLabel: '부족 예상',
    render: () => <InventoryInsufficientInsight />,
  },
  'inventory.long_term': {
    id: 'inventory.long_term',
    shortLabel: '장기재고',
    render: () => <InventoryLongTermInsight />,
  },

  // Outbound 확장
  'outbound.active': {
    id: 'outbound.active',
    shortLabel: '활성 출고',
    render: () => <OutboundActiveInsight />,
  },
  'outbound.cancel_pending': {
    id: 'outbound.cancel_pending',
    shortLabel: '취소 대기',
    render: () => <OutboundCancelPendingInsight />,
  },
  'outbound.cancelled': {
    id: 'outbound.cancelled',
    shortLabel: '취소 완료',
    render: () => <OutboundCancelledInsight />,
  },
  'outbound.sale_unregistered': {
    id: 'outbound.sale_unregistered',
    shortLabel: '매출 미등록',
    render: () => <OutboundSaleUnregisteredInsight />,
  },

  // Sales 확장
  'sales.supply': {
    id: 'sales.supply',
    shortLabel: '매출 공급가',
    render: () => <SalesSupplyInsight />,
  },
  'sales.vat': {
    id: 'sales.vat',
    shortLabel: '매출 부가세',
    render: () => <SalesVatInsight />,
  },
  'sales.invoice_issued': {
    id: 'sales.invoice_issued',
    shortLabel: '계산서 발행',
    render: () => <SalesInvoiceIssuedInsight />,
  },
  'sales.erp_open': {
    id: 'sales.erp_open',
    shortLabel: 'ERP 미마감',
    render: () => <SalesErpOpenInsight />,
  },

  // Receipts 확장
  'receipts.count': {
    id: 'receipts.count',
    shortLabel: '입금 건수',
    render: () => <ReceiptsCountInsight />,
  },
  'receipts.open_sale': {
    id: 'receipts.open_sale',
    shortLabel: '수금 미완료',
    render: () => <ReceiptsOpenSaleInsight />,
  },
  'receipts.avg_amount': {
    id: 'receipts.avg_amount',
    shortLabel: '평균 입금',
    render: () => <ReceiptsAvgAmountInsight />,
  },

  // Orders 확장
  'orders.received': {
    id: 'orders.received',
    shortLabel: '신규 접수',
    render: () => <OrdersReceivedInsight />,
  },
  'orders.completed': {
    id: 'orders.completed',
    shortLabel: '완료 수주',
    render: () => <OrdersCompletedInsight />,
  },
  'orders.cancelled': {
    id: 'orders.cancelled',
    shortLabel: '취소 수주',
    render: () => <OrdersCancelledInsight />,
  },
  'orders.avg_unit_price_wp': {
    id: 'orders.avg_unit_price_wp',
    shortLabel: '전체 평단',
    render: () => <OrdersAvgUnitPriceWpInsight />,
  },
  'orders.shortage': {
    id: 'orders.shortage',
    shortLabel: '충당 부족',
    render: () => <OrdersShortageInsight />,
  },

  // Procurement LC 확장
  'procurement.lc_settled': {
    id: 'procurement.lc_settled',
    shortLabel: 'L/C 결제 완료',
    render: () => <ProcurementLcSettledInsight />,
  },
  'procurement.lc_avg_amount': {
    id: 'procurement.lc_avg_amount',
    shortLabel: 'L/C 평균 개설액',
    render: () => <ProcurementLcAvgAmountInsight />,
  },
  'procurement.lc_progress': {
    id: 'procurement.lc_progress',
    shortLabel: 'L/C 진행률',
    render: () => <ProcurementLcProgressInsight />,
  },

  // Procurement BL 확장
  'procurement.bl_arrived': {
    id: 'procurement.bl_arrived',
    shortLabel: 'B/L 입항',
    render: () => <ProcurementBlArrivedInsight />,
  },
  'procurement.bl_scheduled': {
    id: 'procurement.bl_scheduled',
    shortLabel: 'B/L 입고 예정',
    render: () => <ProcurementBlScheduledInsight />,
  },
  'procurement.bl_completed': {
    id: 'procurement.bl_completed',
    shortLabel: 'B/L 입고 완료',
    render: () => <ProcurementBlCompletedInsight />,
  },
  'procurement.bl_erp_done': {
    id: 'procurement.bl_erp_done',
    shortLabel: 'B/L ERP 마감',
    render: () => <ProcurementBlErpDoneInsight />,
  },

  // Procurement TT 확장
  'procurement.tt_completed_count': {
    id: 'procurement.tt_completed_count',
    shortLabel: 'T/T 완료 건수',
    render: () => <ProcurementTtCompletedCountInsight />,
  },
  'procurement.tt_avg_amount': {
    id: 'procurement.tt_avg_amount',
    shortLabel: 'T/T 평균 송금',
    render: () => <ProcurementTtAvgAmountInsight />,
  },
  'procurement.tt_orphan': {
    id: 'procurement.tt_orphan',
    shortLabel: 'T/T PO 미연결',
    render: () => <ProcurementTtOrphanInsight />,
  },

  // Procurement PO 확장
  'procurement.po_avg_mw': {
    id: 'procurement.po_avg_mw',
    shortLabel: 'PO 평균 용량',
    render: () => <ProcurementPoAvgMwInsight />,
  },
  'procurement.po_changed': {
    id: 'procurement.po_changed',
    shortLabel: '변경계약 PO',
    render: () => <ProcurementPoChangedInsight />,
  },
  'procurement.po_total': {
    id: 'procurement.po_total',
    shortLabel: 'PO 전체',
    render: () => <ProcurementPoTotalInsight />,
  },
  'procurement.po_shipping_ratio': {
    id: 'procurement.po_shipping_ratio',
    shortLabel: 'PO 운송중 비중',
    render: () => <ProcurementPoShippingRatioInsight />,
  },

  // Customs 확장
  'customs.uncosted': {
    id: 'customs.uncosted',
    shortLabel: '원가 미산정',
    render: () => <CustomsUncostedInsight />,
  },
  'customs.unlinked_expense': {
    id: 'customs.unlinked_expense',
    shortLabel: 'B/L 미연결 비용',
    render: () => <CustomsUnlinkedExpenseInsight />,
  },
  'customs.capacity': {
    id: 'customs.capacity',
    shortLabel: '수입 용량',
    render: () => <CustomsCapacityInsight />,
  },
  'customs.vat': {
    id: 'customs.vat',
    shortLabel: '부대비용 VAT',
    render: () => <CustomsVatInsight />,
  },
  'customs.avg_per_decl': {
    id: 'customs.avg_per_decl',
    shortLabel: '면장당 평균',
    render: () => <CustomsAvgPerDeclInsight />,
  },
}

export function getInsight(metricId: string | undefined): InsightEntry | null {
  if (!metricId) return null
  return INSIGHT_REGISTRY[metricId] ?? null
}
