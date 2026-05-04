-- @auto-apply: yes
-- 063_products_erp_code.sql
-- 정식 ERP 자료에서 품번이 'M-JK0635-01' 같은 ERP 내부 코드로 관리됨.
-- 우리 마스터의 product_code (모델명, 'JKM635N-78HL4-BDV-S') 와 별개.
-- 두 코드 모두 인덱스로 보존하여 ERP 자료 매칭·향후 통합에 활용.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS erp_code text;

-- ERP 코드는 회사 전역 unique. NULL 은 허용 (자동 등록 product 등).
CREATE UNIQUE INDEX IF NOT EXISTS products_erp_code_uidx
  ON products (erp_code) WHERE erp_code IS NOT NULL;

COMMENT ON COLUMN products.erp_code IS
  'ERP 시스템 내부 품번 코드 (예: M-JK0635-01). NULL 가능 (사용 ERP 미연동 시).';
