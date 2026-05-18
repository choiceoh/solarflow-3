-- M155: 24년 PO/LC/BL 백필 — raw 수입진행상황 2024 시트 기준
-- @auto-apply: yes
--
-- raw 자료 (수입진행상황(module)-2025년도.xlsx::2024 시트) 에서 추출.
-- 추출: 24년 PO 11건, LC 24건, BL 62건.
-- DB 와의 차이 분석 후 누락분만 INSERT (멱등성: po_number / lc_number+po_id / bl_number).
--
-- 비교 결과:
--   기존 DB: PO 62, LC 58, BL 178
--   raw 24년 PO No 중 DB 신규: 6건
--   M155 신규 INSERT: PO 2건 + LC 19건 + BL 1건
BEGIN;

-- ─── 1) PO 11건 INSERT ──────────────────────────────────────
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '640192c3-3ec4-58a5-aee9-8d0e98bcd06d', '기산태양광 1차~4차', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'c0c0eb4d-3556-434f-8bbf-32c2c65651bc', 'spot', NULL, 'CIF', 3572, NULL, 'completed', 'M155: 24년 raw 2024시트 행702 백필'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = '기산태양광 1차~4차');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '61b19cd9-b82c-5546-96b0-b4776e8d89f4', 'CSI-TO240730', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'c0c0eb4d-3556-434f-8bbf-32c2c65651bc', 'spot', NULL, 'CIF', 462, NULL, 'completed', 'M155: 24년 raw 2024시트 행706 백필'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'CSI-TO240730');

-- ─── 2) LC 23건 INSERT ──────────────────────────────────────
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT '53245e58-919b-5613-8308-c63cbb26b2d6', po.po_id, 'M12MK2401NU00018', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 540492.7, '2024-01-17', NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2401NU00018)'
FROM purchase_orders po WHERE po.po_number = 'LGi-L-Sal-2203-0361-A012'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2401NU00018');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT 'ef48e8d7-b71e-54b1-bdef-e2448536e21a', po.po_id, 'M12MK2405NU00018', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 628404.48, '2024-05-09', NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2405NU00018)'
FROM purchase_orders po WHERE po.po_number = 'LGi-L-Sal-2203-0361-A012'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2405NU00018');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT 'a6874e3e-9891-5a04-946f-575e1015db1d', po.po_id, 'M12MK2407NU00018', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 611867.52, '2024-07-17', NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2407NU00018)'
FROM purchase_orders po WHERE po.po_number = 'LGi-L-Sal-2203-0361-A012'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2407NU00018');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT 'b3fe95b6-e4b4-5083-a419-c37ee15cb89c', po.po_id, 'M12MK2408NU00032', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 611867.52, '2024-08-13', NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2408NU00032)'
FROM purchase_orders po WHERE po.po_number = 'LGi-L-Sal-2203-0361-A012'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2408NU00032');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT '2fb0ba79-23ce-5ef3-b06e-5bf2321cab5a', po.po_id, 'M12MK2408NU00057', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 166988.84, '2024-08-23', NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2408NU00057)'
FROM purchase_orders po WHERE po.po_number = 'LGi-L-Sal-2203-0361-A012'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2408NU00057');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT '8d87750d-da47-5caf-bfff-9dec040ebff6', po.po_id, 'M12MK2408NU00064', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 42901.06, '2024-08-30', NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2408NU00064)'
FROM purchase_orders po WHERE po.po_number = 'LGi-L-Sal-2203-0361-A012'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2408NU00064');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT '2c040d71-6657-5d01-8a22-bdeae9872b3e', po.po_id, 'M12MK2409NU00025', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 55.0, '2024-09-24', NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2409NU00025)'
FROM purchase_orders po WHERE po.po_number = 'LGi-L-Sal-2203-0361-A012'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2409NU00025');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT '9993b0bb-fdd9-53d7-94f5-d69be643a673', po.po_id, 'M12MK2410NU00018', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 7081.8, '2024-10-15', NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2410NU00018)'
FROM purchase_orders po WHERE po.po_number = 'LGi-L-Sal-2203-0361-A012'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2410NU00018');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT '5cc07c83-65f1-5082-b1c3-d1da80cc76b6', po.po_id, 'M12MK2403NU00018', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 1128870.0, '2024-03-05', '2024-06-11', 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2403NU00018)'
FROM purchase_orders po WHERE po.po_number = 'JKS-TOP240118'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2403NU00018');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT '5745775d-778d-5d0a-969f-ffe8f40c1933', po.po_id, 'M12MK2405NU00025', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 566387.64, NULL, NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2405NU00025)'
FROM purchase_orders po WHERE po.po_number = 'JKS-TOP240118'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2405NU00025');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT 'f868cf8f-14aa-56a7-a081-05fd9a9198ba', po.po_id, 'M12MK2409NU00018', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 90.0, '2024-09-13', NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2409NU00018)'
FROM purchase_orders po WHERE po.po_number = 'JKS-TOP240118'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2409NU00018');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT '1350a989-fa8e-5deb-bcd8-2785a5a6542c', po.po_id, 'M12MK2412NU00025', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 1207940.69, '2024-12-06', NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2412NU00025)'
FROM purchase_orders po WHERE po.po_number = 'JKS-TOP240517 (125MW)'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2412NU00025');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT '830326bc-c332-5919-be33-8ddf1691ac65', po.po_id, 'M04NG2409NU00018', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 10.0, '2024-09-06', NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M04NG2409NU00018)'
FROM purchase_orders po WHERE po.po_number = 'JKS-TO240517 (25MW)'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M04NG2409NU00018');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT 'd059fa38-2c4f-5259-a3d3-e9c65007c75a', po.po_id, 'M04NG2409NU00032', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 528066.0, '2024-09-20', NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M04NG2409NU00032)'
FROM purchase_orders po WHERE po.po_number = 'JKS-TO240517 (25MW)'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M04NG2409NU00032');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT '908ac78a-2495-52b4-a646-1f4393421b40', po.po_id, 'M04NG2410NU00025', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 90.0, '2024-10-17', NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M04NG2410NU00025)'
FROM purchase_orders po WHERE po.po_number = 'JKS-TO240517 (25MW)'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M04NG2410NU00025');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT '359cb99e-bccd-5e00-b7cf-6481781f0776', po.po_id, 'M12MK2402NU00018', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 1301806.4400000002, '2024-02-15', NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2402NU00018)'
FROM purchase_orders po WHERE po.po_number = 'KNK-TOP240130 (10MW)'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2402NU00018');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT 'c6539e59-5cee-5011-880a-e8607e33c8e1', po.po_id, 'M12MK2403NU00032', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 1334322.0, '2024-03-18', '2024-06-24', 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2403NU00032)'
FROM purchase_orders po WHERE po.po_number = 'KNK-TOP240131 (20MW)'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2403NU00032');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT '276f3c79-381b-560d-8af8-6315c224836b', po.po_id, 'M12MK2404NU00018', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 1269290.8800000001, '2024-04-01', NULL, 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2404NU00018)'
FROM purchase_orders po WHERE po.po_number = 'KNK-TOP240131 (20MW)'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2404NU00018');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, maturity_date, status, memo)
SELECT '2c95a1d4-705c-5718-8a2c-a407525c9c39', po.po_id, 'M12MK2404NU00025', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 138441.6, '2024-04-17', '2024-07-29', 'settled', 'M155: 24년 raw 2024시트 백필 (LC M12MK2404NU00025)'
FROM purchase_orders po WHERE po.po_number = 'KNK-TOP240408 (1MW)'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2404NU00025');

-- ─── 3) BL INSERT (raw only, 노이즈 제외) ─────────────────
INSERT INTO bl_shipments (bl_id, bl_number, po_id, company_id, manufacturer_id, inbound_type, currency, etd, eta, actual_arrival, forwarder, status, memo)
SELECT 'b389e131-bfa2-50bb-928f-a54dc98fcf85', 'EO00XH240805173', po.po_id, '99f0fc15-0555-4a41-a025-8bf3630a7947', 'c0c0eb4d-3556-434f-8bbf-32c2c65651bc', 'import', 'USD', '2024-09-04', '2024-09-08', NULL, '씨앤
아이', 'completed', 'M155: 24년 raw 2024시트 백필 (PO 디원)'
FROM purchase_orders po WHERE po.po_number = '디원'
  AND NOT EXISTS(SELECT 1 FROM bl_shipments b WHERE b.bl_number = 'EO00XH240805173');

-- ─── 4) 검증 SQL (수동) ─────────────────────────────────────
-- 다음 쿼리로 백필 결과 확인:
-- SELECT 'PO' kind, COUNT(*) FROM purchase_orders WHERE memo LIKE 'M155%'
--  UNION ALL SELECT 'LC', COUNT(*) FROM lc_records WHERE memo LIKE 'M155%'
--  UNION ALL SELECT 'BL', COUNT(*) FROM bl_shipments WHERE memo LIKE 'M155%';

COMMIT;

-- PostgREST 스키마 캐시 reload
-- NOTIFY pgrst, 'reload schema';