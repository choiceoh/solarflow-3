-- @auto-apply: yes
-- 054_fx_daily.sql
-- 통화 페어별 일별 환율 누적 — LC 탭 USD/KRW 30일 sparkline + 재고 시장 시세 패널.
-- pair: 'usdkrw' (1 USD = N KRW), 'cnykrw' (1 CNY = N KRW; backend가 KRW/CNY로 계산)
-- 매 fetchFX 호출 시 today/yesterday UPSERT, 부팅 시 1회 30일 historical 백필.
--
-- 자동 적용 조건 만족: CREATE TABLE/INDEX IF NOT EXISTS, idempotent GRANT, 락 짧음, 데이터 손실 위험 없음.

CREATE TABLE IF NOT EXISTS fx_daily (
  pair         text        NOT NULL,
  date         date        NOT NULL,
  rate         numeric     NOT NULL,
  source       text        NOT NULL DEFAULT 'metalpriceapi.com',
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pair, date)
);

CREATE INDEX IF NOT EXISTS fx_daily_pair_date_desc_idx ON fx_daily (pair, date DESC);

COMMENT ON TABLE fx_daily IS
  '통화 페어별 일별 환율 누적 — LC sparkline + 재고 시장 시세 데이터 소스. 외부 API 캐싱 겸 시계열 영속화.';
COMMENT ON COLUMN fx_daily.pair IS
  '''usdkrw'' (1 USD = N KRW), ''cnykrw'' (1 CNY = N KRW; KRW/CNY 비율로 계산)';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT ON TABLE fx_daily TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON TABLE fx_daily TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE fx_daily TO service_role;
  END IF;
END $$;
