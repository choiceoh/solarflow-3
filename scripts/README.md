# SolarFlow 개발 스크립트

반복 검증과 로컬 서비스 반영 시간을 줄이기 위한 루트 스크립트입니다.

## 작업트리 자동 준비

```bash
./scripts/setup_worktree.sh
```

Codex Local Environment 의 setup script 는 `.codex/setup.sh`를 통해 이 스크립트를 실행합니다.
새 worktree에서 아래 항목을 idempotent 하게 준비합니다.

- `frontend/package.json`의 `packageManager`에 맞는 Bun 설치
- `frontend/bun.lock` 기준 프론트 의존성 설치
- `graphify-out/GRAPH_REPORT.md`가 없으면 graphify 인덱스 생성
- Go/Rust toolchain 누락 여부 안내

`SKIP_GRAPHIFY_SETUP=1`로 graphify 생성을 건너뛸 수 있고, 검증 스크립트에서 bootstrap 자체를 건너뛰려면 `SKIP_WORKTREE_SETUP=1`을 사용합니다.

## 전체 검증

```bash
./scripts/verify_all.sh
```

실행 항목:
- Go: build, vet, test
- Go 규칙: `backend/scripts/lint_rules.sh` advisory 실행
- Go Request 구조체와 DB 컬럼 동기화: `backend/scripts/check_schema.sh`
- Rust: cargo test
- Frontend: bun run build

선택 옵션:

```bash
SKIP_WORKTREE_SETUP=1 ./scripts/verify_all.sh
SKIP_SCHEMA=1 ./scripts/verify_all.sh
SKIP_GO_TEST=1 SKIP_RUST_TEST=1 ./scripts/verify_all.sh
STRICT_RULES=1 ./scripts/verify_all.sh
RUN_GRAPHIFY=1 ./scripts/verify_all.sh
```

현재 코드베이스에는 기존 RULES lint 부채가 남아 있어 기본 실행에서는 advisory로 표시합니다.
신규 작업에서 규칙 위반을 차단해야 할 때는 `STRICT_RULES=1`을 사용합니다.

## 작업 시작 preflight

새 worktree나 새 TASK를 시작할 때는 아래 순서로 맞춘다.

```bash
./scripts/setup_worktree.sh
./scripts/verify_changed.sh
```

TASK 작성은 `harness/TASK_TEMPLATE.md`를 기준으로 한다. 특히 DB migration, feature catalog/matrix, tenant index, 운영 검증 항목을 먼저 표시해야 작업 중 누락을 줄일 수 있다.

## 변경 파일 기준 선택 검증

```bash
./scripts/verify_changed.sh
```

변경 파일을 기준으로 필요한 검증만 실행합니다.

- `backend/` 변경: Go build/vet/test + backend lint + schema check
- `engine/` 변경: Rust test
- `frontend/` 코드/설정 변경: frontend build (`frontend/*.md` 문서는 제외)
- `scripts/*.sh` 변경: shell syntax check
- 알 수 없는 코드 경로 변경: `verify_all.sh`로 자동 전환

기준 브랜치는 upstream이 있으면 upstream, 없으면 `origin/main`입니다.

선택 옵션:

```bash
SKIP_WORKTREE_SETUP=1 ./scripts/verify_changed.sh
VERIFY_BASE=origin/main ./scripts/verify_changed.sh
FORCE_ALL=1 ./scripts/verify_changed.sh
STRICT_RULES=1 ./scripts/verify_changed.sh
RUN_GRAPHIFY=1 ./scripts/verify_changed.sh
```

## 서비스 반영

```bash
./scripts/apply_go.sh
./scripts/apply_rust.sh
./scripts/apply_frontend.sh
```

Go/Rust 스크립트는 macOS의 `codesign`과 `launchctl`이 있으면 자동으로 코드서명과 서비스 재반영까지 수행합니다.

## 운영 DB 마이그레이션 확인

```bash
bun scripts/verify_migration.ts 091_price_benchmark_review_status.sql
```

확인 항목:
- `public.schema_migrations` 적용 이력
- 지정한 DB column / constraint / index 존재 여부
- PostgREST schema cache 노출 여부 (`/rest/v1/<table>?select=<column>`)

`091_price_benchmark_review_status.sql`은 기본 preset으로 `price_benchmarks.review_status`,
CHECK constraint, index, PostgREST 노출까지 확인합니다. 다른 마이그레이션은 필요한 항목을 직접 지정합니다.

```bash
bun scripts/verify_migration.ts 092_xxx.sql \
  --column price_benchmarks.foo \
  --constraint price_benchmarks.price_benchmarks_foo_check \
  --index idx_price_benchmarks_foo \
  --postgrest price_benchmarks.foo
```

운영 `cron-deploy.sh`는 마이그레이션 적용 직후 이 스크립트를 실행하고, 반영 확인 실패 시 Go 재시작을 보류합니다.

## 배포 후 운영 확인

운영 배포 직후에는 한 번에 sync 로그, 서비스 상태, Go/Rust health, 최근 5xx, DB/PostgREST 오류를 확인한다.

```bash
./scripts/prod-logs.sh postdeploy
./scripts/prod-logs.sh postdeploy 2h
```

`postdeploy`는 운영 서버를 수정하지 않고 읽기만 한다. 더 좁혀야 할 때만 `errors`, `db`, `http5xx`, `slow`, `raw`를 사용한다.

## OCR sidecar 준비

```bash
./scripts/setup_ocr_sidecar.sh
```

PaddleOCR/RapidOCR Python 런타임을 `backend/.venv-ocr`에 설치하고 sidecar 모델 로드를 확인합니다.
Go 서버는 기본적으로 이 venv와 `backend/internal/ocr/sidecar-src/rapidocr_main.py`를 자동 탐색합니다.

운영 서비스의 작업 디렉터리가 다르면 systemd user 서비스 환경변수에 아래 값을 지정하세요.

```bash
OCR_PYTHON_BIN=/absolute/path/to/backend/.venv-ocr/bin/python
OCR_SIDECAR_SCRIPT=/absolute/path/to/backend/internal/ocr/sidecar-src/rapidocr_main.py
```
