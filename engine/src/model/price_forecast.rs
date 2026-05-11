use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct PriceForecastStrategyRequest {
    pub unit: Option<String>,
    #[serde(default)]
    pub observations: Vec<PriceForecastObservation>,
    pub own_purchase_usd_w: Option<f64>,
    pub own_purchase_date: Option<String>,
    #[serde(default)]
    pub runs: Vec<PriceForecastRunInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct PriceForecastObservation {
    pub source_key: String,
    pub source_name: String,
    pub metric_key: String,
    pub metric_label: String,
    pub value_date: String,
    pub market_region: String,
    pub basis: String,
    pub price_usd_w: Option<f64>,
    pub price_cny_w: Option<f64>,
    pub price_krw_w: Option<f64>,
    pub confidence: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct PriceForecastRunInput {
    pub status: String,
    pub started_at: Option<String>,
    #[serde(default)]
    pub source_keys: Vec<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PriceForecastStrategyResponse {
    pub action_key: String,
    pub action_label: String,
    pub tone: String,
    pub confidence_score: f64,
    pub one_month_view: String,
    pub three_month_view: String,
    pub six_month_view: String,
    pub note: String,
    pub basis: Vec<String>,
    pub market: PriceForecastMarketSnapshot,
    pub scenarios: Vec<PriceForecastScenario>,
    pub source_quality: Vec<PriceForecastSourceQuality>,
    pub calculated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PriceForecastMarketSnapshot {
    pub latest_cmm_usd_w: Option<f64>,
    pub latest_floor_usd_w: Option<f64>,
    pub latest_tender_usd_w: Option<f64>,
    pub cmm_trend_pct: Option<f64>,
    pub purchase_vs_cmm_pct: Option<f64>,
    pub cmm_vs_floor_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PriceForecastScenario {
    pub key: String,
    pub label: String,
    pub horizon_months: i32,
    pub low_usd_w: Option<f64>,
    pub base_usd_w: Option<f64>,
    pub high_usd_w: Option<f64>,
    pub drivers: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PriceForecastSourceQuality {
    pub source_key: String,
    pub source_name: String,
    pub score: f64,
    pub status: String,
    pub latest_date: Option<String>,
    pub observation_count: i32,
    pub avg_confidence: Option<f64>,
    pub warning_count: i32,
    pub note: String,
}
