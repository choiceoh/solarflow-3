-- 053_library_posts.sql
-- 자료실 게시글: 제목, 본문, 첨부파일(document_files entity_type=library_posts) 연결

CREATE TABLE IF NOT EXISTS library_posts (
  post_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL CHECK (length(trim(title)) > 0 AND char_length(title) <= 120),
  content    text NOT NULL CHECK (length(trim(content)) > 0 AND char_length(content) <= 5000),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_library_posts_created_at
  ON library_posts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_library_posts_created_by
  ON library_posts(created_by);

DROP TRIGGER IF EXISTS library_posts_updated_at ON library_posts;
CREATE TRIGGER library_posts_updated_at
BEFORE UPDATE ON library_posts
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DO $$
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE library_posts TO anon;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

DO $$
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE library_posts TO authenticated;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;
