-- @auto-apply: yes
-- 105_db_anomaly_snapshots.sql
--
-- 배경: 본 세션에서 fifo.over_allocation 100건 → 0건 추이가 v_db_anomalies
-- count 로 추적 가능하다는 점이 드러났다. 일별 snapshot 을 보존해 정합성
-- 진척을 운영자에게 그래프로 보여주면 정량 측정이 가능해진다.
--
-- 본 마이그레이션:
--   1. db_anomaly_snapshots 테이블 (rule_name, severity, count, taken_at)
--   2. RPC: snapshot_db_anomalies() — 호출 시 현재 v_db_anomalies count 를
--      룰별로 캡처해 행 INSERT. 하루 1회 cron 으로 호출하면 일별 시계열 완성.
--   3. 즉시 1회 호출해서 baseline 행 생성.

BEGIN;

CREATE TABLE IF NOT EXISTS db_anomaly_snapshots (
  snapshot_id  bigserial PRIMARY KEY,
  rule_name    text NOT NULL,
  severity     text NOT NULL,
  category     text NOT NULL,
  count        integer NOT NULL,
  taken_at     timestamptz NOT NULL DEFAULT now(),
  taken_date   date GENERATED ALWAYS AS ((taken_at AT TIME ZONE 'Asia/Seoul')::date) STORED
);

-- 하루 1행씩만 보존: 같은 룰+같은 날짜는 덮어쓰지 않고 그날의 최초 캡처만 유효.
-- (앱 레벨에서 UPSERT 로 하루 1행 룰 보장)
CREATE UNIQUE INDEX IF NOT EXISTS db_anomaly_snapshots_rule_date_uidx
  ON db_anomaly_snapshots (rule_name, taken_date);

CREATE INDEX IF NOT EXISTS db_anomaly_snapshots_date_idx
  ON db_anomaly_snapshots (taken_date DESC);

-- RPC: 현재 v_db_anomalies 의 룰별 count 를 snapshot 으로 캡처
CREATE OR REPLACE FUNCTION snapshot_db_anomalies()
RETURNS TABLE(out_rule_name text, out_count integer) AS $$
BEGIN
  RETURN QUERY
  WITH counts AS (
    SELECT v.rule_name AS r, v.severity AS sev, v.category AS cat, COUNT(*)::int AS c
    FROM v_db_anomalies v
    GROUP BY v.rule_name, v.severity, v.category
  ),
  inserted AS (
    INSERT INTO db_anomaly_snapshots AS t (rule_name, severity, category, count)
    SELECT r, sev, cat, c FROM counts
    ON CONFLICT (rule_name, taken_date)
    DO UPDATE SET count = EXCLUDED.count,
                  severity = EXCLUDED.severity,
                  category = EXCLUDED.category
    RETURNING t.rule_name AS r, t.count AS c
  )
  SELECT i.r, i.c FROM inserted i ORDER BY i.r;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE db_anomaly_snapshots IS
  'v_db_anomalies 의 룰별 count 일별 스냅샷. 운영 cron 에서 매일 snapshot_db_anomalies() 호출 권장.';
COMMENT ON FUNCTION snapshot_db_anomalies() IS
  '현재 v_db_anomalies 의 룰별 카운트를 db_anomaly_snapshots 에 일별 1행씩 기록 (한국시간 기준).';

-- 즉시 baseline 1회 실행
SELECT snapshot_db_anomalies();

DO $$
DECLARE v_n int;
BEGIN
  SELECT COUNT(*) INTO v_n FROM db_anomaly_snapshots;
  RAISE NOTICE '[105] db_anomaly_snapshots baseline 캡처: %행', v_n;
END $$;

COMMIT;
