#!/usr/bin/env bash
# check_schema.sh — Create/Update Request 구조체의 JSON 태그 vs 실제 DB 컬럼 불일치 탐지
# 사용법: cd backend && ./scripts/check_schema.sh
# 목적: "모델에는 있는데 DB에 없는 컬럼" → PGRST204 (500 에러) 사전 차단
#
# 핵심 원칙: Response 구조체(Join 결과 포함)는 검사 제외.
#           DB에 직접 쓰는 Create*Request / Update*Request만 대상.
set -uo pipefail

DB="${DB_NAME:-solarflow}"
MODELS_DIR="$(dirname "$0")/../internal/model"
FAIL=0

# Go 파일에서 특정 struct 블록의 json 태그만 추출
# 인자: 파일경로, struct 이름 패턴 (awk로 해당 struct {} 블록만 스캔)
extract_struct_tags() {
  local file="$1"
  local struct_name="$2"
  awk "/^type ${struct_name} struct/,/^}/" "$file" \
    | grep -oE 'json:"[^"]+"' \
    | sed 's/json:"//;s/"//' \
    | sed 's/,omitempty//' \
    | grep -v '^-$' \
    | grep -v '^$' \
    | sort -u
}

# DB 컬럼과 비교
check_struct() {
  local table="$1"
  local file="$2"
  local struct_pattern="$3"   # awk 매칭용 struct 이름 (정규식 가능)

  local db_cols
  db_cols=$(psql -d "$DB" -Atc \
    "SELECT column_name FROM information_schema.columns WHERE table_name='$table' ORDER BY column_name;" 2>/dev/null)

  if [[ -z "$db_cols" ]]; then
    echo "⚠️  테이블 없음: $table"
    FAIL=1; return
  fi

  local missing=()
  while IFS= read -r col; do
    [[ -z "$col" ]] && continue
    if ! echo "$db_cols" | grep -qx "$col"; then
      missing+=("$col")
    fi
  done < <(extract_struct_tags "$file" "$struct_pattern")

  local label="${struct_pattern} → ${table}"
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "❌ ${label}"
    echo "   DB에 없는 컬럼: ${missing[*]}"
    FAIL=1
  else
    echo "✅ ${label}"
  fi
}

echo "=== Create/Update Request 구조체 ↔ DB 컬럼 동기화 검사 ==="
echo ""

# po_line_items
check_struct "po_line_items" "$MODELS_DIR/po_line.go"  "CreatePOLineRequest"
check_struct "po_line_items" "$MODELS_DIR/po_line.go"  "UpdatePOLineRequest"

# purchase_orders
check_struct "purchase_orders" "$MODELS_DIR/po.go" "CreatePurchaseOrderRequest"
check_struct "purchase_orders" "$MODELS_DIR/po.go" "UpdatePurchaseOrderRequest"

# lc_records
check_struct "lc_records" "$MODELS_DIR/lc.go" "CreateLCRequest"
check_struct "lc_records" "$MODELS_DIR/lc.go" "UpdateLCRequest"

# tt_remittances
check_struct "tt_remittances" "$MODELS_DIR/tt.go" "CreateTTRequest"
check_struct "tt_remittances" "$MODELS_DIR/tt.go" "UpdateTTRequest"

# bl_shipments (B/L 메인 테이블)
if [[ -f "$MODELS_DIR/bl.go" ]]; then
  check_struct "bl_shipments" "$MODELS_DIR/bl.go" "CreateBLRequest"
  check_struct "bl_shipments" "$MODELS_DIR/bl.go" "UpdateBLRequest"
fi

# inventory_allocations
if [[ -f "$MODELS_DIR/inventory_allocation.go" ]]; then
  check_struct "inventory_allocations" "$MODELS_DIR/inventory_allocation.go" "CreateInventoryAllocationRequest"
  check_struct "inventory_allocations" "$MODELS_DIR/inventory_allocation.go" "UpdateInventoryAllocationRequest"
fi

echo ""
if [[ $FAIL -eq 1 ]]; then
  echo "💥 불일치 발견 — 아래 절차를 따르세요:"
  echo "   1. backend/migrations/NNN_설명.sql 파일 작성"
  echo "   2. psql -d solarflow -f backend/migrations/NNN_설명.sql"
  echo "   3. launchctl stop com.solarflow.postgrest && launchctl start com.solarflow.postgrest"
  exit 1
else
  echo "✅ 모든 Request 구조체 동기화 정상"
fi
