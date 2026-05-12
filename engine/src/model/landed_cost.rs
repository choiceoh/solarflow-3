/// Landed Cost + 환율 환산 요청/응답 모델

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

// === Landed Cost ===

/// Landed Cost 계산 요청
#[derive(Debug, Deserialize)]
pub struct LandedCostRequest {
    pub declaration_id: Option<Uuid>,
    pub company_id: Option<Uuid>,
    pub bl_id: Option<Uuid>,
    #[serde(default)]
    pub save: bool,
}

/// Landed Cost 계산 응답
#[derive(Debug, Serialize)]
pub struct LandedCostResponse {
    pub items: Vec<LandedCostItem>,
    pub saved: bool,
    pub calculated_at: DateTime<Utc>,
}

/// Landed Cost 라인아이템
#[derive(Debug, Serialize)]
pub struct LandedCostItem {
    pub cost_id: Uuid,
    pub declaration_id: Uuid,
    pub declaration_number: String,
    pub product_id: Uuid,
    pub product_code: String,
    pub product_name: String,
    pub manufacturer_name: String,
    pub quantity: i32,
    pub capacity_kw: f64,
    pub exchange_rate: f64,
    pub fob_unit_usd: Option<f64>,
    pub fob_wp_krw: Option<f64>,
    pub cif_wp_krw: f64,
    pub tariff_rate: Option<f64>,
    pub tariff_amount: f64,
    pub vat_amount: f64,
    /// 부대비용 배분 내역 — expense_type별 배분액 (동적 맵)
    pub allocated_expenses: HashMap<String, f64>,
    pub total_expense_krw: f64,
    pub expense_per_wp_krw: f64,
    pub landed_total_krw: f64,
    pub landed_wp_krw: f64,
    pub margin_vs_cif_krw: f64,
}

// === 환율 환산 비교 ===

/// 환율 환산 비교 요청
#[derive(Debug, Deserialize)]
pub struct ExchangeCompareRequest {
    pub company_id: Option<Uuid>,
    pub company_ids: Option<Vec<Uuid>>,
    pub product_id: Option<Uuid>,
    pub manufacturer_id: Option<Uuid>,
}

/// 환율 환산 비교 응답
#[derive(Debug, Serialize)]
pub struct ExchangeCompareResponse {
    pub items: Vec<ExchangeCompareItem>,
    pub latest_rate: f64,
    pub latest_rate_source: String,
    pub calculated_at: DateTime<Utc>,
}

/// 환율 환산 비교 라인아이템
#[derive(Debug, Serialize)]
pub struct ExchangeCompareItem {
    pub declaration_number: String,
    pub declaration_date: String,
    pub product_name: String,
    pub manufacturer_name: String,
    pub contract_rate: f64,
    pub fob_unit_usd: Option<f64>,
    pub cif_unit_usd: Option<f64>,
    pub cif_wp_at_contract: f64,
    pub cif_wp_at_latest: f64,
    pub rate_impact_krw: f64,
}
