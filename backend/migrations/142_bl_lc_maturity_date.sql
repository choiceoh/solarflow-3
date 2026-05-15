-- M142: bl_shipments.lc_maturity_date 컬럼 신설 + BL date + 90일 백필
-- @auto-apply: yes
-- 비즈니스 룰: 자사 LC 는 무조건 90일 usance (운영자 확인 2026-05-15)
-- 만기 정의: LC 어음 인수일 + 90일 ≈ B/L date + 90일
-- 모델: PO 1개 → LC 1개 → BL 여러 개 (평균 spread 10일, max 49일) →
--      LC 1행에 maturity 1개로 표현 불가 → BL 단위로 별도 컬럼 보관

ALTER TABLE bl_shipments
  ADD COLUMN IF NOT EXISTS lc_maturity_date date;

COMMENT ON COLUMN bl_shipments.lc_maturity_date IS
  'LC 어음 만기일 (B/L date + 90일, 자사 LC 무조건 90일 usance 기준)';

CREATE INDEX IF NOT EXISTS idx_bl_shipments_lc_maturity_date
  ON bl_shipments(lc_maturity_date)
  WHERE lc_maturity_date IS NOT NULL;

-- 백필: lc_id + etd 둘 다 있는 BL (93건 예상)
BEGIN;
UPDATE bl_shipments
SET lc_maturity_date = (etd::date + 90),
    updated_at = now()
WHERE lc_id IS NOT NULL
  AND etd IS NOT NULL
  AND lc_maturity_date IS NULL;
COMMIT;
