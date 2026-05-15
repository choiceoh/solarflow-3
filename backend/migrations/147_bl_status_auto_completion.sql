-- M147: bl_shipments.status 자동 전이 — 입고 완료 BL 'completed' 처리
--
-- 진단:
--   bl_shipments 150건 전부 status='arrived' 그대로 (한 번도 갱신 안 됨)
--   - 면장 발급된 BL 100건 (통관 완료) 도 'arrived'
--   - 출고 시작된 BL 90건 (입고 완료) 도 'arrived'
--   - 자동 전이 트리거 없음
--
-- 전이 규칙:
--   면장 있음 (import_declarations) OR 출고 있음 (outbound_bl_items)
--     → 'completed' (입고 완료, ERP 등록 전)
--   둘 다 없음 (43건)
--     → 'arrived' 유지 (아직 통관 안 됐을 수 있음)

BEGIN;

-- 1. 일회성 백필: 입고 완료 BL → 'completed'
WITH targets AS (
  SELECT b.bl_id FROM bl_shipments b
  WHERE b.status = 'arrived'
    AND (
      EXISTS (SELECT 1 FROM import_declarations id WHERE id.bl_id = b.bl_id)
      OR EXISTS (SELECT 1 FROM outbound_bl_items obi WHERE obi.bl_id = b.bl_id)
    )
)
UPDATE bl_shipments b SET
  status = 'completed',
  memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M147: 면장/출고 기반 completed 자동 전이'
FROM targets t WHERE b.bl_id = t.bl_id;

-- 2. 자동 전이 함수
CREATE OR REPLACE FUNCTION sf_promote_bl_status(p_bl_id uuid)
RETURNS void AS $$
BEGIN
  -- 'arrived' 이상이면 면장/출고 발생 시 'completed' 로 승격 (erp_done 은 별도 운영자 액션)
  UPDATE bl_shipments
  SET status = 'completed'
  WHERE bl_id = p_bl_id
    AND status IN ('scheduled','shipping','arrived','customs')
    AND (
      EXISTS (SELECT 1 FROM import_declarations id WHERE id.bl_id = p_bl_id)
      OR EXISTS (SELECT 1 FROM outbound_bl_items obi WHERE obi.bl_id = p_bl_id)
    );
END;
$$ LANGUAGE plpgsql;

-- 3. 트리거: import_declarations INSERT 시
CREATE OR REPLACE FUNCTION sf_trg_decl_promote_bl()
RETURNS trigger AS $$
BEGIN
  PERFORM sf_promote_bl_status(NEW.bl_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_decl_promote_bl ON import_declarations;
CREATE TRIGGER trg_decl_promote_bl
  AFTER INSERT OR UPDATE OF bl_id ON import_declarations
  FOR EACH ROW EXECUTE FUNCTION sf_trg_decl_promote_bl();

-- 4. 트리거: outbound_bl_items INSERT 시
CREATE OR REPLACE FUNCTION sf_trg_obi_promote_bl()
RETURNS trigger AS $$
BEGIN
  PERFORM sf_promote_bl_status(NEW.bl_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_obi_promote_bl ON outbound_bl_items;
CREATE TRIGGER trg_obi_promote_bl
  AFTER INSERT OR UPDATE OF bl_id ON outbound_bl_items
  FOR EACH ROW EXECUTE FUNCTION sf_trg_obi_promote_bl();

-- 검증
SELECT status, COUNT(*) FROM bl_shipments GROUP BY status ORDER BY 2 DESC;
-- expected: completed=107, arrived=43

SELECT '면장X+출고O (운영자 확인 사항 — 면장 누락 의심)', COUNT(*)
FROM bl_shipments b
WHERE b.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM import_declarations id WHERE id.bl_id = b.bl_id)
  AND EXISTS (SELECT 1 FROM outbound_bl_items obi WHERE obi.bl_id = b.bl_id);
-- expected: 7 (M148 후보 — 면장 백필 후 다시 검증)

INSERT INTO schema_migrations(filename) VALUES ('147_bl_status_auto_completion.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
