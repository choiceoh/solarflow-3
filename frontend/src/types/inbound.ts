export type InboundType = 'import' | 'domestic' | 'domestic_foreign' | 'group';
export type BLStatus = 'scheduled' | 'shipping' | 'arrived' | 'customs' | 'completed' | 'erp_done';

export interface BLShipment {
  bl_id: string;
  bl_number: string;
  po_id?: string;
  lc_id?: string;
  company_id: string;
  manufacturer_id: string;
  manufacturer_name?: string;
  inbound_type: InboundType;
  currency: 'USD' | 'KRW';
  exchange_rate?: number;
  etd?: string;
  eta?: string;
  actual_arrival?: string;
  port?: string;
  forwarder?: string;
  warehouse_id?: string;
  warehouse_name?: string;
  invoice_number?: string;
  status: BLStatus;
  erp_registered?: boolean;
  memo?: string;
}

export interface BLLineItem {
  bl_line_id: string;
  bl_id: string;
  product_id: string;
  product_name?: string;
  product_code?: string;
  quantity: number;
  capacity_kw: number;
  item_type: 'main' | 'spare';
  payment_type: 'paid' | 'free';
  invoice_amount_usd?: number;
  unit_price_usd_wp?: number;
  unit_price_krw_wp?: number;
  usage_category: string;
  memo?: string;
}

export const INBOUND_TYPE_LABEL: Record<InboundType, string> = {
  import: '해외 직수입',
  domestic: '국내 제조사',
  domestic_foreign: '국내 유통사',
  group: '그룹 내',
};

export const BL_STATUS_ORDER: BLStatus[] = [
  'scheduled', 'shipping', 'arrived', 'customs', 'completed', 'erp_done',
];

export const BL_STATUS_LABEL: Record<BLStatus, string> = {
  scheduled: '예정',
  shipping: '선적중',
  arrived: '입항',
  customs: '통관중',
  completed: '완료',
  erp_done: 'ERP등록',
};

export const BL_STATUS_COLOR: Record<BLStatus, string> = {
  scheduled: 'bg-gray-100 text-gray-700',
  shipping: 'bg-blue-100 text-blue-700',
  arrived: 'bg-yellow-100 text-yellow-700',
  customs: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  erp_done: 'bg-purple-100 text-purple-700',
};

export const USAGE_CATEGORIES: Record<string, string> = {
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
