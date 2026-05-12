-- @auto-apply: yes
-- 가격예측: cif_europe 시장 분류 추가.
-- 한국 도착가는 시장 데이터가 없고 우리 거래 자료뿐이므로,
-- 유럽 CIF 가격을 한국 CIF 시장 프록시로 사용한다 (유럽 시장 규모 덕에 거리에 따른 운임 차가 가격에 거의 반영되지 않음).
-- CMM-등가 보정: cif_europe = fob_china + 0.25¢/W (운임·보험).

ALTER TABLE price_benchmarks
  DROP CONSTRAINT IF EXISTS price_benchmarks_market_region_scope;
ALTER TABLE price_benchmarks
  ADD CONSTRAINT price_benchmarks_market_region_scope
  CHECK (market_region IN ('fob_china', 'china_domestic', 'china_export', 'cif_europe', 'ddp_europe'));
