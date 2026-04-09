-- F13: LC 상환일/상환여부 기록 (한도/증액 계산에 반영)
-- 비유: LC 서류에 "상환 도장"을 찍는 칸을 추가 — 상환된 LC는 한도 계산에서 제외

ALTER TABLE lc_records
  ADD COLUMN IF NOT EXISTS repayment_date date,
  ADD COLUMN IF NOT EXISTS repaid boolean NOT NULL DEFAULT false;

-- PostgREST 스키마 리로드
NOTIFY pgrst, 'reload schema';
