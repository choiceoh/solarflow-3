-- @auto-apply: yes
-- 107: dashboard RPC 함수에 per-function statement_timeout 부여.
--
-- 증상 (운영 로그 24h):
--   [출고 대시보드 RPC 실패 — fallback 사용] (57014) canceling statement due to statement timeout (2회)
--
-- 원인:
--   - 'authenticated' role 의 statement_timeout = 8s.
--   - outbounds_dashboard() 정상 실행은 50~100ms (재현 측정) 인데,
--     autovacuum/lock 경합/cold cache 영향으로 가끔 spike → 8s 초과.
--   - fallback 경로마저 PostgREST 응답이 깨져 출고 탭이 빈 화면.
--
-- 수정:
--   - 함수 단위 SET statement_timeout = '30s' 으로 99th percentile 마진 확보.
--   - 함수 진입 시 GUC override, 종료/에러 시 자동 reset (Postgres 표준 동작).
--   - receipts/orders_dashboard 도 같은 카테고리 (074/075/104 가 plpgsql STABLE
--     + 다수 CTE) 이므로 예방적으로 함께 셋.
--
-- 통계 갱신: outbounds/sales/receipts/receipt_matches/orders 는 매일 수십~수백 행
--   변경. ANALYZE 로 plan stability 확보 — autovacuum 임계 도달 전 강제 갱신.

ALTER FUNCTION outbounds_dashboard(uuid, text, text, uuid, text, text)
  SET statement_timeout = '30s';

ALTER FUNCTION receipts_dashboard(uuid, uuid, text, date, date)
  SET statement_timeout = '30s';

ALTER FUNCTION orders_dashboard(uuid, uuid, text, text, text, text, text)
  SET statement_timeout = '30s';

ANALYZE outbounds;
ANALYZE sales;
ANALYZE orders;
ANALYZE receipts;
ANALYZE receipt_matches;
