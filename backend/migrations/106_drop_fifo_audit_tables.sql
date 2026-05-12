-- @auto-apply: yes
-- 106_drop_fifo_audit_tables.sql
--
-- fifo over-allocation 513 → 0 정리 (097-103) 의 6개 audit 테이블 정리.
-- 잔존 over-allocation 0 건 확인 (v_fifo_overallocation = 0행) 후 DROP.
-- ROLLBACK 보존 목적 끝나서 청소.
--
-- 보존된 매핑 합계: 545 행 (439+68+16+2+6+14) — 향후 필요시 git 로그에서
-- 복원 가능.

BEGIN;

DO $$
DECLARE
  v_over int;
BEGIN
  -- 안전 가드: 잔존 over-allocation 이 있으면 DROP 금지
  SELECT COUNT(*) INTO v_over FROM (
    SELECT o.outbound_id FROM outbounds o
    JOIN fifo_matches fm ON fm.outbound_id=o.outbound_id
    WHERE o.usage_category IN ('sale','sale_spare') AND o.status='active'
    GROUP BY o.outbound_id, o.quantity HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
  ) t;

  IF v_over > 0 THEN
    RAISE EXCEPTION '[106] over-allocated outbounds % 건 잔존 — audit 테이블 DROP 금지', v_over;
  END IF;

  RAISE NOTICE '[106] over-allocation 0 건 확인. audit 테이블 6 개 DROP.';
END $$;

DROP TABLE IF EXISTS _fifo_realign_audit_20260512;
DROP TABLE IF EXISTS _fifo_pattern_a_audit_20260512;
DROP TABLE IF EXISTS _fifo_pattern_b_audit_20260512;
DROP TABLE IF EXISTS _fifo_multirow_audit_20260512;
DROP TABLE IF EXISTS _fifo_duplicate_audit_20260512;
DROP TABLE IF EXISTS _fifo_empty_sibling_audit_20260512;

COMMIT;
