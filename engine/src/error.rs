#![allow(dead_code)] // foundation 모듈 — 핸들러 점진 도입 시 경고 자연 소멸

//! 엔진 통합 에러 타입.
//!
//! 핸들러는 `Result<T, EngineError>`로 반환하면 Axum이 적절한 HTTP 상태 + JSON으로 자동 매핑한다.
//! 5xx는 `tracing::error!`로 자동 기록되므로 호출자는 별도 로깅 불필요.
//!
//! 사용 예:
//! ```ignore
//! pub async fn handler(State(pool): State<PgPool>) -> EngineResult<Json<Value>> {
//!     let row = sqlx::query("SELECT 1").fetch_one(&pool).await?; // sqlx::Error → Database
//!     do_calc().context("재고 집계")?;                            // anyhow::Error → Internal
//!     if invalid { return Err(EngineError::BadRequest("…".into())); }
//!     Ok(Json(json!({"ok": true})))
//! }
//! ```

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("입력값 오류: {0}")]
    BadRequest(String),

    #[error("리소스 없음: {0}")]
    NotFound(String),

    #[error(transparent)]
    Database(#[from] sqlx::Error),

    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl EngineError {
    fn status(&self) -> StatusCode {
        match self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Database(_) | Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn kind(&self) -> &'static str {
        match self {
            Self::BadRequest(_) => "bad_request",
            Self::NotFound(_) => "not_found",
            Self::Database(_) => "database",
            Self::Internal(_) => "internal",
        }
    }
}

impl IntoResponse for EngineError {
    fn into_response(self) -> Response {
        let status = self.status();
        let kind = self.kind();
        if status.is_server_error() {
            tracing::error!(error = %self, kind = kind, "engine error");
        }
        let body = Json(json!({
            "error": self.to_string(),
            "kind": kind,
        }));
        (status, body).into_response()
    }
}

pub type EngineResult<T> = Result<T, EngineError>;
