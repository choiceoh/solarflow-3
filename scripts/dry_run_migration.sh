#!/usr/bin/env bash
# scripts/dry_run_migration.sh — 마이그 dry-run 표준 헬퍼
#
# 사용:
#   scripts/dry_run_migration.sh <NNN>           # dry-run (ROLLBACK)
#   scripts/dry_run_migration.sh <NNN> --apply   # 실제 적용 (COMMIT)
#
# 배경: psql `\i` 가 SQL 안의 BEGIN/COMMIT 을 그대로 실행해서
#       외부 ROLLBACK 이 무력화되는 사고 (M155 dry-run 실패) 재발 방지.
#
# 동작:
#   1. backend/migrations/NNN_*.sql 찾기
#   2. 단독 라인의 BEGIN; / COMMIT; / ROLLBACK; 제거 (subqueries / strings 내부 보존)
#   3. gx10 운영 서버로 stripped 파일 scp
#   4. ssh 로 외부 BEGIN; \i; (검증 SELECT;) ROLLBACK|COMMIT; 실행
#
# 검증 출력: memo 'M<NNN>%' 매칭 행수 (PO/LC/BL/cost_details/import_declarations).
# 추가 검증이 필요하면 --extra-check '<SQL>' 옵션으로 SELECT 한 줄 더 전달.
#
# Exit codes:
#   0 — 성공
#   1 — 인자/파일 오류
#   2 — psql 실행 오류

set -euo pipefail

if [[ $# -lt 1 ]]; then
    cat >&2 <<'EOF'
사용: scripts/dry_run_migration.sh <NNN> [--apply] [--extra-check '<SQL>']

  <NNN>       마이그 번호 (예: 155)
  --apply     ROLLBACK 대신 COMMIT 으로 실제 적용
  --extra-check  추가 검증 SELECT 한 줄 (예: "SELECT * FROM ... LIMIT 5")

예시:
  scripts/dry_run_migration.sh 156                            # dry-run
  scripts/dry_run_migration.sh 156 --apply                    # 실제 적용
  scripts/dry_run_migration.sh 156 --extra-check 'SELECT bl_number, eta FROM bl_shipments WHERE memo LIKE ''M156%'' LIMIT 5'
EOF
    exit 1
fi

NNN=$1
shift || true

APPLY=
EXTRA_CHECK=
while [[ $# -gt 0 ]]; do
    case $1 in
        --apply) APPLY=1; shift ;;
        --extra-check) EXTRA_CHECK=$2; shift 2 ;;
        *) echo "❌ 알 수 없는 옵션: $1" >&2; exit 1 ;;
    esac
done

# 1) 마이그 파일 찾기
LOCAL_FILE=$(ls backend/migrations/${NNN}_*.sql 2>/dev/null | head -1)
if [[ -z "${LOCAL_FILE:-}" ]]; then
    echo "❌ backend/migrations/${NNN}_*.sql 파일이 없습니다" >&2
    exit 1
fi
echo "📄 마이그: $LOCAL_FILE"

# 2) BEGIN/COMMIT/ROLLBACK 단독 라인 strip
#    - 정확히 BEGIN; / COMMIT; / ROLLBACK; 형식 (앞뒤 공백 허용) 만 제거
#    - subquery 내부 BEGIN / functions 내부 보존
STRIPPED=$(mktemp -t "m${NNN}_stripped.XXXXXX.sql")
trap 'rm -f "$STRIPPED"' EXIT

sed -E '
    /^[[:space:]]*BEGIN[[:space:]]*;[[:space:]]*$/d
    /^[[:space:]]*COMMIT[[:space:]]*;[[:space:]]*$/d
    /^[[:space:]]*ROLLBACK[[:space:]]*;[[:space:]]*$/d
' "$LOCAL_FILE" > "$STRIPPED"

STRIPPED_COUNT=$(grep -cE '^[[:space:]]*(BEGIN|COMMIT|ROLLBACK)[[:space:]]*;[[:space:]]*$' "$LOCAL_FILE" || true)
echo "✂️  trans 키워드 단독 라인 ${STRIPPED_COUNT}개 strip됨"

# 3) 액션 결정
if [[ -n "$APPLY" ]]; then
    FINAL="COMMIT;"
    MODE_ICON="🚀"
    MODE_LABEL="실제 적용"
else
    FINAL="ROLLBACK;"
    MODE_ICON="🔬"
    MODE_LABEL="Dry-run (변경 없음)"
fi
echo "${MODE_ICON} ${MODE_LABEL}"

# 4) scp + ssh 실행
REMOTE_PATH="/tmp/m${NNN}_stripped.sql"
scp -q "$STRIPPED" "choiceoh@100.105.145.6:${REMOTE_PATH}"

EXTRA_SQL=""
if [[ -n "$EXTRA_CHECK" ]]; then
    EXTRA_SQL="
-- extra check
${EXTRA_CHECK};"
fi

ssh choiceoh@100.105.145.6 "cd ~/공개/solarflow-3 && set -a && . engine/.env && set +a && \
  psql \"\$SUPABASE_DB_URL\" -v ON_ERROR_STOP=1 -X" <<PSQL || { echo "❌ psql 실행 실패" >&2; exit 2; }
BEGIN;
\i ${REMOTE_PATH}

-- ─── M${NNN} memo 매칭 행수 ──────────────────────────────
SELECT 'PO M${NNN}'  AS kind, COUNT(*) AS n FROM purchase_orders        WHERE memo LIKE '%M${NNN}%'
UNION ALL SELECT 'LC',                  COUNT(*) FROM lc_records             WHERE memo LIKE '%M${NNN}%'
UNION ALL SELECT 'BL',                  COUNT(*) FROM bl_shipments           WHERE memo LIKE '%M${NNN}%'
UNION ALL SELECT 'BL_LINE',             COUNT(*) FROM bl_line_items          WHERE memo LIKE '%M${NNN}%'
UNION ALL SELECT 'DECL',                COUNT(*) FROM import_declarations    WHERE memo LIKE '%M${NNN}%'
UNION ALL SELECT 'COST',                COUNT(*) FROM cost_details           WHERE memo LIKE '%M${NNN}%'
UNION ALL SELECT 'OUT',                 COUNT(*) FROM outbounds              WHERE memo LIKE '%M${NNN}%'
UNION ALL SELECT 'INB',                 COUNT(*) FROM inbounds               WHERE memo LIKE '%M${NNN}%'
UNION ALL SELECT 'INCID',               COUNT(*) FROM incidental_expenses    WHERE memo LIKE '%M${NNN}%';
${EXTRA_SQL}
${FINAL}
PSQL

if [[ -z "$APPLY" ]]; then
    echo
    echo "✅ Dry-run 완료. 위 카운트가 예상치와 맞으면 --apply 로 재실행하세요:"
    echo "    scripts/dry_run_migration.sh ${NNN} --apply"
else
    echo
    echo "✅ 적용 완료. memo 'M${NNN}%' 로 추적 가능."
fi
