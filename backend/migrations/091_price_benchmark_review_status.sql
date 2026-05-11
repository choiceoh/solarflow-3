-- @auto-apply: yes
-- 091_price_benchmark_review_status.sql
-- 가격예측 관측값 검토 상태: 후보/채택/제외

ALTER TABLE price_benchmarks
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'candidate';

ALTER TABLE price_benchmarks
  DROP CONSTRAINT IF EXISTS price_benchmarks_review_status_check;

ALTER TABLE price_benchmarks
  ADD CONSTRAINT price_benchmarks_review_status_check
  CHECK (review_status IN ('candidate', 'accepted', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_price_benchmarks_review_status
  ON price_benchmarks(review_status, value_date DESC);

COMMENT ON COLUMN price_benchmarks.review_status IS
  '가격예측 관측값 검토 상태. candidate=후보, accepted=구매 기준선 채택, rejected=차트/판단에서 제외.';
