-- 051_system_settings.sql
-- 사이트 단위 전역 설정 저장소 — key/value JSONB 패턴.
-- 첫 사용처: 메뉴 가시성 (key='menu_visibility', value={"hidden": ["approval", ...]})
-- 후속 사용처: 공지 배너, 회사 식별, 기본 환율 등 (사이트 설정 placeholder 항목들)
--
-- 적용:
--   psql $SUPABASE_DB_URL -f backend/migrations/051_system_settings.sql
--   psql $SUPABASE_DB_URL -c "NOTIFY pgrst, 'reload schema';"

CREATE TABLE IF NOT EXISTS system_settings (
  key         text        PRIMARY KEY,
  value       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid        REFERENCES user_profiles(user_id) ON DELETE SET NULL
);

COMMENT ON TABLE system_settings IS
  '사이트 단위 전역 설정 저장소 — key/value JSONB. admin이 변경하면 모든 사용자에게 영향.';
COMMENT ON COLUMN system_settings.key IS
  '설정 식별자 (예: ''menu_visibility'', ''announcement_banner'', ''default_exchange_rate'')';
COMMENT ON COLUMN system_settings.value IS
  'JSONB payload — key별로 스키마가 다름 (예: menu_visibility = {"hidden": ["approval"]})';

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION sf_touch_system_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON system_settings;
CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION sf_touch_system_settings_updated_at();

-- PostgREST 권한
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE system_settings TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE system_settings TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE system_settings TO service_role;
  END IF;
END $$;
