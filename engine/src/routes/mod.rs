/// 라우터 모듈
/// 비유: 건물 안내 데스크 — 요청을 적절한 부서로 안내

pub mod health;
pub mod calc;

use axum::Router;
use sqlx::PgPool;

/// 전체 라우터 생성
pub fn create_router(pool: PgPool) -> Router {
    Router::new()
        .route("/health", axum::routing::get(health::health))
        .route("/health/ready", axum::routing::get(health::health_ready))
        .route(
            "/api/calc/inventory",
            axum::routing::post(calc::inventory_handler),
        )
        .route(
            "/api/calc/landed-cost",
            axum::routing::post(calc::landed_cost_handler),
        )
        .route(
            "/api/calc/exchange-compare",
            axum::routing::post(calc::exchange_compare_handler),
        )
        .route(
            "/api/calc/lc-fee",
            axum::routing::post(calc::lc_fee_handler),
        )
        .route(
            "/api/calc/lc-limit-timeline",
            axum::routing::post(calc::lc_limit_timeline_handler),
        )
        .route(
            "/api/calc/lc-maturity-alert",
            axum::routing::post(calc::lc_maturity_alert_handler),
        )
        .route("/api/calc/margin-analysis", axum::routing::post(calc::margin_analysis_handler))
        .route("/api/calc/customer-analysis", axum::routing::post(calc::customer_analysis_handler))
        .route("/api/calc/price-trend", axum::routing::post(calc::price_trend_handler))
        .route("/api/calc/supply-forecast", axum::routing::post(calc::supply_forecast_handler))
        .route("/api/calc/outstanding-list", axum::routing::post(calc::outstanding_list_handler))
        .route("/api/calc/receipt-match-suggest", axum::routing::post(calc::receipt_match_suggest_handler))
        .route("/api/calc/search", axum::routing::post(calc::search_handler))
        .route("/api/calc/inventory-turnover", axum::routing::post(calc::inventory_turnover_handler))
        .with_state(pool)
}
