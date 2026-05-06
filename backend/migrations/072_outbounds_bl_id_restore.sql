-- 072: outbounds.bl_id 컬럼 복구
-- 운영 Supabase 에서 outbounds.bl_id 가 사라진 상태로 발견 (2026-05-06):
--   /api/v1/outbounds/dashboard → "(42703) column outbounds.bl_id does not exist"
-- 이전 List 핸들러는 Select("*") 라 PostgREST 가 누락 컬럼을 조용히 스킵해 우회됐으나,
-- PR #500 의 outboundListColumns 명시 SELECT 가 42703 을 발생시켜 표면화.
--
-- 코드/스키마 의도:
--   - migration 021 (outbound_bl_items) 이 다대다 BL 연결을 도입하면서 bl_id 데이터를
--     outbound_bl_items 로 이전했으나 원본 컬럼은 보존하도록 설계됨 (단일 BL 빠른 참조용).
--   - migration 055 RPC (handler_create_outbound, handler_update_outbound) 가 여전히
--     outbounds.bl_id 를 INSERT/UPDATE 함 — 컬럼이 없으면 RPC 도 호출 시 실패함.
--   - Go model.Outbound.BLID *string 필드가 응답 셰이프에 포함됨.
--
-- 본 마이그레이션:
--   1) bl_id uuid 컬럼 추가 (이미 있으면 no-op)
--   2) outbound_bl_items 에 등록된 첫 번째 (created_at 기준) BL 로 backfill — 단일 BL 참조 의미.
--      분할선적 (multi-BL) outbound 도 outbound_bl_items 가 source of truth 로 유지됨.

-- 1. 컬럼 추가 (idempotent)
ALTER TABLE outbounds
  ADD COLUMN IF NOT EXISTS bl_id uuid REFERENCES bl_shipments(bl_id);

CREATE INDEX IF NOT EXISTS idx_outbounds_bl_id ON outbounds (bl_id);

-- 2. outbound_bl_items 의 첫 BL 로 backfill — bl_id 가 NULL 인 행만.
WITH first_bl AS (
  SELECT DISTINCT ON (outbound_id)
    outbound_id,
    bl_id
  FROM outbound_bl_items
  ORDER BY outbound_id, created_at ASC, outbound_bl_item_id ASC
)
UPDATE outbounds o
SET bl_id = f.bl_id
FROM first_bl f
WHERE o.outbound_id = f.outbound_id
  AND o.bl_id IS NULL;
