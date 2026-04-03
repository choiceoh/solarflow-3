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

export interface Bank {
  bank_id: string;
  company_id: string;
  company_name?: string;
  bank_name: string;
  lc_limit_usd: number;
  opening_fee_rate?: number;
  acceptance_fee_rate?: number;
  fee_calc_method?: string;
  memo?: string;
  is_active: boolean;
}
