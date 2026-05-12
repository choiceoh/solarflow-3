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
//
// 응답 모양은 프론트 `types/banking.ts` 의 `LCLimitTimeline` 과 정확히 일치하도록 정렬.
// 과거에는 엔진이 `banks` + `total_summary` 를 보냈는데 프론트는 `bank_summaries` /
// `timeline_events` / `monthly_projection` 만 참조해서 항상 undefined 로 떨어졌었다.

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
    pub bank_summaries: Vec<BankSummary>,
    pub timeline_events: Vec<TimelineEvent>,
    pub monthly_projection: Vec<MonthlyProjection>,
    pub calculated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct BankSummary {
    pub bank_name: String,
    pub limit: f64,
    pub used: f64,
    pub available: f64,
    pub usage_rate: f64,
}

#[derive(Debug, Serialize)]
pub struct TimelineEvent {
    pub date: String,
    pub bank_name: String,
    pub amount: f64,
    pub description: String,
}

#[derive(Debug, Serialize)]
pub struct MonthlyProjection {
    pub month: String,
    pub projected_available: f64,
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
