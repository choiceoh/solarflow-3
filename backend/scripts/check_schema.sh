#!/usr/bin/env bash
# check_schema.sh — Go 모델 ↔ DB 컬럼 동기화 검증 (얇은 shim).
#
# 본 스크립트는 PR #855/#865 의 schema codegen 시스템 도입 이후
# scripts/gen_db_types.ts --check 의 thin wrapper 다 — 기존 호출자
# (migrate.sh, verify_changed.sh, verify_all.sh, .claude/hooks/domains.json,
# harness/domains/*.yaml) 호환성을 위해 진입점만 유지한다.
#
# 동작
#   1. repo root 로 이동
#   2. backend/.env 자동 source (호출자가 안 했을 경우)
#   3. bun scripts/gen_db_types.ts --check 실행
#      → generated 산출물 (backend/internal/dbschema/tables.gen.go,
#        frontend/src/types/db.gen.ts) 가 운영 DB introspection 과 일치하는지 검증
#
# 이전 동작 (이 파일이 macOS-only psql + grep/awk 로 직접 비교하던 것) 은
# stale 한 `internal/model/` 경로를 참조해 사실상 무력화됐다. 새 시스템은
# DB 를 *정본으로 코드 생성* 하므로 비교가 아니라 *재생성 + diff* 다.
#
# 종료 코드
#   0  통과 (또는 친절 skip — SUPABASE_DB_URL 미설정 시)
#   1  generated 산출물과 DB introspection 불일치
#   2  실행 환경 문제 (bun 미설치 등)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

if [[ -z "${SUPABASE_DB_URL:-}" && -f backend/.env ]]; then
  # shellcheck disable=SC1091
  set -a; . backend/.env; set +a
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "❌ bun 미설치 — scripts/gen_db_types.ts 를 실행할 수 없음" >&2
  echo "   설치: https://bun.com  (또는 PATH 확인: ~/.bun/bin)" >&2
  exit 2
fi

exec bun scripts/gen_db_types.ts --check
