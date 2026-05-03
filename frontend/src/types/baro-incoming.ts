export type BaroIncomingStatus = 'scheduled' | 'shipping' | 'arrived' | 'customs' | 'completed' | 'erp_done';
export type BaroIncomingType = 'import' | 'domestic' | 'domestic_foreign' | 'group';

export interface BaroIncomingItem {
  id: string;
  bl_id: string;
  bl_number: string;
  company_id: string;
  company_name?: string;
  manufacturer_id: string;
  manufacturer_name?: string;
  inbound_type: BaroIncomingType;
  status: BaroIncomingStatus;
  etd?: string;
  eta?: string;
  actual_arrival?: string;
  sales_available_date?: string;
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
}

export const BARO_INCOMING_STATUS_LABEL: Record<BaroIncomingStatus, string> = {
  scheduled: '예정',
  shipping: '선적중',
  arrived: '입항',
  customs: '통관중',
  completed: '입고완료',
  erp_done: 'ERP등록',
};

export const BARO_INCOMING_TYPE_LABEL: Record<BaroIncomingType, string> = {
  import: '해외입고',
  domestic: '국내입고',
  domestic_foreign: '국내입고',
  group: '그룹내입고',
};
