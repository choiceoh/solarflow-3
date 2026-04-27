-- 033_document_files.sql
-- 업무 데이터에 연결되는 PDF 첨부파일 메타데이터
-- 실제 파일은 로컬 파일시스템에 저장하고, DB에는 추적 정보만 둔다.

CREATE TABLE IF NOT EXISTS document_files (
  file_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   text NOT NULL,
  entity_id     uuid NOT NULL,
  file_type     text NOT NULL DEFAULT 'other',
  original_name text NOT NULL,
  stored_name   text NOT NULL,
  stored_path   text NOT NULL,
  content_type  text,
  size_bytes    bigint NOT NULL DEFAULT 0,
  uploaded_by   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_files_entity
  ON document_files(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_files_type
  ON document_files(file_type);
