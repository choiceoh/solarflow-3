/// 마진/이익률 + 거래처 분석 + 단가 추이 모델
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// === 마진 분석 ===

#[derive(Debug, Deserialize)]
pub struct MarginAnalysisRequest {
    pub company_id: Option<Uuid>,
    pub company_ids: Option<Vec<Uuid>>,
    pub manufacturer_id: Option<Uuid>,
    pub customer_id: Option<Uuid>,
    pub product_id: Option<Uuid>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    #[serde(default = "default_cost_basis")]
    pub cost_basis: String,
}
fn default_cost_basis() -> String {
    "cif".to_string()
}

#[derive(Debug, Serialize)]
pub struct MarginAnalysisResponse {
    pub items: Vec<MarginItem>,
    pub summary: MarginSummary,
    /// 최근 24개월 월별 마진 추이 (fifo 기준 + 부대비용 반영, cost_basis 토글과 무관).
    /// 데이터가 없는 달은 revenue/cost=0, margin_rate=0 으로 채움.
    pub trend24: Vec<MarginTrendPoint>,
    pub calculated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct MarginTrendPoint {
    /// 'YYYY-MM' 라벨.
    pub month: String,
    /// 원가 매칭이 있는 매출분의 공급가 합 (KRW).
    pub revenue_krw: f64,
    /// fifo cost_amount + BL 부대비용 분배 (KRW).
    pub cost_krw: f64,
    /// (revenue - cost) / revenue × 100. 분모 0 이면 0.
    pub margin_rate: f64,
}

#[derive(Debug, Serialize)]
pub struct MarginItem {
    pub manufacturer_name: String,
    pub product_code: String,
    pub product_name: String,
    pub spec_wp: i32,
    pub module_width_mm: Option<i32>,
    pub module_height_mm: Option<i32>,
    pub total_sold_qty: i64,
    pub total_sold_kw: f64,
    pub avg_sale_price_wp: f64,
    pub avg_cost_wp: Option<f64>,
    pub margin_wp: Option<f64>,
    pub margin_rate: Option<f64>,
    pub total_revenue_krw: f64,
    pub total_cost_krw: Option<f64>,
    pub total_margin_krw: Option<f64>,
    pub cost_covered_revenue_krw: f64,
    pub cost_missing_revenue_krw: f64,
    pub cost_basis: String,
    pub sale_count: i64,
}

#[derive(Debug, Serialize)]
pub struct MarginSummary {
    pub total_sold_kw: f64,
    /// 전체 매출 공급가. 원가가 아직 연결되지 않은 매출도 포함한다.
    pub total_revenue_krw: f64,
    /// 원가가 연결된 매출분의 원가 합계.
    pub total_cost_krw: f64,
    /// 원가가 연결된 매출분에서만 계산한 이익.
    pub total_margin_krw: f64,
    /// 원가가 연결된 매출분 기준 이익률.
    pub overall_margin_rate: f64,
    /// 원가가 연결되어 이익 계산에 포함된 공급가.
    pub cost_covered_revenue_krw: f64,
    /// 원가가 아직 없어 이익 계산에서 제외한 공급가.
    pub cost_missing_revenue_krw: f64,
    /// 전체 공급가 중 원가가 연결된 공급가 비율.
    pub cost_coverage_rate: f64,
    pub cost_basis: String,
}

// === 거래처 분석 ===

#[derive(Debug, Deserialize)]
pub struct CustomerAnalysisRequest {
    pub company_id: Option<Uuid>,
    pub company_ids: Option<Vec<Uuid>>,
    pub customer_id: Option<Uuid>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    #[serde(default = "default_customer_cost_basis")]
    pub cost_basis: String,
}
fn default_customer_cost_basis() -> String {
    "landed".to_string()
}

#[derive(Debug, Serialize)]
pub struct CustomerAnalysisResponse {
    pub items: Vec<CustomerItem>,
    pub summary: CustomerSummary,
    pub calculated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct CustomerItem {
    pub customer_id: Uuid,
    pub customer_name: String,
    pub total_sales_krw: f64,
    pub total_collected_krw: f64,
    pub outstanding_krw: f64,
    pub outstanding_count: i64,
    pub oldest_outstanding_days: i64,
    pub avg_payment_days: Option<f64>,
    pub avg_margin_rate: Option<f64>,
    /// 이익 절대금액 (원). landed cost 데이터가 있는 매출분에 한해 계산.
    /// 제품에 원가 이력이 없으면 None
    pub total_margin_krw: Option<f64>,
    pub avg_deposit_rate: Option<f64>,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct CustomerSummary {
    pub total_sales_krw: f64,
    pub total_collected_krw: f64,
    pub total_outstanding_krw: f64,
    /// 전체 거래처 이익 합계 (원). 원가 커버 매출분 기준
    pub total_margin_krw: f64,
    /// 전체 평균 이익률 (%). 원가 커버 매출분 기준
    pub overall_margin_rate: f64,
}

// === 단가 추이 ===

#[derive(Debug, Deserialize)]
pub struct PriceTrendRequest {
    pub company_id: Option<Uuid>,
    pub manufacturer_id: Option<Uuid>,
    pub product_id: Option<Uuid>,
    #[serde(default = "default_period")]
    pub period: String,
}
fn default_period() -> String {
    "quarterly".to_string()
}

#[derive(Debug, Serialize)]
pub struct PriceTrendResponse {
    pub trends: Vec<TrendProduct>,
    pub calculated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct TrendProduct {
    pub manufacturer_name: String,
    pub product_name: String,
    pub spec_wp: i32,
    pub data_points: Vec<TrendDataPoint>,
}

#[derive(Debug, Serialize, Clone)]
pub struct TrendDataPoint {
    pub period: String,
    pub avg_purchase_price_usd_wp: Option<f64>,
    pub avg_purchase_price_krw_wp: Option<f64>,
    pub avg_sale_price_krw_wp: Option<f64>,
    pub exchange_rate: Option<f64>,
    pub volume_kw: Option<f64>,
}
