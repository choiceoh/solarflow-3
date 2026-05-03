#!/usr/bin/env bash
# cron-deploy.sh — git pull 후 변경된 컴포넌트만 빌드/재시작
#
# 사용처: 운영 서버(Linux gx10-f96e)의 crontab에서 매 10분 호출.
# 동작:
#   1) git pull --ff-only origin main
#   2) HEAD 차이 없으면 즉시 종료
#   3) 차이 있으면 변경된 파일을 분류:
#      backend/migrations/*.sql        → apply_migrations.py 호출 (헤더 게이트)
#      backend/(non-migration)         → Go 빌드 + solarflow-go 재시작
#      engine/(src|Cargo.{toml,lock})  → Rust 빌드 + solarflow-engine 재시작
#      frontend/*                      → 무시 (Cloudflare Pages 자동 배포)
#      그 외 (docs/harness 등)         → 무시
#   4) 마이그레이션은 `-- @auto-apply: yes` 헤더 있는 파일만 자동 적용.
#      미게이트 파일은 SKIP + 경고. 마이그레이션 SQL 실패 시 Go 재시작 생략 (DB 정합 우선).
#   5) 빌드 실패 시 재시작 생략 — 기존 서비스 유지
#   6) 동시 실행 방지 (flock)

set -uo pipefail

REPO=/home/choiceoh/공개/solarflow-3
LOCK=/tmp/solarflow-cron-deploy.lock
GO_DIR="$REPO/backend"
ENGINE_DIR="$REPO/engine"
PY_BIN="$REPO/backend/.venv-ocr/bin/python"   # psycopg2 가 들어 있는 venv
APPLY_MIG="$REPO/scripts/apply_migrations.py"

# 동시 실행 방지 (이전 실행이 빌드 중이면 skip)
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[$(date -Iseconds)] busy — 이전 실행이 빌드 중, skip"
  exit 0
fi

cd "$REPO" || { echo "[$(date -Iseconds)] repo cd 실패"; exit 1; }

# 운영 박스는 main 만 따라잡는다.
# `git pull --ff-only origin` 은 현재 브랜치 기준 ff 인데, 운영 박스가 작업 브랜치로
# 체크아웃돼 있으면 원격 main 의 새 커밋을 못 가져와 침묵으로 멈춘다 (이전 사고 사례).
# 다른 브랜치 발견 시 즉시 중단하고 큰소리로 알린다 — 자동 복구는 안 함 (작업 손실 위험).
CURRENT_BRANCH=$(git symbolic-ref --short -q HEAD || echo "DETACHED")
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "[$(date -Iseconds)] ❌ 운영 박스가 main 이 아닌 브랜치($CURRENT_BRANCH)에 있음 — 배포 중단"
  echo "    원인: 누군가 운영 박스에서 다른 브랜치를 체크아웃해 둠"
  echo "    조치: cd $REPO && git checkout main && git pull --ff-only origin main"
  echo "    작업은 다른 worktree 또는 다른 박스에서 (예: git worktree add ../solarflow-3-work feat/xxx)"
  exit 1
fi

BEFORE=$(git rev-parse HEAD)

# pull (실패해도 다음 cron이 다시 시도)
if ! git pull --ff-only origin main 2>&1; then
  echo "[$(date -Iseconds)] git pull 실패 — 다음 cron에서 재시도"
  exit 1
fi

AFTER=$(git rev-parse HEAD)

# 변경 없음 → 조용히 종료 (로그 노이즈 방지)
if [[ "$BEFORE" == "$AFTER" ]]; then
  exit 0
fi

CHANGED=$(git diff --name-only "$BEFORE" "$AFTER")
echo "[$(date -Iseconds)] 새 커밋 ${BEFORE:0:7}..${AFTER:0:7}"
echo "$CHANGED" | sed 's/^/  /'

# 분류
need_go=0
need_engine=0
has_migration=0
migrations=()

while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  case "$f" in
    backend/migrations/*.sql)
      has_migration=1
      migrations+=("$f")
      ;;
    backend/scripts/*|backend/sql/*|backend/setup_*|backend/STATUS.md|backend/Dockerfile|backend/fly.toml|backend/.env*|backend/tasks/*)
      ;;
    backend/*)
      need_go=1
      ;;
    engine/scripts/*|engine/tests/*|engine/Dockerfile|engine/fly.toml|engine/.env*)
      ;;
    engine/*)
      need_engine=1
      ;;
    *)
      ;;
  esac
done <<< "$CHANGED"

# 마이그레이션 자동 적용 (Go 빌드보다 먼저 — 새 코드가 새 스키마를 가정하므로)
mig_ok=1   # 1=성공/skip, 0=실패
if [[ $has_migration -eq 1 ]]; then
  echo "[$(date -Iseconds)] 마이그레이션 변경 감지:"
  for m in "${migrations[@]}"; do
    echo "    $m"
  done
  if [[ -x "$PY_BIN" && -f "$APPLY_MIG" ]]; then
    # backend/.env 의 SUPABASE_DB_URL 을 환경에 주입
    if [[ -f "$REPO/backend/.env" ]]; then
      set -a
      # shellcheck disable=SC1091
      source "$REPO/backend/.env"
      set +a
    fi
    echo "[$(date -Iseconds)] apply_migrations.py 실행"
    if "$PY_BIN" "$APPLY_MIG"; then
      echo "[$(date -Iseconds)] 마이그레이션 적용 완료"
    else
      rc=$?
      echo "[$(date -Iseconds)] ❌ apply_migrations.py 실패 (exit=$rc) — Go 재시작 보류"
      mig_ok=0
    fi
  else
    echo "[$(date -Iseconds)] ⚠️  apply_migrations.py 또는 venv python 없음 — 수동 적용 필요"
  fi
fi

# Go 빌드 + 재시작
if [[ $need_go -eq 1 && $mig_ok -eq 1 ]]; then
  echo "[$(date -Iseconds)] Go 빌드 시작"
  if (cd "$GO_DIR" && go build -o solarflow-go . 2>&1); then
    if systemctl --user restart solarflow-go.service 2>&1; then
      sleep 2
      if curl -fsS -o /dev/null http://localhost:8080/health; then
        echo "[$(date -Iseconds)] solarflow-go 재시작 OK (health 200)"
      else
        echo "[$(date -Iseconds)] solarflow-go 재시작했으나 health 응답 없음 — journalctl 확인 필요"
      fi
    else
      echo "[$(date -Iseconds)] solarflow-go systemctl restart 실패"
    fi
  else
    echo "[$(date -Iseconds)] Go 빌드 실패 — 기존 서비스 유지"
  fi
elif [[ $need_go -eq 1 && $mig_ok -eq 0 ]]; then
  echo "[$(date -Iseconds)] Go 변경분 빌드 보류 — 마이그레이션 실패 해결 후 다음 회차에 재시도"
fi

# Rust 빌드 + 재시작
if [[ $need_engine -eq 1 ]]; then
  echo "[$(date -Iseconds)] Rust 빌드 시작 (release)"
  if (cd "$ENGINE_DIR" && cargo build --release 2>&1); then
    if systemctl --user restart solarflow-engine.service 2>&1; then
      sleep 3
      if curl -fsS -o /dev/null http://localhost:8081/health; then
        echo "[$(date -Iseconds)] solarflow-engine 재시작 OK (health 200)"
      else
        echo "[$(date -Iseconds)] solarflow-engine 재시작했으나 health 응답 없음 — journalctl 확인 필요"
      fi
    else
      echo "[$(date -Iseconds)] solarflow-engine systemctl restart 실패"
    fi
  else
    echo "[$(date -Iseconds)] Rust 빌드 실패 — 기존 서비스 유지"
  fi
fi

# (마이그레이션은 위 분기에서 이미 처리됨 — apply_migrations.py 헤더 게이트)

exit 0
