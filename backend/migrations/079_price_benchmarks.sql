-- @auto-apply: yes
-- 079_price_benchmarks.sql
-- 가격예측: OPIS/InfoLink/TrendForce/PVinsights/중국 입찰/CPIA/제조사 ASP 벤치마크 저장

CREATE TABLE IF NOT EXISTS price_benchmark_runs (
  run_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status          text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  provider        text,
  model           text,
  source_keys     jsonb NOT NULL DEFAULT '[]'::jsonb,
  requested_by    uuid,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  inserted_count  integer NOT NULL DEFAULT 0 CHECK (inserted_count >= 0),
  skipped_count   integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  error_message   text,
  warnings        jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence        jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_response    text
);

CREATE TABLE IF NOT EXISTS price_benchmarks (
  benchmark_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid REFERENCES price_benchmark_runs(run_id) ON DELETE SET NULL,
  source_key      text NOT NULL,
  source_name     text NOT NULL,
  metric_key      text NOT NULL,
  metric_label    text NOT NULL,
  value_date      date NOT NULL,
  period_label    text,
  market_region   text NOT NULL,
  basis           text NOT NULL,
  currency        text NOT NULL DEFAULT 'USD',
  price_usd_w     numeric(10,6),
  price_cny_w     numeric(10,6),
  price_krw_w     numeric(12,4),
  cargo_min_mw    numeric(10,3),
  cargo_max_mw    numeric(10,3),
  quarter_label   text,
  project_segment text,
  technology      text,
  confidence      numeric(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source_url      text,
  raw_excerpt     text,
  notes           text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_benchmarks_price_present
    CHECK (price_usd_w IS NOT NULL OR price_cny_w IS NOT NULL OR price_krw_w IS NOT NULL),
  CONSTRAINT price_benchmarks_price_positive
    CHECK (
      (price_usd_w IS NULL OR price_usd_w > 0) AND
      (price_cny_w IS NULL OR price_cny_w > 0) AND
      (price_krw_w IS NULL OR price_krw_w > 0)
    ),
  CONSTRAINT price_benchmarks_cargo_positive
    CHECK (
      (cargo_min_mw IS NULL OR cargo_min_mw > 0) AND
      (cargo_max_mw IS NULL OR cargo_max_mw > 0) AND
      (cargo_min_mw IS NULL OR cargo_max_mw IS NULL OR cargo_min_mw <= cargo_max_mw)
    )
);

CREATE INDEX IF NOT EXISTS idx_price_benchmarks_date
  ON price_benchmarks(value_date DESC);
CREATE INDEX IF NOT EXISTS idx_price_benchmarks_source_metric
  ON price_benchmarks(source_key, metric_key, value_date DESC);
CREATE INDEX IF NOT EXISTS idx_price_benchmarks_region_basis
  ON price_benchmarks(market_region, basis, value_date DESC);
CREATE INDEX IF NOT EXISTS idx_price_benchmarks_run
  ON price_benchmarks(run_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_price_benchmarks_point
  ON price_benchmarks(source_key, metric_key, value_date, market_region, basis, currency);
CREATE INDEX IF NOT EXISTS idx_price_benchmark_runs_started
  ON price_benchmark_runs(started_at DESC);

DROP TRIGGER IF EXISTS price_benchmarks_updated_at ON price_benchmarks;
CREATE TRIGGER price_benchmarks_updated_at
BEFORE UPDATE ON price_benchmarks
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE price_benchmarks DISABLE ROW LEVEL SECURITY;
ALTER TABLE price_benchmark_runs DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE price_benchmarks TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE price_benchmark_runs TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE price_benchmarks TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE price_benchmark_runs TO authenticated;
  END IF;
END $$;

COMMENT ON TABLE price_benchmarks IS
  '가격예측 화면의 외부 태양광 가격 벤치마크 시계열. OPIS/InfoLink/TrendForce/PVinsights/중국 입찰/CPIA/제조사 ASP 관측값을 같은 구조로 저장한다.';
COMMENT ON TABLE price_benchmark_runs IS
  '가격예측 AI 수집 버튼 1회 실행 로그. 어떤 source 를 어떤 provider/model 로 수집했고 몇 건이 저장됐는지 기록한다.';
