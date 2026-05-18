// BARO 출고 보드 — sanitized view (D-039 + D-116 패턴).
// 가격(unit_price_wp/supply/vat/total) · memo · source_payload 컬럼은 백엔드에서 응답에
// 절대 포함되지 않으므로 타입에도 없다 — column-level masking.

import type { OutboundStatus, UsageCategory } from './outbound';

export interface BaroOutboundItem {
  outbound_id: string;
  outbound_date: string;
  company_id: string;
  company_name?: string;
  product_id: string;
  product_code?: string;
  product_name?: string;
  spec_wp?: number;
  quantity: number;
  capacity_kw: number;
  warehouse_id?: string;
  warehouse_name?: string;
  usage_category: UsageCategory;
  customer_id?: string;
  customer_name?: string;
  site_name?: string;
  site_address?: string;
  spare_qty?: number;
  order_number?: string;
  group_trade?: boolean;
  target_company_id?: string;
  target_company_name?: string;
  erp_outbound_no?: string;
  status: OutboundStatus;
  // 워크플로우 4 체크박스 (D-055) — 거래명세서/인수검수요청서/결재요청/계산서발행.
  tx_statement_ready: boolean;
  inspection_request_sent: boolean;
  approval_requested: boolean;
  tax_invoice_issued: boolean;
}
