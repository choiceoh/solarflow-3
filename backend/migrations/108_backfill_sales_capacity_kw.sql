-- @auto-apply: yes
-- 108_backfill_sales_capacity_kw.sql
--
-- sales.capacity_kw NULL 행 백필 (sales.quantity × products.spec_wp / 1000).
--
-- 마이그 107 (outbounds.capacity_kw 백필) 의 자매. 같은 임포터 경로
-- (backfill_dh_20260512, 098/099/100 split) 가 sales 의 capacity_kw 도
-- 채우지 않아 702행 NULL. 매출분석 거래처별 탭에서 customerKwMap
-- (SalesAnalysisPage.tsx:1239) 가 sale.capacity_kw 를 직접 합산하므로,
-- 분모 deflate → 평균단가 부풀림이 동일 패턴으로 발생할 수 있다.
--
-- 안전:
-- - WHERE s.capacity_kw IS NULL 가드 → idempotent (재실행 시 0행).
-- - sales.quantity 와 outbounds.quantity mismatch 0건 확인 (2026-05-12),
--   sales.quantity 그대로 사용.
-- - spec_wp NULL product 1행 (CS3U-375MS MBB) 은 백필 대상 제외 — 마스터
--   spec_wp 채우면 다음 cron-deploy 가 자동 백필.

BEGIN;

DO $$
DECLARE
  v_will int;
  v_done int;
BEGIN
  SELECT COUNT(*) INTO v_will
  FROM sales s
  JOIN outbounds o ON s.outbound_id = o.outbound_id
  JOIN products  p ON o.product_id  = p.product_id
  WHERE s.capacity_kw IS NULL
    AND s.quantity > 0
    AND p.spec_wp IS NOT NULL
    AND COALESCE(s.status,'active') <> 'cancelled';

  UPDATE sales s
  SET capacity_kw = ROUND((s.quantity::numeric * p.spec_wp::numeric) / 1000.0, 3),
      updated_at  = now()
  FROM outbounds o
  JOIN products  p ON o.product_id = p.product_id
  WHERE s.outbound_id = o.outbound_id
    AND s.capacity_kw IS NULL
    AND s.quantity > 0
    AND p.spec_wp IS NOT NULL
    AND COALESCE(s.status,'active') <> 'cancelled';

  GET DIAGNOSTICS v_done = ROW_COUNT;
  RAISE NOTICE '[108] sales.capacity_kw backfilled: predicted=% updated=%', v_will, v_done;
END $$;

COMMIT;
