-- @auto-apply: yes
-- 081_integrity_mview.sql
-- v_integrity_check VIEW → MATERIALIZED VIEW 전환 (D-064 PR 39).
--
-- 이슈: PR 38 의 view 가 5.27초 — PostgREST statement_timeout (3초) 초과로
-- /api/v1/admin/db-integrity 가 항상 500 반환. MATERIALIZED VIEW 로 전환해
-- SELECT 는 즉시, REFRESH 만 명시적 (운영자 '재검증' 버튼 또는 cron).

DROP MATERIALIZED VIEW IF EXISTS mv_integrity_check;

-- 같은 정의 — VIEW 의 SELECT 그대로 MATERIALIZED 로 복제
CREATE MATERIALIZED VIEW mv_integrity_check AS
  SELECT * FROM v_integrity_check;

CREATE UNIQUE INDEX mv_integrity_check_name_uidx ON mv_integrity_check (name);
CREATE INDEX mv_integrity_check_severity_idx ON mv_integrity_check (severity, status);

COMMENT ON MATERIALIZED VIEW mv_integrity_check IS
  'D-064 PR 39: v_integrity_check 의 캐시. SELECT 즉시 / REFRESH 만 5초+ 소요.
운영자가 사이드바 DB 정합성 진입 시 즉시 표시, 재검증 버튼이 RPC 호출.';

-- REFRESH RPC — frontend 의 '재검증' 버튼이 호출
CREATE OR REPLACE FUNCTION refresh_integrity_check()
RETURNS TABLE(name text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_integrity_check;
  RETURN QUERY SELECT m.name, m.status FROM mv_integrity_check m;
END;
$$;

COMMENT ON FUNCTION refresh_integrity_check() IS
  'mv_integrity_check 갱신 (CONCURRENTLY — 락 없이). SECURITY DEFINER 로
PostgREST timeout 우회 (함수 자체가 더 긴 timeout). 5초 정도 소요.';

-- 권한
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON mv_integrity_check TO authenticated;
    GRANT EXECUTE ON FUNCTION refresh_integrity_check() TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON mv_integrity_check TO service_role;
    GRANT EXECUTE ON FUNCTION refresh_integrity_check() TO service_role;
  END IF;
END $$;

-- 첫 갱신 (SELECT 시 빈 결과 회피)
REFRESH MATERIALIZED VIEW mv_integrity_check;
