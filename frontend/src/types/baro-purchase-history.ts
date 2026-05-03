export type BaroPurchaseInboundType = 'import' | 'domestic' | 'domestic_foreign' | 'group';
export type BaroPurchaseStatus = 'scheduled' | 'shipping' | 'arrived' | 'customs' | 'completed' | 'erp_done';

export interface BaroPurchaseHistoryItem {
  id: string;
  bl_id: string;
  bl_number: string;
  po_id?: string;
  po_number?: string;
  company_id: string;
  company_name?: string;
  manufacturer_id: string;
  manufacturer_name?: string;
  source_name?: string;
  inbound_type: BaroPurchaseInboundType;
  status: BaroPurchaseStatus;
  currency: 'KRW' | 'USD';
  exchange_rate?: number;
  etd?: string;
  eta?: string;
  actual_arrival?: string;
  purchase_date?: string;
  port?: string;
  warehouse_id?: string;
  warehouse_name?: string;
  product_id: string;
  product_code?: string;
  product_name?: string;
  spec_wp?: number;
  module_width_mm?: number;
  module_height_mm?: number;
  quantity: number;
  capacity_kw: number;
  item_type: 'main' | 'spare';
  payment_type: 'paid' | 'free';
  usage_category: string;
  unit_price_usd_wp?: number;
  unit_price_krw_wp?: number;
  invoice_amount_usd?: number;
  estimated_amount_usd?: number;
  estimated_amount_krw?: number;
  payment_terms?: string;
  incoterms?: string;
  counterpart_company_id?: string;
}

export const BARO_PURCHASE_INBOUND_LABEL: Record<BaroPurchaseInboundType, string> = {
  import: '직수입',
  domestic: '국내구매',
  domestic_foreign: '국내 타사',
  group: '그룹내',
};

export const BARO_PURCHASE_STATUS_LABEL: Record<BaroPurchaseStatus, string> = {
  scheduled: '입고예정',
  shipping: '입고중',
  arrived: '도착',
  customs: '통관중',
  completed: '입고완료',
  erp_done: 'ERP등록',
};
