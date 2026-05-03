-- @auto-apply: yes
-- 053_cable_tenant_scope.sql
-- D-119: cable.topworks.ltd를 module.topworks.ltd의 독립 테넌트 분기로 추가한다.
--   cable은 user_profiles.tenant_scope='cable'로 식별한다.
--   초기 기능 표면은 module(topsolar) 계열을 포크하므로 기존 수입/금융/원가 가드는
--   topsolar와 cable을 함께 허용하고, BARO 전용 가드는 계속 baro만 허용한다.
--
-- 적용:
--   psql $SUPABASE_DB_URL -f backend/migrations/053_cable_tenant_scope.sql
--   psql $SUPABASE_DB_URL -c "NOTIFY pgrst, 'reload schema';"

ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_tenant_scope_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_tenant_scope_check
  CHECK (tenant_scope IN ('topsolar', 'cable', 'baro'));

COMMENT ON COLUMN user_profiles.tenant_scope IS
  'D-119: 사용자가 속한 앱 테넌트(topsolar/cable/baro). cable은 cable.topworks.ltd의 독립 분기이며 module(topsolar) 기능 표면을 포크한다. baro 사용자는 수입원가/LC/면장/T/T/한도/단가 이력/부대비용/마진 등 1단계 차단 엔드포인트의 응답을 받지 못한다.';
