-- @auto-apply: yes
-- 052_user_profiles_preferences.sql
-- 사용자별 환경설정(JSONB) — 표시 단위 등 개인 취향 저장.
-- 첫 사용처: 금액 단위(amount_unit), 용량 단위(capacity_unit), 모듈 장수 표시(show_ea).
-- 후속 사용처: 테마, 기본 사이드바 상태, 언어 등 (개인 설정 페이지 항목들).
--
-- 적용:
--   psql $SUPABASE_DB_URL -f backend/migrations/052_user_profiles_preferences.sql
--   psql $SUPABASE_DB_URL -c "NOTIFY pgrst, 'reload schema';"

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN user_profiles.preferences IS
  '개인 환경설정 — JSONB. 예: {"amount_unit":"auto","capacity_unit":"auto","show_ea":true}. 누락 키는 클라이언트 fallback으로 자동 기본값.';
