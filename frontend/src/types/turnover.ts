// Rust 재고 회전율 API 응답 (POST /api/v1/calc/inventory-turnover)
// 비유: "재고 건강검진 결과지"
export interface TurnoverResponse {
  window_days: number;
  total: TurnoverTotal;
  by_manufacturer: TurnoverByManufacturer[];
  by_spec_wp: TurnoverBySpecWp[];
  matrix: TurnoverMatrixCell[];
  top_movers: TurnoverByProduct[];
  slow_movers: TurnoverByProduct[];
  calculated_at: string;
}

export interface TurnoverTotal {
  inventory_kw: number;
  outbound_kw: number;
  turnover_ratio: number;  // 회/년 (연환산)
  dio_days: number;        // 평균 재고일수
}

export interface TurnoverByManufacturer {
  manufacturer_id: string;
  manufacturer_name: string;
  inventory_kw: number;
  outbound_kw: number;
  turnover_ratio: number;
  dio_days: number;
}

export interface TurnoverBySpecWp {
  spec_wp: number;
  inventory_kw: number;
  outbound_kw: number;
  turnover_ratio: number;
  dio_days: number;
}

export interface TurnoverMatrixCell {
  manufacturer_id: string;
  manufacturer_name: string;
  spec_wp: number;
  inventory_kw: number;
  outbound_kw: number;
  turnover_ratio: number;
}

export interface TurnoverByProduct {
  product_id: string;
  product_code: string;
  product_name: string;
  manufacturer_name: string;
  spec_wp: number;
  module_width_mm: number;
  module_height_mm: number;
  inventory_kw: number;
  inventory_ea: number;
  outbound_kw: number;
  outbound_ea: number;
  turnover_ratio: number;
  dio_days: number;
}
