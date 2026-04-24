-- 제조사 약칭 컬럼 추가 (진코, 론지, 트리나 등)
-- "진코 640", "트리나 730" 형식의 모듈 레이블에 사용
ALTER TABLE manufacturers ADD COLUMN IF NOT EXISTS short_name VARCHAR(20);
