// 수주/수금/매칭 타입 (D-015)

export type OrderStatus = "received" | "partial" | "completed" | "cancelled"
export type ReceiptMethod = "purchase_order" | "phone" | "email" | "other"
export type ManagementCategory =
  | "sale"
  | "construction"
  | "spare"
  | "repowering"
  | "maintenance"
  | "other"
export type FulfillmentSource = "stock" | "incoming"
export type OrderFulfillmentRisk = "available" | "shortage" | "check"

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
  remaining_qty: number
  need_kw: number
  available_before_kw: number
  available_after_kw: number
  shortage_kw: number
  reason: string
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
