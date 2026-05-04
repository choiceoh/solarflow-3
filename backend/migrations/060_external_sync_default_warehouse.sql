-- @auto-apply: yes
-- 060_external_sync_default_warehouse.sql
-- D-059 PR 10: 자동 모드의 창고 매칭이 마스터에 정확 1개일 때만 동작했는데
-- 운영 마스터에 9개 창고가 있어 모든 행이 창고 단계에서 SKIP. 시트별 기본 창고
-- 지정으로 해결.

ALTER TABLE external_sync_sources
  ADD COLUMN IF NOT EXISTS default_warehouse_id uuid REFERENCES warehouses(warehouse_id) ON DELETE SET NULL;

COMMENT ON COLUMN external_sync_sources.default_warehouse_id IS
  '시트에 창고 정보가 없을 때 자동 모드가 채택할 기본 창고. NULL이면 자동 모드 SKIP.';
