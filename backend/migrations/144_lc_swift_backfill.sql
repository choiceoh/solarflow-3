-- M144: SWIFT MT700 자료 기반 신규 LC 백필 + po_id NULL 허용
-- @auto-apply: yes
-- 출처: KDB_SWIFT_발신 PDF 본문 파싱 (산업은행 발신 MT700 표준 메시지)
-- 자사 LC 무조건 90일 usance (운영자 확인 2026-05-15, SWIFT :42C: 100% 매치)
-- 등록 후보: 9건 (산업은행, 진코/론지 LC)
--
-- 스키마 변경: lc_records.po_id NULL 허용
--   사유: 9 신규 LC 중 7건이 2024년인데 운영 DB 의 PO 데이터는 2025-03 이후만 보유.
--         system 도입 이전 LC 라도 SWIFT 자료로 보관 가치 있음.
--         운영자가 추후 PO 입력 시 po_id 채워질 수 있도록 nullable 로 변경.
-- 멱등성: (lc_number, open_date, amount_usd) 동일 행이 이미 있으면 skip

-- 1. po_id NOT NULL 제약 완화
ALTER TABLE lc_records ALTER COLUMN po_id DROP NOT NULL;
COMMENT ON COLUMN lc_records.po_id IS 'PO 참조 (NULL 허용 — system 도입 이전 SWIFT-only LC 자료 등 PO 미입력 케이스 보관).';

-- 2. 9 LC 신규 INSERT
BEGIN;
-- M0215402NU00071 | 2024-02-20 | USD     536,213.25 | 산업은행 | ZHEJIANG JINKO SOLAR CO.,LTD
INSERT INTO lc_records (lc_number, bank_id, company_id, open_date, amount_usd, usance_days, status, memo)
SELECT 'M0215402NU00071', 'e13be7f2-d835-4893-9a87-3e0581a96eab'::uuid, '99f0fc15-0555-4a41-a025-8bf3630a7947'::uuid, '2024-02-20'::date, 536213.25, 90, 'settled',
  'M144: SWIFT MT700 자료 백필 (산업은행 KDB_SWIFT 발신 PDF). beneficiary=ZHEJIANG JINKO SOLAR CO.,LTD'
WHERE NOT EXISTS (SELECT 1 FROM lc_records WHERE lc_number='M0215402NU00071' AND open_date='2024-02-20'::date AND amount_usd=536213.25);

-- M0215402NU00089 | 2024-02-21 | USD     536,213.25 | 산업은행 | ZHEJIANG JINKO SOLAR CO.,LTD
INSERT INTO lc_records (lc_number, bank_id, company_id, open_date, amount_usd, usance_days, status, memo)
SELECT 'M0215402NU00089', 'e13be7f2-d835-4893-9a87-3e0581a96eab'::uuid, '99f0fc15-0555-4a41-a025-8bf3630a7947'::uuid, '2024-02-21'::date, 536213.25, 90, 'settled',
  'M144: SWIFT MT700 자료 백필 (산업은행 KDB_SWIFT 발신 PDF). beneficiary=ZHEJIANG JINKO SOLAR CO.,LTD'
WHERE NOT EXISTS (SELECT 1 FROM lc_records WHERE lc_number='M0215402NU00089' AND open_date='2024-02-21'::date AND amount_usd=536213.25);

-- M0215403NU00300 | 2024-03-25 | USD   1,072,426.50 | 산업은행 | ZHEJIANG JINKO SOLAR CO.,LTD
INSERT INTO lc_records (lc_number, bank_id, company_id, open_date, amount_usd, usance_days, status, memo)
SELECT 'M0215403NU00300', 'e13be7f2-d835-4893-9a87-3e0581a96eab'::uuid, '99f0fc15-0555-4a41-a025-8bf3630a7947'::uuid, '2024-03-25'::date, 1072426.5, 90, 'settled',
  'M144: SWIFT MT700 자료 백필 (산업은행 KDB_SWIFT 발신 PDF). beneficiary=ZHEJIANG JINKO SOLAR CO.,LTD'
WHERE NOT EXISTS (SELECT 1 FROM lc_records WHERE lc_number='M0215403NU00300' AND open_date='2024-03-25'::date AND amount_usd=1072426.5);

-- M0215405NU00228 | 2024-05-21 | USD     319,438.94 | 산업은행 | LONGI SOLAR TECHNOLOGY CO.,LTD.
INSERT INTO lc_records (lc_number, bank_id, company_id, open_date, amount_usd, usance_days, status, memo)
SELECT 'M0215405NU00228', 'e13be7f2-d835-4893-9a87-3e0581a96eab'::uuid, '99f0fc15-0555-4a41-a025-8bf3630a7947'::uuid, '2024-05-21'::date, 319438.94, 90, 'settled',
  'M144: SWIFT MT700 자료 백필 (산업은행 KDB_SWIFT 발신 PDF). beneficiary=LONGI SOLAR TECHNOLOGY CO.,LTD.'
WHERE NOT EXISTS (SELECT 1 FROM lc_records WHERE lc_number='M0215405NU00228' AND open_date='2024-05-21'::date AND amount_usd=319438.94);

-- M0215405NU00331 | 2024-05-30 | USD     638,877.89 | 산업은행 | LONGI SOLAR TECHNOLOGY CO.,LTD.
INSERT INTO lc_records (lc_number, bank_id, company_id, open_date, amount_usd, usance_days, status, memo)
SELECT 'M0215405NU00331', 'e13be7f2-d835-4893-9a87-3e0581a96eab'::uuid, '99f0fc15-0555-4a41-a025-8bf3630a7947'::uuid, '2024-05-30'::date, 638877.89, 90, 'settled',
  'M144: SWIFT MT700 자료 백필 (산업은행 KDB_SWIFT 발신 PDF). beneficiary=LONGI SOLAR TECHNOLOGY CO.,LTD.'
WHERE NOT EXISTS (SELECT 1 FROM lc_records WHERE lc_number='M0215405NU00331' AND open_date='2024-05-30'::date AND amount_usd=638877.89);

-- M0215407NU00395 | 2024-07-25 | USD     945,177.66 | 산업은행 | ZHEJIANG JINKO SOLAR CO.,LTD
INSERT INTO lc_records (lc_number, bank_id, company_id, open_date, amount_usd, usance_days, status, memo)
SELECT 'M0215407NU00395', 'e13be7f2-d835-4893-9a87-3e0581a96eab'::uuid, '99f0fc15-0555-4a41-a025-8bf3630a7947'::uuid, '2024-07-25'::date, 945177.66, 90, 'settled',
  'M144: SWIFT MT700 자료 백필 (산업은행 KDB_SWIFT 발신 PDF). beneficiary=ZHEJIANG JINKO SOLAR CO.,LTD'
WHERE NOT EXISTS (SELECT 1 FROM lc_records WHERE lc_number='M0215407NU00395' AND open_date='2024-07-25'::date AND amount_usd=945177.66);

-- M0215407NU00370 | 2024-07-25 | USD     945,177.66 | 산업은행 | ZHEJIANG JINKO SOLAR CO.,LTD
INSERT INTO lc_records (lc_number, bank_id, company_id, open_date, amount_usd, usance_days, status, memo)
SELECT 'M0215407NU00370', 'e13be7f2-d835-4893-9a87-3e0581a96eab'::uuid, '99f0fc15-0555-4a41-a025-8bf3630a7947'::uuid, '2024-07-25'::date, 945177.66, 90, 'settled',
  'M144: SWIFT MT700 자료 백필 (산업은행 KDB_SWIFT 발신 PDF). beneficiary=ZHEJIANG JINKO SOLAR CO.,LTD'
WHERE NOT EXISTS (SELECT 1 FROM lc_records WHERE lc_number='M0215407NU00370' AND open_date='2024-07-25'::date AND amount_usd=945177.66);

-- M0215410NU00281 | 2024-10-15 | USD   4,725,888.30 | 산업은행 | ZHEJIANG JINKO SOLAR CO.,LTD
INSERT INTO lc_records (lc_number, bank_id, company_id, open_date, amount_usd, usance_days, status, memo)
SELECT 'M0215410NU00281', 'e13be7f2-d835-4893-9a87-3e0581a96eab'::uuid, '99f0fc15-0555-4a41-a025-8bf3630a7947'::uuid, '2024-10-15'::date, 4725888.3, 90, 'settled',
  'M144: SWIFT MT700 자료 백필 (산업은행 KDB_SWIFT 발신 PDF). beneficiary=ZHEJIANG JINKO SOLAR CO.,LTD'
WHERE NOT EXISTS (SELECT 1 FROM lc_records WHERE lc_number='M0215410NU00281' AND open_date='2024-10-15'::date AND amount_usd=4725888.3);

-- M0215509NU00317 | 2025-09-22 | USD   2,999,986.88 | 산업은행 | LONGI SOLAR TECHNOLOGY CO.,LTD
INSERT INTO lc_records (lc_number, bank_id, company_id, open_date, amount_usd, usance_days, status, memo)
SELECT 'M0215509NU00317', 'e13be7f2-d835-4893-9a87-3e0581a96eab'::uuid, '99f0fc15-0555-4a41-a025-8bf3630a7947'::uuid, '2025-09-22'::date, 2999986.88, 90, 'settled',
  'M144: SWIFT MT700 자료 백필 (산업은행 KDB_SWIFT 발신 PDF). beneficiary=LONGI SOLAR TECHNOLOGY CO.,LTD'
WHERE NOT EXISTS (SELECT 1 FROM lc_records WHERE lc_number='M0215509NU00317' AND open_date='2025-09-22'::date AND amount_usd=2999986.88);

COMMIT;
