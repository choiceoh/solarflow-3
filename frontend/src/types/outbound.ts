// 출고/판매 타입 (D-013, D-014)

export type OutboundStatus = 'active' | 'cancel_pending' | 'cancelled';
export type UsageCategory =
  | 'sale' | 'sale_spare' | 'construction' | 'construction_damage'
  | 'maintenance' | 'disposal' | 'transfer' | 'adjustment' | 'other';

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
  site_name?: string;
  site_address?: string;
  spare_qty?: number;
  group_trade?: boolean;
  target_company_id?: string;
  target_company_name?: string;
  erp_outbound_no?: string;
  status: OutboundStatus;
  memo?: string;
  sale?: Sale;
}

export interface Sale {
  sale_id: string;
  outbound_id: string;
  customer_id: string;
  customer_name?: string;
  unit_price_wp: number;
  unit_price_ea?: number;
  supply_amount?: number;
  vat_amount?: number;
  total_amount?: number;
  tax_invoice_date?: string;
  tax_invoice_email?: string;
  erp_closed?: boolean;
  erp_closed_date?: string;
  memo?: string;
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
  construction: '공사사용',
  construction_damage: '공사사용(파손)',
  maintenance: '유지관리',
  disposal: '폐기',
  transfer: '창고이동',
  adjustment: '재고조정',
  other: '기타',
};
