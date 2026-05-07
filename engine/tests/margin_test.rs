/// 마진/거래처/단가 추이 API + 단위 테스트
use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use serde_json::json;
use tower::ServiceExt;

fn test_router() -> Router {
    Router::new()
        .route(
            "/api/calc/margin-analysis",
            axum::routing::post(mock_margin),
        )
        .route(
            "/api/calc/customer-analysis",
            axum::routing::post(mock_customer),
        )
        .route("/api/calc/price-trend", axum::routing::post(mock_trend))
}

async fn mock_handler(
    body: serde_json::Value,
    require_company: bool,
) -> (StatusCode, axum::response::Json<serde_json::Value>) {
    if require_company && body.get("company_id").and_then(|v| v.as_str()).is_none() {
        return (
            StatusCode::BAD_REQUEST,
            axum::response::Json(json!({"error": "company_id는 필수 항목입니다"})),
        );
    }
    (
        StatusCode::OK,
        axum::response::Json(json!({"items": [], "calculated_at": "2026-03-29T12:00:00Z"})),
    )
}

async fn mock_margin(
    axum::extract::Json(body): axum::extract::Json<serde_json::Value>,
) -> (StatusCode, axum::response::Json<serde_json::Value>) {
    if body.get("company_id").and_then(|v| v.as_str()).is_none() {
        return (
            StatusCode::BAD_REQUEST,
            axum::response::Json(json!({"error": "company_id는 필수 항목입니다"})),
        );
    }
    let cost_basis = body
        .get("cost_basis")
        .and_then(|v| v.as_str())
        .unwrap_or("cif");
    (
        StatusCode::OK,
        axum::response::Json(json!({
            "items": [],
            "summary": {
                "total_sold_kw": 0.0,
                "total_revenue_krw": 0.0,
                "total_cost_krw": 0.0,
                "total_margin_krw": 0.0,
                "overall_margin_rate": 0.0,
                "cost_covered_revenue_krw": 0.0,
                "cost_missing_revenue_krw": 0.0,
                "cost_coverage_rate": 0.0,
                "cost_basis": cost_basis
            },
            "calculated_at": "2026-03-29T12:00:00Z"
        })),
    )
}

async fn mock_customer(
    axum::extract::Json(body): axum::extract::Json<serde_json::Value>,
) -> (StatusCode, axum::response::Json<serde_json::Value>) {
    mock_handler(body, true).await
}

async fn mock_trend(
    axum::extract::Json(body): axum::extract::Json<serde_json::Value>,
) -> (StatusCode, axum::response::Json<serde_json::Value>) {
    if body.get("company_id").and_then(|v| v.as_str()).is_none() {
        return (
            StatusCode::BAD_REQUEST,
            axum::response::Json(json!({"error": "company_id는 필수 항목입니다"})),
        );
    }
    let period = body
        .get("period")
        .and_then(|v| v.as_str())
        .unwrap_or("quarterly");
    (
        StatusCode::OK,
        axum::response::Json(
            json!({"trends": [], "period_used": period, "calculated_at": "2026-03-29T12:00:00Z"}),
        ),
    )
}

fn post_json(uri: &str, body: &serde_json::Value) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_string(body).unwrap()))
        .unwrap()
}

#[tokio::test]
async fn test_margin_missing_company() {
    let r = test_router()
        .oneshot(post_json("/api/calc/margin-analysis", &json!({})))
        .await
        .unwrap();
    assert_eq!(r.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_margin_empty_result() {
    let r = test_router()
        .oneshot(post_json(
            "/api/calc/margin-analysis",
            &json!({"company_id": "uuid"}),
        ))
        .await
        .unwrap();
    assert_eq!(r.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_margin_default_cost_basis() {
    let r = test_router()
        .oneshot(post_json(
            "/api/calc/margin-analysis",
            &json!({"company_id": "uuid"}),
        ))
        .await
        .unwrap();
    let body = axum::body::to_bytes(r.into_body(), usize::MAX)
        .await
        .unwrap();
    let j: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(j["summary"]["cost_basis"], "cif");
}

#[tokio::test]
async fn test_customer_missing_company() {
    let r = test_router()
        .oneshot(post_json("/api/calc/customer-analysis", &json!({})))
        .await
        .unwrap();
    assert_eq!(r.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_customer_empty_result() {
    let r = test_router()
        .oneshot(post_json(
            "/api/calc/customer-analysis",
            &json!({"company_id": "uuid"}),
        ))
        .await
        .unwrap();
    assert_eq!(r.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_trend_missing_company() {
    let r = test_router()
        .oneshot(post_json("/api/calc/price-trend", &json!({})))
        .await
        .unwrap();
    assert_eq!(r.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_trend_default_period() {
    let r = test_router()
        .oneshot(post_json(
            "/api/calc/price-trend",
            &json!({"company_id": "uuid"}),
        ))
        .await
        .unwrap();
    let body = axum::body::to_bytes(r.into_body(), usize::MAX)
        .await
        .unwrap();
    let j: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(j["period_used"], "quarterly");
}

// === 단위 테스트 ===

#[test]
fn test_margin_calc() {
    use solarflow_engine::calc::margin::calc_margin_rate;
    let rate = calc_margin_rate(155.0, 131.5);
    assert_eq!(rate, 15.16);
}

#[test]
fn test_margin_summary_uses_cost_covered_revenue() {
    use solarflow_engine::calc::margin::{calc_cost_coverage_rate, calc_covered_margin_rate};

    assert_eq!(calc_covered_margin_rate(600.0, 500.0), 16.67);
    assert_eq!(calc_cost_coverage_rate(1000.0, 600.0), 60.0);
}

#[test]
fn test_outstanding_status() {
    use solarflow_engine::calc::margin::outstanding_status;
    assert_eq!(outstanding_status(30), "normal");
    assert_eq!(outstanding_status(45), "warning");
    assert_eq!(outstanding_status(65), "overdue");
}
