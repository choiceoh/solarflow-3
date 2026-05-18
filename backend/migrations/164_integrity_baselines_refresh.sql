-- @auto-apply: yes
-- M161: v_integrity_check baseline 갱신 — sales 1976→3116, outbounds(active) 2229→3343
--
-- 배경 (운영자 확인 2026-05-18):
--   /admin/db-integrity 의 high severity 2건이 baseline 노후로 false-positive.
--     - 'sales 행수': baseline 1976 vs actual 3116 (+58%, 5% tolerance 초과)
--     - 'outbounds 행수 (active)': baseline 2229 vs actual 3343 (+50%)
--   둘 다 정상적인 ERP 백필 누적 증가 — "데이터 손실"이 아니라 데이터 추가다.
--   M077 (2025-12 경) 의 baseline 이 2026-05 운영 데이터를 따라잡지 못함.
--
-- 본 마이그:
--   v_integrity_check 의 두 baseline 값만 갱신. view 본문은 통째 재정의가 필요하지만
--   M115 의 정의(539 줄)를 그대로 복사하지 않고 pg_get_viewdef + replace 로 in-place 패치
--   → M115 이후 누군가 view 를 수정해도 그 변경이 보존된다.
--
--   다른 baseline (inbounds 117, fifo_matches 3332, products 104) 은 actual 과 5~10% 이내라
--   유지. tolerance 가 자연 증가를 흡수.
--
-- 멱등성: replace 패턴이 매칭되지 않으면 (이미 패치됨) 본문이 그대로 유지 → 부작용 없음.
-- mv_integrity_check 즉시 REFRESH 로 admin UI 가 다음 호출부터 새 baseline 적용.

DO $$
DECLARE
  viewdef text;
BEGIN
  viewdef := pg_get_viewdef('v_integrity_check'::regclass);

  -- sales 1976 → 3116
  viewdef := replace(viewdef, '(1976)::numeric AS baseline', '(3116)::numeric AS baseline');
  viewdef := replace(viewdef, '(count(*) - 1976)',           '(count(*) - 3116)');
  viewdef := replace(viewdef, '1976.0',                      '3116.0');

  -- outbounds(active) 2229 → 3343
  viewdef := replace(viewdef, '2229 AS baseline',            '3343 AS baseline');
  viewdef := replace(viewdef, '(count(*) - 2229)',           '(count(*) - 3343)');
  viewdef := replace(viewdef, '2229.0',                      '3343.0');

  EXECUTE 'CREATE OR REPLACE VIEW v_integrity_check AS ' || viewdef;
END $$;

REFRESH MATERIALIZED VIEW mv_integrity_check;
