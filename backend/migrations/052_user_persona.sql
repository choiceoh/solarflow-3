-- 052_user_persona.sql
-- D-112: 사이드바 탭(persona) 시스템 — 사용자별 "주력 업무" 컬럼.
--   탭 정의는 system_settings의 sidebar_tabs.{tenant} key에 저장되며 admin이 자유 편집한다.
--   user_profiles.persona는 그 탭 정의의 key 문자열을 가리킨다(예: 'import', 'sales', 'finance').
--   NULL이면 탭 정의의 default_tab으로 fallback. 탭이 사라지거나 리네임되면 자동 default 폴백.
--
-- 적용 절차 (CLAUDE.md "Go 모델 필드 변경 시 필수 절차" 참조):
--   psql -d solarflow -f backend/migrations/052_user_persona.sql
--   launchctl stop com.solarflow.postgrest && launchctl start com.solarflow.postgrest
--   cd backend && ./scripts/check_schema.sh

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS persona text;

COMMENT ON COLUMN user_profiles.persona IS
  'D-112: 사용자가 마지막으로 선택한 사이드바 탭 key. NULL이면 system_settings.sidebar_tabs.{tenant}의 default_tab fallback. 탭 정의 변경 시 dangling 가능 → 프론트에서 탭 목록 미존재 시 default로 자동 폴백.';
