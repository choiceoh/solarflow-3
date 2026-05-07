// Baro 자체 매출 요약 (D-129) — /api/v1/baro/sales-summary 응답 타입
//
// 백엔드 baro_sales_summary.go 와 1:1 매핑.

export interface SalesSummaryByOwner {
  owner_user_id: string | null;
  amount: number;
  count: number;
  partner_count: number;
}

export interface SalesSummaryByType {
  partner_type: string;
  amount: number;
  count: number;
}

export interface SalesSummaryByMonth {
  month: string; // YYYY-MM
  amount: number;
  count: number;
}

export interface SalesSummaryByPartner {
  partner_id: string;
  partner_name: string;
  amount: number;
  count: number;
}

export interface SalesSummaryResponse {
  period_months: number;
  start_date: string;
  end_date: string;
  total_amount: number;
  total_count: number;
  unique_partners: number;
  by_owner: SalesSummaryByOwner[];
  by_partner_type: SalesSummaryByType[];
  by_month: SalesSummaryByMonth[];
  top_partners: SalesSummaryByPartner[];
}
