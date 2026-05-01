// BARO 테넌트 전용 타입 정의 (Phase 1)
// 백엔드 응답 그대로 snake_case 사용 (D-059)

export interface PartnerPrice {
  price_id: string;
  partner_id: string;
  product_id: string;
  unit_price_wp: number;
  discount_pct: number;
  effective_from: string;       // YYYY-MM-DD
  effective_to: string | null;
  memo: string | null;
  tenant_scope: string;         // 항상 'baro'
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreatePartnerPriceRequest {
  partner_id: string;
  product_id: string;
  unit_price_wp: number;
  discount_pct: number;
  effective_from: string;
  effective_to?: string | null;
  memo?: string | null;
}

export interface UpdatePartnerPriceRequest {
  unit_price_wp?: number;
  discount_pct?: number;
  effective_from?: string;
  effective_to?: string | null;
  memo?: string | null;
}
