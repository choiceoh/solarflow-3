-- @auto-apply: yes
-- M160: sales.currency NULL → 'KRW' 백필 + NOT NULL DEFAULT 'KRW'
--
-- 배경 (운영자 확인 2026-05-18):
--   /admin/db-integrity 에 "sales 외화: KRW 100%" 검사가 1140건 fail.
--   실제 조회 결과 외화(USD/CNY) 매출은 0건이고, 전부 currency = NULL.
--   분포: TS 525 / DW 587 / HS 28 — 전 회사에 흩어진 단순 누락이며,
--   sales 는 국내 매출 (세금계산서) 정본이라 KRW 가 사업적으로 유일한 값이다.
--
-- 본 마이그:
--   1) NULL 인 모든 sales.currency 를 'KRW' 로 백필
--   2) DEFAULT 'KRW' 부여 — 향후 INSERT 시 누락 방지
--   3) NOT NULL 강제 — integrity check 가 재발 안 하도록
--
-- 멱등성: 이미 KRW 인 행은 영향 없음 (WHERE currency IS NULL).
-- 외화 매출이 도입되면 별도 마이그로 CHECK 추가 + NOT NULL 유지.

UPDATE sales
SET currency = 'KRW'
WHERE currency IS NULL;

ALTER TABLE sales ALTER COLUMN currency SET DEFAULT 'KRW';
ALTER TABLE sales ALTER COLUMN currency SET NOT NULL;
