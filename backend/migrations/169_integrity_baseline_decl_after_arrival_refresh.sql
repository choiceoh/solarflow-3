-- @auto-apply: yes
-- M166: v_integrity_check 의 '면장 사후신고' baseline 43 → 86 갱신
--
-- 배경 (운영자 확인 2026-05-18):
--   /admin/db-integrity 의 low severity 'ERP 본질 (참고)' 카테고리에서
--   '면장 사후신고 (declaration > arrival)' baseline 43 vs actual 86 (+100%,
--   tolerance 20% 초과) 로 fail. M077 정의 시점 (2025-12 경) 의 baseline 이
--   2026-05 운영 데이터를 따라잡지 못함.
--
--   이는 데이터 손실이 아니라 ERP 면장 입력 패턴의 자연 누적 — 통관일 후 등록 관행
--   이 운영자 일상 업무이고, 26년 들어 declarations 행 자체가 증가하면서 같은 비율
--   이 자연스럽게 +x% 증가. M077 의 description 도 "수치 변화 시 ERP 면장 입력
--   패턴 변화. 운영자 확인" — 운영자가 패턴 변화 아님을 확인했으므로 baseline 만
--   갱신.
--
-- 본 마이그 — substring 충돌 방지:
--   M164 가 outbounds(active) baseline 을 3343 으로 갱신한 상태. 단순히 '43' 만
--   replace 하면 '3343' 도 같이 치환되는 사고가 난다 (dry-run 으로 검증함).
--   해결: 4-space 들여쓰기 + `- 43)))::numeric / 43.0` 의 풀 조건식을 anchor 로
--   잡아 decl_after_arrival 줄에만 정확히 매칭.
--
-- 멱등성: 이미 baseline=86 으로 바뀐 상태면 no-op. 매치 갯수 0 OR 1 만 허용.

DO $$
DECLARE
  viewdef text;
  baseline_43_n int;
  baseline_86_n int;
  arith_43_n    int;
  arith_86_n    int;
BEGIN
  viewdef := pg_get_viewdef('v_integrity_check'::regclass);

  baseline_43_n := (length(viewdef) - length(replace(viewdef, '    43 AS baseline,', ''))) / length('    43 AS baseline,');
  baseline_86_n := (length(viewdef) - length(replace(viewdef, '    86 AS baseline,', ''))) / length('    86 AS baseline,');
  arith_43_n    := (length(viewdef) - length(replace(viewdef, '- 43)))::numeric / 43.0', ''))) / length('- 43)))::numeric / 43.0');
  arith_86_n    := (length(viewdef) - length(replace(viewdef, '- 86)))::numeric / 86.0', ''))) / length('- 86)))::numeric / 86.0');

  -- 이미 적용됨 (멱등 no-op)
  IF baseline_43_n = 0 AND arith_43_n = 0 AND baseline_86_n >= 1 AND arith_86_n >= 1 THEN
    RAISE NOTICE '[166] 이미 baseline=86 적용됨 — no-op.';
    RETURN;
  END IF;

  -- 정상 적용 시나리오: 정확히 1 매치
  IF baseline_43_n != 1 OR arith_43_n != 1 THEN
    RAISE EXCEPTION
      '[166] anchor 매치 갯수 비정상 (baseline_43=%, baseline_86=%, arith_43=%, arith_86=%). view 정의가 예상 형식과 다름.',
      baseline_43_n, baseline_86_n, arith_43_n, arith_86_n;
  END IF;

  viewdef := replace(viewdef, '    43 AS baseline,', '    86 AS baseline,');
  viewdef := replace(viewdef, '- 43)))::numeric / 43.0', '- 86)))::numeric / 86.0');

  EXECUTE 'CREATE OR REPLACE VIEW v_integrity_check AS ' || viewdef;
  RAISE NOTICE '[166] baseline 43 → 86 갱신 완료.';
END $$;

-- mv_integrity_check materialized view 가 있으면 REFRESH (M164 패턴)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews WHERE schemaname='public' AND matviewname='mv_integrity_check'
  ) THEN
    REFRESH MATERIALIZED VIEW mv_integrity_check;
  END IF;
END $$;

-- 최종 검증
DO $$
DECLARE
  v_baseline numeric;
  v_status text;
BEGIN
  SELECT baseline, status INTO v_baseline, v_status
  FROM v_integrity_check WHERE name='면장 사후신고 (declaration > arrival)';
  RAISE NOTICE '[166] 면장 사후신고: baseline=%, status=% (기대 baseline=86, status=pass)', v_baseline, v_status;
  IF v_baseline != 86 OR v_status != 'pass' THEN
    RAISE WARNING '[166] 갱신 결과 비정상 — view 본문 또는 actual 값 확인 필요.';
  END IF;
END $$;
