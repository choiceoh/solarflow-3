// 대시보드 타입 (Step 28B)

export interface DashboardSectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface DashboardSummary {
  physical_mw: number;
  available_mw: number;
  incoming_mw: number;
  secured_mw: number;
  outstanding_krw: number;
  lc_available_usd: number;
}

export interface MonthlyRevenue {
  months: {
    month: string;
    revenue_krw: number;
    margin_krw: number;
    margin_rate: number;
  }[];
}

export interface PriceTrend {
  manufacturers: {
    name: string;
    color: string;
    data_points: {
      period: string;
      price_usd_wp: number;
    }[];
  }[];
}

export interface CompanySummaryRow {
  company_id: string;
  company_name: string;
  physical_mw: number;
  available_mw: number;
  monthly_revenue_krw: number;
  outstanding_krw: number;
  lc_available_usd: number;
}

export interface AlertItem {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  icon: string;
  title: string;
  description: string;
  count: number;
  link: string;
}
