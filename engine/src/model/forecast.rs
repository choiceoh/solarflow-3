/// 월별 수급 전망 요청/응답 모델

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct SupplyForecastRequest {
    pub company_id: Option<Uuid>,
    pub product_id: Option<Uuid>,
    pub manufacturer_id: Option<Uuid>,
    #[serde(default = "default_months")]
    pub months_ahead: i32,
}
fn default_months() -> i32 { 6 }

#[derive(Debug, Serialize)]
pub struct SupplyForecastResponse {
    pub products: Vec<ProductForecast>,
    pub summary: ForecastSummary,
    pub calculated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ProductForecast {
    pub product_id: Uuid,
    pub product_code: String,
    pub product_name: String,
    pub manufacturer_name: String,
    pub spec_wp: i32,
    pub module_width_mm: Option<i32>,
    pub module_height_mm: Option<i32>,
    pub months: Vec<MonthForecast>,
    pub unscheduled: UnscheduledForecast,
}

#[derive(Debug, Serialize, Clone)]
pub struct MonthForecast {
    pub month: String,
    pub opening_kw: f64,
    pub incoming_kw: f64,
    pub outgoing_construction_kw: f64,
    pub outgoing_sale_kw: f64,
    pub closing_kw: f64,
    pub reserved_kw: f64,
    pub allocated_kw: f64,
    pub available_kw: f64,
    pub insufficient: bool,
}

#[derive(Debug, Serialize, Default, Clone)]
pub struct UnscheduledForecast {
    pub sale_kw: f64,
    pub construction_kw: f64,
    pub incoming_kw: f64,
}

#[derive(Debug, Serialize)]
pub struct ForecastSummary {
    pub months: Vec<SummaryMonth>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SummaryMonth {
    pub month: String,
    pub total_opening_kw: f64,
    pub total_incoming_kw: f64,
    pub total_outgoing_kw: f64,
    pub total_closing_kw: f64,
    pub total_available_kw: f64,
}
