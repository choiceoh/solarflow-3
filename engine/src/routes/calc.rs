/// 계산 API 엔드포인트

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::Json;
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::calc::inventory::calculate_inventory;
use crate::calc::landed_cost::{calculate_landed_cost, compare_exchange_rates};
use crate::calc::lc_schedule::{calculate_lc_fees, calculate_limit_timeline, get_maturity_alerts};
use crate::calc::margin::{calculate_margin, analyze_customers, calculate_price_trend};
use crate::calc::forecast::calculate_forecast;
use crate::calc::receipt_match::{get_outstanding_list, suggest_receipt_match};
use crate::calc::search::search;
use crate::calc::turnover::calculate_turnover;
use crate::model::inventory::InventoryRequest;
use crate::model::landed_cost::{ExchangeCompareRequest, LandedCostRequest};
use crate::model::lc_schedule::{LcFeeRequest, LcLimitTimelineRequest, LcMaturityAlertRequest};
use crate::model::margin::{MarginAnalysisRequest, CustomerAnalysisRequest, PriceTrendRequest};
use crate::model::forecast::SupplyForecastRequest;
use crate::model::receipt_match::{OutstandingListRequest, ReceiptMatchSuggestRequest};
use crate::model::search::SearchRequest;
use crate::model::turnover::TurnoverRequest;

/// POST /api/calc/inventory — 재고 집계 핸들러
pub async fn inventory_handler(
    State(pool): State<PgPool>,
    Json(req): Json<InventoryRequest>,
) -> (StatusCode, Json<Value>) {
    let has_ids = req.company_ids.as_ref().is_some_and(|v| !v.is_empty());
    if req.company_id.is_none() && !has_ids {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "company_id 또는 company_ids 중 하나는 필수입니다"})),
        );
    }

    match calculate_inventory(&pool, &req).await {
        Ok(response) => (
            StatusCode::OK,
            Json(serde_json::to_value(response).unwrap_or(json!({"error": "직렬화 실패"}))),
        ),
        Err(e) => {
            tracing::error!("재고 집계 실패: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("재고 집계 실패: {}", e)})),
            )
        }
    }
}

/// POST /api/calc/landed-cost — Landed Cost 계산 핸들러
/// 비유: "원가 계산 요청 접수 창구"
pub async fn landed_cost_handler(
    State(pool): State<PgPool>,
    Json(req): Json<LandedCostRequest>,
) -> (StatusCode, Json<Value>) {
    // 우선순위: declaration_id > company_id
    if req.declaration_id.is_none() && req.company_id.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "declaration_id 또는 company_id 중 하나는 필수입니다"})),
        );
    }

    match calculate_landed_cost(&pool, &req).await {
        Ok(response) => (
            StatusCode::OK,
            Json(serde_json::to_value(response).unwrap_or(json!({"error": "직렬화 실패"}))),
        ),
        Err(e) => {
            tracing::error!("Landed Cost 계산 실패: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Landed Cost 계산 실패: {}", e)})),
            )
        }
    }
}

/// POST /api/calc/exchange-compare — 환율 환산 비교 핸들러
/// 비유: "환율 비교 요청 접수 창구"
pub async fn exchange_compare_handler(
    State(pool): State<PgPool>,
    Json(req): Json<ExchangeCompareRequest>,
) -> (StatusCode, Json<Value>) {
    if req.company_id.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "company_id는 필수 항목입니다"})),
        );
    }

    match compare_exchange_rates(&pool, &req).await {
        Ok(response) => (
            StatusCode::OK,
            Json(serde_json::to_value(response).unwrap_or(json!({"error": "직렬화 실패"}))),
        ),
        Err(e) => {
            tracing::error!("환율 비교 실패: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("환율 비교 실패: {}", e)})),
            )
        }
    }
}

/// POST /api/calc/lc-fee — LC 수수료 계산 핸들러
pub async fn lc_fee_handler(
    State(pool): State<PgPool>,
    Json(req): Json<LcFeeRequest>,
) -> (StatusCode, Json<Value>) {
    if req.lc_id.is_none() && req.company_id.is_none() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "lc_id 또는 company_id 중 하나는 필수입니다"})));
    }
    match calculate_lc_fees(&pool, &req).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap_or(json!({"error": "직렬화 실패"})))),
        Err(e) => { tracing::error!("LC 수수료 계산 실패: {}", e); (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("LC 수수료 계산 실패: {}", e)}))) }
    }
}

/// POST /api/calc/lc-limit-timeline — 한도 복원 타임라인 핸들러
pub async fn lc_limit_timeline_handler(
    State(pool): State<PgPool>,
    Json(req): Json<LcLimitTimelineRequest>,
) -> (StatusCode, Json<Value>) {
    match calculate_limit_timeline(&pool, &req).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap_or(json!({"error": "직렬화 실패"})))),
        Err(e) => { tracing::error!("한도 복원 타임라인 실패: {}", e); (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("한도 복원 타임라인 실패: {}", e)}))) }
    }
}

/// POST /api/calc/lc-maturity-alert — LC 만기 알림 핸들러
pub async fn lc_maturity_alert_handler(
    State(pool): State<PgPool>,
    Json(req): Json<LcMaturityAlertRequest>,
) -> (StatusCode, Json<Value>) {
    match get_maturity_alerts(&pool, &req).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap_or(json!({"error": "직렬화 실패"})))),
        Err(e) => { tracing::error!("만기 알림 실패: {}", e); (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("만기 알림 실패: {}", e)}))) }
    }
}

/// POST /api/calc/margin-analysis — 마진 분석 핸들러
pub async fn margin_analysis_handler(State(pool): State<PgPool>, Json(req): Json<MarginAnalysisRequest>) -> (StatusCode, Json<Value>) {
    if req.company_id.is_none() { return (StatusCode::BAD_REQUEST, Json(json!({"error": "company_id는 필수 항목입니다"}))); }
    match calculate_margin(&pool, &req).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap_or(json!({"error": "직렬화 실패"})))),
        Err(e) => { tracing::error!("마진 분석 실패: {}", e); (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("마진 분석 실패: {}", e)}))) }
    }
}

/// POST /api/calc/customer-analysis — 거래처 분석 핸들러
pub async fn customer_analysis_handler(State(pool): State<PgPool>, Json(req): Json<CustomerAnalysisRequest>) -> (StatusCode, Json<Value>) {
    if req.company_id.is_none() { return (StatusCode::BAD_REQUEST, Json(json!({"error": "company_id는 필수 항목입니다"}))); }
    match analyze_customers(&pool, &req).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap_or(json!({"error": "직렬화 실패"})))),
        Err(e) => { tracing::error!("거래처 분석 실패: {}", e); (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("거래처 분석 실패: {}", e)}))) }
    }
}

/// POST /api/calc/price-trend — 단가 추이 핸들러
pub async fn price_trend_handler(State(pool): State<PgPool>, Json(req): Json<PriceTrendRequest>) -> (StatusCode, Json<Value>) {
    if req.company_id.is_none() { return (StatusCode::BAD_REQUEST, Json(json!({"error": "company_id는 필수 항목입니다"}))); }
    match calculate_price_trend(&pool, &req).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap_or(json!({"error": "직렬화 실패"})))),
        Err(e) => { tracing::error!("단가 추이 실패: {}", e); (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("단가 추이 실패: {}", e)}))) }
    }
}

/// POST /api/calc/supply-forecast — 월별 수급 전망 핸들러
pub async fn supply_forecast_handler(State(pool): State<PgPool>, Json(req): Json<SupplyForecastRequest>) -> (StatusCode, Json<Value>) {
    if req.company_id.is_none() { return (StatusCode::BAD_REQUEST, Json(json!({"error": "company_id는 필수 항목입니다"}))); }
    match calculate_forecast(&pool, &req).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap_or(json!({"error": "직렬화 실패"})))),
        Err(e) => { tracing::error!("수급 전망 실패: {}", e); (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("수급 전망 실패: {}", e)}))) }
    }
}

/// POST /api/calc/outstanding-list — 미수금 목록 핸들러
pub async fn outstanding_list_handler(State(pool): State<PgPool>, Json(req): Json<OutstandingListRequest>) -> (StatusCode, Json<Value>) {
    if req.company_id.is_none() { return (StatusCode::BAD_REQUEST, Json(json!({"error": "company_id는 필수 항목입니다"}))); }
    if req.customer_id.is_none() { return (StatusCode::BAD_REQUEST, Json(json!({"error": "customer_id는 필수 항목입니다"}))); }
    match get_outstanding_list(&pool, &req).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap_or(json!({"error": "직렬화 실패"})))),
        Err(e) => { tracing::error!("미수금 목록 실패: {}", e); (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("미수금 목록 실패: {}", e)}))) }
    }
}

/// POST /api/calc/receipt-match-suggest — 수금 매칭 추천 핸들러
pub async fn receipt_match_suggest_handler(State(pool): State<PgPool>, Json(req): Json<ReceiptMatchSuggestRequest>) -> (StatusCode, Json<Value>) {
    if req.company_id.is_none() { return (StatusCode::BAD_REQUEST, Json(json!({"error": "company_id는 필수 항목입니다"}))); }
    if req.customer_id.is_none() { return (StatusCode::BAD_REQUEST, Json(json!({"error": "customer_id는 필수 항목입니다"}))); }
    match req.receipt_amount {
        None => return (StatusCode::BAD_REQUEST, Json(json!({"error": "receipt_amount는 필수 항목입니다"}))),
        Some(a) if a <= 0.0 => return (StatusCode::BAD_REQUEST, Json(json!({"error": "receipt_amount는 양수여야 합니다"}))),
        _ => {}
    }
    match suggest_receipt_match(&pool, &req).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap_or(json!({"error": "직렬화 실패"})))),
        Err(e) => { tracing::error!("매칭 추천 실패: {}", e); (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("매칭 추천 실패: {}", e)}))) }
    }
}

/// POST /api/calc/inventory-turnover — 재고 회전율 핸들러
pub async fn inventory_turnover_handler(
    State(pool): State<PgPool>,
    Json(req): Json<TurnoverRequest>,
) -> (StatusCode, Json<Value>) {
    if req.company_id.is_none() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "company_id는 필수 항목입니다"})));
    }
    match calculate_turnover(&pool, &req).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap_or(json!({"error": "직렬화 실패"})))),
        Err(e) => {
            tracing::error!("재고 회전율 계산 실패: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("재고 회전율 계산 실패: {}", e)})))
        }
    }
}

/// POST /api/calc/search — 자연어 검색 핸들러
pub async fn search_handler(State(pool): State<PgPool>, Json(req): Json<SearchRequest>) -> (StatusCode, Json<Value>) {
    if req.company_id.is_none() { return (StatusCode::BAD_REQUEST, Json(json!({"error": "company_id는 필수 항목입니다"}))); }
    match &req.query {
        None => return (StatusCode::BAD_REQUEST, Json(json!({"error": "query는 필수 항목입니다"}))),
        Some(q) if q.trim().is_empty() => return (StatusCode::BAD_REQUEST, Json(json!({"error": "query는 빈 문자열일 수 없습니다"}))),
        _ => {}
    }
    match search(&pool, &req).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap_or(json!({"error": "직렬화 실패"})))),
        Err(e) => { tracing::error!("검색 실패: {}", e); (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("검색 실패: {}", e)}))) }
    }
}
