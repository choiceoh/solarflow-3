#!/usr/bin/env bash
# cron-deploy.sh — git pull 후 변경된 컴포넌트만 빌드/재시작
#
# 사용처: 운영 서버(Linux gx10-f96e)의 crontab에서 매 10분 호출.
# 동작:
#   1) git pull --ff-only origin main
#   2) HEAD 차이 없으면 즉시 종료
#   3) 차이 있으면 변경된 파일을 분류:
#      backend/migrations/*.sql        → 경고만 (수동 적용)
#      backend/(non-migration)         → Go 빌드 + solarflow-go 재시작
#      engine/(src|Cargo.{toml,lock})  → Rust 빌드 + solarflow-engine 재시작
#      frontend/*                      → 무시 (Cloudflare Pages 자동 배포)
#      그 외 (docs/harness 등)         → 무시
#   4) 빌드 실패 시 재시작 생략 — 기존 서비스 유지
#   5) 동시 실행 방지 (flock)

set -uo pipefail

REPO=/home/choiceoh/공개/solarflow-3
LOCK=/tmp/solarflow-cron-deploy.lock
GO_DIR="$REPO/backend"
ENGINE_DIR="$REPO/engine"

# 동시 실행 방지 (이전 실행이 빌드 중이면 skip)
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[$(date -Iseconds)] busy — 이전 실행이 빌드 중, skip"
  exit 0
fi

cd "$REPO" || { echo "[$(date -Iseconds)] repo cd 실패"; exit 1; }

BEFORE=$(git rev-parse HEAD)

# pull (실패해도 다음 cron이 다시 시도)
if ! git pull --ff-only origin 2>&1; then
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

# Go 빌드 + 재시작
if [[ $need_go -eq 1 ]]; then
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

# 마이그레이션은 자동 적용하지 않음 — 수동 검토 필요
if [[ $has_migration -eq 1 ]]; then
  echo "[$(date -Iseconds)] ⚠️  마이그레이션 변경 감지 — 수동 적용 필요:"
  for m in "${migrations[@]}"; do
    echo "    $m"
  done
  echo "    적용 절차: harness/PRODUCTION.md 'DB 마이그레이션' 섹션 참조"
fi

exit 0
