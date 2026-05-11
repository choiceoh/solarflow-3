// 수주/수금/매칭 타입 (D-015)

export type OrderStatus = "received" | "partial" | "completed" | "cancelled"
export type ReceiptMethod = "purchase_order" | "phone" | "email" | "other"
export type ReceiptBalanceDisposition = "advance" | "next_settlement" | "refund_review"
export type ManagementCategory =
  | "sale"
  | "construction"
  | "spare"
  | "repowering"
  | "maintenance"
  | "other"
export type FulfillmentSource = "stock" | "incoming"
export type OrderFulfillmentRisk = "available" | "shortage" | "check"
export type OrderFulfillmentEtaStatus =
  | "ready"
  | "on_time"
  | "late"
  | "unknown_eta"
  | "missing_due"
  | "shortage"
  | "not_applicable"

export interface Order {
  order_id: string
  order_number?: string
  company_id: string
  company_name?: string
  customer_id: string
  customer_name?: string
  order_date: string
  receipt_method: ReceiptMethod
  management_category: ManagementCategory
  fulfillment_source: FulfillmentSource
  product_id: string
  product_name?: string
  product_code?: string
  manufacturer_name?: string
  spec_wp?: number
  wattage_kw?: number
  quantity: number
  capacity_kw?: number
  unit_price_wp: number
  unit_price_ea?: number
  site_id?: string
  site_name?: string
  site_address?: string
  site_contact?: string
  site_phone?: string
  payment_terms?: string
  deposit_rate?: number
  delivery_due?: string
  shipped_qty?: number
  remaining_qty?: number
  spare_qty?: number
  status: OrderStatus
  memo?: string
  bl_id?: string
}

export interface OrderFulfillmentRiskItem {
  order_id: string
  company_id: string
  product_id: string
  fulfillment_source: FulfillmentSource | string
  risk: OrderFulfillmentRisk
  allocation_rank?: number
  remaining_qty: number
  need_kw: number
  available_before_kw: number
  available_after_kw: number
  shortage_kw: number
  delivery_due?: string | null
  expected_available_date?: string | null
  eta_status?: OrderFulfillmentEtaStatus | string
  eta_days_late?: number | null
  eta_reason?: string
  breakdown?: OrderFulfillmentRiskBreakdown
  reason: string
}

export interface OrderFulfillmentRiskBreakdown {
  inbound_completed_kw: number
  outbound_active_kw: number
  stock_allocated_kw: number
  bl_incoming_kw: number
  lc_incoming_kw: number
  incoming_allocated_kw: number
}

export interface OrderFulfillmentRiskResponse {
  items: OrderFulfillmentRiskItem[]
  summary: {
    total_count: number
    available_count: number
    shortage_count: number
    check_count: number
  }
  calculated_at: string
}

export interface Receipt {
  receipt_id: string
  customer_id: string
  customer_name?: string
  receipt_date: string
  amount: number
  bank_account?: string
  memo?: string
  matched_total?: number
  remaining?: number
}

export interface ReceiptMatch {
  match_id: string
  receipt_id: string
  outbound_id?: string
  sale_id?: string
  matched_amount: number
}

export interface CompleteReceiptMatchResponse {
  receipt: Receipt
  match: ReceiptMatch
  matched_amount: number
  outstanding_before: number
}

export interface OutstandingItem {
  outbound_id: string
  outbound_date?: string
  customer_name?: string
  site_name?: string
  product_name?: string
  spec_wp?: number
  quantity?: number
  total_amount: number
  collected_amount?: number
  matched_amount: number
  outstanding_amount: number
  days_elapsed?: number
  tax_invoice_date?: string
  status?: string
}

export interface MatchSuggestion {
  match_type: "exact" | "closest" | "single"
  suggestions: { outbound_id: string; amount: number }[]
  total_suggested: number
  difference: number
}

export interface AIMatchCandidate {
  outbound_id: string
  outbound_date?: string
  site_name?: string
  product_name: string
  outstanding_amount: number
  match_amount: number
  is_partial?: boolean
  confidence: number
  reason: string
}

export interface AIMatchSuggestion {
  receipt_id: string
  provider?: string
  model?: string
  summary: string
  candidates: AIMatchCandidate[]
  total_suggested: number
  difference: number
}

// 상태 Badge
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  received: "접수",
  partial: "분할출고중",
  completed: "완료",
  cancelled: "취소",
}

export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  received: "sf-tone-info",
  partial: "sf-tone-warn",
  completed: "sf-tone-pos",
  cancelled: "sf-tone-neg",
}

export const RECEIPT_METHOD_LABEL: Record<ReceiptMethod, string> = {
  purchase_order: "발주서",
  phone: "유선",
  email: "이메일",
  other: "기타",
}

export const RECEIPT_BALANCE_DISPOSITION_LABEL: Record<ReceiptBalanceDisposition, string> = {
  advance: "선수금 이월",
  next_settlement: "다음 정산 이월",
  refund_review: "환불/정산 검토",
}

export const MANAGEMENT_CATEGORY_LABEL: Record<ManagementCategory, string> = {
  sale: "상품판매",
  construction: "공사사용",
  spare: "스페어",
  repowering: "리파워링",
  maintenance: "유지관리",
  other: "기타",
}

export const FULFILLMENT_SOURCE_LABEL: Record<FulfillmentSource, string> = {
  stock: "실재고",
  incoming: "미착품",
}

export const FULFILLMENT_SOURCE_COLOR: Record<FulfillmentSource, string> = {
  stock: "sf-tone-pos",
  incoming: "sf-tone-warn",
}

export const ORDER_FULFILLMENT_RISK_LABEL: Record<OrderFulfillmentRisk, string> = {
  available: "충당 가능",
  shortage: "부족",
  check: "확인 필요",
}

export const ORDER_FULFILLMENT_RISK_COLOR: Record<OrderFulfillmentRisk, string> = {
  available: "sf-tone-pos",
  shortage: "sf-tone-neg",
  check: "sf-tone-muted",
}

export const ORDER_FULFILLMENT_ETA_STATUS_LABEL: Record<OrderFulfillmentEtaStatus, string> = {
  ready: "실재고 즉시",
  on_time: "납기 내",
  late: "ETA 지연",
  unknown_eta: "ETA 확인",
  missing_due: "납기 확인",
  shortage: "물량 부족",
  not_applicable: "대상 아님",
}

export const ORDER_FULFILLMENT_ETA_STATUS_COLOR: Record<OrderFulfillmentEtaStatus, string> = {
  ready: "sf-tone-pos",
  on_time: "sf-tone-pos",
  late: "sf-tone-warn",
  unknown_eta: "sf-tone-warn",
  missing_due: "sf-tone-muted",
  shortage: "sf-tone-neg",
  not_applicable: "sf-tone-muted",
}
