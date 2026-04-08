-- 009_postgrest_reload_schema.sql
-- 목적: ALTER TABLE bl_line_items ADD COLUMN po_line_id 이후
--       PostgREST schema cache가 새 컬럼을 인식하도록 강제 재로드.
-- 사유: PGRST204 "Could not find the 'po_line_id' column of 'bl_line_items' in the schema cache"
-- 환경: 로컬 Mac mini PostgreSQL + 로컬 PostgREST(com.solarflow.postgrest)
-- 참고: D-087 / Phase A — bl_line_items.po_line_id (nullable, FK to po_line_items)
--
-- 실행 (택1):
--   1) psql -d solarflow -f backend/migrations/009_postgrest_reload_schema.sql
--   2) psql -d solarflow -c "NOTIFY pgrst, 'reload schema';"
--   3) launchctl stop com.solarflow.postgrest && launchctl start com.solarflow.postgrest
--      (NOTIFY가 안 먹으면 서비스 재시작이 가장 확실)

-- 1) PostgREST schema cache 재로드 트리거
NOTIFY pgrst, 'reload schema';

-- 2) 컬럼 존재 검증
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'bl_line_items'
   AND column_name = 'po_line_id';

-- 3) FK 검증
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'bl_line_items'::regclass
   AND contype = 'f';
