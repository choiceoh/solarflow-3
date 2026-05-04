-- @auto-apply: yes
-- 064_inventory_snapshots.sql
-- 정식 ERP 자료의 재고 시트를 시계열 스냅샷으로 보존 + products 마스터에 안전/가용재고 동기화.
-- 사용자 지시(D-064): 안전장치보다 데이터 최대 살림. 충돌 시 ERP가 더 신뢰도 높음.

-- 1) 시계열 스냅샷 테이블 — 추후 수불 시트도 같은 형태로 누적 가능
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  snapshot_id     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date   date        NOT NULL,
  product_id      uuid        NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  beginning_qty   integer,
  inbound_qty     integer,
  outbound_qty    integer,
  ending_qty      integer,
  safety_qty      integer,
  available_qty   integer,
  unit_factor     numeric,
  source          text        NOT NULL DEFAULT 'erp_export',
  source_payload  jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, product_id, source)
);

CREATE INDEX IF NOT EXISTS inventory_snapshots_product_date_idx
  ON inventory_snapshots (product_id, snapshot_date DESC);

COMMENT ON TABLE inventory_snapshots IS
  '재고 스냅샷 시계열 (D-064). ERP 자료·수불 시트·우리 시스템 자체 계산을 source 별로 누적.';

-- 2) products 에 안전·가용재고 컬럼 추가 (현재 시점 빠른 조회용)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS safety_stock integer,
  ADD COLUMN IF NOT EXISTS available_stock integer;

COMMENT ON COLUMN products.safety_stock IS
  '안전재고 — ERP 마스터에서 동기화. 매 import 마다 갱신.';
COMMENT ON COLUMN products.available_stock IS
  '가용재고 — ERP 기준. SolarFlow 계산 결과와 다를 수 있어 정합성 비교에 활용.';

-- 3) RLS 정합성 (다른 마스터 테이블 패턴)
ALTER TABLE inventory_snapshots DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT ON TABLE inventory_snapshots TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE inventory_snapshots TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE inventory_snapshots TO service_role;
  END IF;
END $$;
