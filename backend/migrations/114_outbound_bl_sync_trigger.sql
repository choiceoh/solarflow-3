-- 114_outbound_bl_sync_trigger.sql
-- outbounds.bl_id ↔ outbound_bl_items 영구 일치성 가드 + 잔여 1건 백필
--
-- 배경:
--   PR #816 (M113) 적용 후 outbound_bl_items 매핑률 18% → 80% 회복. 운영
--   진단 결과 outbounds.bl_id 와 outbound_bl_items 사이에 모순(conflict)은
--   0건이지만 only_direct 케이스 1건이 남아있고, 향후 변경 시점에 모순이
--   생기지 않도록 가드 필요.
--
-- 데이터 모델 정리:
--   outbound_bl_items 가 source of truth (분할 출고를 다대다로 표현).
--   outbounds.bl_id 는 단일 BL 의 빠른 참조용 mirror 컬럼으로 강등.
--   따라서 본 PR 은:
--     1. only_direct 1건 의 obi 백필 (정합성 회복)
--     2. obi 변경 시 outbounds.bl_id 를 자동으로 obi 의 대표 BL 로 동기화
--        하는 트리거 도입 (앞으로 어떤 경로로 obi 가 바뀌어도 모순 방지)
--     3. outbounds.bl_id 컬럼에 deprecation 코멘트 추가
--
-- "대표 BL" 정의:
--   obi 중 quantity 가 가장 큰 BL. 동률이면 bl_id 의 사전순 ASC 첫 번째.
--   이전 코드(M072 백필)도 "첫 BL" 을 잡았으므로 호환.
--
-- 미해결 (이후 PR):
--   - RPC sf_create_outbound / sf_update_outbound 에서 p_bl_id 파라미터 정리
--   - Go model.Outbound.BLID JSON 응답 deprecation 표시
--   - 최종적으로 outbounds.bl_id 컬럼 DROP

BEGIN;

-- 1) only_direct 1건 백필 (obi 행 생성)
INSERT INTO outbound_bl_items (outbound_id, bl_id, quantity)
SELECT o.outbound_id, o.bl_id, o.quantity
FROM outbounds o
WHERE o.bl_id IS NOT NULL
  AND o.quantity > 0
  AND NOT EXISTS (
    SELECT 1 FROM outbound_bl_items WHERE outbound_id = o.outbound_id
  );

-- 2) 동기화 함수: obi 의 대표 BL 을 outbounds.bl_id 로 반영
CREATE OR REPLACE FUNCTION sync_outbound_bl_id() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_out_id uuid;
  v_rep_bl uuid;
BEGIN
  -- 영향받는 outbound_id 결정 (INSERT/UPDATE 는 NEW, DELETE 는 OLD)
  v_out_id := COALESCE(NEW.outbound_id, OLD.outbound_id);

  -- 대표 BL 재계산
  SELECT bl_id INTO v_rep_bl
  FROM outbound_bl_items
  WHERE outbound_id = v_out_id
  ORDER BY quantity DESC, bl_id ASC
  LIMIT 1;

  -- outbounds.bl_id 가 다르면 갱신 (NULL ↔ uuid 케이스 포함)
  UPDATE outbounds
  SET bl_id = v_rep_bl, updated_at = now()
  WHERE outbound_id = v_out_id
    AND bl_id IS DISTINCT FROM v_rep_bl;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION sync_outbound_bl_id IS
  'outbound_bl_items 변경 시 outbounds.bl_id 를 대표 BL (quantity DESC, bl_id ASC) 로 자동 동기화. M114.';

-- 3) 트리거: obi 의 INSERT/UPDATE/DELETE 모두 동기화
DROP TRIGGER IF EXISTS trg_sync_outbound_bl_id ON outbound_bl_items;
CREATE TRIGGER trg_sync_outbound_bl_id
AFTER INSERT OR UPDATE OR DELETE ON outbound_bl_items
FOR EACH ROW EXECUTE FUNCTION sync_outbound_bl_id();

-- 4) outbounds.bl_id 컬럼 deprecation 코멘트
COMMENT ON COLUMN outbounds.bl_id IS
  'DEPRECATED — outbound_bl_items 가 정본. 본 컬럼은 단일 BL 빠른 참조용 mirror, M114 트리거로 자동 동기화됨. 향후 PR 에서 RPC/응답에서 제거 후 DROP 예정.';

-- 검증
SELECT 'only_direct 잔여' AS metric, COUNT(*) AS value
FROM outbounds o
WHERE o.bl_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM outbound_bl_items WHERE outbound_id = o.outbound_id);

SELECT 'conflict 잔여' AS metric, COUNT(*) AS value
FROM outbounds o
WHERE o.bl_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM outbound_bl_items WHERE outbound_id = o.outbound_id)
  AND NOT EXISTS (
    SELECT 1 FROM outbound_bl_items
    WHERE outbound_id = o.outbound_id AND bl_id = o.bl_id
  );

SELECT 'trigger installed' AS metric,
       COUNT(*) AS value
FROM information_schema.triggers
WHERE trigger_name = 'trg_sync_outbound_bl_id';

COMMIT;
