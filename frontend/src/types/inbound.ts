export type InboundType = 'import' | 'domestic' | 'group';
export type BLStatus = 'scheduled' | 'shipping' | 'arrived' | 'customs' | 'completed' | 'erp_done';

/* D-083: 국내/그룹은 DB에 scheduled→completed만 사용. 화면 표시는 "입고중/입고완료"로. */
export const STATUS_BY_TYPE: Record<InboundType, BLStatus[]> = {
  import: ['scheduled', 'shipping', 'arrived', 'customs', 'completed', 'erp_done'],
  domestic: ['scheduled', 'completed'],
  group: ['scheduled', 'completed'],
};

export const STATUS_LABEL_BY_TYPE: Record<InboundType, Record<string, string>> = {
  import: { scheduled: '예정', shipping: '선적중', arrived: '입항', customs: '통관중', completed: '완료', erp_done: 'ERP등록' },
  domestic: { scheduled: '입고중', completed: '입고완료' },
  group: { scheduled: '입고중', completed: '입고완료' },
};

export function statusLabel(type: InboundType, status: BLStatus): string {
  return STATUS_LABEL_BY_TYPE[type]?.[status] ?? status;
}

export interface BLShipment {
  bl_id: string;
  bl_number: string;
  po_id?: string;
  po_number?: string;
  lc_id?: string;
  lc_number?: string;
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
  payment_terms?: string;
  incoterms?: string;
  counterpart_company_id?: string;
  declaration_number?: string;
  cif_amount_krw?: number;  // 면장 CIF 원화금액 (부가세·무상분 과세 제외)
}

export interface BLLineItem {
  bl_line_id: string;
  bl_id: string;
  product_id: string;
  po_line_id?: string;
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
  // Go API는 products를 nested 객체로 반환
  products?: {
    product_code?: string;
    product_name?: string;
    spec_wp?: number;
  };
}

export const INBOUND_TYPE_LABEL: Record<InboundType, string> = {
  import: '해외직수입',
  domestic: '국내구매',
  group: '그룹내구매',
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
