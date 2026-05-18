# SolarFlow 3.0 — Claude Code 작업 안내

## ⚡ Product 관점

이 프로젝트는 **ERP 시스템** (무역/재고/회계 등 SolarFlow 그 자체) 한 product 다.

> **이력**: 초기에는 "GUI 메타 편집기" 가 두 번째 product 로 같이 개발됐으나 **D-121 결정으로 제거됐다.** `templates/MetaForm`, `pages/UIConfigEditor`, v2 페이지 모두 삭제됐고, 잔존물은 `frontend/src/templates/MetaDetail.tsx` + `templates/registry.tsx` 뿐 — BLDetailView 한 곳만 사용하는 평범한 detail 컴포넌트로 강등됐다. 새 도메인 추가 시 GUI 로 form/detail 화면을 정의하는 메커니즘은 없으므로 정상적인 React 페이지로 구현한다.
>
> **새 도메인 추가 절차**는 [D-145](harness/DECISIONS.md#d-145) 의 "테넌트 모듈화" 패턴을 따른다 — `tenant.Registry` 객체 1개 + `packs/<id>/{nav.ts, pages/}` 디렉토리 + DB CHECK 마이그 + admin 매트릭스 (`/settings/feature-wiring`) 토글. **단계별 절차**는 [harness/NEW-TENANT-GUIDE.md](harness/NEW-TENANT-GUIDE.md) 참조.

## 읽기 순서
이 프로젝트에서 작업하기 전에 아래 순서로 읽으세요:
1. harness/PROGRESS.md — 현재 위치 확인 (이것만 읽으면 지금 어디인지 파악)
2. harness/RULES.md — 개발 규칙 + 감리 교훈 (헌법)
3. harness/AGENTS.md — 역할 정의 (시공자/감리자/Alex)
4. harness/SolarFlow_설계문서_통합판.md — 유일한 설계 정본
5. harness/DECISIONS.md — 설계 판단 기록 (왜 이렇게 했는지)
6. **harness/db-connectivity-report.md — DB 스키마/카탈로그/함정/카드/FK 매트릭스 (DB·SQL·마이그 작업 전 필독)**
7. **harness/dbschema-system.md — DB 정본 → Go/TS 타입 자동 생성 시스템 가이드 (PostgREST 핸들러·frontend 타입 작업 전 필독)**
8. **harness/data-sources.md — 외부 자료(엑셀/회계/발주 아카이브) → DB 매핑 카탈로그 (백필·정합·갭 작업 전 필독)**
9. 할당된 TASK 파일 — 새 TASK는 `harness/TASK_TEMPLATE.md` 기준

## 도메인별 인덱스 (테넌트 한정 작업 시)
변경 작업이 한쪽 사이트에만 적용된다면 해당 도메인 인덱스부터 보세요 — 활성 메뉴, 관련 결정(`D-YYYYMMDD-HHMMSS` 또는 기존 순번형 ID), `*Only` 미들웨어 적용 라우트가 한 페이지에 정리돼 있습니다.
- harness/module.md — `module.topworks.ltd` (탑솔라(주), 해외 모듈 수입·도매)
- harness/cable.md — `cable.topworks.ltd` (module 포크, 별도 `cable` 테넌트)
- harness/baro.md — `baro.topworks.ltd` (바로(주), 국내 도매·인바운드 위주)

양 테넌트에 공통으로 영향 가는 작업은 통합판 + DECISIONS를 그대로 참조.

**새 도메인 추가가 필요할 때**: [harness/NEW-TENANT-GUIDE.md](harness/NEW-TENANT-GUIDE.md) — registry 1줄 + 마이그 1개 + `packs/<id>/` + admin UI 토글의 단계별 가이드.

## 프로젝트 구조
- backend/ — Go API 게이트웨이 (chi v5, 운영 포트 8080, systemd user `solarflow-go.service`)
- engine/ — Rust 계산엔진 (Axum 0.8.x, 운영 포트 8081, systemd user `solarflow-engine.service`)
- frontend/ — React + Vite + TypeScript + Tailwind (운영은 Cloudflare Pages 자동 배포)
- harness/ — 하네스 파일 (규칙, 설계, 판단 기록)

## 운영 서버 SSH 접근 (에러 로그 조회)

운영 서버 `gx10-f96e` 는 **Tailscale SSH** 로 항상 접근 가능하다. 코드를 추측으로 디버깅하기 전에 **먼저 실제 운영 로그를 확인할 것**.

```
SSH:        ssh choiceoh@100.105.145.6
Hostname:   gx10-f96e (Ubuntu 24.04, ARM64)
Repo path:  /home/choiceoh/공개/solarflow-3   (경로에 한글 포함 — 쿼팅 주의)
서비스:     solarflow-go / solarflow-engine / cloudflared-solarflow / solarflow-webhook (systemd --user)
로그 백엔드: 전부 journald (`journalctl --user -u <unit>`)
DB:         Supabase pooler (aws-1-ap-northeast-2). 로컬 PG 로그 없음 — DB 에러는 solarflow-go 저널에 그대로 묻힌다.
```

**먼저 헬퍼 스크립트를 써라** — [`scripts/prod-logs.sh`](scripts/prod-logs.sh) 가 가장 흔한 조회를 한 줄로 제공한다:

```bash
scripts/prod-logs.sh errors            # 최근 30분간 ERROR/WARN (4개 유닛 통합)
scripts/prod-logs.sh errors 2h         # 시간 윈도우 지정 (30m, 2h, '1 day ago' 형식)
scripts/prod-logs.sh http5xx 1h        # Go 5xx 응답만
scripts/prod-logs.sh slow 1h           # Rust sqlx slow statement WARN
scripts/prod-logs.sh db 1h             # Supabase/PostgREST 에러 (PGRST204, column does not exist, 등)
scripts/prod-logs.sh tail go           # 실시간 follow (go|engine|cloudflared|webhook)
scripts/prod-logs.sh status            # 4개 유닛 systemctl status
scripts/prod-logs.sh sync              # cron-deploy .sync.log 마지막 200줄
scripts/prod-logs.sh raw -u solarflow-go.service --since '15min ago' --no-pager
```

원시 ssh 가 필요할 때 (1회성, 헬퍼로 안 잡히는 패턴):

```bash
# 특정 request_id 로 전체 흐름 추적
ssh choiceoh@100.105.145.6 "journalctl --user --since '1h ago' --no-pager \
  -u solarflow-go.service -u solarflow-engine.service | grep '<request_id>'"

# 특정 엔드포인트의 500 만 골라보기
ssh choiceoh@100.105.145.6 "journalctl --user --since '6h ago' --no-pager -u solarflow-go.service \
  | grep -E 'path=/api/v1/sales/summary.*status=500'"

# 서비스 재시작 이력 (Restart= 회수 추적)
ssh choiceoh@100.105.145.6 "journalctl --user -u solarflow-go.service --since today --no-pager \
  | grep -E 'Started|Stopped|Failed|Main process exited'"
```

**에러 트리아지 흐름**:
1. `prod-logs.sh errors` 로 최근 윈도우 스캔 → 빈도 높은 패턴 식별
2. 그 패턴이 DB 류면 `prod-logs.sh db` 와 `slow` 를 같이 봐서 스키마 드리프트(`PGRST204` / `column ... does not exist`) 인지 쿼리 지연인지 분리
3. 특정 요청을 깊이 볼 때만 `request_id` grep 으로 좁힌다 — Go 로그의 `request_id=<uuid>` 가 동일 요청의 모든 stage 를 묶는다
4. 스키마 드리프트가 확인되면 CLAUDE.md 의 "DB 스키마 변경 시 절차" 절을 다시 읽고 마이그레이션부터 작성

⚠️ 운영 박스에서 **임의로 서비스를 재시작하거나 파일을 고치지 말 것**. 진단(읽기)만 SSH 로 하고, 수정은 PR + cron-deploy(또는 webhook) 경유로 반영한다. 운영 직접 수정은 git pull 충돌을 영구화한다 (메모리: gx10 cron-deploy 80커밋 드리프트 사례).

## 핵심 원칙
1. 설계문서 통합판이 유일한 정본. 임의 변경 금지.
2. Go+Rust 분리: 한 행 사칙연산=Go, 여러 테이블 조합=Rust.
3. CHECKLIST_TEMPLATE.md 양식으로 보고.
4. 커밋은 작업 단위별.
5. Rust 담당 로직에 // TODO: Rust 계산엔진 연동 주석 필수.

## DB 스키마 변경 시 절차 (회귀 방지)

⚠️ 마이그 파일 작성 → `bun scripts/apply_migrations.ts` 한 번이면 끝. codegen 까지 자동.

```bash
# 1. backend/migrations/NNN_설명.sql 작성 (헤더 '-- @auto-apply: yes' 권장)
#    예: ALTER TABLE po_line_items ADD COLUMN IF NOT EXISTS item_type text;

# 2. 로컬: 마이그 적용 + codegen 자동 수행 (한 명령)
set -a && . backend/.env && set +a
bun scripts/apply_migrations.ts
#   → 미적용 .sql 적용 → NOTIFY pgrst → gen_db_types.ts 자동 트리거
#   → backend/internal/dbschema/tables.gen.go + frontend/src/types/db.gen.ts 갱신

# 3. 마이그 + 두 산출물을 같은 커밋에 포함
git add backend/migrations/NNN_*.sql \
        backend/internal/dbschema/tables.gen.go \
        frontend/src/types/db.gen.ts
```

도메인 손코딩 (선택): 새 컬럼을 클라이언트가 직접 보내야 하면
`backend/internal/domains/<도메인>/model.go` 의 `Create*Request` / `Update*Request` 와
`frontend/src/types/<도메인>.ts` 의 인터페이스에 필드를 추가한다. validation 로직은
손코딩 유지가 정본 — codegen 은 *DB row 표현*만 책임진다.

PostgREST select 시 컬럼 typo 차단: `dbschema.<Table>AllColumns` (Go) 또는
`Database['public']['Tables'][T]['Row']` (TS) 를 참조하면 컴파일타임에 잡힌다.

운영 반영: main push 후 cron-deploy 가 동일하게 `apply_migrations.ts` 를 실행 →
codegen 도 함께 트리거 (`SUPABASE_DB_URL` 환경변수 동일).

CI 차단: PR 단계에서 `.github/workflows/ci.yml` 의 `schema` 잡이
`bun scripts/gen_db_types.ts --check` 로 git diff 0 여부 검증 — 마이그만 추가하고
codegen 산출물 미커밋 시 PR 이 막힘 (repo secret `SUPABASE_DB_URL` 필요).

이전 절차 (`backend/scripts/check_schema.sh`) 는 비교만 했고 macOS-only 라 정본
생성으로 대체됨. PGRST204 → Go 500 → 프론트 저장 실패 사슬은 더 이상 동기화 누락으로
발생하지 않음.

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
- 운영 DB: Supabase hosted PostgreSQL + hosted PostgREST (Go는 Supabase REST/Auth 경유)
- 인증: Supabase Auth/JWKS만 사용
- Rust DB 연결: `SUPABASE_DB_URL` 환경변수로 PostgreSQL 직접 연결, sqlx 풀 5개
- Supabase 프로젝트: aalxpmfnsjzmhsfkuxnp.supabase.co

## DB 작업 시 필수 참조 (모든 에이전트 적용)

⚠️ **DB 관련 작업** (SQL 쿼리, 마이그레이션, 데이터 분석, 스키마 변경, FK 영향 검토)을
시작하기 전에 **반드시** [`harness/db-connectivity-report.md`](harness/db-connectivity-report.md)
를 참조한다.

이 문서가 답을 가지고 있는 질문들:
- 어떤 컬럼이 있나? (부록 A — 테이블 카드 35개)
- 무엇이 무엇을 참조하나? (부록 B — FK 매트릭스 127건)
- enum 허용값은? (§ 4 — 카테고리/status/bin_date)
- 회사 필터는 어떻게? (§ 1 — UUID 4개 + § 6.2 corporation 한글 함정)
- 매출/원가 어떻게 산정? (§ 2.3 원가 사슬 + § 5.3 SQL 템플릿)
- 어떤 함정이 있나? (§ 6 — 10가지: deprecated bl_id, 다면장, 단가 0≠NULL, fifo profit 합산 등)
- 빈 테이블/도메인은? (§ 9)
- 마이그 어떻게 작성? (§ 12 — 멱등성 / dry-run / PR 절차)
- 정합성 확인은? (§ 13 — 자가검증 SQL 4개)

### 자기 갱신 규칙 (Living Document)

본 문서는 **누적 reference** 다. 다음 변경이 있을 때 동일 PR 안에서 갱신한다:

| 변경 | 갱신할 섹션 |
|---|---|
| 새 마이그레이션 (스키마 변경) | 부록 A 의 해당 테이블 카드 + 필요 시 § 3 / § 6 |
| 새 RPC / function 추가 | § 7 |
| 새 뷰 추가 | § 8 |
| 새 enum 값 / status 변경 | § 4 |
| 새 함정/패턴 발견 | § 6 (10가지에 추가) |
| 새 JOIN 패턴이 반복 사용됨 | § 5 |
| 빈 테이블이 채워짐 / 새 빈 테이블 발생 | § 9 + 부록 A 의 rows 표시 |
| 회사 (tenant) 추가/제거 | § 1 |
| 마이그 시리즈 진행 | § 10 |

**자기 갱신을 안 하면 다음 에이전트가 stale 한 정보로 작업해 버그를 만든다.** 코드/스키마
변경 PR 에 본 문서 갱신을 같이 묶거나, 별도 `docs:` PR 로 즉시 갱신한다.

## graphify

이 프로젝트는 가능한 경우 `graphify-out/` 지식 그래프를 사용한다. 새 worktree에는 없을 수 있으므로 `scripts/setup_worktree.sh`가 생성하거나, `graphify` 명령이 없으면 건너뛴다.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure when it exists
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
