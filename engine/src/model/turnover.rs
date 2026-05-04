/// 재고 회전율 모델
/// 비유: "재고 건강검진 결과지" — 얼마나 빠르게 돌고 있는지 측정

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 요청 파라미터
/// - company_id: 법인 (필수)
/// - days: 분석 기간 (기본 90일, 최소 30일)
#[derive(Debug, Deserialize)]
pub struct TurnoverRequest {
    pub company_id: Option<Uuid>,
    #[serde(default = "default_days")]
    pub days: i32,
}

fn default_days() -> i32 { 90 }

/// 전체 지표
#[derive(Debug, Serialize)]
pub struct TurnoverTotal {
    pub inventory_kw: f64,     // 현재 재고 (kW)
    pub outbound_kw: f64,      // 기간 출고 (kW)
    pub turnover_ratio: f64,   // 연환산 회전율 (회/년)
    pub dio_days: f64,         // 평균 재고일수
}

/// 제조사별 회전율
#[derive(Debug, Serialize)]
pub struct TurnoverByManufacturer {
    pub manufacturer_id: Uuid,
    pub manufacturer_name: String,
    pub inventory_kw: f64,
    pub outbound_kw: f64,
    pub turnover_ratio: f64,
    pub dio_days: f64,
}

/// 출력(Wp)별 회전율
#[derive(Debug, Serialize)]
pub struct TurnoverBySpecWp {
    pub spec_wp: i32,
    pub inventory_kw: f64,
    pub outbound_kw: f64,
    pub turnover_ratio: f64,
    pub dio_days: f64,
}

/// 제조사×출력 매트릭스
#[derive(Debug, Serialize)]
pub struct TurnoverMatrixCell {
    pub manufacturer_id: Uuid,
    pub manufacturer_name: String,
    pub spec_wp: i32,
    pub inventory_kw: f64,
    pub outbound_kw: f64,
    pub turnover_ratio: f64,
}

/// 품목별 회전율 (Top/Bottom 후보)
#[derive(Debug, Serialize, Clone)]
pub struct TurnoverByProduct {
    pub product_id: Uuid,
    pub product_code: String,
    pub product_name: String,
    pub manufacturer_name: String,
    pub spec_wp: i32,
    pub module_width_mm: Option<i32>,
    pub module_height_mm: Option<i32>,
    pub inventory_kw: f64,
    pub inventory_ea: i32,
    pub outbound_kw: f64,
    pub outbound_ea: i32,
    pub turnover_ratio: f64,
    pub dio_days: f64,
}

/// 응답
#[derive(Debug, Serialize)]
pub struct TurnoverResponse {
    pub window_days: i32,
    pub total: TurnoverTotal,
    pub by_manufacturer: Vec<TurnoverByManufacturer>,
    pub by_spec_wp: Vec<TurnoverBySpecWp>,
    pub matrix: Vec<TurnoverMatrixCell>,
    pub top_movers: Vec<TurnoverByProduct>,   // 회전율 높은 Top 10 (재발주 후보)
    pub slow_movers: Vec<TurnoverByProduct>,  // 회전율 낮은 Bottom 10 (처분 타겟)
    pub calculated_at: String,
}
