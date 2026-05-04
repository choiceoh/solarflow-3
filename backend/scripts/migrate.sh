#!/usr/bin/env bash
# migrate.sh — 단일 마이그레이션 파일을 적용하고 PostgREST 캐시를 reload.
# 사용법: cd backend && ./scripts/migrate.sh migrations/067_xxx.sql
#         또는 ./scripts/migrate.sh 067_xxx.sql (migrations/ 자동 prefix)
#
# 단계:
#   1. psql -f <file>  — SQL 적용
#   2. NOTIFY pgrst, 'reload schema'  — 클라우드/로컬 PostgREST 캐시 갱신
#   3. ./scripts/check_schema.sh  — Go 모델 vs DB 컬럼 동기화 검증
#
# 환경변수:
#   SUPABASE_DB_URL  (backend/.env) — 필수
#   PGPASSWORD       (선택, URL에 password 없을 때)
#   DB_NAME          (선택, check_schema.sh 용, 기본 solarflow)

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <migration-file>" >&2
  echo "  e.g. $0 migrations/067_add_foo.sql" >&2
  echo "       $0 067_add_foo.sql" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_ROOT"

INPUT="$1"
if [ -f "$INPUT" ]; then
  FILE="$INPUT"
elif [ -f "migrations/$INPUT" ]; then
  FILE="migrations/$INPUT"
else
  echo "migration file not found: $INPUT" >&2
  exit 2
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  if [ -f .env ]; then
    # shellcheck disable=SC1091
    set -a; . .env; set +a
  fi
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "SUPABASE_DB_URL not set (check backend/.env)" >&2
  exit 2
fi

echo "[1/3] applying $FILE"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$FILE"

echo "[2/3] reloading PostgREST schema cache"
psql "$SUPABASE_DB_URL" -c "NOTIFY pgrst, 'reload schema';" >/dev/null

echo "[3/3] verifying Go model <-> DB column sync"
./scripts/check_schema.sh
