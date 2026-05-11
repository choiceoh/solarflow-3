-- @auto-apply: yes
-- 091_module_product_family_fields.sql
-- 품번(product_code)은 거래 SKU로 유지하고, 같은 생산 라인/외형 규격을 묶는 제품군과
-- 품번 분리 사유(BOM/출력 binning 등)를 별도 분류 필드로 보존한다.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_family_code text,
  ADD COLUMN IF NOT EXISTS product_variant_kind varchar(30),
  ADD COLUMN IF NOT EXISTS bom_revision text,
  ADD COLUMN IF NOT EXISTS substitution_group_code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_variant_kind_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_variant_kind_check
      CHECK (
        product_variant_kind IS NULL
        OR product_variant_kind IN (
          'output_bin',
          'bom_variant',
          'cert_variant',
          'label_variant',
          'packaging_variant',
          'mixed',
          'other'
        )
      );
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS products_family_code_idx
  ON products (product_family_code) WHERE product_family_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_manufacturer_family_idx
  ON products (manufacturer_id, product_family_code) WHERE product_family_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_substitution_group_idx
  ON products (substitution_group_code) WHERE substitution_group_code IS NOT NULL;

COMMENT ON COLUMN products.product_family_code IS
  '품번보다 상위의 모듈 제품군 코드. 같은 제조사·시리즈·라인·외형 규격을 묶고 출력 binning 차이는 분리한다. 예: JKM-N-78HL4-BDV-S.';
COMMENT ON COLUMN products.product_variant_kind IS
  '같은 제품군 안에서 품번이 갈라진 이유. output_bin/BOM/cert/label/packaging/mixed/other.';
COMMENT ON COLUMN products.bom_revision IS
  '동일 출력·동일 제품군이지만 BOM 차이로 품번이 갈라질 때의 BOM revision 또는 내부 구분값.';
COMMENT ON COLUMN products.substitution_group_code IS
  '영업·출고 검토 시 사람이 같은 대체 후보로 묶기 위한 수동 코드. 원가·재고 계산은 여전히 product_id 기준.';
