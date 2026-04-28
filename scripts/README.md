# SolarFlow 개발 스크립트

반복 검증과 로컬 서비스 반영 시간을 줄이기 위한 루트 스크립트입니다.

## 전체 검증

```bash
./scripts/verify_all.sh
```

실행 항목:
- Go: build, vet, test
- Go 규칙: `backend/scripts/lint_rules.sh` advisory 실행
- Go Request 구조체와 DB 컬럼 동기화: `backend/scripts/check_schema.sh`
- Rust: cargo test
- Frontend: npm run build

선택 옵션:

```bash
SKIP_SCHEMA=1 ./scripts/verify_all.sh
SKIP_GO_TEST=1 SKIP_RUST_TEST=1 ./scripts/verify_all.sh
STRICT_RULES=1 ./scripts/verify_all.sh
RUN_GRAPHIFY=1 ./scripts/verify_all.sh
```

현재 코드베이스에는 기존 RULES lint 부채가 남아 있어 기본 실행에서는 advisory로 표시합니다.
신규 작업에서 규칙 위반을 차단해야 할 때는 `STRICT_RULES=1`을 사용합니다.

## 변경 파일 기준 선택 검증

```bash
./scripts/verify_changed.sh
```

변경 파일을 기준으로 필요한 검증만 실행합니다.

- `backend/` 변경: Go build/vet/test + backend lint + schema check
- `engine/` 변경: Rust test
- `frontend/` 변경: frontend build
- `scripts/*.sh` 변경: shell syntax check
- 알 수 없는 코드 경로 변경: `verify_all.sh`로 자동 전환

기준 브랜치는 upstream이 있으면 upstream, 없으면 `origin/main`입니다.

선택 옵션:

```bash
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
