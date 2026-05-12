# SolarFlow 3.0 — Claude Code 작업 안내

## ⚡ Product 관점

이 프로젝트는 **ERP 시스템** (무역/재고/회계 등 SolarFlow 그 자체) 한 product 다.

> **이력**: 초기에는 "GUI 메타 편집기" 가 두 번째 product 로 같이 개발됐으나 **D-120 결정으로 제거됐다.** `templates/MetaForm`, `pages/UIConfigEditor`, v2 페이지 모두 삭제됐고, 잔존물은 `frontend/src/templates/MetaDetail.tsx` + `templates/registry.tsx` 뿐 — BLDetailView 한 곳만 사용하는 평범한 detail 컴포넌트로 강등됐다. 새 도메인 추가 시 GUI 로 form/detail 화면을 정의하는 메커니즘은 없으므로 정상적인 React 페이지로 구현한다.
>
> **새 도메인 추가 절차**는 [D-145](harness/DECISIONS.md#d-145) 의 "테넌트 모듈화" 패턴을 따른다 — `tenant.Registry` 객체 1개 + `packs/<id>/{nav.ts, pages/}` 디렉토리 + DB CHECK 마이그 + admin 매트릭스 (`/settings/feature-wiring`) 토글. **단계별 절차**는 [harness/NEW-TENANT-GUIDE.md](harness/NEW-TENANT-GUIDE.md) 참조.

## 읽기 순서
이 프로젝트에서 작업하기 전에 아래 순서로 읽으세요:
1. harness/PROGRESS.md — 현재 위치 확인 (이것만 읽으면 지금 어디인지 파악)
2. harness/RULES.md — 개발 규칙 + 감리 교훈 (헌법)
3. harness/AGENTS.md — 역할 정의 (시공자/감리자/Alex)
4. harness/SolarFlow_설계문서_통합판.md — 유일한 설계 정본
5. harness/DECISIONS.md — 설계 판단 기록 (왜 이렇게 했는지)
6. 할당된 TASK 파일

## 도메인별 인덱스 (테넌트 한정 작업 시)
변경 작업이 한쪽 사이트에만 적용된다면 해당 도메인 인덱스부터 보세요 — 활성 메뉴, 관련 결정(`D-YYYYMMDD-HHMMSS` 또는 기존 순번형 ID), `*Only` 미들웨어 적용 라우트가 한 페이지에 정리돼 있습니다.
- harness/module.md — `module.topworks.ltd` (탑솔라(주), 해외 모듈 수입·도매)
- harness/cable.md — `cable.topworks.ltd` (module 포크, 별도 `cable` 테넌트)
- harness/baro.md — `baro.topworks.ltd` (바로(주), 국내 도매·인바운드 위주)

양 테넌트에 공통으로 영향 가는 작업은 통합판 + DECISIONS를 그대로 참조.

**새 도메인 추가가 필요할 때**: [harness/NEW-TENANT-GUIDE.md](harness/NEW-TENANT-GUIDE.md) — registry 1줄 + 마이그 1개 + `packs/<id>/` + admin UI 토글의 단계별 가이드.

## 프로젝트 구조
- backend/ — Go API 게이트웨이 (chi v5, 포트 8080, launchd `com.solarflow.go`)
- engine/ — Rust 계산엔진 (Axum 0.8.x, 포트 8081, launchd `com.solarflow.engine`)
- frontend/ — React + Vite + TypeScript + Tailwind (Caddy 정적 서빙, dist/)
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

## 플랫폼별 운영 절차

- **Linux (현재 운영 서버)**: `harness/PRODUCTION.md` 참조. systemd user 유닛(`solarflow-go/engine`, `cloudflared-solarflow`) + cloudflared 터널 + Cloudflare Pages(프론트). `launchctl`/`codesign` 적용 안 됨.
- **macOS** (과거 표기 — 일부 문서가 macOS 가정): 아래 "Go 백엔드 변경 시 필수 절차"는 *macOS 한정* 절차. 운영 적용 시 PRODUCTION.md의 systemd 절차 사용.
- **Windows** (개발용): `harness/WINDOWS.md` 참조. launchctl/codesign 무관, 터미널 포그라운드 실행.

## Go 백엔드 변경 시 필수 절차 (macOS)
⚠️ macOS 26.4+ 코드 서명 필수 — 서명 없는 바이너리는 launchd가 즉시 SIGKILL

Go 소스 수정 후 반드시 아래 3단계를 순서대로 실행:
```bash
cd ~/solarflow-3/backend && go build -o solarflow-go .
codesign -f -s - solarflow-go
launchctl bootout gui/501 ~/Library/LaunchAgents/com.solarflow.go.plist 2>/dev/null || true && launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.solarflow.go.plist
```
- `stop/start`는 코드 서명 문제 해결 불가 → 반드시 `bootout/bootstrap` 사용
- Rust 엔진 변경 시: `cd ~/solarflow-3/engine && cargo build --release && codesign -f -s - target/release/solarflow-engine && launchctl bootout gui/501 ~/Library/LaunchAgents/com.solarflow.engine.plist 2>/dev/null || true && launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.solarflow.engine.plist`
- 모든 서비스 라벨: `com.solarflow.go`, `com.solarflow.engine`, `com.solarflow.postgrest`, `com.solarflow.caddy`
- 프론트엔드 운영 반영은 `cd ~/solarflow-3/frontend && npm run build` 후 Caddy가 `dist/`를 서빙
- `go test`, `cargo test`, `npm run build`는 검증일 뿐이고, 실제 반영은 위 3단계

## DB 연결
- 운영 DB: 로컬 PostgreSQL + PostgREST (Go는 supabase-go/PostgREST 경유)
- 인증: Supabase Auth/JWKS만 사용
- Rust DB 연결: `SUPABASE_DB_URL` 환경변수로 PostgreSQL 직접 연결, sqlx 풀 5개
- Supabase 프로젝트: aalxpmfnsjzmhsfkuxnp.supabase.co

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
