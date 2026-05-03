-- 053: 박물관 표본 (튜토리얼 데이터) 격리 마커
--
-- Q12·Q13 결정: is_sandbox boolean 컬럼 + Frontend가 응답에서 읽어 readonly 처리.
-- 시드 데이터는 054_onboarding_sandbox_seed.sql 참조.
--
-- 운영 적용:
--   psql -d solarflow -f backend/migrations/053_onboarding_sandbox.sql
--   psql -d solarflow -f backend/migrations/054_onboarding_sandbox_seed.sql
--   systemctl --user restart solarflow-postgrest

ALTER TABLE partners              ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;
ALTER TABLE purchase_orders       ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;
ALTER TABLE po_line_items         ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;
ALTER TABLE lc_records            ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;
ALTER TABLE lc_line_items         ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;
ALTER TABLE bl_shipments          ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;
ALTER TABLE bl_line_items         ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;
ALTER TABLE import_declarations   ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;
ALTER TABLE cost_details          ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;

-- 99.9% 쿼리는 is_sandbox=false 이므로 partial index가 효율적.
CREATE INDEX IF NOT EXISTS idx_partners_real            ON partners(partner_id)            WHERE is_sandbox = false;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_real     ON purchase_orders(po_id)          WHERE is_sandbox = false;
CREATE INDEX IF NOT EXISTS idx_po_line_items_real       ON po_line_items(po_id)            WHERE is_sandbox = false;
CREATE INDEX IF NOT EXISTS idx_lc_records_real          ON lc_records(lc_id)               WHERE is_sandbox = false;
CREATE INDEX IF NOT EXISTS idx_bl_shipments_real        ON bl_shipments(bl_id)             WHERE is_sandbox = false;
CREATE INDEX IF NOT EXISTS idx_import_declarations_real ON import_declarations(declaration_id) WHERE is_sandbox = false;
CREATE INDEX IF NOT EXISTS idx_cost_details_real        ON cost_details(cost_id)           WHERE is_sandbox = false;

-- PostgREST 자동 필터(view 이전)는 별도 PR — 운영 위생 작업으로 분리.
-- 현 PR에서는 시드 데이터의 partner_name에 _TUTORIAL_ prefix를 박아 운영자가 시각 식별 가능.
