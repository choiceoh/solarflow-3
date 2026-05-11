-- @auto-apply: yes
-- 092_price_benchmark_supplier_quotes.sql
-- 가격예측: 구매로 이어지지 않은 공급사 견적을 같은 관측값 장부에 기록한다.

DROP INDEX IF EXISTS ux_price_benchmarks_point;

CREATE UNIQUE INDEX IF NOT EXISTS ux_price_benchmarks_point
  ON price_benchmarks(source_key, source_name, metric_key, value_date, market_region, basis, currency);

COMMENT ON INDEX ux_price_benchmarks_point IS
  '가격 관측값 중복 방지. our_quote는 source_name에 공급사명을 넣어 같은 날짜 여러 공급사 견적을 보존한다.';

COMMENT ON TABLE price_benchmarks IS
  '가격예측 화면의 가격 벤치마크 시계열. 외부 시세/입찰/floor와 우리 미체결 공급사 견적을 같은 구조로 저장한다.';
