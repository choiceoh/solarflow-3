// 출고/판매 타입 (D-013, D-014)

export type OutboundStatus = 'active' | 'cancel_pending' | 'cancelled';
export type SaleStatus = 'active' | 'cancelled';
export type UsageCategory =
  | 'sale' | 'sale_spare' | 'construction' | 'construction_damage' | 'repowering'
  | 'maintenance' | 'disposal' | 'transfer' | 'adjustment' | 'other';

export interface OutboundBLItem {
  outbound_bl_item_id: string;
  outbound_id: string;
  bl_id: string;
  bl_number?: string;
  quantity: number;
}

export interface Outbound {
  outbound_id: string;
  outbound_date: string;
  company_id: string;
  company_name?: string;
  product_id: string;
  product_name?: string;
  product_code?: string;
  spec_wp?: number;
  wattage_kw?: number;
  quantity: number;
  capacity_kw: number;
  warehouse_id: string;
  warehouse_name?: string;
  usage_category: UsageCategory;
  order_id?: string;
  order_number?: string;
  customer_id?: string;
  customer_name?: string;
  unit_price_wp?: number;
  site_name?: string;
  site_address?: string;
  spare_qty?: number;
  group_trade?: boolean;
  target_company_id?: string;
  target_company_name?: string;
  erp_outbound_no?: string;
  status: OutboundStatus;
  memo?: string;
  bl_id?: string;
  bl_number?: string;
  bl_items?: OutboundBLItem[];
  sale?: Sale;
  // BARO Phase 4: 배차 묶음 FK (NULL=미배차)
  dispatch_route_id?: string | null;
  // D-055: 워크플로우 체크박스 4개 (탑솔라 그룹 양식 매핑)
  tx_statement_ready?: boolean;
  inspection_request_sent?: boolean;
  approval_requested?: boolean;
  tax_invoice_issued?: boolean;
  // D-055: 외부 양식 변환 시 원본 행 보존 (정보 손실 0)
  source_payload?: Record<string, unknown>;
}

export interface Sale {
  sale_id: string;
  outbound_id?: string;
  order_id?: string;
  customer_id: string;
  customer_name?: string;
  quantity?: number;
  capacity_kw?: number;
  unit_price_wp: number;
  unit_price_ea?: number;
  supply_amount?: number;
  vat_amount?: number;
  total_amount?: number;
  tax_invoice_date?: string;
  tax_invoice_email?: string;
  erp_closed?: boolean;
  erp_closed_date?: string;
  status?: SaleStatus;
  memo?: string;
}

export interface SaleListItem {
  sale_id: string;
  outbound_id?: string;
  order_id?: string;
  outbound_date?: string;
  outbound_status?: OutboundStatus;
  order_date?: string;
  order_number?: string;
  company_id?: string;
  customer_id: string;
  customer_name?: string;
  product_id?: string;
  product_name?: string;
  product_code?: string;
  spec_wp?: number;
  quantity: number;
  capacity_kw?: number;
  site_name?: string;
  unit_price_wp: number;
  unit_price_ea?: number;
  supply_amount?: number;
  vat_amount?: number;
  total_amount?: number;
  tax_invoice_date?: string;
  status?: SaleStatus;
  sale: Sale;
}

export const OUTBOUND_STATUS_LABEL: Record<OutboundStatus, string> = {
  active: '정상',
  cancel_pending: '취소예정',
  cancelled: '취소완료',
};

export const OUTBOUND_STATUS_COLOR: Record<OutboundStatus, string> = {
  active: 'bg-green-100 text-green-700',
  cancel_pending: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-red-100 text-red-700',
};

export const USAGE_CATEGORY_LABEL: Record<UsageCategory, string> = {
  sale: '상품판매',
  sale_spare: '상품판매(스페어)',
  construction: '공사현장 출고',
  construction_damage: '공사현장 출고(파손)',
  repowering: '리파워링 출고',
  maintenance: '유지관리',
  disposal: '폐기',
  transfer: '창고이동',
  adjustment: '재고조정',
  other: '기타',
};
