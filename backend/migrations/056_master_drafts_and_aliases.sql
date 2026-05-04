-- @auto-apply: yes
-- 056_master_aliases_and_nullable.sql
-- 외부 양식 변환기가 마스터(법인·품번)에 미존재 행을 자동 등록할 때 필요한 인프라.
--
-- 설계 결정: draft 플래그는 도입하지 않음 (D-056). 자동 등록된 행도 정식 마스터 행으로
-- 취급하되, 비필수 메타(제조사·wattage·spec)는 NULL 로 두고 사용자가 마스터 화면에서
-- 사후 보정한다. 부작용: 보정 전 출고는 capacity_kw=0 (양은 quantity*wattage 계산이라
-- wattage NULL → 0).
--
-- 1. products 의 일부 NOT NULL 컬럼을 NULL 허용으로 완화 — 자동 등록 행이 빠진 메타 없이도 살아남도록.
-- 2. company_aliases / product_aliases — alias 학습 사전. fuzzy 매칭으로 사용자가 [같음] 선택한
--    결과를 영구 저장하여 다음 변환부터 자동 매핑.
--
-- 자동 적용 조건 만족: ALTER DROP NOT NULL(idempotent), CREATE TABLE IF NOT EXISTS, idempotent GRANT.

-- ============================================================
-- 1. products NOT NULL 완화 (자동 등록 허용)
-- ============================================================
-- 기존 행에는 영향 없음(NOT NULL → NULL 허용은 metadata-only).
-- 정식 등록 경로(/api/v1/products POST)는 Go 모델 Validate() 가 여전히 필수 강제.

ALTER TABLE products ALTER COLUMN manufacturer_id   DROP NOT NULL;
ALTER TABLE products ALTER COLUMN spec_wp           DROP NOT NULL;
ALTER TABLE products ALTER COLUMN wattage_kw        DROP NOT NULL;
ALTER TABLE products ALTER COLUMN module_width_mm   DROP NOT NULL;
ALTER TABLE products ALTER COLUMN module_height_mm  DROP NOT NULL;

COMMENT ON COLUMN products.manufacturer_id IS
  '제조사 FK. 정식 등록은 NOT NULL, 외부 양식 자동 등록(D-056)은 NULL 허용.';
COMMENT ON COLUMN products.wattage_kw IS
  '모듈 용량(kW). 자동 등록 행은 NULL → 출고 capacity_kw 계산 시 0이 되므로 사후 보정 필요.';

-- ============================================================
-- 2. alias 학습 사전 (외부 양식 변환기가 사용)
-- ============================================================

CREATE TABLE IF NOT EXISTS company_aliases (
  alias_id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_company_id  uuid        NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  alias_text            text        NOT NULL,
  alias_text_normalized text        NOT NULL,
  source                text        NOT NULL DEFAULT 'manual',
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            text,
  UNIQUE (alias_text_normalized)
);

CREATE INDEX IF NOT EXISTS company_aliases_canonical_idx
  ON company_aliases (canonical_company_id);

COMMENT ON TABLE company_aliases IS
  '법인명 alias 학습 사전. 변환기가 fuzzy 매칭으로 사용자 확인받은 결과를 영구 저장. alias_text_normalized 는 공백·괄호·㈜·(주) 제거한 비교 키.';
COMMENT ON COLUMN company_aliases.source IS
  '''manual'' (사용자 명시), ''learned'' (변환 미리보기에서 [같음] 선택), ''import'' (대량 사전 등록)';

CREATE TABLE IF NOT EXISTS product_aliases (
  alias_id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_product_id  uuid        NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  alias_code            text        NOT NULL,
  alias_code_normalized text        NOT NULL,
  source                text        NOT NULL DEFAULT 'manual',
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            text,
  UNIQUE (alias_code_normalized)
);

CREATE INDEX IF NOT EXISTS product_aliases_canonical_idx
  ON product_aliases (canonical_product_id);

COMMENT ON TABLE product_aliases IS
  '품번코드 alias 학습 사전. 변환기가 fuzzy 매칭으로 사용자 확인받은 결과를 영구 저장. alias_code_normalized 는 영숫자만 남기고 대문자화한 비교 키.';

-- ============================================================
-- 3. RLS·권한
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT ON TABLE company_aliases TO anon;
    GRANT SELECT ON TABLE product_aliases TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE company_aliases TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE product_aliases TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE company_aliases TO service_role;
    GRANT ALL ON TABLE product_aliases TO service_role;
  END IF;
END $$;
