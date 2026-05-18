-- @auto-apply: yes
-- 160_products_wattage_kw_auto_trigger.sql
-- products.wattage_kw 를 spec_wp 기반 자동 동기 컬럼으로 강등 (PR 1/2).
--
-- 배경:
--  - wattage_kw = spec_wp / 1000 으로 항상 일치해야 하나, 과거 일괄 보정 사고
--    (PROGRESS.md:2397) 후에도 INSERT 경로마다 분산되어 drift 위험 잔존.
--  - 현재 운영 DB 정합성 확인 결과 drift 0건, wattage_kw NULL 4건 (spec_wp 있는 3건 + 둘 다
--    NULL 1건).
--
-- 변경:
--  1) BEFORE INSERT OR UPDATE trigger 로 spec_wp 가 NOT NULL 이면 wattage_kw 를
--     spec_wp::numeric / 1000.0 으로 강제 덮어쓴다. spec_wp NULL 인 행은 legacy 호환
--     (D-056 draft) 을 위해 wattage_kw 를 그대로 둔다.
--  2) 백필: spec_wp 있는데 wattage_kw NULL 인 3행을 자동 계산값으로 채운다.
--
-- 다음 PR (PR 2): 모든 SELECT 경로 정리 후 컬럼을 GENERATED ALWAYS AS (...) STORED 로
--                 전환 + 트리거 제거.

CREATE OR REPLACE FUNCTION products_sync_wattage_kw()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.spec_wp IS NOT NULL THEN
    NEW.wattage_kw := NEW.spec_wp::numeric / 1000.0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_sync_wattage_kw_trg ON products;
CREATE TRIGGER products_sync_wattage_kw_trg
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION products_sync_wattage_kw();

-- 백필: spec_wp 있는데 wattage_kw NULL 인 행 (CS1U-MS-1, CS7N-695TB-AG-1, RSM156-9-635BNDG)
UPDATE products
SET wattage_kw = spec_wp::numeric / 1000.0
WHERE spec_wp IS NOT NULL AND wattage_kw IS NULL;

COMMENT ON FUNCTION products_sync_wattage_kw IS
  'products.wattage_kw 를 spec_wp/1000 으로 강제 동기 (D-160 PR1). PR2 에서 컬럼이 generated 로 전환되면 트리거 제거.';
COMMENT ON COLUMN products.wattage_kw IS
  'spec_wp 의 kW 환산 캐시. 입력 금지 — BEFORE 트리거가 spec_wp 기반으로 자동 채움. PR2 에서 GENERATED 컬럼으로 전환 예정.';
