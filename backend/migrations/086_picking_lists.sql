-- D-140 WMS Phase 2 — 위치별 재고 + 피킹 리스트
--
-- 목적: 출고 1건당 "어디서 몇 장 꺼낼지" 자동 명세 생성.
-- D-139 warehouse_locations(Bin 단위) 위에 inventory_allocations.location_id 추가 +
-- picking_lists + picking_list_items 테이블.
--
-- 사용 시나리오:
--   - 영업 수주 → 출고 생성 → 시스템이 가용재고 위치 기반 자동 피킹 명세 작성
--   - 창고 작업자가 모바일/태블릿으로 picking_lists 화면 열고 위치별 수량 확인
--   - 픽 완료 시 picked_qty 갱신 → 차이 발생 시 picker 메모 + 알림
--
-- ⚠️ 적용 절차:
--   psql -d solarflow -f backend/migrations/086_picking_lists.sql
--   launchctl stop com.solarflow.postgrest && launchctl start com.solarflow.postgrest

-- 1. inventory_allocations 에 location_id 추가 (어느 Bin 에 어느 SKU 가 있는지 추적)
ALTER TABLE inventory_allocations
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES warehouse_locations(location_id);

CREATE INDEX IF NOT EXISTS idx_inventory_allocations_location
  ON inventory_allocations(location_id) WHERE location_id IS NOT NULL;

-- 2. picking_lists — 출고 1건 = 피킹 명세 1건
CREATE TABLE IF NOT EXISTS picking_lists (
  picking_list_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbound_id uuid,                                -- 출고 FK (nullable, 수동 생성 가능)
  dispatch_route_id uuid,                          -- 배차 묶음 (BARO Phase 4)
  warehouse_id uuid NOT NULL REFERENCES warehouses(warehouse_id),
  partner_id uuid REFERENCES partners(partner_id), -- 거래처 (snapshot)
  partner_name_snapshot text,                      -- 명세 인쇄 시 유지
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  -- 작업자 매핑 (NULL = 미배정)
  picker_user_id uuid REFERENCES auth.users(id),
  -- 시간 추적
  created_at timestamptz NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES auth.users(id),
  started_at timestamptz,                          -- 작업자가 picking 시작 클릭
  completed_at timestamptz,                        -- 모든 라인 picked
  -- 메모 / 차이 사유
  notes text
);
CREATE INDEX IF NOT EXISTS idx_picking_lists_outbound
  ON picking_lists(outbound_id) WHERE outbound_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_picking_lists_status
  ON picking_lists(status) WHERE status IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_picking_lists_picker
  ON picking_lists(picker_user_id) WHERE picker_user_id IS NOT NULL;

-- 3. picking_list_items — 명세 라인 (위치별 수량)
CREATE TABLE IF NOT EXISTS picking_list_items (
  item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  picking_list_id uuid NOT NULL REFERENCES picking_lists(picking_list_id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  -- product 정보 (snapshot — picking 시점 보존)
  product_id uuid REFERENCES products(product_id),
  product_code_snapshot text,
  product_name_snapshot text,
  spec_wp_snapshot integer,
  -- 위치 정보 (warehouse_locations FK, snapshot 도 보존)
  location_id uuid REFERENCES warehouse_locations(location_id),
  location_code_snapshot text,                    -- 'A-01-R03-B12'
  -- 수량
  quantity_planned integer NOT NULL CHECK (quantity_planned > 0),
  quantity_picked integer NOT NULL DEFAULT 0 CHECK (quantity_picked >= 0),
  -- 상태
  is_picked boolean NOT NULL DEFAULT false,
  picked_at timestamptz,
  picked_by uuid REFERENCES auth.users(id),
  -- 차이 사유 (실재고 부족 / 파손 / 위치 오류)
  variance_note text
);
CREATE INDEX IF NOT EXISTS idx_picking_list_items_list
  ON picking_list_items(picking_list_id);
CREATE INDEX IF NOT EXISTS idx_picking_list_items_unpicked
  ON picking_list_items(picking_list_id) WHERE is_picked = false;
