-- @auto-apply: yes
-- 057_partner_aliases.sql
-- D-057: 거래처(partners) alias 학습 사전 — D-056 의 company_aliases / product_aliases 와 동일 패턴.
-- 외부 양식 변환기가 매출 정보의 customer_name 을 partners 마스터와 fuzzy 매칭할 때
-- 사용자가 [같음] 선택한 결과를 영구 저장하여 다음 변환부터 자동 매핑.
--
-- 자동 적용 조건 만족: CREATE TABLE IF NOT EXISTS, idempotent GRANT.

CREATE TABLE IF NOT EXISTS partner_aliases (
  alias_id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_partner_id  uuid        NOT NULL REFERENCES partners(partner_id) ON DELETE CASCADE,
  alias_text            text        NOT NULL,
  alias_text_normalized text        NOT NULL,
  source                text        NOT NULL DEFAULT 'manual',
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            text,
  UNIQUE (alias_text_normalized)
);

CREATE INDEX IF NOT EXISTS partner_aliases_canonical_idx
  ON partner_aliases (canonical_partner_id);

COMMENT ON TABLE partner_aliases IS
  '거래처명 alias 학습 사전. 변환기가 fuzzy 매칭으로 사용자 확인받은 결과를 영구 저장. alias_text_normalized 는 공백·괄호·㈜·(주) 제거한 비교 키.';
COMMENT ON COLUMN partner_aliases.source IS
  '''manual'' (사용자 명시), ''learned'' (변환 미리보기에서 [같음] 선택), ''import'' (대량 등록)';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT ON TABLE partner_aliases TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE partner_aliases TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE partner_aliases TO service_role;
  END IF;
END $$;
