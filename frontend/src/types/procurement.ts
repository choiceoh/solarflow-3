export type POStatus = 'draft' | 'contracted' | 'shipping' | 'completed';
export type ContractType = 'general' | 'exclusive' | 'annual' | 'spot';
export type LCStatus = 'pending' | 'opened' | 'docs_received' | 'settled';
export type TTStatus = 'planned' | 'completed';

export interface PurchaseOrder {
  po_id: string;
  po_number?: string;
  company_id: string;
  company_name?: string;
  manufacturer_id: string;
  manufacturer_name?: string;
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
  total_amount_usd?: number;
  memo?: string;
}

export interface LCRecord {
  lc_id: string;
  lc_number?: string;
  po_id: string;
  po_number?: string;
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
  status: LCStatus;
  memo?: string;
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

export const PO_STATUS_LABEL: Record<POStatus, string> = { draft: '초안', contracted: '계약완료', shipping: '선적중', completed: '완료' };
export const PO_STATUS_COLOR: Record<POStatus, string> = { draft: 'bg-gray-100 text-gray-700', contracted: 'bg-blue-100 text-blue-700', shipping: 'bg-yellow-100 text-yellow-700', completed: 'bg-green-100 text-green-700' };
export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = { general: '일반', exclusive: '독점', annual: '연간', spot: '스팟' };
export const LC_STATUS_LABEL: Record<LCStatus, string> = { pending: '대기', opened: '개설', docs_received: '서류접수', settled: '결제완료' };
export const LC_STATUS_COLOR: Record<LCStatus, string> = { pending: 'bg-gray-100 text-gray-700', opened: 'bg-blue-100 text-blue-700', docs_received: 'bg-yellow-100 text-yellow-700', settled: 'bg-green-100 text-green-700' };
export const TT_STATUS_LABEL: Record<TTStatus, string> = { planned: '예정', completed: '완료' };
export const TT_STATUS_COLOR: Record<TTStatus, string> = { planned: 'bg-gray-100 text-gray-700', completed: 'bg-green-100 text-green-700' };
