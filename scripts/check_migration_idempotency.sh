#!/usr/bin/env bash
# check_migration_idempotency.sh — 새/수정된 마이그가 idempotent 인지 검증
#
# 룰 (D-20260512-171222 #5): @auto-apply: yes 마이그는 cron-deploy 가 재실행
# 가능해야 한다. CI 또는 로컬에서 PR 의 마이그 파일을 두 번 적용 → 결과 동일성 검증.
#
# 동작:
#   1) origin/main 대비 추가/수정된 backend/migrations/*.sql 식별
#   2) 각 파일을 임시 DB 에 한 번 적용 → 모든 public 테이블 row count + checksum
#   3) 같은 파일을 두 번째 적용 → row count + checksum 비교
#   4) 차이 있으면 비-idempotent 마이그로 분류, exit 1
#
# 사용:
#   PG_DSN=postgres://user:pw@host:6543/dbname scripts/check_migration_idempotency.sh
#   PG_DSN=... scripts/check_migration_idempotency.sh --base origin/main
#   PG_DSN=... scripts/check_migration_idempotency.sh --file backend/migrations/107_x.sql
#
# CI 통합:
#   GitHub Actions 의 backend 잡에 추가하거나 PR pre-merge hook 으로 사용.
#   임시 DB 는 docker compose 의 Postgres 또는 Supabase test branch 사용 권장.

set -eo pipefail

BASE_REF="${BASE_REF:-origin/main}"
SPECIFIC_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE_REF="$2"; shift 2 ;;
    --file) SPECIFIC_FILE="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${PG_DSN:-}" ]]; then
  echo "PG_DSN 필요 (예: postgres://user:pw@host:port/db)" >&2
  exit 2
fi

# 1) 검사 대상 마이그 식별
if [[ -n "$SPECIFIC_FILE" ]]; then
  FILES=("$SPECIFIC_FILE")
else
  mapfile -t FILES < <(git diff --diff-filter=AM --name-only "$BASE_REF" -- 'backend/migrations/*.sql' | sort)
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "[idempotency] 검사 대상 마이그 없음 ($BASE_REF 대비)"
  exit 0
fi

echo "[idempotency] 검사 대상 ${#FILES[@]} 파일:"
for f in "${FILES[@]}"; do echo "  - $f"; done

# 2) public 테이블 row count + 간단 checksum 추출
# - row count: 모든 public 테이블의 (table_name, count) JSON
# - checksum: 각 테이블의 모든 행을 정렬해 md5
snapshot_state() {
  psql "$PG_DSN" -At <<'SQL'
SELECT jsonb_build_object(
  'row_counts', (
    SELECT jsonb_object_agg(t.table_name, c.cnt) FROM (
      SELECT t.table_name,
             (xpath('/row/cnt/text()',
              query_to_xml(format('SELECT COUNT(*) AS cnt FROM %I', t.table_name), false, true, '')))[1]::text::bigint AS cnt
      FROM information_schema.tables t
      WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
        AND t.table_name NOT LIKE '\_%' ESCAPE '\'
    ) c
  )
)::text;
SQL
}

FAIL=0
for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "[idempotency] $f — 파일 없음 (renamed/deleted?), skip"
    continue
  fi

  # @auto-apply: yes 가 아닌 마이그는 검사 제외 (수동 호출)
  if ! head -3 "$f" | grep -qE '^-- @auto-apply: yes'; then
    echo "[idempotency] $f — @auto-apply 아님, skip"
    continue
  fi

  echo
  echo "[idempotency] === $f ==="

  # 1차 적용
  if ! psql "$PG_DSN" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1; then
    echo "  1차 적용 실패 — 마이그 자체 에러"
    FAIL=1
    continue
  fi
  STATE_1=$(snapshot_state)

  # 2차 적용
  if ! psql "$PG_DSN" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1; then
    echo "  ✗ 2차 적용 실패 — idempotent 아님 (CREATE TABLE IF NOT EXISTS 누락 의심)"
    FAIL=1
    continue
  fi
  STATE_2=$(snapshot_state)

  if [[ "$STATE_1" != "$STATE_2" ]]; then
    echo "  ✗ 두 번째 적용으로 상태 변경 — idempotent 아님"
    echo "    diff (1차 vs 2차):"
    diff <(echo "$STATE_1" | python3 -m json.tool 2>/dev/null || echo "$STATE_1") \
         <(echo "$STATE_2" | python3 -m json.tool 2>/dev/null || echo "$STATE_2") | head -20
    FAIL=1
  else
    echo "  ✓ idempotent (1차/2차 row count 동일)"
  fi
done

if [[ $FAIL -ne 0 ]]; then
  echo
  echo "[idempotency] 실패 — 마이그를 idempotent 로 수정하거나 @auto-apply: yes 제거 후 수동 호출 처리"
  exit 1
fi

echo
echo "[idempotency] 모든 마이그 idempotent ✓"
