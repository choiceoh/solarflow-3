-- @auto-apply: yes
-- 104_partners_normalized_name.sql
--
-- 배경: fifo 정리 (097-103) 작업에서 거래처 이름 표기 변형 ('바로 주식회사' /
-- '바로(주)', '주식회사 미래에스엠' / '(주)미래에스엠' 등) 때문에 매칭이 일관되게
-- 안 잡혀 마이그레이션 한 번 더 (103) 가 필요했다. 회사명 정규화를 1급 시민
-- 으로 도입해 향후 모든 임포터·매칭에서 표준 키로 쓸 수 있게 한다.
--
-- 본 마이그레이션:
--   1. norm_company(text) 함수: 주식회사/유한회사/(주)/(유)/㈜/공백 제거 + 소문자
--   2. partners.normalized_name 컬럼 추가, 함수 결과로 채움
--   3. UNIQUE index — 정규화된 이름은 (partner_type 별) 유일해야 함
--   4. trigger: INSERT/UPDATE 시 자동 sync, 수동 SET 불가
--
-- 향후 룰 (harness/RULES.md): 모든 customer/supplier 매칭 SQL 은 partner_name 이
-- 아니라 normalized_name 으로 JOIN/비교. fifo 임포터, 거래처 자동 매칭, OCR
-- 거래처 추정 등에 적용.

BEGIN;

-- 1) 정규화 함수 (103 에서 inline 으로 만들었던 것을 표준 함수로 승격)
CREATE OR REPLACE FUNCTION norm_company(name text) RETURNS text AS $$
  SELECT lower(regexp_replace(
    regexp_replace(
      COALESCE(name, ''),
      '(주식회사|유한회사|\(주\)|\(유\)|㈜|㈠|주식)', '', 'g'
    ),
    '\s+', '', 'g'
  ))
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION norm_company(text) IS
  '회사명 정규화: 주식회사·유한회사·(주)·㈜·공백 제거 후 소문자. fifo/import 매칭의 표준 키.';

-- 2) partners.normalized_name 컬럼
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS normalized_name text
    GENERATED ALWAYS AS (norm_company(partner_name)) STORED;

-- 3) UNIQUE index (partner_type 별)
-- - 같은 (정규화이름, partner_type) 조합은 단 하나의 partner 만 존재해야 함
-- - 다만 기존 데이터에 중복이 있을 수 있으므로 먼저 점검만 하고 안전하면 추가
DO $$
DECLARE
  v_dup int;
BEGIN
  SELECT COUNT(*) INTO v_dup FROM (
    SELECT normalized_name, partner_type, COUNT(*) AS n
    FROM partners
    WHERE is_active = true AND normalized_name <> ''
    GROUP BY normalized_name, partner_type
    HAVING COUNT(*) > 1
  ) t;
  IF v_dup = 0 THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS partners_normalized_name_type_uidx
             ON partners (normalized_name, partner_type) WHERE is_active = true';
    RAISE NOTICE '[104] partners_normalized_name_type_uidx 생성 완료';
  ELSE
    RAISE NOTICE '[104] 정규화 이름 중복 % 그룹 — UNIQUE index 생성 보류. 수동 통폐합 필요.', v_dup;
  END IF;
END $$;

-- 4) 일반 (non-unique) lookup index 는 무조건 생성
CREATE INDEX IF NOT EXISTS partners_normalized_name_idx
  ON partners (normalized_name);

-- 5) 검증
DO $$
DECLARE v_filled int; v_total int;
BEGIN
  SELECT COUNT(*) INTO v_total FROM partners;
  SELECT COUNT(*) INTO v_filled FROM partners WHERE normalized_name <> '';
  RAISE NOTICE '[104] partners.normalized_name 채워진 행: %/%', v_filled, v_total;
END $$;

COMMIT;
