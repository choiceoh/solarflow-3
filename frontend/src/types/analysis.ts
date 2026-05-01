// Rust engine /api/v1/calc/customer-analysis 응답 스키마 정본
// (engine/src/model/margin.rs::CustomerAnalysisResponse 와 맞물림)
export interface CustomerItem {
  customer_id: string;
  customer_name: string;
  total_sales_krw: number;
  total_collected_krw: number;
  outstanding_krw: number;
  outstanding_count: number;
  oldest_outstanding_days: number;
  avg_payment_days?: number | null;
  avg_margin_rate?: number | null;
  total_margin_krw?: number | null;
  avg_deposit_rate?: number | null;
  status: string; // 'normal' | 'warning' | 'overdue'
}

export interface CustomerAnalysis {
  items: CustomerItem[];
  summary: {
    total_sales_krw: number;
    total_collected_krw: number;
    total_outstanding_krw: number;
    total_margin_krw: number;
    overall_margin_rate: number;
  };
}
