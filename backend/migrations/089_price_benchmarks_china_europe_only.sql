-- @auto-apply: yes
-- 가격예측: 미국/기타 지역 가격은 중국·유럽 기준선과 가격대가 달라 차트와 예측을 왜곡하므로 정리한다.

DELETE FROM price_benchmarks
WHERE metric_key = 'ddp_us'
   OR market_region NOT IN ('fob_china', 'china_domestic', 'china_export', 'ddp_europe');

ALTER TABLE price_benchmarks
  DROP CONSTRAINT IF EXISTS price_benchmarks_market_region_scope;
ALTER TABLE price_benchmarks
  ADD CONSTRAINT price_benchmarks_market_region_scope
  CHECK (market_region IN ('fob_china', 'china_domestic', 'china_export', 'ddp_europe'));

ALTER TABLE price_benchmarks
  DROP CONSTRAINT IF EXISTS price_benchmarks_no_ddp_us_metric;
ALTER TABLE price_benchmarks
  ADD CONSTRAINT price_benchmarks_no_ddp_us_metric
  CHECK (metric_key <> 'ddp_us');
