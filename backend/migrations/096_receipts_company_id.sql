-- @auto-apply: yes
-- 096_receipts_company_id.sql
-- receipts 에 company_id 추가 — 수금이 어느 회사 계좌로 들어왔는지 식별하기 위함.
--
-- 동기: 095 에서 bank_accounts 마스터를 신설하면서, 수금 자유 입력 bank_account 문자열을
-- 마스터에 자동 등록하려면 "어느 회사 소속 계좌"인지가 필요한데 기존 receipts 에는
-- 회사 식별 컬럼이 없어 추가한다. 향후 회사별 수금 보드/필터에도 활용 가능.
--
-- NULL 허용: 기존 row 는 회사 정보 없음 (소급 적용 안 함). 신규 입력만 채워 짐.
--
-- 자동 적용 조건 만족: ADD COLUMN IF NOT EXISTS, idempotent.

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(company_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS receipts_company_id_idx
  ON receipts (company_id) WHERE company_id IS NOT NULL;

COMMENT ON COLUMN receipts.company_id IS
  '수금을 받은 우리 회사 (NULL 허용 — 옛 row 호환). 자동 bank_accounts 등록 시 사용.';
