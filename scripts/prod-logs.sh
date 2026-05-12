#!/usr/bin/env bash
# 운영 서버(gx10-f96e) 로그를 Tailscale SSH 로 읽는 헬퍼.
# 전제: ssh choiceoh@100.105.145.6 가 키 기반으로 접속 가능해야 한다.
#
# 사용 예:
#   scripts/prod-logs.sh errors            # 최근 30분간 ERROR (go/engine/cloudflared)
#   scripts/prod-logs.sh errors 2h         # 최근 2시간
#   scripts/prod-logs.sh tail go           # 실시간 follow (Ctrl-C 로 종료)
#   scripts/prod-logs.sh tail engine
#   scripts/prod-logs.sh tail cloudflared
#   scripts/prod-logs.sh tail webhook
#   scripts/prod-logs.sh slow              # engine sqlx slow query WARN (최근 1h)
#   scripts/prod-logs.sh db                # Go 에 잡힌 PostgreSQL 에러 (PGRST/Supabase)
#   scripts/prod-logs.sh http5xx           # 5xx 응답만
#   scripts/prod-logs.sh status            # 4개 유닛 status
#   scripts/prod-logs.sh sync              # cron-deploy .sync.log tail
#   scripts/prod-logs.sh postdeploy        # 배포 직후 sync/status/health/최근 오류 한 번에 확인
#
# 모든 명령은 ssh 1회 호출로 실행되고 stdout 으로 결과만 돌려준다.

set -euo pipefail

SSH_TARGET="${SOLARFLOW_PROD_SSH:-choiceoh@100.105.145.6}"
REMOTE_REPO='/home/choiceoh/공개/solarflow-3'

# journalctl 단위 4종 - alias 매핑
unit_for() {
  case "$1" in
    go)           echo 'solarflow-go.service' ;;
    engine)       echo 'solarflow-engine.service' ;;
    cloudflared)  echo 'cloudflared-solarflow.service' ;;
    webhook)      echo 'solarflow-webhook.service' ;;
    *) echo "unknown unit: $1 (go|engine|cloudflared|webhook)" >&2; exit 2 ;;
  esac
}

run_remote() {
  # bash -lc 로 감싸서 PATH/locale 보장
  ssh -o ConnectTimeout=10 "$SSH_TARGET" "bash -lc $(printf '%q' "$1")"
}

since_expr() {
  local value="${1:-30m}"
  case "$value" in
    *ago|today|yesterday|20[0-9][0-9]-*) printf '%s' "$value" ;;
    *) printf '%s ago' "$value" ;;
  esac
}

cmd="${1:-errors}"
shift || true

case "$cmd" in
  errors)
    since="$(since_expr "${1:-30m}")"
    # Go: slog level=ERROR | Rust tracing ERROR | cloudflared ERR
    run_remote "journalctl --user --since '${since}' --no-pager \
      -u solarflow-go.service -u solarflow-engine.service -u cloudflared-solarflow.service -u solarflow-webhook.service \
      | grep -E 'level=ERROR|level=WARN| ERROR | WARN | ERR ' | tail -200"
    ;;
  http5xx)
    since="$(since_expr "${1:-1h}")"
    run_remote "journalctl --user --since '${since}' --no-pager -u solarflow-go.service \
      | grep -E 'status=5[0-9]{2}' | tail -200"
    ;;
  slow)
    since="$(since_expr "${1:-1h}")"
    run_remote "journalctl --user --since '${since}' --no-pager -u solarflow-engine.service \
      | grep -E 'slow statement|slow_acquire' | tail -100"
    ;;
  db)
    since="$(since_expr "${1:-1h}")"
    # Supabase/PostgREST 에러는 모두 Go 로그에 묻혀 들어온다 (PGRST, SQLSTATE, pq:, error parsing error response 등)
    run_remote "journalctl --user --since '${since}' --no-pager -u solarflow-go.service \
      | grep -iE 'pgrst|sqlstate|pq:|error parsing error response|column .* does not exist|relation .* does not exist|null value in column|duplicate key' | tail -200"
    ;;
  tail)
    unit="$(unit_for "${1:?usage: tail <go|engine|cloudflared|webhook>}")"
    run_remote "journalctl --user -f -u '${unit}' --no-pager"
    ;;
  status)
    run_remote "systemctl --user status --no-pager \
      solarflow-go.service solarflow-engine.service cloudflared-solarflow.service solarflow-webhook.service \
      | sed -n '1,80p'"
    ;;
  sync)
    run_remote "tail -n 200 '${REMOTE_REPO}/.sync.log'"
    ;;
  postdeploy)
    since="$(since_expr "${1:-30m}")"
    run_remote "
      set +e

      echo '== cron-deploy sync tail =='
      tail -n 120 '${REMOTE_REPO}/.sync.log'

      echo
      echo '== service status =='
      systemctl --user status --no-pager \
        solarflow-go.service solarflow-engine.service cloudflared-solarflow.service solarflow-webhook.service \
        | sed -n '1,120p'

      echo
      echo '== local health =='
      printf 'go     /health:       '
      curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8080/health || true
      printf 'engine /health:       '
      curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8081/health || true
      printf 'engine /health/ready: '
      curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8081/health/ready || true

      echo
      echo '== recent 5xx =='
      journalctl --user --since '${since}' --no-pager -u solarflow-go.service \
        | grep -E 'status=5[0-9]{2}' | tail -80 || true

      echo
      echo '== recent DB/PostgREST errors =='
      journalctl --user --since '${since}' --no-pager -u solarflow-go.service \
        | grep -iE 'pgrst|sqlstate|pq:|error parsing error response|column .* does not exist|relation .* does not exist|null value in column|duplicate key' \
        | tail -80 || true

      echo
      echo '== recent service restarts/failures =='
      journalctl --user --since '${since}' --no-pager \
        -u solarflow-go.service -u solarflow-engine.service -u cloudflared-solarflow.service -u solarflow-webhook.service \
        | grep -E 'Started|Stopped|Failed|Main process exited|Reloaded|Deactivated|Consumed' | tail -120 || true
    "
    ;;
  raw)
    # 임의 journalctl 인자 전달: scripts/prod-logs.sh raw -u solarflow-go.service -n 50 --no-pager
    run_remote "journalctl --user $*"
    ;;
  -h|--help|help|'')
    sed -n '1,28p' "$0"
    ;;
  *)
    echo "unknown command: $cmd" >&2
    sed -n '1,28p' "$0" >&2
    exit 2
    ;;
esac
