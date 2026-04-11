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
  bl_number?: string;
  month?: string;
  company_id: string;
  company_name?: string;
  expense_type: ExpenseType;
  amount: number;
  vat?: number;
  total: number;
  vendor?: string;
  memo?: string;
}

export interface ExchangeCompareResult {
  base_currency: string;
  target_currency: string;
  comparisons: {
    amount: number;
    rate1_result: number;
    rate2_result: number;
    difference: number;
    difference_percent: number;
  }[];
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
/** F20: BL 부대비용 등록에서 사용하는 8종 (신규) */
export const EXPENSE_TYPES_ACTIVE: Array<{ value: ExpenseType; label: string }> = [
  { value: 'lc_acceptance', label: 'LC인수수수료' },
  { value: 'telegraph', label: 'LC개설전신료' },
  { value: 'dock_charge', label: '부두발생비용' },
  { value: 'shuttle', label: '셔틀및부대비용' },
  { value: 'transport', label: '현장운송료' },
  { value: 'customs_fee', label: '통관수수료' },
  { value: 'storage', label: '보관료' },
  { value: 'other', label: '기타비용' },
];
