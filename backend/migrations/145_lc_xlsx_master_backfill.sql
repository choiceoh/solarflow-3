-- M145: xlsx 마스터 자료 기반 2025-03 이후 누락 LC 등록
-- @auto-apply: yes
-- 출처: 수입진행상황(module)-2025년도.xlsx + 2026년도.xlsx (운영자 관리 마스터)
-- 자사 LC 무조건 90일 usance
--
-- 누락 5건 (2025-03 이후, xlsx 자료 확인):
--   M12MK2507NU00032: 하나은행, 캔슬완료 (status='cancelled')
--   M04NG2512NU00018: 기업은행 (신규), 디원, 론지 LR7-72HYD-645M, $101,146.32 (Amount)
--   M04NG2512NU00025: 기업은행, 디원, 론지, $702,347.24
--   M42M62602NU00018: 신한은행, 탑솔라(주), 론지 540W, $274,104
--   M100R2603NU00032: 국민은행, 론지솔라, 615W, $1,854,523.89
--
-- 별도 보류: M04PH2512NU00032 (xlsx 미수록 — 운영자 자료 확인 필요)
--
-- 운영자 확인 사항 (PR 본문):
--   - xlsx 의 prefix → 은행 매핑이 운영 DB 의 M119/M124 백필 추정과 다름
--     예: M100R = 국민 (xlsx) vs 광주 (DB 백필). M12MK = 하나 (xlsx) vs 신한 (DB 백필).
--     기존 운영 DB 의 추정 매핑 행 재검증 필요 (별도 정합 마이그 후보)

-- ============================================================
-- 1. banks 마스터에 기업은행 추가 (운영 DB 미등록)
-- ============================================================
INSERT INTO banks (company_id, bank_name, lc_limit_usd, is_active, memo)
SELECT '99f0fc15-0555-4a41-a025-8bf3630a7947'::uuid, '기업은행', 0, true,
  'M145: xlsx 마스터에서 M04NG/M04PH prefix LC 발견하여 추가. 한도/수수료율 운영자 입력 필요'
WHERE NOT EXISTS (SELECT 1 FROM banks WHERE bank_name = '기업은행');

-- ============================================================
-- 2. 5건 LC INSERT (모두 자사 90일 usance, po_id NULL — M144 에서 허용함)
-- ============================================================
BEGIN;

-- M12MK2507NU00032: 하나은행 / 캔슬완료
INSERT INTO lc_records (lc_number, bank_id, company_id, open_date, amount_usd, usance_days, status, memo)
SELECT 'M12MK2507NU00032',
       (SELECT bank_id FROM banks WHERE bank_name='하나은행' LIMIT 1),
       '99f0fc15-0555-4a41-a025-8bf3630a7947'::uuid,
       '2025-07-23'::date, 4895028.48, 90, 'cancelled',
       'M145: xlsx 마스터 (수입진행상황 2025년도 row 569). 85938 PCS @ 0.089 / 캔슬완료'
WHERE NOT EXISTS (SELECT 1 FROM lc_records WHERE lc_number='M12MK2507NU00032' AND open_date='2025-07-23'::date);

-- M04NG2512NU00018: 기업은행 / 디원 / 론지 1584 PCS @ 0.099
INSERT INTO lc_records (lc_number, bank_id, company_id, open_date, amount_usd, target_qty, usance_days, status, memo)
SELECT 'M04NG2512NU00018',
       (SELECT bank_id FROM banks WHERE bank_name='기업은행' LIMIT 1),
       '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c'::uuid,  -- 디원
       '2025-12-01'::date, 101146.32, 1584, 90, 'settled',
       'M145: xlsx 마스터 (수입진행상황 2025년도 row 1159). 디원 / 론지 LR7-72HYD-645M / BL=SHADGV03730 / ETD 2025-12-09 / 충남 천안(화덕3)'
WHERE NOT EXISTS (SELECT 1 FROM lc_records WHERE lc_number='M04NG2512NU00018' AND open_date='2025-12-01'::date);

-- M04NG2512NU00025: 기업은행 / 디원 / amount 702347.24
INSERT INTO lc_records (lc_number, bank_id, company_id, open_date, amount_usd, target_qty, usance_days, status, memo)
SELECT 'M04NG2512NU00025',
       (SELECT bank_id FROM banks WHERE bank_name='기업은행' LIMIT 1),
       '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c'::uuid,  -- 디원
       '2025-12-16'::date, 702347.24, 3323, 90, 'settled',
       'M145: xlsx 마스터 (수입진행상황 2025년도 row 1189). 디원 / 론지 / BL=SHADHG40310 / 충북 청주(사정리104)'
WHERE NOT EXISTS (SELECT 1 FROM lc_records WHERE lc_number='M04NG2512NU00025' AND open_date='2025-12-16'::date);

-- M42M62602NU00018: 신한은행 / 탑솔라 / 론지 540W 3384PCS
INSERT INTO lc_records (lc_number, bank_id, company_id, open_date, amount_usd, target_qty, usance_days, status, memo)
SELECT 'M42M62602NU00018',
       (SELECT bank_id FROM banks WHERE bank_name='신한은행' LIMIT 1),
       '99f0fc15-0555-4a41-a025-8bf3630a7947'::uuid,  -- 탑솔라
       '2026-02-20'::date, 274104.00, 3384, 90, 'settled',
       'M145: xlsx 마스터 (수입진행상황 2026년도 론지솔라 sheet row 122). 탑솔라 / 론지 540W @ 0.15 / BL=DFS815002451 / ETD 2026-04-25 / 광양'
WHERE NOT EXISTS (SELECT 1 FROM lc_records WHERE lc_number='M42M62602NU00018' AND open_date='2026-02-20'::date);

-- M100R2603NU00032: 국민은행 / 론지 615W
INSERT INTO lc_records (lc_number, bank_id, company_id, open_date, amount_usd, target_qty, usance_days, status, memo)
SELECT 'M100R2603NU00032',
       (SELECT bank_id FROM banks WHERE bank_name='국민은행' LIMIT 1),
       '99f0fc15-0555-4a41-a025-8bf3630a7947'::uuid,  -- 탑솔라 (xlsx 시트=론지솔라)
       '2026-03-12'::date, 1854523.89, 14360, 90, 'settled',
       'M145: xlsx 마스터 (수입진행상황 2026년도 론지솔라 sheet row 61). 론지 615W 14360 PCS / BL=DFS815002470 / ETD 2026-05-05 / 광양'
WHERE NOT EXISTS (SELECT 1 FROM lc_records WHERE lc_number='M100R2603NU00032' AND open_date='2026-03-12'::date);

COMMIT;
