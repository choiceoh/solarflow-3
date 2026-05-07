// Baro Partner Cockpit (D-125) — /api/v1/baro/partner-cockpit/{partner_id} 응답 타입
//
// 백엔드 baro_partner_cockpit.go 의 CockpitResponse 와 1:1 매핑.
// stub 패널(quote_ready_skus / incoming_matches)은 PR1 에서는 항상 빈 배열이지만,
// 응답 shape 을 미리 고정해 후속 PR(견적 빌더 등)에서 데이터만 채우면 되도록 한다.

import type { Partner } from './masters';
import type { PartnerActivity } from './crm';

export interface CockpitCreditPanel {
  outstanding_krw: number | null;
  credit_limit_krw: number | null;
  remaining_krw: number | null;
  utilization_pct: number | null;
  oldest_unpaid_days: number | null;
  credit_payment_days: number | null;
  last_sale_date: string | null;
  last_receipt_date: string | null;
}

export interface CockpitRecentSale {
  sale_id: string;
  tax_invoice_date: string | null;
  quantity: number | null;
  unit_price_wp: number;
  total_amount: number | null;
  status: string;
}

export interface CockpitQuoteReadyRow {
  product_id: string;
  product_name: string;
  available_qty: number;
  unit_price_krw: number;
  margin_pct: number | null;
}

export interface CockpitIncomingMatch {
  product_id: string;
  product_name: string;
  eta: string | null;
  qty: number;
  last_purchased_at: string | null;
}

export interface CockpitResponse {
  partner: Partner | null;
  credit: CockpitCreditPanel | null;
  recent_sales: CockpitRecentSale[];
  open_followups: PartnerActivity[];
  recent_activities: PartnerActivity[];
  quote_ready_skus: CockpitQuoteReadyRow[];
  incoming_matches: CockpitIncomingMatch[];
}
