-- @auto-apply: yes
-- 095_bank_accounts.sql
-- 은행 계좌 마스터 — 회사별 수금/지급 계좌 목록.
-- 기존 banks 테이블 (LC 한도 카드) 와 분리. banks 가 한도/수수료를 담는 카드라면
-- 이 테이블은 "어디로 입금받고 어디서 송금하는가" 의 실제 계좌 정보를 담는다.
--
-- 수금(receipts) 흐름:
--   - 현재 receipts.bank_account 는 자유 입력 VARCHAR(50) 문자열 (예: "신한 110-...").
--   - bank_account_id 컬럼을 추가해 마스터 FK 로도 연결할 수 있게 한다 (NULL 허용).
--   - 엑셀 import 변환기가 bank_account 문자열 → bank_account_id 매칭은 별도 PR.
--
-- 자동 적용 조건 만족: CREATE TABLE/COLUMN IF NOT EXISTS, idempotent GRANT.

CREATE TABLE IF NOT EXISTS bank_accounts (
  account_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES companies(company_id) ON DELETE RESTRICT,
  -- bank_id NULL 허용: 기존 banks 의 LC 한도 카드와 선택적 연결.
  -- 마스터 첫 등록 시 한도 카드가 없을 수 있어 NULL 로 두고, 필요 시 나중에 연결.
  bank_id         uuid        REFERENCES banks(bank_id) ON DELETE SET NULL,
  bank_name       text        NOT NULL,
  branch_name     text,
  account_number  text        NOT NULL,
  account_holder  text        NOT NULL,
  currency        char(3)     NOT NULL DEFAULT 'KRW',
  swift_code      text,
  memo            text,
  is_default      boolean     NOT NULL DEFAULT false,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, bank_name, account_number)
);

CREATE INDEX IF NOT EXISTS bank_accounts_company_idx
  ON bank_accounts (company_id);
CREATE INDEX IF NOT EXISTS bank_accounts_active_idx
  ON bank_accounts (company_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS bank_accounts_currency_idx
  ON bank_accounts (company_id, currency) WHERE is_active = true;

COMMENT ON TABLE bank_accounts IS
  '회사별 은행 계좌 마스터. 수금/지급 계좌 정보. banks 테이블(LC 한도 카드)과 분리되어 실제 계좌번호·예금주·통화·SWIFT 를 담는다.';
COMMENT ON COLUMN bank_accounts.bank_id IS
  '기존 banks (LC 한도 카드) FK. NULL 가능 — LC 한도 카드가 없는 일반 수금 계좌도 등록 가능.';
COMMENT ON COLUMN bank_accounts.currency IS
  'ISO 4217 통화 코드 (KRW/USD/EUR/CNY/JPY 등). 외화 계좌는 swift_code 도 함께 채울 것.';
COMMENT ON COLUMN bank_accounts.is_default IS
  '회사+통화 조합당 기본 계좌 표시. 수금 등록 시 자동 선택 후보로 사용.';

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION bank_accounts_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bank_accounts_updated_at ON bank_accounts;
CREATE TRIGGER bank_accounts_updated_at
  BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION bank_accounts_set_updated_at();

-- 수금(receipts) 마스터 FK 추가 — 기존 bank_account VARCHAR 컬럼은 그대로 유지하여
-- 엑셀 import 와 과거 데이터 호환. 신규 입력만 bank_account_id 로 마스터 참조.
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES bank_accounts(account_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS receipts_bank_account_id_idx
  ON receipts (bank_account_id) WHERE bank_account_id IS NOT NULL;

COMMENT ON COLUMN receipts.bank_account_id IS
  'bank_accounts 마스터 FK (NULL 허용). 자유 입력 bank_account 문자열과 공존 — 마스터 매칭된 row 는 이 FK 가 채워짐.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT ON TABLE bank_accounts TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bank_accounts TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE bank_accounts TO service_role;
  END IF;
END $$;
