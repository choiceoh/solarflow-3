// 은행/LC 한도/만기/수수료/수요예측 타입 (Step 28A)

// BankLimitRow — Go Bank + Rust BankSummary 병합 행
export interface BankLimitRow {
  bank_id?: string;
  bank_name: string;
  limit_approve_date?: string;   // 승인일 (Go)
  limit_expiry_date?: string;    // 승인기한 (Go)
  lc_limit_usd: number;          // 승인한도 (Go)
  used: number;                   // 실행금액 (Rust)
  available: number;              // 잔여한도 (Rust 또는 계산)
  usage_rate: number;             // 사용률 (Rust)
  opening_fee_rate?: number;     // 개설수수료율 (Go)
  acceptance_fee_rate?: number;  // 인수수수료율 (Go)
  fee_calc_method?: string;       // 수수료 계산방식 (Go)
}

export interface LimitChange {
  limit_change_id: string;
  bank_id: string;
  bank_name?: string;
  change_date: string;
  previous_limit: number;
  new_limit: number;
  reason?: string;
}

// Rust lc-limit-timeline 응답
export interface BankSummary {
  bank_name: string;
  limit: number;
  used: number;
  available: number;
  usage_rate: number;
}

export interface TimelineEvent {
  date: string;
  bank_name: string;
  amount: number;
  description: string;
}

export interface MonthlyProjection {
  month: string;
  projected_available: number;
}

export interface LCLimitTimeline {
  bank_summaries: BankSummary[];
  timeline_events: TimelineEvent[];
  monthly_projection: MonthlyProjection[];
}

// Rust lc-maturity-alert 응답
export interface LCMaturityAlert {
  alerts: {
    lc_id: string;
    lc_number?: string;
    po_number?: string;
    bank_name: string;
    amount_usd: number;
    maturity_date: string;
    days_remaining: number;
    status: string;
  }[];
}

// Rust lc-fee 응답
export interface LCFeeCalc {
  opening_fee: number;
  acceptance_fee: number;
  total_fee: number;
  fee_note: string;
}

// LC 수요 예측 — PO별
export interface LCDemandByPO {
  po_id: string;
  po_number?: string;
  manufacturer_name?: string;
  po_total_usd: number;
  tt_paid_usd: number;
  lc_opened_usd: number;
  lc_needed_usd: number;
  contract_date?: string;
  lc_due_date?: string;
  urgency: 'immediate' | 'soon' | 'normal';
}

// LC 수요 예측 — 월별
export interface LCDemandMonthly {
  month: string;
  lc_demand_usd: number;
  limit_recovery_usd: number;
  projected_available_usd: number;
  shortage_usd: number;
  status: 'sufficient' | 'caution' | 'shortage';
}
