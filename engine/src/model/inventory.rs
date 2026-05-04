/// 재고 집계 요청/응답 모델
/// 비유: "재고 조회 신청서"와 "재고 현황 보고서"

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 재고 집계 요청
///
/// 단일 법인: `company_id` 단독
/// 다중 법인: `company_ids`에 법인 ID 배열 (예: 전체 법인 모드)
/// 둘 중 하나는 반드시 있어야 한다.
#[derive(Debug, Deserialize)]
pub struct InventoryRequest {
    pub company_id: Option<Uuid>,
    pub company_ids: Option<Vec<Uuid>>,
    pub product_id: Option<Uuid>,
    pub manufacturer_id: Option<Uuid>,
}

/// 재고 집계 응답 — 품번별 상세 + 전체 합계
#[derive(Debug, Serialize)]
pub struct InventoryResponse {
    pub items: Vec<InventoryItem>,
    pub summary: InventorySummary,
    pub calculated_at: DateTime<Utc>,
}

/// 품번별 재고 상세
///
/// 다중 법인 모드에서는 같은 product_id가 여러 법인 row로 분리되어 반환된다.
/// 단일 법인 모드에서도 호출 법인 1개의 row만 나온다.
#[derive(Debug, Serialize)]
pub struct InventoryItem {
    pub company_id: Uuid,
    pub company_name: String,
    pub product_id: Uuid,
    pub product_code: String,
    pub product_name: String,
    pub manufacturer_name: String,
    pub spec_wp: i32,
    pub module_width_mm: Option<i32>,
    pub module_height_mm: Option<i32>,
    /// 물리적 재고 (입고완료 - 출고active)
    pub physical_kw: f64,
    /// 예약 (수주 중 sale/spare/maintenance/other + stock)
    pub reserved_kw: f64,
    /// 배정 (수주 중 construction/repowering + stock)
    pub allocated_kw: f64,
    /// 가용재고 = 물리적 - 예약 - 배정
    pub available_kw: f64,
    /// 미착품 (PO contracted/shipping 계약량 - 해당 PO 입고량)
    pub incoming_kw: f64,
    /// 미착품 예약 (수주 중 fulfillment_source=incoming)
    pub incoming_reserved_kw: f64,
    /// 가용미착품 = 미착품 - 미착품예약
    pub available_incoming_kw: f64,
    /// 총확보량 = 가용재고 + 가용미착품
    pub total_secured_kw: f64,
    /// 장기재고 판별: normal / warning / critical
    pub long_term_status: String,
    /// 현재고: 가장 최근 입항일 (completed/erp_done BL 기준)
    pub latest_arrival: Option<NaiveDate>,
    /// 미착품: 가장 최근 L/C 개설일 (shipping/arrived/customs BL 기준)
    pub latest_lc_open: Option<NaiveDate>,
}

/// 전체 합계
#[derive(Debug, Serialize)]
pub struct InventorySummary {
    pub total_physical_kw: f64,
    pub total_available_kw: f64,
    pub total_incoming_kw: f64,
    pub total_secured_kw: f64,
}
