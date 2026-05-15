-- M143: LC 만기일 보강 — ETD-null 백필 + 자동계산 트리거 + 미도래 view
-- @auto-apply: yes
-- 후속작업 of M142:
--   1) ETD 미입력 6 BL: actual_arrival 로 lc_maturity 추정 백필
--   2) Trigger: bl_shipments INSERT/UPDATE 시 lc_id+etd(또는 fallback) 있으면 자동 채움
--   3) View v_lc_maturity_upcoming: 만기 30일 이내 도래 BL 알림용

-- ============================================================================
-- 1. ETD null 6 BL 백필 (actual_arrival 로 대체 — 보수적, 만기 조금 늦게 잡힘)
-- ============================================================================
BEGIN;
UPDATE bl_shipments
SET lc_maturity_date = (coalesce(etd::date, actual_arrival::date, eta::date) + 90),
    updated_at = now()
WHERE lc_id IS NOT NULL
  AND lc_maturity_date IS NULL
  AND coalesce(etd, actual_arrival, eta) IS NOT NULL;
COMMIT;

-- ============================================================================
-- 2. Trigger: lc_id + etd/arrival/eta 채워질 때 lc_maturity_date 자동 계산
-- ============================================================================
CREATE OR REPLACE FUNCTION sf_bl_shipments_compute_lc_maturity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- 자사 LC 무조건 90일 usance (운영자 확인 2026-05-15)
  -- 이미 사람이 값을 명시한 경우(NEW.lc_maturity_date 변경됨)는 존중
  IF NEW.lc_id IS NOT NULL
     AND NEW.lc_maturity_date IS NULL
     AND coalesce(NEW.etd, NEW.actual_arrival, NEW.eta) IS NOT NULL
  THEN
    NEW.lc_maturity_date := (coalesce(NEW.etd::date, NEW.actual_arrival::date, NEW.eta::date) + 90);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_bl_shipments_compute_lc_maturity ON bl_shipments;
CREATE TRIGGER trg_bl_shipments_compute_lc_maturity
  BEFORE INSERT OR UPDATE OF lc_id, etd, actual_arrival, eta ON bl_shipments
  FOR EACH ROW
  EXECUTE FUNCTION sf_bl_shipments_compute_lc_maturity();

COMMENT ON FUNCTION sf_bl_shipments_compute_lc_maturity IS
  'BEFORE INSERT/UPDATE 시 lc_id + 선적/도착 일자가 있고 lc_maturity_date 가 비어있으면 자동 채움 (B/L date + 90일).';

-- ============================================================================
-- 3. View: 만기 도래 알림 (오늘 ~ 30일 이내) + 도래 임박/도래완료 구분
-- ============================================================================
CREATE OR REPLACE VIEW v_lc_maturity_upcoming AS
SELECT
  b.bl_id,
  b.bl_number,
  b.company_id,
  c.company_name,
  b.lc_id,
  l.lc_number,
  l.bank_id,
  bk.bank_name,
  l.amount_usd,
  b.etd::date            AS etd,
  b.actual_arrival::date AS actual_arrival,
  b.lc_maturity_date,
  (b.lc_maturity_date - CURRENT_DATE) AS days_until_maturity,
  CASE
    WHEN b.lc_maturity_date < CURRENT_DATE                       THEN 'overdue'
    WHEN b.lc_maturity_date <= CURRENT_DATE + INTERVAL '7 days'  THEN 'due_7d'
    WHEN b.lc_maturity_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'due_30d'
    ELSE                                                              'future'
  END AS maturity_bucket
FROM bl_shipments b
LEFT JOIN companies   c  ON c.company_id  = b.company_id
LEFT JOIN lc_records  l  ON l.lc_id       = b.lc_id
LEFT JOIN banks       bk ON bk.bank_id    = l.bank_id
WHERE b.lc_maturity_date IS NOT NULL
  AND b.lc_maturity_date <= CURRENT_DATE + INTERVAL '30 days'
  AND coalesce(l.status, 'unknown') <> 'settled'
ORDER BY b.lc_maturity_date;

COMMENT ON VIEW v_lc_maturity_upcoming IS
  '향후 30일 내 또는 이미 도래한 LC 만기 BL 알림. status=settled 인 LC 는 제외.';

-- ============================================================================
-- 4. View: 만기 도래 알림 (status 필터 없이 — 30일 이내 모든 BL, 대시보드용)
-- ============================================================================
CREATE OR REPLACE VIEW v_lc_maturity_calendar AS
SELECT
  b.bl_id,
  b.bl_number,
  c.company_name,
  l.lc_number,
  bk.bank_name,
  l.amount_usd,
  b.etd::date AS etd,
  b.lc_maturity_date,
  (b.lc_maturity_date - CURRENT_DATE) AS days_until_maturity,
  l.status AS lc_status
FROM bl_shipments b
LEFT JOIN companies   c  ON c.company_id  = b.company_id
LEFT JOIN lc_records  l  ON l.lc_id       = b.lc_id
LEFT JOIN banks       bk ON bk.bank_id    = l.bank_id
WHERE b.lc_maturity_date IS NOT NULL
ORDER BY b.lc_maturity_date;

COMMENT ON VIEW v_lc_maturity_calendar IS
  '모든 LC 만기 BL 의 캘린더 뷰 (대시보드용, status 무관).';

-- ============================================================================
-- 5. 권한
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT ON v_lc_maturity_upcoming, v_lc_maturity_calendar TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON v_lc_maturity_upcoming, v_lc_maturity_calendar TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT ON v_lc_maturity_upcoming, v_lc_maturity_calendar TO service_role;
  END IF;
END $$;
