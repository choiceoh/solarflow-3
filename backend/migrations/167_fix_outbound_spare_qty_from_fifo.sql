-- @auto-apply: yes
-- M164: outbounds.spare_qty 589건 정정 — fifo_matches 정본 기준 재계산
--
-- 배경 (운영자 확인 2026-05-18):
--   /admin/db-integrity 의 누계 검증 'fifo allocated 합 ≠ outbound qty + spare'
--   가 589건 fail. 분포 (직접 prod 조회):
--     usage_category | mismatch | over | under | no_fifo | ok
--     sale           | 571      | 0    | 571   | 184     | 1225
--     sale_spare     |  18      | 0    |  18   | 133     |  661
--   589건 모두 `fm_sum < quantity + spare_qty` (under), over-allocation 0건.
--
--   세부 패턴:
--     - 589건 모두 fm_sum = quantity (메인 FIFO 합 = 출고 수량, 정상)
--     - 589건 모두 spare_qty > 0 인데 spare FIFO 행이 없음 (orphan spare)
--     - 76.7% (452/589) 의 spare_qty 가 같은 erp_outbound_no 의 sibling 출고
--       quantity 합과 정확히 일치 — 즉 spare 가 sibling 으로 옮겨갔거나 construction
--       으로 분류 전환된 잔재
--
--   원인 추적:
--     M097-100 (`_fifo_pattern_*_audit_20260512`) 는 over-allocated outbound 의
--     스페어 FIFO 를 별도 sale_spare outbound 로 분리. 분리 시 fifo_matches.outbound_id
--     만 재할당했고, 원본 outbound 의 spare_qty 컬럼은 그대로 둠. M137 (`implicit
--     order 자동 생성 + 연결`) + M138 (`공사사용건 전환`) 으로 스페어가 construction
--     outbound 으로 이동한 케이스도 마찬가지로 원본 sale 의 spare_qty 가 stale.
--     audit 테이블 (`_fifo_*_audit_20260512`) 은 prod 에 존재하지 않음 — 정리 PR 에서
--     이미 DROP 됐거나 prod 에서 실제로 매칭 케이스가 없어 INSERT 가 0 행이었던 듯.
--
-- 사후 영향:
--   - 589건 mismatch → 0
--   - 영향 산식: spare_qty 자체. engine grep 결과 0건 참조 (margin/cost 는 fifo_matches
--     직접 사용). frontend OutboundDetailView 에서 "무상 수량" 표시값이 정상화됨
--     (예: 72 EA 판매 outbound 의 spare 36698 → 0)
--   - 음수 spare_qty 우려: dry-run 결과 GREATEST(0, ...) 로 음수 케이스 없음.
--     fm_sum < quantity 도 0건 (sp0_main_under 가 분기별 0).
--
-- 알고리즘:
--   spare_qty := GREATEST(0, fm_sum - quantity)
--   (사실상 모든 mismatch 에서 fm_sum = quantity 이므로 결과는 0)
--   no_fifo (317건) 는 fm_sum IS NULL → spare_qty 변경 안 함.

BEGIN;

WITH fm_sum AS (
  SELECT outbound_id, sum(allocated_qty) AS total_alloc
  FROM fifo_matches
  GROUP BY outbound_id
),
targets AS (
  SELECT o.outbound_id, o.quantity, COALESCE(o.spare_qty, 0) AS old_sp, fm.total_alloc,
         GREATEST(0, fm.total_alloc - o.quantity) AS new_sp
  FROM outbounds o
  JOIN fm_sum fm ON fm.outbound_id = o.outbound_id
  WHERE o.usage_category IN ('sale','sale_spare')
    AND o.status = 'active'
    AND fm.total_alloc != o.quantity + COALESCE(o.spare_qty, 0)
)
UPDATE outbounds o
SET spare_qty = t.new_sp,
    memo = COALESCE(o.memo, '') ||
      CASE WHEN COALESCE(o.memo,'') = '' THEN '' ELSE E'\n' END ||
      '[167] spare_qty 정정: ' || t.old_sp::text || ' → ' || t.new_sp::text ||
      ' (fifo_matches 정본 기준 fm_sum=' || t.total_alloc::text || ', qty=' || t.quantity::text || ')'
FROM targets t
WHERE o.outbound_id = t.outbound_id;

DO $$
DECLARE
  v_remaining int;
  v_changed int;
BEGIN
  SELECT count(*) INTO v_changed FROM outbounds WHERE memo LIKE '%[167] spare_qty 정정%';
  SELECT count(*) INTO v_remaining
  FROM outbounds o
  WHERE o.usage_category IN ('sale','sale_spare') AND o.status='active'
    AND (SELECT sum(allocated_qty) FROM fifo_matches WHERE outbound_id=o.outbound_id)
        != o.quantity + COALESCE(o.spare_qty, 0)
    AND (SELECT sum(allocated_qty) FROM fifo_matches WHERE outbound_id=o.outbound_id) IS NOT NULL;
  RAISE NOTICE '[167] spare_qty 정정 % 행, FIFO mismatch 잔존: % (기대 0)', v_changed, v_remaining;
  IF v_remaining > 0 THEN
    RAISE WARNING '[167] 잔존 %건 — fm_sum < quantity 케이스 가능, 수기 확인 필요.', v_remaining;
  END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
