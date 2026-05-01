-- 044_dispatch_routes.sql
-- BARO Phase 4 — 출고 배차/일정 보드
--   유통 운영의 일 단위 배송: 배송일 × 차량 × 기사 단위로 출고를 묶어
--   "오늘 어디로 어떤 차량이 가는가"를 한 보드에서 본다.
--
-- 적용:
--   psql $SUPABASE_DB_URL -f backend/migrations/044_dispatch_routes.sql
--   psql $SUPABASE_DB_URL -c "NOTIFY pgrst, 'reload schema';"

CREATE TABLE IF NOT EXISTS dispatch_routes (
  route_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_date      date NOT NULL,
  vehicle_type    text,        -- '카고', '윙바디', '5톤' 등 자유 입력
  vehicle_plate   text,        -- 차량 번호판
  driver_name     text,
  driver_phone    text,
  status          text NOT NULL DEFAULT 'planned',
  memo            text,
  tenant_scope    text NOT NULL DEFAULT 'baro',
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatch_routes_status_check
    CHECK (status IN ('planned', 'dispatched', 'completed', 'cancelled')),
  CONSTRAINT dispatch_routes_tenant_scope_check
    CHECK (tenant_scope = 'baro')
);

COMMENT ON TABLE dispatch_routes IS
  'BARO Phase 4: 일 단위 배차 묶음 (배송일 × 차량 × 기사). RequireTenantScope("baro")로 격리.';

CREATE INDEX IF NOT EXISTS idx_dispatch_routes_date
  ON dispatch_routes(route_date DESC, status);

DROP TRIGGER IF EXISTS dispatch_routes_updated_at ON dispatch_routes;
CREATE TRIGGER dispatch_routes_updated_at
  BEFORE UPDATE ON dispatch_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- outbounds에 배차 FK
ALTER TABLE outbounds
  ADD COLUMN IF NOT EXISTS dispatch_route_id uuid
    REFERENCES dispatch_routes(route_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_outbounds_dispatch_route
  ON outbounds(dispatch_route_id) WHERE dispatch_route_id IS NOT NULL;

COMMENT ON COLUMN outbounds.dispatch_route_id IS
  'BARO Phase 4: 같은 차량 같은 날 묶음 출고. NULL=미배차.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dispatch_routes TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dispatch_routes TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dispatch_routes TO service_role;
  END IF;
END $$;
