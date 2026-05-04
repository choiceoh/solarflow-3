#!/usr/bin/env bash
# staging-daily-sync.sh (D-122)
# 매일 03:00 KST 에 prod → staging snapshot reload.
# cron 등록:
#   0 3 * * * /home/choiceoh/공개/solarflow-3/scripts/staging/staging-daily-sync.sh

set -euo pipefail

PROD_DB="${PROD_DB:-solarflow}"
STAGING_DB="${STAGING_DB:-solarflow_staging}"
DUMP_PATH="${DUMP_PATH:-/tmp/solarflow-staging-snapshot.sql}"
LOG_DIR="${LOG_DIR:-/home/choiceoh/공개/solarflow-3/logs/staging}"

mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/sync-$(date +%Y%m%d).log"

{
  echo "[$(date -Iseconds)] === staging daily sync 시작 ==="

  # 1. staging 서비스 정지 (DB drop 중 연결 막음)
  systemctl --user stop solarflow-go-staging.service || true

  # 2. dump
  pg_dump --no-owner --no-acl -d "$PROD_DB" -f "$DUMP_PATH"
  echo "[$(date -Iseconds)] dump 완료 $(du -h "$DUMP_PATH" | cut -f1)"

  # 3. staging DB drop + 재생성 + restore
  dropdb --if-exists "$STAGING_DB"
  createdb "$STAGING_DB"
  psql -d "$STAGING_DB" -f "$DUMP_PATH" >/dev/null
  echo "[$(date -Iseconds)] restore 완료"

  # 4. 마이그레이션 자동 적용 — prod webhook 의 apply_migrations.py 와 동일 정책.
  #    이미 dump 에 포함됐을 수 있으나, snapshot 시점 이후에 추가된 마이그레이션이 있을 수 있으므로 재적용.
  if [ -x /home/choiceoh/공개/solarflow-3/scripts/apply_migrations.py ]; then
    PGDATABASE="$STAGING_DB" /home/choiceoh/공개/solarflow-3/scripts/apply_migrations.py \
      || echo "[$(date -Iseconds)] WARN: apply_migrations.py 실패 (이미 적용된 마이그레이션이면 무시 가능)"
  fi

  # 5. 서비스 재시작
  systemctl --user start solarflow-go-staging.service
  sleep 3
  if curl -sf http://localhost:8082/health >/dev/null; then
    echo "[$(date -Iseconds)] staging health 200"
  else
    echo "[$(date -Iseconds)] ERROR: staging health 실패"
    exit 1
  fi

  rm -f "$DUMP_PATH"
  echo "[$(date -Iseconds)] === staging daily sync 완료 ==="
} >> "$LOG_FILE" 2>&1
