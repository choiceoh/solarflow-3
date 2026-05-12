-- @auto-apply: yes
-- 107_backfill_outbounds_capacity_kw.sql
--
-- outbounds.capacity_kw NULL 행 백필 (quantity × products.spec_wp / 1000).
--
-- 배경: 마이그 056 (D-056) 에서 products.wattage_kw 를 NULL 허용으로 완화하면서
-- 자동 등록 product 의 wattage 보정 전에 생성된 출고 행은 capacity_kw 가 NULL
-- 로 남는다. 추가로 backfill_dh_20260512 임포터와 마이그 098/099/100 의 split
-- 신규 outbound 들이 capacity_kw 를 계산하지 않고 INSERT 해서 NULL 누락이
-- 누적됐다 (2026-05-12 운영 데이터 기준 701행).
--
-- 부작용: 매출분석 제조사별 평균단가가 SUM(supply_amount)/SUM(capacity_kw)
-- 공식을 쓰면 분모만 줄어 단가가 부풀려진다 — 론지 표시 585원/W vs 실제
-- 144원/W (4.1배). 엔진 SQL 은 같은 PR 에서 qty×spec_wp 기준으로 전환했지만
-- 그 외 화면/리포트 일관성을 위해 컬럼 자체도 채워둔다.
--
-- 안전: spec_wp 가 채워진 product 의 출고만 갱신. 1행 (CS3U-375MS MBB,
-- spec_wp NULL) 은 마스터 보정 전까지 NULL 유지. UPDATE 조건이 idempotent
-- (capacity_kw IS NULL) 이라 재실행해도 영향 없음.

BEGIN;

DO $$
DECLARE
  v_will int;
  v_done int;
BEGIN
  SELECT COUNT(*) INTO v_will
  FROM outbounds o JOIN products p ON o.product_id = p.product_id
  WHERE o.capacity_kw IS NULL AND p.spec_wp IS NOT NULL AND o.quantity > 0;

  UPDATE outbounds o
  SET capacity_kw = ROUND((o.quantity::numeric * p.spec_wp::numeric) / 1000.0, 3),
      updated_at  = now()
  FROM products p
  WHERE o.product_id = p.product_id
    AND o.capacity_kw IS NULL
    AND p.spec_wp IS NOT NULL
    AND o.quantity > 0;

  GET DIAGNOSTICS v_done = ROW_COUNT;
  RAISE NOTICE '[107] capacity_kw backfilled: predicted=% updated=%', v_will, v_done;
END $$;

COMMIT;
