// Go API 응답 그대로 snake_case 사용 (D-059)

export interface Company {
  company_id: string;
  company_name: string;
  company_code: string;
  business_number?: string;
  is_active: boolean;
}

export interface Manufacturer {
  manufacturer_id: string;
  name_kr: string;
  name_en?: string;
  short_name?: string;   // 약칭 (예: 진코, 론지, 트리나) — 화면 표시용
  country: string;
  domestic_foreign: string;
  is_active: boolean;
}

export interface Product {
  product_id: string;
  product_code: string;
  product_name: string;
  manufacturer_id: string;
  manufacturer_name?: string;
  manufacturers?: { name_kr?: string; short_name?: string; name_en?: string; domestic_foreign?: string }; // products API 임베드
  spec_wp: number;
  wattage_kw: number;
  module_width_mm: number;
  module_height_mm: number;
  module_depth_mm?: number;
  weight_kg?: number;
  wafer_platform?: string;
  cell_config?: string;
  series_name?: string;
  memo?: string;
  is_active: boolean;
}

export interface Partner {
  partner_id: string;
  partner_name: string;
  partner_type: string;
  erp_code?: string;
  payment_terms?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  is_active: boolean;
}

export interface Warehouse {
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  warehouse_type: string;
  location_code: string;
  location_name: string;
  is_active: boolean;
}

// 공사 현장 마스터 — 자체(own) / 타사 EPC(epc)
export interface ConstructionSite {
  site_id: string;
  company_id: string;
  name: string;           // 발전소명
  location?: string;      // 지명 (예: 전남 영광군 갈동리)
  site_type: 'own' | 'epc';
  capacity_mw?: number;
  started_at?: string;    // YYYY-MM-DD
  completed_at?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Bank {
  bank_id: string;
  company_id: string;
  company_name?: string;
  companies?: { company_name: string; company_code: string }; // nested from Go JOIN
  bank_name: string;
  lc_limit_usd: number;
  limit_approve_date?: string;   // 승인일
  limit_expiry_date?: string;    // 승인기한
  opening_fee_rate?: number;
  acceptance_fee_rate?: number;
  fee_calc_method?: string;
  memo?: string;
  is_active: boolean;
}
