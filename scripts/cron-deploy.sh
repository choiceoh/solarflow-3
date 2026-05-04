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
#   6) [자동 롤백] 재시작 후 health(/health) 실패 시 이전 바이너리(.prev)로 복원하고
#      다시 재시작. Go·Rust 모두 적용. .prev는 빌드 직전 백업으로 갱신됨.
#   7) 동시 실행 방지 (flock)
#
# CI 게이트는 제거됨 — main 브랜치 protection 으로 CI red 머지가 차단되므로
# 여기서 다시 확인할 이유 없음. 머지된 = CI green 가정. 머지는 됐는데 배포가
# 멈춰서 "왜 안 되지?" 혼란이 생기던 패턴 제거.
#
# 운영 안전선 (만일을 위한 다중 가드):
#   - 빌드 실패 → 재시작 생략 (5)
#   - 마이그레이션 실패 → Go 재시작 보류 (4, apply_migrations.py 트랜잭션)
#   - 빌드는 됐지만 런타임 panic → health 실패 → 자동 롤백 (6)
#   - 그래도 안 되면 systemd가 service Restart=on-failure로 재시도

set -uo pipefail

# cron 환경에서 systemctl --user 가 동작하려면 user systemd 인스턴스의 소켓을 가리키는
# XDG_RUNTIME_DIR 와 DBUS_SESSION_BUS_ADDRESS 가 필요하다. 인터랙티브 로그인 셸에는
# pam_systemd 가 자동 주입하지만 cron 의 환경엔 없어서, restart 호출이 다음과 같이 실패한다:
#   "Failed to connect to bus: No medium found"
# 이 경우 swap 후 systemd 가 새 바이너리를 못 잡고, 디스크/메모리 mismatch 가 발생한다.
# 한 번 운영자 조치 필요: `loginctl enable-linger choiceoh` (로그아웃 후에도 user systemd 유지).
USER_UID=$(id -u)
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$USER_UID}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"

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

# CI 게이트는 GitHub branch protection 으로 이전됨 (머지 자체를 막음).
# main 에 도달한 모든 commit 은 backend + changes CI green 가정.
# 빌드/health/롤백 다중 가드는 그대로 — main 에 코드 결함이 들어와도
# 운영은 health 실패 시 .prev 로 자동 복원.

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

# 재시작 후 health 확인 + 실패 시 이전 바이너리로 자동 롤백.
# 호출: restart_with_rollback <service-name> <bin-path> <bin-prev-path> <health-url>
# 동작:
#   1) systemctl restart
#   2) sleep + health curl
#   3) health 실패 → 이전 바이너리(.prev) 복원 → systemctl restart → health 재확인
#   4) 롤백도 실패하면 last bad state 그대로 두고 알림 (systemd 자체 재시작 정책에 위임)
restart_with_rollback() {
  local svc=$1 bin=$2 prev=$3 health=$4
  if ! systemctl --user restart "$svc" 2>&1; then
    echo "[$(date -Iseconds)] ❌ $svc systemctl restart 실패"
    return 1
  fi
  sleep 3
  if curl -fsS -m 5 -o /dev/null "$health"; then
    echo "[$(date -Iseconds)] $svc 재시작 OK (health 200)"
    return 0
  fi
  echo "[$(date -Iseconds)] ❌ $svc health 실패 — 자동 롤백 시도"
  if [[ ! -f "$prev" ]]; then
    echo "[$(date -Iseconds)] ❌ 이전 바이너리($prev) 없음 — 자동 롤백 불가, 수동 개입 필요"
    return 1
  fi
  mv -f "$prev" "$bin"
  if ! systemctl --user restart "$svc" 2>&1; then
    echo "[$(date -Iseconds)] ❌ 롤백 후 systemctl restart 실패 — 수동 개입 필요"
    return 1
  fi
  sleep 3
  if curl -fsS -m 5 -o /dev/null "$health"; then
    echo "[$(date -Iseconds)] ✓ $svc 이전 바이너리로 자동 롤백 완료 (health 200)"
    return 0
  fi
  echo "[$(date -Iseconds)] ❌ $svc 롤백 후에도 health 실패 — journalctl + 수동 개입 필요"
  return 1
}

# Go 빌드 + 재시작 (이전 바이너리 백업 → 자동 롤백 가드 포함)
GO_BIN="$GO_DIR/solarflow-go"
GO_BIN_PREV="$GO_DIR/solarflow-go.prev"
GO_BIN_NEW="$GO_DIR/solarflow-go.new"
if [[ $need_go -eq 1 && $mig_ok -eq 1 ]]; then
  echo "[$(date -Iseconds)] Go 빌드 시작 (-> solarflow-go.new)"
  if (cd "$GO_DIR" && go build -o solarflow-go.new . 2>&1); then
    # 백업: 현재 운영 중인 바이너리를 .prev로, 새 빌드를 운영 자리로 원자적 swap
    [[ -f "$GO_BIN" ]] && cp -f "$GO_BIN" "$GO_BIN_PREV"
    mv -f "$GO_BIN_NEW" "$GO_BIN"
    restart_with_rollback solarflow-go.service "$GO_BIN" "$GO_BIN_PREV" http://localhost:8080/health
  else
    echo "[$(date -Iseconds)] Go 빌드 실패 — 기존 서비스 유지"
    rm -f "$GO_BIN_NEW"
  fi
elif [[ $need_go -eq 1 && $mig_ok -eq 0 ]]; then
  echo "[$(date -Iseconds)] Go 변경분 빌드 보류 — 마이그레이션 실패 해결 후 다음 회차에 재시도"
fi

# Rust 빌드 + 재시작
# cargo는 빌드 결과를 in-place로 덮어쓰므로 (Go의 -o .new 패턴이 안 됨) 빌드 직전에 미리 백업.
# cargo build는 실패 시 기존 바이너리를 건드리지 않으므로 pre-build 백업이 의미를 가진다.
ENGINE_BIN="$ENGINE_DIR/target/release/solarflow-engine"
ENGINE_BIN_PREV="$ENGINE_DIR/target/release/solarflow-engine.prev"
if [[ $need_engine -eq 1 ]]; then
  echo "[$(date -Iseconds)] Rust 빌드 시작 (release)"
  # 빌드 직전 백업 (현재 운영 중 바이너리)
  [[ -f "$ENGINE_BIN" ]] && cp -f "$ENGINE_BIN" "$ENGINE_BIN_PREV"
  if (cd "$ENGINE_DIR" && cargo build --release 2>&1); then
    restart_with_rollback solarflow-engine.service "$ENGINE_BIN" "$ENGINE_BIN_PREV" http://localhost:8081/health
  else
    echo "[$(date -Iseconds)] Rust 빌드 실패 — 기존 서비스 유지"
    # 빌드 실패 시 .prev는 그대로 둔다 (다음 빌드 시 다시 갱신됨)
  fi
fi

# (마이그레이션은 위 분기에서 이미 처리됨 — apply_migrations.py 헤더 게이트)

exit 0
