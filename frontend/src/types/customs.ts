// 면장/원가/부대비용/환율비교 타입 (Step 27)

export interface Declaration {
  declaration_id: string;
  declaration_number: string;
  bl_id: string;
  bl_number?: string;
  company_id: string;
  company_name?: string;
  declaration_date: string;
  arrival_date?: string;
  release_date?: string;
  hs_code?: string;
  customs_office?: string;
  port?: string;
  memo?: string;
  // D-064 PR 28: ERP 면장 자료(50컬럼)에서 노출하는 통관/원가/유상무상/환율 컬럼
  lc_no?: string;
  invoice_no?: string;
  supplier_name_en?: string;
  supplier_name_kr?: string;
  po_number?: string;
  exchange_rate?: number;
  contract_unit_price_usd_wp?: number;
  contract_total_usd?: number;
  contract_total_krw?: number;
  cif_krw?: number;
  incoterms?: string;
  customs_rate?: number;
  customs_amount?: number;
  vat_amount?: number;
  paid_qty?: number;
  free_qty?: number;
  free_ratio?: number;
  paid_cif_krw?: number;
  free_cif_krw?: number;
  cost_unit_price_wp?: number;
  cost_unit_price_ea?: number;
  product_id?: string;
  quantity?: number;
  capacity_kw?: number;
  erp_inbound_no?: string;
  declaration_line_no?: string;
}

export interface DeclarationCost {
  cost_id: string;
  declaration_id: string;
  product_id: string;
  product_name?: string;
  product_code?: string;
  spec_wp?: number;
  quantity: number;
  capacity_kw?: number;
  exchange_rate: number;
  // FOB 단계
  fob_unit_usd?: number;
  fob_total_usd?: number;
  fob_wp_krw?: number;
  // CIF 단계
  cif_total_krw: number;
  cif_unit_usd?: number;
  cif_total_usd?: number;
  cif_wp_krw: number;
  // 관세/Landed 단계
  tariff_rate?: number;
  tariff_amount?: number;
  vat_amount?: number;
  customs_fee?: number;
  incidental_cost?: number;
  landed_total_krw?: number;
  landed_wp_krw?: number;
  allocated_expenses?: Record<string, number>;
  memo?: string;
}

export type ExpenseType =
  | 'dock_charge' | 'shuttle' | 'customs_fee' | 'transport'
  | 'storage' | 'handling' | 'surcharge' | 'lc_fee'
  | 'lc_acceptance' | 'telegraph' | 'other';

export interface Expense {
  expense_id: string;
  bl_id?: string;
  outbound_id?: string;
  bl_number?: string;
  month?: string;
  company_id: string;
  company_name?: string;
  expense_type: ExpenseType;
  amount: number;
  vat?: number;
  total: number;
  vendor?: string;
  vehicle_type?: string;
  destination?: string;
  memo?: string;
}

export interface ExchangeCompareItem {
  declaration_number: string;
  declaration_date: string;
  product_name: string;
  manufacturer_name: string;
  contract_rate: number;
  fob_unit_usd?: number;
  cif_unit_usd?: number;
  cif_wp_at_contract: number;
  cif_wp_at_latest: number;
  rate_impact_krw: number;
}

export interface ExchangeCompareResult {
  items: ExchangeCompareItem[];
  latest_rate: number;
  latest_rate_source: string;
  calculated_at: string;
}

export const EXPENSE_TYPE_LABEL: Record<ExpenseType, string> = {
  dock_charge: '부두발생비용',
  shuttle: '셔틀및부대비용',
  customs_fee: '통관수수료',
  transport: '현장운송료',
  storage: '보관료',
  handling: '핸들링비(레거시)',
  surcharge: '할증료(레거시)',
  lc_fee: 'LC개설수수료(레거시)',
  lc_acceptance: 'LC인수수수료',
  telegraph: 'LC개설전신료',
  other: '기타비용',
};
/** F20: BL 부대비용 등록에서 사용하는 주요 비용유형 */
export const EXPENSE_TYPES_ACTIVE: Array<{ value: ExpenseType; label: string }> = [
  { value: 'lc_fee', label: 'LC개설수수료' },
  { value: 'lc_acceptance', label: 'LC인수수수료' },
  { value: 'telegraph', label: 'LC개설전신료' },
  { value: 'dock_charge', label: '부두발생비용' },
  { value: 'shuttle', label: '셔틀및부대비용' },
  { value: 'transport', label: '항만-창고 운송료' },
  { value: 'customs_fee', label: '통관수수료' },
  { value: 'storage', label: '보관료' },
  { value: 'other', label: '기타비용' },
];
