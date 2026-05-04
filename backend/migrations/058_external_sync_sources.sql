-- @auto-apply: yes
-- 058_external_sync_sources.sql
-- 구글 시트 등 외부 소스 단방향 동기화 (D-059):
-- - external_sync_sources: 동기화 대상 시트 목록(수동 + cron 자동 1시간)
-- - outbounds.source_payload 부분 UNIQUE 인덱스: 같은 (spreadsheet_id, sheet_row_index)
--   조합으로는 한 번만 INSERT 되도록 dedup 안전망
--
-- 자동 적용 조건 만족: CREATE TABLE/INDEX IF NOT EXISTS, idempotent GRANT, 락 짧음.

-- ============================================================
-- 1. outbounds dedup index — 같은 시트 행은 한 번만 등록
-- ============================================================

-- source_payload 가 NULL 이거나 spreadsheet_id 키가 없는 행은 인덱스에 포함 안 됨 (부분 인덱스).
-- 수동 등록·표준 양식 업로드는 영향 없음. 외부 시트 자동 sync 만 dedup.
CREATE UNIQUE INDEX IF NOT EXISTS outbounds_source_spreadsheet_row_uidx
  ON outbounds (
    (source_payload->>'spreadsheet_id'),
    (source_payload->>'sheet_row_index')
  )
  WHERE source_payload IS NOT NULL
    AND source_payload ? 'spreadsheet_id'
    AND source_payload ? 'sheet_row_index';

COMMENT ON INDEX outbounds_source_spreadsheet_row_uidx IS
  'D-059 외부 시트 단방향 동기화 dedup. 같은 (spreadsheet_id, sheet_row_index) 조합은 한 번만 INSERT.';

-- ============================================================
-- 2. external_sync_sources — 동기화 대상 시트 목록
-- ============================================================

CREATE TABLE IF NOT EXISTS external_sync_sources (
  sync_id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text        NOT NULL,
  source_kind        text        NOT NULL DEFAULT 'google_sheet',
  spreadsheet_id     text        NOT NULL,
  sheet_gid          bigint      NOT NULL DEFAULT 0,
  external_format_id text        NOT NULL,                  -- 'topsolar_group_outbound' 등 frontend registry id
  schedule           text        NOT NULL DEFAULT 'hourly', -- 'hourly' | 'manual'
  enabled            boolean     NOT NULL DEFAULT true,
  last_synced_at     timestamptz,
  last_sync_count    integer,
  last_skipped_count integer,
  last_error         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         text,
  UNIQUE (source_kind, spreadsheet_id, sheet_gid)
);

CREATE INDEX IF NOT EXISTS external_sync_sources_enabled_idx
  ON external_sync_sources (enabled, schedule)
  WHERE enabled;

COMMENT ON TABLE external_sync_sources IS
  'D-059 외부 단방향 동기화 대상. cron worker (1시간 ticker) 가 enabled=true + schedule=hourly 행을 fetch → 변환 → idempotent INSERT.';
COMMENT ON COLUMN external_sync_sources.external_format_id IS
  '프론트 registry 의 ExternalFormat.id 와 동일. 현재는 ''topsolar_group_outbound'' 만 지원.';
COMMENT ON COLUMN external_sync_sources.schedule IS
  '''hourly'' (cron 자동) / ''manual'' (사용자 수동만)';
COMMENT ON COLUMN external_sync_sources.last_skipped_count IS
  '직전 sync 에서 dedup·매핑 실패로 SKIP 된 행 수.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT ON TABLE external_sync_sources TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE external_sync_sources TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE external_sync_sources TO service_role;
  END IF;
END $$;

-- ============================================================
-- 3. 초기 seed — 사용자가 제공한 탑솔라 그룹 출고현황 시트
-- ============================================================
INSERT INTO external_sync_sources
  (name, source_kind, spreadsheet_id, sheet_gid, external_format_id, schedule, enabled)
VALUES
  ('탑솔라 그룹 출고현황', 'google_sheet',
   '11jOoc52eBUOU6eR-up5MUOsxLZVbQvgJtEgKnWQroOk', 1698992198,
   'topsolar_group_outbound', 'hourly', true)
ON CONFLICT (source_kind, spreadsheet_id, sheet_gid) DO NOTHING;
