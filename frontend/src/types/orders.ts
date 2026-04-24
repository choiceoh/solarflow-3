// 수주/수금/매칭 타입 (D-015)

export type OrderStatus = 'received' | 'partial' | 'completed' | 'cancelled';
export type ReceiptMethod = 'purchase_order' | 'phone' | 'email' | 'other';
export type ManagementCategory = 'sale' | 'construction' | 'spare' | 'repowering' | 'maintenance' | 'other';
export type FulfillmentSource = 'stock' | 'incoming';

export interface Order {
  order_id: string;
  order_number?: string;
  company_id: string;
  company_name?: string;
  customer_id: string;
  customer_name?: string;
  order_date: string;
  receipt_method: ReceiptMethod;
  management_category: ManagementCategory;
  fulfillment_source: FulfillmentSource;
  product_id: string;
  product_name?: string;
  product_code?: string;
  spec_wp?: number;
  wattage_kw?: number;
  quantity: number;
  capacity_kw?: number;
  unit_price_wp: number;
  site_id?: string;
  site_name?: string;
  site_address?: string;
  site_contact?: string;
  site_phone?: string;
  payment_terms?: string;
  deposit_rate?: number;
  delivery_due?: string;
  shipped_qty?: number;
  remaining_qty?: number;
  spare_qty?: number;
  status: OrderStatus;
  memo?: string;
}

export interface Receipt {
  receipt_id: string;
  customer_id: string;
  customer_name?: string;
  receipt_date: string;
  amount: number;
  bank_account?: string;
  memo?: string;
  matched_total?: number;
  remaining?: number;
}

export interface ReceiptMatch {
  match_id: string;
  receipt_id: string;
  outbound_id: string;
  matched_amount: number;
}

export interface OutstandingItem {
  outbound_id: string;
  outbound_date: string;
  customer_name?: string;
  site_name?: string;
  product_name?: string;
  spec_wp?: number;
  quantity?: number;
  total_amount: number;
  matched_amount: number;
  outstanding_amount: number;
}

export interface MatchSuggestion {
  match_type: 'exact' | 'closest' | 'single';
  suggestions: { outbound_id: string; amount: number }[];
  total_suggested: number;
  difference: number;
}

// 상태 Badge
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  received: '접수',
  partial: '분할출고중',
  completed: '완료',
  cancelled: '취소',
};

export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  received: 'bg-blue-100 text-blue-700',
  partial: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export const RECEIPT_METHOD_LABEL: Record<ReceiptMethod, string> = {
  purchase_order: '발주서',
  phone: '유선',
  email: '이메일',
  other: '기타',
};

export const MANAGEMENT_CATEGORY_LABEL: Record<ManagementCategory, string> = {
  sale: '상품판매',
  construction: '공사사용',
  spare: '스페어',
  repowering: '리파워링',
  maintenance: '유지관리',
  other: '기타',
};

export const FULFILLMENT_SOURCE_LABEL: Record<FulfillmentSource, string> = {
  stock: '현재재고',
  incoming: '미착품',
};

export const FULFILLMENT_SOURCE_COLOR: Record<FulfillmentSource, string> = {
  stock: 'bg-green-100 text-green-700',
  incoming: 'bg-yellow-100 text-yellow-700',
};
