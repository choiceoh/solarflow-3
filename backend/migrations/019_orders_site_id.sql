-- 019: orders 테이블에 공사현장 FK 추가
-- 수주와 공사현장 마스터를 연결 — nullable (수주 시 현장 미확정 허용)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS site_id UUID
  REFERENCES construction_sites(site_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_site_id ON orders(site_id) WHERE site_id IS NOT NULL;

COMMENT ON COLUMN orders.site_id IS '공사현장 마스터 FK — nullable, 현장 미확정 수주는 NULL';
