-- @auto-apply: yes
-- 124_list_db_anomaly_snapshots_rpc.sql
--
-- /admin/db-integrity 페이지의 일별 추세 그래프 (D-20260512-171222 룰 6) 용
-- RPC. 105 의 db_anomaly_snapshots 를 룰별 N일 시계열로 반환.

CREATE OR REPLACE FUNCTION list_db_anomaly_snapshots(p_days int DEFAULT 30)
RETURNS TABLE(
  rule_name text,
  severity  text,
  category  text,
  taken_date date,
  count     int
) AS $$
  SELECT s.rule_name, s.severity, s.category, s.taken_date, s.count
  FROM db_anomaly_snapshots s
  WHERE s.taken_date >= ((now() AT TIME ZONE 'Asia/Seoul')::date - p_days)
  ORDER BY s.rule_name, s.taken_date
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION list_db_anomaly_snapshots(int) IS
  '최근 N일 (기본 30) 의 db_anomaly_snapshots 룰별 시계열. /admin/db-integrity 추세 그래프용.';
