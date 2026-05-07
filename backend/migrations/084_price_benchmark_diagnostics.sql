-- @auto-apply: yes
-- 084_price_benchmark_diagnostics.sql
-- D-064 PR 47: 가격 벤치마크 정합성 검토 + 진단 컬럼 추가
--   evidence_hashes — source 별 evidence 콘텐츠 해시 (무변동 시 LLM 호출 skip 용)
--   diagnostics      — source 별 진단 (homepage 상태/검색 결과수/LLM 응답 길이/파싱 결과)
--   sanity_review    — AI 가격정합성 검토 결과 (의심 point 목록 + 사유)

ALTER TABLE price_benchmark_runs
  ADD COLUMN IF NOT EXISTS evidence_hashes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS diagnostics     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sanity_review   jsonb;

COMMENT ON COLUMN price_benchmark_runs.evidence_hashes IS
  'source_key → SHA256(evidence content) 매핑. 직전 run 의 hash 와 동일하면 LLM 호출 skip.';
COMMENT ON COLUMN price_benchmark_runs.diagnostics IS
  'source_key → 진단 객체 ({homepage_status, evidence_count, llm_raw_length, llm_parse_status, points_extracted, skip_reason}).';
COMMENT ON COLUMN price_benchmark_runs.sanity_review IS
  'AI 가격정합성 검토 결과. {checked: int, suspect: [{source_key, metric_key, value_date, reason}], summary: text}.';
