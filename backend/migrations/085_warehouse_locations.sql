-- D-139 WMS Phase 1 — 창고 내 위치(Bin/Location) 관리
--
-- 목적: 창고 < 존(Zone) < 통로(Aisle) < 랙(Rack) < 빈(Bin) 4단계 위치 트리.
-- BARO/탑솔라/케이블 모두에 노출 (master.warehouse_location, 모든 테넌트 공유).
--
-- 초기 사용 시나리오:
--   - 영업이 출고 1건당 "A존-3랙-Bin12 에서 30장" 위치 추적
--   - 입고 시 패널 적재 위치 배정
--   - 재고실사 시 위치 단위 점검 (Phase 4 cycle counting)
--
-- ⚠️ 적용 절차:
--   psql -d solarflow -f backend/migrations/085_warehouse_locations.sql
--   launchctl stop com.solarflow.postgrest && launchctl start com.solarflow.postgrest

CREATE TABLE IF NOT EXISTS warehouse_locations (
  location_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES warehouses(warehouse_id) ON DELETE CASCADE,
  -- 4단계 계층 (NULL 허용 — 일부 단계 생략 가능, 예: 작은 창고는 Zone-Bin 만)
  zone text,                                       -- 예: 'A', 'B', 'OUTDOOR'
  aisle text,                                      -- 예: '01', '02', 'MAIN'
  rack text,                                       -- 예: 'R03', 'GROUND'
  bin text,                                        -- 예: 'B12', 'PILE-1'
  -- 합성 코드 (warehouse 내 unique) — 사람이 읽는 식별자
  location_code text NOT NULL,                     -- 예: 'A-01-R03-B12'
  -- 용량 / 제약
  capacity_qty integer,                            -- 패널 장 수 한도 (NULL = 미설정)
  weight_capacity_kg numeric,                      -- 무게 한도 (NULL)
  -- 위치 속성
  location_type text NOT NULL DEFAULT 'storage'
    CHECK (location_type IN ('storage', 'staging', 'receiving', 'shipping', 'damaged', 'reserved')),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (warehouse_id, location_code)
);
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_warehouse
  ON warehouse_locations(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_active
  ON warehouse_locations(warehouse_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_zone
  ON warehouse_locations(warehouse_id, zone) WHERE zone IS NOT NULL;
