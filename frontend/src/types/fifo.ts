// ERP FIFO 매칭 타입 (D-064 PR 26/29).
// 한 입고 LOT 이 어떤 출고에 어떤 비율로 배분됐는지 + 원가/이익 라인.

export interface FifoMatch {
  match_id: string;
  // 입고 식별
  erp_inbound_no?: string;
  erp_inbound_line_no?: number;
  inbound_id?: string;
  inbound_date?: string;
  inbound_kind?: string;
  supplier_name?: string;
  // 출고 식별
  erp_outbound_no?: string;
  outbound_id?: string;
  outbound_date?: string;
  customer_name?: string;
  // 품번
  product_id: string;
  // 수량
  lot_inbound_qty?: number;
  outbound_qty_origin?: number;
  allocated_qty?: number;
  // 단가/금액
  wp_unit_price?: number;
  ea_unit_cost?: number;
  cost_amount?: number;
  sales_unit_price_ea?: number;
  sales_amount?: number;
  profit_amount?: number;
  profit_ratio?: number;
  // ERP 메타
  usage_category_raw?: string;
  project?: string;
  procurement_type?: string;
  corporation?: string;
  manufacturer_name_kr?: string;
  manufacturer_name_en?: string;
  // 통관 cross-key
  declaration_id?: string;
  declaration_number?: string;
  bl_number?: string;
  lc_number?: string;
  category_no?: string;
  po_number?: string;
  source: 'fifo_topsolar' | 'fifo_diwon';
}

export interface FifoMatchSummary {
  match_count: number;
  total_allocated_qty: number;
  total_cost_amount: number;
  total_sales_amount: number;
  total_profit_amount: number;
  avg_profit_ratio: number; // % (sales 가중평균)
}

export interface OutboundFifoMatchesResponse {
  matches: FifoMatch[];
  summary: FifoMatchSummary;
}
