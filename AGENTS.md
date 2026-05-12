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
- backend/ — Go API 게이트웨이 (chi v5, 포트 8080, launchd `com.solarflow.go`)
- engine/ — Rust 계산엔진 (Axum 0.8.x, 포트 8081, launchd `com.solarflow.engine`)
- frontend/ — React + Vite + TypeScript + Tailwind (Caddy 정적 서빙, dist/)
- harness/ — 하네스 파일 (규칙, 설계, 판단 기록)

## 운영 서버 SSH 접근 (에러 로그 조회)

운영 서버 `gx10-f96e` 는 **Tailscale SSH** 로 항상 접근 가능하다. 추측 디버깅 전에 **반드시 실제 로그부터 확인**.

```
SSH:        ssh choiceoh@100.105.145.6
Hostname:   gx10-f96e (Ubuntu 24.04, ARM64)
Repo path:  /home/choiceoh/공개/solarflow-3   (경로에 한글 — 쿼팅 주의)
서비스:     solarflow-go / solarflow-engine / cloudflared-solarflow / solarflow-webhook (systemd --user)
로그 백엔드: 전부 journald
DB:         Supabase pooler. 로컬 PG 로그 없음 — DB 에러는 solarflow-go 저널에 그대로 묻힌다.
```

**헬퍼 우선** — [`scripts/prod-logs.sh`](scripts/prod-logs.sh):

```bash
scripts/prod-logs.sh errors            # 최근 30분 ERROR/WARN (4개 유닛 통합)
scripts/prod-logs.sh errors 2h         # 윈도우 지정 (30m, 2h, '1 day ago')
scripts/prod-logs.sh http5xx 1h        # Go 5xx 만
scripts/prod-logs.sh slow 1h           # Rust sqlx slow statement
scripts/prod-logs.sh db 1h             # Supabase/PostgREST 에러 (PGRST204, column does not exist 등)
scripts/prod-logs.sh tail go           # 실시간 follow (go|engine|cloudflared|webhook)
scripts/prod-logs.sh status            # 4개 유닛 status
scripts/prod-logs.sh sync              # cron-deploy .sync.log 마지막 200줄
scripts/prod-logs.sh raw <journalctl args...>
```

원시 ssh 패턴 (헬퍼로 안 잡히는 케이스):

```bash
# request_id 로 동일 요청의 전체 흐름 추적
ssh choiceoh@100.105.145.6 "journalctl --user --since '1h ago' --no-pager \
  -u solarflow-go.service -u solarflow-engine.service | grep '<request_id>'"

# 서비스 재시작 이력
ssh choiceoh@100.105.145.6 "journalctl --user -u solarflow-go.service --since today --no-pager \
  | grep -E 'Started|Stopped|Failed|Main process exited'"
```

**트리아지 흐름**: `errors` → 패턴 식별 → DB 류면 `db` + `slow` 로 스키마 드리프트(`PGRST204`)인지 쿼리 지연인지 분리 → 좁힐 때만 `request_id` grep. Go 로그의 `request_id=<uuid>` 가 동일 요청을 묶는다.

⚠️ 운영 박스에서 **임의로 서비스를 재시작하거나 파일을 고치지 말 것** — SSH 는 진단(읽기) 전용. 수정은 PR → cron-deploy/webhook 경유. 운영 직접 수정은 git pull 충돌을 영구화한다.

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
