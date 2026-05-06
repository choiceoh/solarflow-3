-- @auto-apply: yes
-- 072_product_family_aliases.sql
-- 모듈 product 의 family/series 그룹 + 변종 alias 매핑 (D-064 PR 35).
--
-- 사용자 지시: 출력만 다른 패밀리(예: LR7-72HYD-640M~655M) + 동일 출력 변종
-- (예: JKM635-S vs -S1 lot) 처리.
--
-- Hybrid 전략 (Option 3):
--   1) products.product_family_code — NNN(출력) 부분을 wildcard 처리한 family 식별자
--      예: LR7-72HYD-640M / 645M / 650M / 655M → "LR7-72HYD-NNNM" 동일 family
--   2) products.series_name — 제조사 시리즈명 (자동 채움 안 함, 향후 수동 또는 ERP 보강)
--   3) product_aliases — 사용량 적은 변종을 canonical product 의 alias 로 매핑
--      → 영업/매출/통계 화면이 alias→canonical 자동 통합

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_family_code text;

CREATE INDEX IF NOT EXISTS products_family_code_idx
  ON products (product_family_code) WHERE product_family_code IS NOT NULL;

COMMENT ON COLUMN products.product_family_code IS
  '같은 family 의 식별자 (NNN 출력값 wildcard). 예: "LR7-72HYD-NNNM" — 640~655M 동일.';

-- product_aliases 는 이미 존재 (string code 기반 매핑) — 확장:
-- alias_product_id 컬럼 추가 → 등록된 product 끼리 매핑 가능
ALTER TABLE product_aliases
  ADD COLUMN IF NOT EXISTS alias_product_id uuid REFERENCES products(product_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reason text;

-- alias_product_id UNIQUE — 한 변종 product 는 하나의 canonical 만 (NULL 허용 = string-only alias)
CREATE UNIQUE INDEX IF NOT EXISTS product_aliases_alias_product_uidx
  ON product_aliases (alias_product_id) WHERE alias_product_id IS NOT NULL;

COMMENT ON COLUMN product_aliases.alias_product_id IS
  '등록된 변종 product 를 canonical 로 매핑 (PR 35). NULL 이면 alias_code(string) 만 사용.';
COMMENT ON COLUMN product_aliases.reason IS
  '''lot_variant'' (예: -S vs -S1), ''typo'' (오타), ''legacy'' (구표기) 등.';

-- 편의 view: canonical resolve (alias 면 canonical, 아니면 자기 자신)
CREATE OR REPLACE VIEW v_products_canonical AS
SELECT
  p.product_id,
  COALESCE(pa.canonical_product_id, p.product_id) AS canonical_product_id
FROM products p
LEFT JOIN product_aliases pa ON pa.alias_product_id = p.product_id;

COMMENT ON VIEW v_products_canonical IS
  'product → canonical 매핑 view. SELECT 시 alias 자동 해결 (PR 35).';
