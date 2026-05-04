-- @auto-apply: yes
-- 068_products_module_efficiency_type.sql
-- 품번 마스터에 모듈 효율(%) + 모듈 종류(PERC/TOPCON/BC) + 모듈 등급(탄소인증제) 컬럼 추가.
-- 모듈 사이즈는 module_width_mm / module_height_mm / module_depth_mm 로 이미 존재.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS module_efficiency  DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS module_type        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS module_grade       VARCHAR(2);

-- 모듈 종류·등급은 화이트리스트로 제한 (NULL 은 "미입력" 의미).
-- module_grade='NA' 는 "탄소인증 미해당" 의 명시적 표기.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_module_type_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_module_type_check
      CHECK (module_type IS NULL OR module_type IN ('PERC', 'TOPCON', 'BC'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_module_grade_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_module_grade_check
      CHECK (module_grade IS NULL OR module_grade IN ('1', '2', '3', 'NA'));
  END IF;
END$$;

COMMENT ON COLUMN products.module_efficiency IS
  '모듈 효율 (%) — 예: 22.50. 정격 출력 / (가로 × 세로 × 1000W/m²) × 100.';
COMMENT ON COLUMN products.module_type IS
  '모듈 셀 종류 — PERC / TOPCON / BC. wafer_platform(N-type/M10)·cell_config(72셀)와 별개의 셀 기술 구분.';
COMMENT ON COLUMN products.module_grade IS
  '모듈 등급 — 한국 탄소인증제 등급. 1(670kg-CO2/kW 이하) / 2(670~750) / 3(750 초과) / NA(미해당). RPS 가중치에 영향.';
