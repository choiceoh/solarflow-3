/// DB 연결 풀 생성 모듈
/// 비유: 건물 수도 배관 — Supabase PostgreSQL에 연결하는 파이프라인

use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::time::Duration;

/// DB 연결 풀을 생성
/// Supabase pooler (port 5432, transaction mode, max 60). Go 의 PostgREST 가
/// 같은 pooler 를 공유하므로 절반 이하로 잡음 — engine 15 + Go/PostgREST 측 헤드룸.
/// min=2 로 warm pool 유지 (cold acquire latency 제거).
pub async fn create_pool(db_url: &str) -> Result<PgPool, sqlx::Error> {
    tracing::info!("DB 연결 풀 생성 중...");

    let pool = PgPoolOptions::new()
        .max_connections(15)
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Duration::from_secs(600))
        .connect(db_url)
        .await;

    match &pool {
        Ok(_) => tracing::info!("DB 연결 풀 생성 성공"),
        Err(e) => tracing::error!("DB 연결 풀 생성 실패: {}", e),
    }

    pool
}
