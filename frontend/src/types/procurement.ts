export type POStatus = 'draft' | 'contracted' | 'in_progress' | 'completed' | 'cancelled' | 'shipping';
export type ContractType = 'spot' | 'frame' | 'general' | 'exclusive' | 'annual' | 'annual_frame' | 'half_year_frame';
export type LCStatus = 'pending' | 'opened' | 'docs_received' | 'settled' | 'cancelled';
export type TTStatus = 'planned' | 'completed';

export interface PurchaseOrder {
  po_id: string;
  po_number?: string;
  company_id: string;
  company_name?: string;
  manufacturer_id: string;
  manufacturer_name?: string;
  first_spec_wp?: number;  // purchase_orders_ext 뷰: 첫 번째 유상 라인 spec_wp (드롭다운용)
  contract_type: ContractType;
  contract_date?: string;
  incoterms?: string;
  payment_terms?: string;
  total_qty?: number;
  total_mw?: number;
  contract_period_start?: string;
  contract_period_end?: string;
  status: POStatus;
  memo?: string;
  parent_po_id?: string;
}

export interface POLineItem {
  po_line_id: string;
  po_id: string;
  product_id: string;
  product_name?: string;
  product_code?: string;
  spec_wp?: number;
  quantity: number;
  unit_price_usd?: number;
  unit_price_usd_wp?: number;
  total_amount_usd?: number;
  item_type?: 'main' | 'spare';
  payment_type?: 'paid' | 'free';
  memo?: string;
  // Go API가 nested로 반환 (POLineWithProduct)
  products?: { product_code?: string; product_name?: string; spec_wp?: number };
}

export interface LCRecord {
  lc_id: string;
  lc_number?: string;
  po_id: string;
  po_number?: string;
  manufacturer_id?: string;
  bank_id: string;
  bank_name?: string;
  company_id: string;
  company_name?: string;
  open_date?: string;
  amount_usd: number;
  target_qty?: number;
  target_mw?: number;  // LC 대상 MW
  usance_days?: number;
  usance_type?: string;
  maturity_date?: string;
  settlement_date?: string;
  repayment_date?: string;
  repaid?: boolean;
  status: LCStatus;
  memo?: string;
}

export interface LCLineItem {
  lc_line_id: string;
  lc_id: string;
  po_line_id?: string;
  product_id: string;
  product_name?: string;
  product_code?: string;
  spec_wp?: number;
  quantity: number;
  capacity_kw: number;
  amount_usd?: number;
  unit_price_usd_wp?: number;
  item_type: 'main' | 'spare';
  payment_type: 'paid' | 'free';
  memo?: string;
  products?: {
    product_code?: string;
    product_name?: string;
    spec_wp?: number;
    module_width_mm?: number;
    module_height_mm?: number;
  };
}

export interface TTRemittance {
  tt_id: string;
  po_id: string;
  po_number?: string;
  manufacturer_name?: string;
  remit_date?: string;
  amount_usd: number;
  amount_krw?: number;
  exchange_rate?: number;
  purpose?: string;
  status: TTStatus;
  bank_name?: string;
  memo?: string;
}

export interface PriceHistory {
  price_history_id: string;
  product_id: string;
  product_name?: string;
  spec_wp?: number;
  manufacturer_id: string;
  manufacturer_name?: string;
  change_date: string;
  previous_price?: number;
  new_price: number;
  reason?: string;
  related_po_id?: string;
  related_po_number?: string;
  memo?: string;
}

export const PO_STATUS_LABEL: Record<POStatus, string> = { draft: '초안', contracted: '계약완료', in_progress: '진행중', completed: '완료', cancelled: '취소', shipping: '선적중(레거시)' };
export const PO_STATUS_COLOR: Record<POStatus, string> = { draft: 'bg-gray-100 text-gray-700', contracted: 'bg-blue-100 text-blue-700', in_progress: 'bg-yellow-100 text-yellow-700', completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700', shipping: 'bg-yellow-100 text-yellow-700' };
export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = { spot: '스팟', frame: '프레임', general: '일반(레거시)', exclusive: '독점(레거시)', annual: '연간(레거시)', annual_frame: '연간프레임(레거시)', half_year_frame: '6개월프레임(레거시)' };
/** 신규 PO에 허용되는 계약유형 (필터/등록 드롭다운에서 사용) */
export const CONTRACT_TYPES_ACTIVE: Array<{ value: ContractType; label: string }> = [
  { value: 'spot', label: '스팟' },
  { value: 'frame', label: '프레임' },
];
export const LC_STATUS_LABEL: Record<LCStatus, string> = { pending: '대기', opened: '개설', docs_received: '서류접수', settled: '결제완료', cancelled: '취소' };
export const LC_STATUS_COLOR: Record<LCStatus, string> = { pending: 'bg-gray-100 text-gray-700', opened: 'bg-blue-100 text-blue-700', docs_received: 'bg-yellow-100 text-yellow-700', settled: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700' };
export const TT_STATUS_LABEL: Record<TTStatus, string> = { planned: '예정', completed: '완료' };
export const TT_STATUS_COLOR: Record<TTStatus, string> = { planned: 'bg-gray-100 text-gray-700', completed: 'bg-green-100 text-green-700' };
