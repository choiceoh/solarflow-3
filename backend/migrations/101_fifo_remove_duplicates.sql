-- @auto-apply: yes
-- 101_fifo_remove_duplicates.sql
--
-- 잔존 over-allocated outbounds 중 fifo 행이 동일 qty 로 정확히 2번 반복된
-- 케이스 (예: ob=159, fifo=159+159) 는 ERP 원본의 단순 데이터 중복.
-- 임포터가 같은 출고 라인을 2번 읽어들이며 cost 가 2배 누적된 것.
--
-- 본 마이그레이션:
--   1. 정확한 중복 fifo 행 (같은 outbound_id + 같은 allocated_qty +
--      같은 usage_category_raw, 그리고 합이 ob_qty 의 2배) 식별
--   2. 둘 중 created_at 늦은 행 (= 나중에 들어온 중복) 1개 제거
--   3. _fifo_duplicate_audit_20260512 에 보존
--
-- 안전: 중복 판정은 정확 일치 (qty + raw 카테고리 + outbound_id) 만 처리.

BEGIN;

CREATE TABLE IF NOT EXISTS _fifo_duplicate_audit_20260512 (
  audit_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_match_id  uuid NOT NULL,
  kept_match_id     uuid NOT NULL,
  outbound_id       uuid NOT NULL,
  erp_outbound_no   text,
  allocated_qty     integer,
  usage_category_raw text,
  deleted_at        timestamptz NOT NULL DEFAULT now(),
  snapshot          jsonb
);

-- 중복 식별 + 한 행만 삭제 대상으로 선정
WITH dup_groups AS (
  SELECT outbound_id, allocated_qty, usage_category_raw, COUNT(*) AS dup_n
  FROM fifo_matches
  GROUP BY outbound_id, allocated_qty, usage_category_raw
  HAVING COUNT(*) >= 2
),
-- 대상 outbound 가 over-allocated 인지 확인 (정상 분할인 경우 제외)
target_outbounds AS (
  SELECT o.outbound_id, o.quantity
  FROM outbounds o
  JOIN fifo_matches fm ON fm.outbound_id=o.outbound_id
  WHERE o.usage_category IN ('sale','sale_spare') AND o.status='active'
  GROUP BY o.outbound_id, o.quantity
  HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
),
to_delete AS (
  SELECT fm.match_id, fm.outbound_id, fm.allocated_qty, fm.usage_category_raw, fm.erp_outbound_no,
         row_number() OVER (
           PARTITION BY fm.outbound_id, fm.allocated_qty, fm.usage_category_raw
           ORDER BY fm.created_at DESC, fm.match_id
         ) AS rn,
         (SELECT match_id FROM fifo_matches fm2
          WHERE fm2.outbound_id=fm.outbound_id
            AND fm2.allocated_qty=fm.allocated_qty
            AND fm2.usage_category_raw=fm.usage_category_raw
            AND fm2.match_id <> fm.match_id
          ORDER BY fm2.created_at ASC, fm2.match_id
          LIMIT 1) AS kept_id,
         to_jsonb(fm) AS snapshot
  FROM fifo_matches fm
  JOIN dup_groups dg
    ON dg.outbound_id=fm.outbound_id
   AND dg.allocated_qty=fm.allocated_qty
   AND COALESCE(dg.usage_category_raw,'') = COALESCE(fm.usage_category_raw,'')
  JOIN target_outbounds t ON t.outbound_id=fm.outbound_id
),
audit_inserted AS (
  INSERT INTO _fifo_duplicate_audit_20260512
    (deleted_match_id, kept_match_id, outbound_id, erp_outbound_no, allocated_qty, usage_category_raw, snapshot)
  SELECT match_id, kept_id, outbound_id, erp_outbound_no, allocated_qty, usage_category_raw, snapshot
  FROM to_delete
  WHERE rn = 1 AND kept_id IS NOT NULL
  RETURNING deleted_match_id
)
DELETE FROM fifo_matches
WHERE match_id IN (SELECT deleted_match_id FROM audit_inserted);

DO $$
DECLARE
  v_deleted int;
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_deleted FROM _fifo_duplicate_audit_20260512;
  SELECT COUNT(*) INTO v_remaining FROM (
    SELECT o.outbound_id FROM outbounds o JOIN fifo_matches fm ON fm.outbound_id=o.outbound_id
    WHERE o.usage_category IN ('sale','sale_spare') AND o.status='active'
    GROUP BY o.outbound_id, o.quantity HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
  ) t;
  RAISE NOTICE '[101] 중복 fifo_match 삭제: %건, 잔존 over-allocated: %', v_deleted, v_remaining;
END $$;

COMMIT;
