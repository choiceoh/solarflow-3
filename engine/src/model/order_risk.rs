/// 수주 충당 위험도 요청/응답 모델
/// 비유: "수주 잔량을 어느 창고/미착품 묶음에서 채울 수 있는지 보는 점검표"
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct OrderFulfillmentRiskRequest {
    pub company_id: Option<Uuid>,
    pub company_ids: Option<Vec<Uuid>>,
    pub order_ids: Option<Vec<Uuid>>,
}

#[derive(Debug, Serialize)]
pub struct OrderFulfillmentRiskResponse {
    pub items: Vec<OrderFulfillmentRiskItem>,
    pub summary: OrderFulfillmentRiskSummary,
    pub calculated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct OrderFulfillmentRiskItem {
    pub order_id: Uuid,
    pub company_id: Uuid,
    pub product_id: Uuid,
    pub fulfillment_source: String,
    pub risk: String,
    pub remaining_qty: i32,
    pub need_kw: f64,
    pub available_before_kw: f64,
    pub available_after_kw: f64,
    pub shortage_kw: f64,
    pub reason: String,
}

#[derive(Debug, Default, Serialize)]
pub struct OrderFulfillmentRiskSummary {
    pub total_count: usize,
    pub available_count: usize,
    pub shortage_count: usize,
    pub check_count: usize,
}
