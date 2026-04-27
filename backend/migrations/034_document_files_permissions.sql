-- 034_document_files_permissions.sql
-- document_files 테이블을 PostgREST API 역할에서 사용할 수 있도록 권한 부여

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE document_files TO anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE document_files TO authenticated;
  END IF;
END $$;
