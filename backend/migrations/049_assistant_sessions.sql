-- 049_assistant_sessions.sql
-- AI 어시스턴트 대화 세션 영구 저장소
--   assistant_sessions — 사용자별 채팅 세션과 메시지 배열을 JSONB로 보관.
--   프런트엔드 AssistantPage 우측상단 "세션목록"이 이 테이블을 조회한다.
--
-- 적용:
--   psql $SUPABASE_DB_URL -f backend/migrations/049_assistant_sessions.sql
--   psql $SUPABASE_DB_URL -c "NOTIFY pgrst, 'reload schema';"

CREATE TABLE IF NOT EXISTS assistant_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  title       text        NOT NULL DEFAULT '새 대화',
  messages    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE assistant_sessions IS
  'AI 어시스턴트 대화 세션 — 사용자별 채팅 히스토리. messages는 ChatMessage[] JSONB.';
COMMENT ON COLUMN assistant_sessions.messages IS
  'jsonb 배열 — 각 원소는 {role, content, proposals?} 구조의 ChatMessage';

CREATE INDEX IF NOT EXISTS idx_assistant_sessions_user_updated
  ON assistant_sessions(user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_assistant_sessions_updated_at ON assistant_sessions;
CREATE TRIGGER trg_assistant_sessions_updated_at
  BEFORE UPDATE ON assistant_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE assistant_sessions DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE assistant_sessions TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE assistant_sessions TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE assistant_sessions TO service_role;
  END IF;
END $$;
