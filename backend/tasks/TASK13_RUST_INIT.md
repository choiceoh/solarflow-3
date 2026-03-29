# 작업: Step 11B — Rust 프로젝트 초기화 + fly.io 배포
RULES.md를 반드시 따를 것. CHECKLIST_TEMPLATE.md 양식으로 보고할 것.

## 프로젝트 위치
~/solarflow-3/engine/ (신규 디렉토리)
기존 solarflow-3 레포에 engine/ 추가 (모노레포)

## Cargo.toml
[package]
name = "solarflow-engine"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls", "postgres", "uuid", "chrono", "migrate"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
dotenvy = "0.15"

## 디렉토리 구조
engine/
├── Cargo.toml
├── Cargo.lock          (커밋 대상 — 바이너리 프로젝트는 Cargo.lock 커밋이 Rust 공식 권장)
├── Dockerfile
├── fly.toml
├── .env.example
├── .gitignore          (target/ 와 .env만. Cargo.lock은 넣지 않음)
├── src/
│   ├── main.rs
│   ├── config.rs
│   ├── routes/
│   │   ├── mod.rs
│   │   └── health.rs
│   ├── calc/
│   │   └── mod.rs      (빈 모듈, Step 13부터)
│   ├── model/
│   │   └── mod.rs      (빈 모듈)
│   └── db/
│       └── mod.rs
└── tests/
    └── health_test.rs

## .gitignore (Cargo.lock 포함하지 않음)
/target
.env

## src/main.rs
- dotenvy::dotenv().ok() (개발용 .env 로딩, 없어도 에러 아님)
- tracing_subscriber 초기화
- Config::from_env()로 환경변수 읽기
- create_pool(config.db_url)로 DB 풀 생성 (max_connections=5)
- Router 생성: /health, /health/ready 등록
- DB 풀을 Axum State로 공유
- 0.0.0.0:8081 바인딩

## src/config.rs
- Config 구조체: db_url: String, port: u16
- from_env() -> Config
- SUPABASE_DB_URL 없으면 panic("SUPABASE_DB_URL 환경변수가 필요합니다")
- PORT 기본값 8081

## src/db/mod.rs
- create_pool(db_url: &str) -> Result<PgPool, sqlx::Error>
- PgPoolOptions::new().max_connections(5).connect_timeout(Duration::from_secs(5))
- 연결 성공/실패 tracing::info/error 로깅

## src/routes/mod.rs
- create_router(pool: PgPool) -> Router
- /health 등록
- /health/ready 등록
- /api/calc/ 경로 예약 주석: // Step 13부터 계산 API 추가

## src/routes/health.rs — 두 개 엔드포인트 (감리 지적 반영)

GET /health
- 항상 200 OK (서버 생존 확인, fly.io 헬스체크용)
- 응답: { "status": "ok", "service": "solarflow-engine", "version": "0.1.0" }
- DB 연결 확인 안 함

GET /health/ready
- DB 연결 확인: sqlx::query("SELECT 1").execute(&pool)
- 성공 시 200: { "status": "ready", "db": "connected" }
- 실패 시 503: { "status": "not_ready", "db": "disconnected", "error": "에러 메시지" }
- Go에서 Rust 호출 전 이 엔드포인트로 상태 확인

## src/calc/mod.rs, src/model/mod.rs
- 빈 모듈: // Step 13부터 계산 모듈 추가 예정
- calc/ 파일 구조 예약 주석:
  // inventory.rs — 재고 3단계 집계 + 장기재고 판별
  // landed_cost.rs — Landed Cost 계산 + 환율 환산
  // margin.rs — 마진/이익률 분석 + 단가 추이
  // lc_schedule.rs — LC 만기 + 수수료 + 한도 복원 타임라인
  // supply_forecast.rs — 월별 수급 전망
  // receipt_match.rs — 수금 매칭 자동 추천
  // search.rs — 자연어 검색 엔진

## Dockerfile (감리 지적 반영: rustls 사용이므로 libssl 불필요)

FROM rust:1.85-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/solarflow-engine .
EXPOSE 8081
CMD ["./solarflow-engine"]

참고:
- rustls 사용이므로 빌드/런타임 모두 libssl 불필요
- ca-certificates만 필요 (Supabase SSL 인증서 검증)
- Cargo.lock 와일드카드 없이 확정 복사

## fly.toml

app = 'solarflow-engine'
primary_region = 'nrt'

[build]

[env]
PORT = '8081'
RUST_LOG = 'info'

[http_service]
internal_port = 8081
force_https = true
auto_stop_machines = 'stop'
auto_start_machines = true
min_machines_running = 0
processes = ['app']

[[vm]]
size = 'shared-cpu-1x'
memory = '256mb'

## .env.example
SUPABASE_DB_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres
PORT=8081
RUST_LOG=info

## tests/health_test.rs
- /health → 200 + "status": "ok" 확인
- 서버 시작 테스트 (DB 없이도 /health는 200)

## DECISIONS.md 추가 (기존 내용 뒤에 append)
- D-016: Axum 선택
  이유: SolarFlow 계산엔진은 극한 성능이 아닌 정확한 계산이 목적.
  Tokio 팀 제작, 타입 안전, 메모리 효율 최고, 학습 곡선 완만.
  sqlx/serde 등 Tokio 생태계와 자연스럽게 통합.
- D-017: sqlx 직접 연결 (pgBouncer 아닌 이유)
  이유: sqlx는 prepared statements 사용. pgBouncer transaction mode에서
  세션 간 유지 안 됨. 직접 연결이 안전. 풀 5개로 Free 플랜 내 운영.
- D-018: Cargo.lock 커밋
  이유: Rust 공식 권장 — 바이너리 프로젝트는 Cargo.lock을 커밋해야
  빌드 재현성(reproducibility) 보장. .gitignore에 넣지 않음.
- D-019: /health와 /health/ready 분리
  이유: /health는 fly.io 헬스체크용 (항상 200, DB 무관).
  /health/ready는 DB 연결 확인용 (Go에서 Rust 호출 전 상태 확인).
  DB 장애 시 서버는 살아있지만 계산은 불가능한 상태를 구분.

## PROGRESS.md 업데이트
- 먼저 Step 11A 결과가 최신인지 확인 (이전 작업 반영 여부)
- Step 11B Rust 프로젝트 초기화 + fly.io 배포 완료 기록
- 현재 단계: Step 12 (Go↔Rust 통신 테스트) 대기

## 완료 기준
1. cargo build --release 성공
2. cargo test 성공
3. 전체 파일 코드(cat) 보여주기
4. CHECKLIST_TEMPLATE.md 양식으로 보고

참고: fly.io 배포(fly deploy)는 Alex가 별도로 실행.
SUPABASE_DB_URL secrets 등록도 Alex가 별도로 실행.
Claude Code는 코드 작성 + 로컬 빌드/테스트까지만.
