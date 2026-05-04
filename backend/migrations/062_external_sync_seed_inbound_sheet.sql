-- @auto-apply: yes
-- 062_external_sync_seed_inbound_sheet.sql
-- D-059 PR 15: 두 번째 탑솔라 그룹 시트 (2025-12 입고 데이터, 헤더 라벨이 약간 다름).
-- 변환기는 헤더 이름 기반 동적 매핑이라 같은 external_format_id 로 처리.

INSERT INTO external_sync_sources
  (name, source_kind, spreadsheet_id, sheet_gid, external_format_id, schedule, enabled, default_warehouse_id)
VALUES
  ('탑솔라 그룹 입고 시트 (2025-12)', 'google_sheet',
   '1duHlWDyXCx_65BvHAkBaLjAiKBfEvHh0SZCJfNT7VAY', 0,
   'topsolar_group_outbound', 'hourly', true,
   '0f10b79c-2707-4ae0-9915-b6a2f4e4a25e')
ON CONFLICT (source_kind, spreadsheet_id, sheet_gid) DO NOTHING;
