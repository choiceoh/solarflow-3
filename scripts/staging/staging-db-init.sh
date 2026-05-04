#!/usr/bin/env bash
# staging-db-init.sh (D-122)
# 1회 staging DB 생성 + prod snapshot 적재.
#
# 멱등하지 않다 — 재실행 시 staging DB 가 이미 있으면 에러. 의도적: drop 은 명시적
# staging-down.sh 또는 daily-sync 가 담당. 실수 drop 방지.
#
# 전제:
#   - postgres 가 localhost 에 떠 있음
#   - 현재 사용자가 prod DB(`solarflow`)에 SELECT 권한
#   - 같은 사용자가 staging DB 만들 권한 (CREATEDB)

set -euo pipefail

PROD_DB="${PROD_DB:-solarflow}"
STAGING_DB="${STAGING_DB:-solarflow_staging}"
DUMP_PATH="${DUMP_PATH:-/tmp/solarflow-staging-snapshot.sql}"

echo "[$(date -Iseconds)] staging DB 초기 생성: $STAGING_DB"

# 이미 존재하는지 확인 — 있으면 중단
if psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$STAGING_DB'" | grep -q 1; then
  echo "ERROR: $STAGING_DB 이미 존재 — drop 하려면 staging-down.sh 사용"
  exit 1
fi

# prod 에서 dump (--no-owner: staging 사용자가 prod 와 다를 수 있음 / --no-acl: GRANT 재현 스킵)
echo "[$(date -Iseconds)] prod($PROD_DB) snapshot 시작"
pg_dump --no-owner --no-acl -d "$PROD_DB" -f "$DUMP_PATH"
echo "[$(date -Iseconds)] dump 완료: $(du -h "$DUMP_PATH" | cut -f1)"

# staging DB 생성 + restore
createdb "$STAGING_DB"
echo "[$(date -Iseconds)] $STAGING_DB 생성, restore 시작"
psql -d "$STAGING_DB" -f "$DUMP_PATH" >/dev/null

echo "[$(date -Iseconds)] 완료. row count 검증:"
psql -d "$STAGING_DB" -c "SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM partners) AS partners, (SELECT COUNT(*) FROM lc_records) AS lcs;"

rm -f "$DUMP_PATH"
echo "[$(date -Iseconds)] dump 파일 정리 완료"
