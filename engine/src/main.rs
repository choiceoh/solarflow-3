/// SolarFlow 계산엔진 — Rust/Axum 기반
/// 비유: "계산실" — 복잡한 원가, 재고, 마진 계산을 전담하는 부서

mod config;
mod db;
mod error;
mod routes;
mod calc;
mod model;

use config::Config;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() {
    // 개발용 .env 로딩 — 없어도 에러 아님 (프로덕션은 fly.io secrets 사용)
    dotenvy::dotenv().ok();

    // 로깅 초기화 (RUST_LOG 환경변수로 레벨 제어)
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    // 환경변수에서 설정 읽기
    let config = Config::from_env();

    tracing::info!("SolarFlow Engine v0.1.0 시작");
    tracing::info!("포트: {}", config.port);

    // DB 연결 풀 생성
    let pool = db::create_pool(&config.db_url)
        .await
        .expect("DB 연결 풀 생성에 실패했습니다");

    // 라우터 생성 — DB 풀을 Axum State로 공유
    let app = routes::create_router(pool);

    // 서버 시작
    let addr = format!("0.0.0.0:{}", config.port);
    tracing::info!("서버 시작: {}", addr);

    let listener = TcpListener::bind(&addr)
        .await
        .expect("서버 바인딩에 실패했습니다");

    axum::serve(listener, app)
        .await
        .expect("서버 실행에 실패했습니다");
}
