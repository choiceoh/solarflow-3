# SolarFlow 3.0 — Codex 작업 안내

## 읽기 순서
이 프로젝트에서 작업하기 전에 아래 순서로 읽으세요:
1. harness/PROGRESS.md — 현재 위치 확인 (이것만 읽으면 지금 어디인지 파악)
2. harness/RULES.md — 개발 규칙 + 감리 교훈 (헌법)
3. harness/AGENTS.md — 역할 정의 (시공자/감리자/Alex)
4. harness/SolarFlow_설계문서_통합판.md — 유일한 설계 정본
5. harness/DECISIONS.md — 설계 판단 기록 (왜 이렇게 했는지)
6. 할당된 TASK 파일

## 프로젝트 구조
- backend/ — Go API 게이트웨이 (chi v5, 포트 8080, fly.io solarflow-backend)
- engine/ — Rust 계산엔진 (Axum 0.8.8, 포트 8081, fly.io solarflow-engine)
- frontend/ — React + Vite + TypeScript + Tailwind (Phase 4, Cloudflare Pages)
- harness/ — 하네스 파일 (규칙, 설계, 판단 기록)

## 핵심 원칙
1. 설계문서 통합판이 유일한 정본. 임의 변경 금지.
2. Go+Rust 분리: 한 행 사칙연산=Go, 여러 테이블 조합=Rust.
3. CHECKLIST_TEMPLATE.md 양식으로 보고.
4. 커밋은 작업 단위별.
5. Rust 담당 로직에 // TODO: Rust 계산엔진 연동 주석 필수.

## Go 모델 필드 변경 시 필수 절차 (회귀 방지)
⚠️ `Create*Request` / `Update*Request` 구조체에 필드를 추가/삭제하면 반드시 아래를 수행:

```bash
# 1. 마이그레이션 파일 작성 (번호는 기존 최대+1)
# backend/migrations/NNN_설명.sql 예시:
#   ALTER TABLE po_line_items ADD COLUMN IF NOT EXISTS item_type text;

# 2. 마이그레이션 적용
psql -d solarflow -f backend/migrations/NNN_설명.sql

# 3. PostgREST 스키마 캐시 갱신 (빠뜨리면 기존 캐시로 여전히 500)
launchctl stop com.solarflow.postgrest && launchctl start com.solarflow.postgrest

# 4. 동기화 검증 (모두 ✅ 나와야 커밋)
cd backend && ./scripts/check_schema.sh
```

이 절차를 빠뜨리면: PostgREST PGRST204 → Go 500 → 프론트엔드 저장 실패 (단가/수량 유실처럼 보임)

## Go 백엔드 변경 시 필수 절차
⚠️ macOS 26.4+ 코드 서명 필수 — 서명 없는 바이너리는 launchd가 즉시 SIGKILL

Go 소스 수정 후 반드시 아래 3단계를 순서대로 실행:
```bash
cd ~/solarflow-3/backend && go build -o solarflow-go .
codesign -f -s - solarflow-go
launchctl bootout gui/501 ~/Library/LaunchAgents/com.solarflow.go.plist 2>/dev/null || true && launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.solarflow.go.plist
```
- `stop/start`는 코드 서명 문제 해결 불가 → 반드시 `bootout/bootstrap` 사용
- Rust 엔진 변경 시: `cd ~/solarflow-3/engine && cargo build --release && codesign -f -s - target/release/solarflow-engine && launchctl stop com.solarflow.engine && launchctl start com.solarflow.engine`
- 모든 서비스 라벨: `com.solarflow.go`, `com.solarflow.engine`, `com.solarflow.postgrest`, `com.solarflow.caddy`
- 프론트엔드는 `npm run dev`가 자동 반영하므로 재시작 불필요
- `go test`, `cargo test`, `npm run build`는 검증일 뿐이고, 실제 반영은 위 3단계

## DB 연결
- Supabase PostgreSQL (Session pooler, 포트 5432)
- Go 풀 약5개, Rust 풀 5개
- 프로젝트: aalxpmfnsjzmhsfkuxnp.supabase.co

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
