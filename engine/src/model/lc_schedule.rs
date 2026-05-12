/// LC 수수료/한도 복원/만기 알림 요청/응답 모델

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// === LC 수수료 ===

#[derive(Debug, Deserialize)]
pub struct LcFeeRequest {
    pub lc_id: Option<Uuid>,
    pub company_id: Option<Uuid>,
    pub status_filter: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct LcFeeResponse {
    pub items: Vec<LcFeeItem>,
    pub summary: LcFeeSummary,
    pub fee_note: String,
    pub calculated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct LcFeeItem {
    pub lc_id: Uuid,
    pub lc_number: Option<String>,
    pub po_number: Option<String>,
    pub bank_name: String,
    pub company_name: String,
    pub amount_usd: f64,
    pub open_date: Option<String>,
    pub usance_days: i32,
    pub maturity_date: Option<String>,
    pub days_to_maturity: i64,
    pub status: String,
    pub exchange_rate: f64,
    pub opening_fee: FeeDetail,
    pub acceptance_fee: AcceptanceFeeDetail,
    pub total_fee_krw: f64,
}

#[derive(Debug, Serialize)]
pub struct FeeDetail {
    pub rate: f64,
    pub amount_krw: f64,
}

#[derive(Debug, Serialize)]
pub struct AcceptanceFeeDetail {
    pub rate: f64,
    pub days: i32,
    pub amount_krw: f64,
    pub formula: String,
}

#[derive(Debug, Serialize)]
pub struct LcFeeSummary {
    pub total_lc_amount_usd: f64,
    pub total_opening_fee_krw: f64,
    pub total_acceptance_fee_krw: f64,
    pub total_fee_krw: f64,
}

// === 한도 복원 타임라인 ===

#[derive(Debug, Deserialize)]
pub struct LcLimitTimelineRequest {
    pub company_id: Option<Uuid>,
    pub company_ids: Option<Vec<Uuid>>,
    #[serde(default = "default_months")]
    pub months_ahead: i32,
}

fn default_months() -> i32 { 6 }

#[derive(Debug, Serialize)]
pub struct LcLimitTimelineResponse {
    pub banks: Vec<BankTimeline>,
    pub total_summary: TimelineSummary,
    pub calculated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct BankTimeline {
    pub bank_id: Uuid,
    pub bank_name: String,
    pub company_name: String,
    pub lc_limit_usd: f64,
    pub current_used_usd: f64,
    pub current_available_usd: f64,
    pub usage_rate: f64,
    pub restoration_events: Vec<RestorationEvent>,
}

#[derive(Debug, Serialize)]
pub struct RestorationEvent {
    pub date: String,
    pub lc_number: Option<String>,
    pub amount_usd: f64,
    pub cumulative_available_usd: f64,
    pub po_number: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TimelineSummary {
    pub total_limit_usd: f64,
    pub total_used_usd: f64,
    pub total_available_usd: f64,
    pub total_usage_rate: f64,
    pub projected_available: Vec<ProjectedAvailable>,
}

#[derive(Debug, Serialize)]
pub struct ProjectedAvailable {
    pub month: String,
    pub available_usd: f64,
}

// === 만기 알림 ===

#[derive(Debug, Deserialize)]
pub struct LcMaturityAlertRequest {
    pub company_id: Option<Uuid>,
    pub company_ids: Option<Vec<Uuid>>,
    #[serde(default = "default_days")]
    pub days_ahead: i32,
}

fn default_days() -> i32 { 7 }

#[derive(Debug, Serialize)]
pub struct LcMaturityAlertResponse {
    pub alerts: Vec<MaturityAlert>,
    pub count: usize,
    pub calculated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct MaturityAlert {
    pub lc_id: Uuid,
    pub lc_number: Option<String>,
    pub bank_name: String,
    pub company_name: String,
    pub amount_usd: f64,
    pub maturity_date: String,
    pub days_remaining: i64,
    pub po_number: Option<String>,
    pub severity: String,
}
