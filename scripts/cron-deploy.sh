#!/usr/bin/env bash
# cron-deploy.sh — git pull 후 변경된 컴포넌트만 빌드/재시작
#
# 사용처: 운영 서버(Linux gx10-f96e)의 crontab에서 매 10분 호출.
# 동작:
#   1) git pull --ff-only origin main
#   2) HEAD 차이 없으면 즉시 종료
#   3) 차이 있으면 변경된 파일을 분류:
#      backend/migrations/*.sql        → apply_migrations.ts 호출 후 verify_migration.ts 확인
#      backend/(non-migration)         → Go 빌드 + solarflow-go 재시작
#      engine/(src|Cargo.{toml,lock})  → Rust 빌드 + solarflow-engine 재시작
#      frontend/*                      → 무시 (Cloudflare Pages 자동 배포)
#      그 외 (docs/harness 등)         → 무시
#   4) 마이그레이션은 apply_migrations.ts 정책으로 자동/skip 결정.
#      SQL 실패 또는 반영 확인 실패 시 Go 재시작 생략 (DB 정합 우선).
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
#   - 마이그레이션 실패 → Go 재시작 보류 (4, apply_migrations.ts 트랜잭션)
#   - 빌드는 됐지만 런타임 panic → health 실패 → 자동 롤백 (6)
#   - 그래도 안 되면 systemd가 service Restart=on-failure로 재시도
#
# Zero-downtime reload (D-123): Go 는 systemctl reload 가 ExecReload=kill -HUP $MAINPID
# 를 통해 tableflip Upgrader 의 fork+exec 를 트리거. 자식이 listener fd 를 인계받아
# 사용자 체감 다운타임 0 으로 새 바이너리 가동. reload 실패 시 restart 폴백.

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

# webhook(systemd user 유닛) 환경엔 인터랙티브 셸의 PATH 가 없어 `cargo`/`go` 가 안 잡힌다.
# 그래서 engine 변경분이 들어와도 "cargo: 명령어를 찾을 수 없음" → "Rust 빌드 실패" 로 침묵 종료,
# 운영 바이너리만 stale 로 남는 사고가 반복됐다 (2026-05 sales-analysis 사고). cargo/go bin 을 PATH 에 강제로 합친다.
export PATH="$HOME/.cargo/bin:/usr/local/go/bin:/usr/lib/go-1.22/bin:$PATH"

REPO=/home/choiceoh/공개/solarflow-3
LOCK=/tmp/solarflow-cron-deploy.lock
GO_DIR="$REPO/backend"
ENGINE_DIR="$REPO/engine"
APPLY_MIG_TS="$REPO/scripts/apply_migrations.ts"
VERIFY_MIG_TS="$REPO/scripts/verify_migration.ts"
BUN_BIN="$HOME/.bun/bin/bun"                  # Bun 1.2+ — Bun.SQL 로 PostgreSQL 직결

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
  # backend/.env 의 SUPABASE_DB_URL 을 환경에 주입
  if [[ -f "$REPO/backend/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO/backend/.env"
    set +a
  fi

  if [[ -x "$BUN_BIN" && -f "$APPLY_MIG_TS" ]]; then
    echo "[$(date -Iseconds)] apply_migrations.ts 실행 (bun)"
    if "$BUN_BIN" "$APPLY_MIG_TS"; then
      echo "[$(date -Iseconds)] 마이그레이션 적용 완료"
      if [[ -f "$VERIFY_MIG_TS" ]]; then
        verify_ok=1
        echo "[$(date -Iseconds)] 마이그레이션 반영 확인 실행"
        for m in "${migrations[@]}"; do
          name="$(basename "$m")"
          if "$BUN_BIN" "$VERIFY_MIG_TS" "$name"; then
            echo "[$(date -Iseconds)]   ✓ $name 반영 확인 완료"
          else
            rc=$?
            echo "[$(date -Iseconds)]   ❌ $name 반영 확인 실패 (exit=$rc)"
            verify_ok=0
          fi
        done
        if [[ $verify_ok -ne 1 ]]; then
          echo "[$(date -Iseconds)] ❌ 마이그레이션 반영 확인 실패 — Go 재시작 보류"
          mig_ok=0
        fi
      else
        echo "[$(date -Iseconds)] ⚠️  verify_migration.ts 없음 — 반영 확인 생략"
      fi
    else
      rc=$?
      echo "[$(date -Iseconds)] ❌ apply_migrations.ts 실패 (exit=$rc) — Go 재시작 보류"
      mig_ok=0
    fi
  else
    echo "[$(date -Iseconds)] ❌ bun 미설치 또는 apply_migrations.ts 누락 — 수동 적용 필요"
    mig_ok=0
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

# Zero-downtime reload (D-123): SIGHUP → tableflip Upgrader fork+exec → 자식이 listener fd 인계.
# 호출: reload_or_restart <service-name> <bin-path> <bin-prev-path> <health-url>
#
# 동작:
#   1) systemctl reload (ExecReload=/bin/kill -HUP $MAINPID 정의돼야 함)
#   2) sleep 3 + health curl — 자식 인계는 보통 1~2초 안에 끝남
#   3) reload 성공 + health 200 → 사용자 체감 다운타임 0 (이상적 경로)
#   4) reload 자체 실패(ExecReload 미정의 등) 또는 health 실패 → restart_with_rollback 폴백
#
# 폴백이 필요한 경우:
#   - unit 파일에 ExecReload 가 아직 없는 운영 박스 (배포 직후 1회)
#   - 새 바이너리에 tableflip 호환 문제 (예: SIGHUP 미처리) — 부모가 그냥 죽고 systemd Restart=on-failure 가 살림. 이때 health 가 잠깐 빨갈 수 있어 폴백.
reload_or_restart() {
  local svc=$1 bin=$2 prev=$3 health=$4
  if systemctl --user reload "$svc" 2>/dev/null; then
    sleep 3
    if curl -fsS -m 5 -o /dev/null "$health"; then
      echo "[$(date -Iseconds)] $svc reload OK (zero-downtime, health 200)"
      return 0
    fi
    echo "[$(date -Iseconds)] $svc reload 후 health 실패 — restart 폴백"
  else
    echo "[$(date -Iseconds)] $svc reload 미지원/실패 — restart 폴백"
  fi
  restart_with_rollback "$svc" "$bin" "$prev" "$health"
}

# Go 빌드 + 재시작 (이전 바이너리 백업 → 자동 롤백 가드 포함)
GO_BIN="$GO_DIR/solarflow-go"
GO_BIN_PREV="$GO_DIR/solarflow-go.prev"
GO_BIN_NEW="$GO_DIR/solarflow-go.new"
if [[ $need_go -eq 1 && $mig_ok -eq 1 ]]; then
  echo "[$(date -Iseconds)] Go 빌드 시작 (-> solarflow-go.new)"
  # GOARM64=v9.0,lse,crypto: Grace ARM (Neoverse V2) 의 ARMv9 baseline + LSE atomic + crypto.
  # Go 의 GOARM64 는 ,lse 와 ,crypto 만 토큰으로 받는다 (sve2 같은 런타임 feature 는 불가) —
  # v9.0,sve2 로 적으면 Go 1.26+ 가 invalid 로 거부해 빌드 실패.
  # 운영 호스트(gx10) 와 spark4tb(콜드 스탠바이) 모두 Grace 라 안전.
  if (cd "$GO_DIR" && GOARM64=v9.0,lse,crypto go build -o solarflow-go.new . 2>&1); then
    # 백업: 현재 운영 중인 바이너리를 .prev로, 새 빌드를 운영 자리로 원자적 swap.
    # 이 시점부터 SIGHUP 을 받은 tableflip 의 fork+exec 는 새 바이너리를 실행.
    [[ -f "$GO_BIN" ]] && cp -f "$GO_BIN" "$GO_BIN_PREV"
    mv -f "$GO_BIN_NEW" "$GO_BIN"
    # reload(SIGHUP) → tableflip zero-downtime 인계가 정상 경로.
    # ExecReload 미정의 / 새 바이너리 결함 등 비정상 상황은 restart_with_rollback 으로 폴백.
    reload_or_restart solarflow-go.service "$GO_BIN" "$GO_BIN_PREV" http://localhost:8080/health
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
# 엔진은 tableflip 미적용이라 restart 경로 — 단, with_graceful_shutdown 으로 in-flight 계산은
# 드레인되고, Go 의 EngineClient.doWithRetry 가 listener 단절(보통 1~2초) 을 가린다 (D-123).
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

# (마이그레이션은 위 분기에서 이미 처리됨 — apply_migrations.ts 헤더 게이트)

exit 0
