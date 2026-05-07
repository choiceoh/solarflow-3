-- D-142 WMS Phase 4 — Cycle Counting (정기 재고실사)
--
-- 목적: 정기적으로 위치 단위 재고를 실측 → 시스템 재고와 차이 추적 → 정확도 보드.
-- BARO 1000억 매출 환경에서 SKU 50종 × 분기 1회 점검 = 분기 200~300건 점검.
--
-- 사용 시나리오:
--   - 분기/월 시작 시 admin 이 cycle_counts 세션 생성 (warehouse_id, scheduled_date)
--   - 시스템이 해당 창고의 inventory_allocations 스냅샷 → cycle_count_items 생성
--   - 작업자가 Bin 별 실측 입력 → counted_qty / variance 자동 계산
--   - 차이 발생 시 variance_reason + 영업·회계 알림
--   - 세션 종료 시 정확도 % 자동 집계

-- ⚠️ 적용 절차:
--   psql -d solarflow -f backend/migrations/088_cycle_counts.sql
--   launchctl stop com.solarflow.postgrest && launchctl start com.solarflow.postgrest

CREATE TABLE IF NOT EXISTS cycle_counts (
  cycle_count_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES warehouses(warehouse_id),
  scheduled_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  -- 시작/종료
  started_at timestamptz,
  completed_at timestamptz,
  -- 정확도 (자동 집계 — completed 시 채움)
  total_locations integer,
  matched_locations integer,
  variance_locations integer,
  accuracy_pct numeric(5,2),
  -- 작성/관리
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  notes text
);
CREATE INDEX IF NOT EXISTS idx_cycle_counts_warehouse_date
  ON cycle_counts(warehouse_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_cycle_counts_status
  ON cycle_counts(status) WHERE status IN ('pending', 'in_progress');

CREATE TABLE IF NOT EXISTS cycle_count_items (
  item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_count_id uuid NOT NULL REFERENCES cycle_counts(cycle_count_id) ON DELETE CASCADE,
  -- 위치 (D-139)
  location_id uuid REFERENCES warehouse_locations(location_id),
  location_code_snapshot text,
  -- 품번 (D-064 보호)
  product_id uuid REFERENCES products(product_id),
  product_code_snapshot text,
  product_name_snapshot text,
  -- 수량
  expected_qty integer NOT NULL,                   -- 시스템 재고 (cycle_counts 생성 시 스냅샷)
  counted_qty integer,                             -- 작업자 실측 입력 (NULL = 미점검)
  variance_qty integer GENERATED ALWAYS AS (
    COALESCE(counted_qty, 0) - expected_qty
  ) STORED,
  -- 차이 사유
  variance_reason text CHECK (variance_reason IN (
    'shrinkage', 'damage', 'wrong_location', 'system_error', 'other'
  ) OR variance_reason IS NULL),
  variance_note text,
  -- 점검자 + 시간
  counted_by uuid REFERENCES auth.users(id),
  counted_at timestamptz,
  -- 사진 첨부
  photo_attachment_ids uuid[]
);
CREATE INDEX IF NOT EXISTS idx_cycle_count_items_session
  ON cycle_count_items(cycle_count_id);
CREATE INDEX IF NOT EXISTS idx_cycle_count_items_uncounted
  ON cycle_count_items(cycle_count_id) WHERE counted_qty IS NULL;
CREATE INDEX IF NOT EXISTS idx_cycle_count_items_variance
  ON cycle_count_items(cycle_count_id, variance_qty) WHERE variance_qty != 0;
