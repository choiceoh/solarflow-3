# SolarFlow 3.0 — Codex 작업 안내

## 제품 관점
이 프로젝트의 현재 제품은 **SolarFlow ERP 시스템** 하나다.

초기에는 GUI 메타 편집기를 두 번째 제품처럼 다뤘지만, D-121에서 `/ui-config-editor`, MetaForm/ListScreen, v2 페이지 라인을 폐기했다. 남은 `frontend/src/templates/MetaDetail.tsx`와 `frontend/src/templates/registry.tsx`는 BL 상세 화면이 일부 섹션을 그리는 데 쓰는 잔존 컴포넌트다.

새 도메인이나 화면을 추가할 때는 메타 GUI를 되살리지 말고 일반 React 도메인 화면으로 구현한다. 새 테넌트는 `harness/NEW-TENANT-GUIDE.md`의 registry + pack + feature wiring 절차를 따른다.

## 읽기 순서
이 프로젝트에서 작업하기 전에 아래 순서로 읽으세요:
1. harness/PROGRESS.md — 현재 위치 확인 (이것만 읽으면 지금 어디인지 파악)
2. harness/RULES.md — 개발 규칙 + 감리 교훈 (헌법)
3. harness/AGENTS.md — 역할 정의 (시공자/감리자/Alex)
4. harness/SolarFlow_설계문서_통합판.md — 유일한 설계 정본
5. harness/DECISIONS.md — 설계 판단 기록 (왜 이렇게 했는지)
6. 할당된 TASK 파일 — 새 TASK는 `harness/TASK_TEMPLATE.md` 기준

## 프로젝트 구조
- backend/ — Go API 게이트웨이 (chi v5, 운영 포트 8080, systemd user `solarflow-go.service`)
- engine/ — Rust 계산엔진 (Axum 0.8.x, 운영 포트 8081, systemd user `solarflow-engine.service`)
- frontend/ — React + Vite + TypeScript + Tailwind (운영은 Cloudflare Pages 자동 배포)
- harness/ — 하네스 파일 (규칙, 설계, 판단 기록)
- scripts/ — 검증, 운영 로그 조회, 자동 배포 보조 스크립트

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

# 2. 마이그레이션 적용/검증
# 운영 Linux: main push 후 cron-deploy가 apply_migrations.ts + verify_migration.ts 실행
# 로컬/수동 검증: bun scripts/verify_migration.ts NNN_설명.sql

# 3. PostgREST 스키마 캐시 갱신
# 운영 Linux/Supabase hosted: NOTIFY pgrst, 'reload schema' (apply_migrations.ts가 자동 발송)
# macOS 과거 로컬 PostgREST: launchctl stop/start 절차는 CLAUDE.md의 macOS 섹션 참고

# 4. 동기화 검증 (모두 ✅ 나와야 커밋)
cd backend && ./scripts/check_schema.sh
```

이 절차를 빠뜨리면: PostgREST PGRST204 → Go 500 → 프론트엔드 저장 실패 (단가/수량 유실처럼 보임)

## 플랫폼별 운영 절차

- **Linux 현재 운영 서버**: `harness/PRODUCTION.md`를 정본으로 따른다. systemd user 서비스와 Cloudflare Pages 자동 배포가 현재 운영 방식이다.
- **macOS 과거/로컬 운영**: launchd와 codesign 절차가 필요할 수 있다. 이 절차는 현재 운영 서버에는 적용하지 않는다.
- **Windows/WSL 개발**: `harness/WINDOWS.md`를 따른다. launchd/codesign은 무관하다.

## DB 연결
- 운영 DB: Supabase hosted PostgreSQL + hosted PostgREST (Go는 Supabase REST/Auth 경유)
- 인증: Supabase Auth/JWKS만 사용
- Rust DB 연결: `SUPABASE_DB_URL` 환경변수로 PostgreSQL 직접 연결, sqlx 풀 5개
- Supabase 프로젝트: aalxpmfnsjzmhsfkuxnp.supabase.co

## graphify

이 프로젝트는 가능한 경우 `graphify-out/` 지식 그래프를 사용한다. 새 worktree에는 없을 수 있으므로 `scripts/setup_worktree.sh`가 생성하거나, `graphify` 명령이 없으면 건너뛴다.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure when it exists
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
