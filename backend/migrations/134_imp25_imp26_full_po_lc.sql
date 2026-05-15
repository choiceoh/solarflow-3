-- M134: imp25/imp26 풀 추출 — 컬럼 길이 확장 + 멀티라인 정리
BEGIN;

-- 1) view 일시 DROP (ALTER COLUMN 의존성 우회)
DROP VIEW IF EXISTS purchase_orders_ext;

-- 2) PO/LC number 컬럼 길이 확장
ALTER TABLE purchase_orders ALTER COLUMN po_number TYPE varchar(60);
ALTER TABLE lc_records ALTER COLUMN lc_number TYPE varchar(100);

-- 3) PO/LC INSERT (중복 자동 회피)
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '2f44804e-30c6-40a2-add1-68c49d00d8f0', 'MCKRJH25Q301 V4', '99f0fc15-0555-4a41-a025-8bf3630a7947', '016ba1ef-cf58-4164-8adf-a048f2c54f3e', 'spot', '2026-01-30', 'CIF', 13508, 8.5776, 'completed', 'M134: imp26-징코'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'MCKRJH25Q301 V4');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, status, memo)
SELECT '076314a6-a405-4816-8004-48e708b4eaf4', po.po_id, 'M12MK2601NU00040', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 943533.8, '2026-01-30', 'settled', 'M134: imp26-징코'
FROM purchase_orders po WHERE po.po_number = 'MCKRJH25Q301 V4'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2601NU00040' AND lr.po_id = po.po_id);
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '4575b7f1-5896-46aa-9133-f7e8ebc50739', 'LGi-UG-Sal-2508-3660-B012', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '30f5aae6-000e-4f6e-93af-076a246005a7', 'spot', '2026-03-05', 'CIF', 46524, 28.6123, 'completed', 'M134: imp26-론지솔라'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'LGi-UG-Sal-2508-3660-B012');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, status, memo)
SELECT '5ab52595-13e3-4484-8d30-5f70f2320bbf', po.po_id, 'M0215603NU00153', 'e13be7f2-d835-4893-9a87-3e0581a96eab', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', 333332.829, '2026-03-05', 'settled', 'M134: imp26-론지솔라'
FROM purchase_orders po WHERE po.po_number = 'LGi-UG-Sal-2508-3660-B012'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M0215603NU00153' AND lr.po_id = po.po_id);
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '363f61af-2864-4e43-9d32-c455667a7c41', '비금호 26MW', '99f0fc15-0555-4a41-a025-8bf3630a7947', '30f5aae6-000e-4f6e-93af-076a246005a7', 'spot', '2026-03-05', 'CIF', 13524, 8.3173, 'completed', 'M134: imp26-론지솔라'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = '비금호 26MW');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, status, memo)
SELECT '08256554-4d64-4ff7-86c5-c437d2e9d5ac', po.po_id, 'M0215603NU00160', 'e13be7f2-d835-4893-9a87-3e0581a96eab', '99f0fc15-0555-4a41-a025-8bf3630a7947', 96896.07900000001, '2026-03-05', 'settled', 'M134: imp26-론지솔라'
FROM purchase_orders po WHERE po.po_number = '비금호 26MW'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M0215603NU00160' AND lr.po_id = po.po_id);
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '5194aa35-e36c-4886-b01b-aed4c800a444', 'Lgi-HG-Sal-2601-1805-B012', '99f0fc15-0555-4a41-a025-8bf3630a7947', '30f5aae6-000e-4f6e-93af-076a246005a7', 'spot', '2026-02-01', 'CIF', 24875, 16.1687, 'completed', 'M134: imp26-론지솔라'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'Lgi-HG-Sal-2601-1805-B012');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, status, memo)
SELECT '26b99726-6d7d-468a-9287-d575e025f084', po.po_id, 'M12MK2602NU00025', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 189174.375, '2026-02-01', 'settled', 'M134: imp26-론지솔라'
FROM purchase_orders po WHERE po.po_number = 'Lgi-HG-Sal-2601-1805-B012'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M12MK2602NU00025' AND lr.po_id = po.po_id);
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT 'd6c6f82d-2aca-435d-8934-bb10d72364e5', 'Lgi-HG-Sal-2601-1530-B012', '99f0fc15-0555-4a41-a025-8bf3630a7947', '30f5aae6-000e-4f6e-93af-076a246005a7', 'spot', '2026-02-01', 'CIF', 3468, 1.8727, 'completed', 'M134: imp26-론지솔라'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'Lgi-HG-Sal-2601-1530-B012');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, status, memo)
SELECT '08f7803b-3c55-450b-b27f-32dae5bec855', po.po_id, 'M100R2602NU00114', 'ef4f9d00-6622-4070-ada3-c878aa02522b', '99f0fc15-0555-4a41-a025-8bf3630a7947', 28090.800000000003, '2026-02-01', 'settled', 'M134: imp26-론지솔라'
FROM purchase_orders po WHERE po.po_number = 'Lgi-HG-Sal-2601-1530-B012'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M100R2602NU00114' AND lr.po_id = po.po_id);
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT 'bd094ac6-feb6-42f6-b003-e48d5b229da6', 'TED-A11046-2601-TSI-00499-00', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'fe7728ec-2cf5-4c95-89f4-733934fb7fcb', 'spot', '2026-01-22', 'CIF', 41679, 30.0089, 'completed', 'M134: imp26-트리나'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'TED-A11046-2601-TSI-00499-00');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, status, memo)
SELECT '8e3c2a18-121c-4781-8281-773044111565', po.po_id, 'M34PD2601NU00018', '38c0f484-e145-4ed0-bba0-0a0a1b44a907', '99f0fc15-0555-4a41-a025-8bf3630a7947', 2465791.8, '2026-01-22', 'settled', 'M134: imp26-트리나'
FROM purchase_orders po WHERE po.po_number = 'TED-A11046-2601-TSI-00499-00'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M34PD2601NU00018' AND lr.po_id = po.po_id);
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '983ce12c-74c8-4243-9a4a-86aa96cb86ee', 'PO No. TOP260507', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'fe7728ec-2cf5-4c95-89f4-733934fb7fcb', 'spot', NULL, 'CIF', 136986, 99.9998, 'completed', 'M134: imp26-트리나'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'PO No. TOP260507');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT 'c319a46b-d7f9-4ef8-af98-bb334d92b0bd', 'RS/KRS/KR-A-TOPSOLAR-26031301', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'ccc9937e-6214-45f8-8b48-26487bf1d0d7', 'spot', '2026-04-20', 'CIF', 141982, 29.9923, 'completed', 'M134: imp26-라이젠'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'RS/KRS/KR-A-TOPSOLAR-26031301');
INSERT INTO lc_records (lc_id, po_id, lc_number, bank_id, company_id, amount_usd, open_date, status, memo)
SELECT '38130e73-0cc8-4340-af58-91cd55a5df31', po.po_id, 'M0215604NU00160', 'e13be7f2-d835-4893-9a87-3e0581a96eab', '99f0fc15-0555-4a41-a025-8bf3630a7947', 3958986.24, '2026-04-20', 'settled', 'M134: imp26-라이젠'
FROM purchase_orders po WHERE po.po_number = 'RS/KRS/KR-A-TOPSOLAR-26031301'
  AND NOT EXISTS(SELECT 1 FROM lc_records lr WHERE lr.lc_number = 'M0215604NU00160' AND lr.po_id = po.po_id);
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT 'a4cb510c-d145-49a6-9f46-64c335ed213f', 'LGi-L-Sal-2203-0361-A012', '99f0fc15-0555-4a41-a025-8bf3630a7947', '30f5aae6-000e-4f6e-93af-076a246005a7', 'spot', NULL, 'CIF', 5040, 0.0, 'completed', 'M134: imp25-2024'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'LGi-L-Sal-2203-0361-A012');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT 'bc2632e2-b694-4e05-97ed-4787ca53520d', 'JKS-TOP240118', '99f0fc15-0555-4a41-a025-8bf3630a7947', '016ba1ef-cf58-4164-8adf-a048f2c54f3e', 'spot', NULL, 'CIF', 39960, 0.0, 'completed', 'M134: imp25-2024'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'JKS-TOP240118');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT 'bf6b1329-6bf5-479e-a156-e2809abbf124', 'JKS-TOP240517 (125MW)', '99f0fc15-0555-4a41-a025-8bf3630a7947', '016ba1ef-cf58-4164-8adf-a048f2c54f3e', 'spot', NULL, 'CIF', 23616, 0.0, 'completed', 'M134: imp25-2024'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'JKS-TOP240517 (125MW)');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT 'd66f2076-1742-4771-a408-973e933327c4', 'KNK-TOP240517 (50MW)', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'fd8c3fa6-128a-4118-bda4-fe7554321302', 'spot', NULL, 'CIF', 79170, 0.0, 'completed', 'M134: imp25-2024'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'KNK-TOP240517 (50MW)');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '201dbed4-5c46-4aba-897b-9d780bea67aa', 'JKS-TO240517 (25MW)', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '016ba1ef-cf58-4164-8adf-a048f2c54f3e', 'spot', NULL, 'CIF', 15876, 0.0, 'completed', 'M134: imp25-2024'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'JKS-TO240517 (25MW)');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '323c8319-1201-4e25-a106-f09bcf0a6955', 'KNK-TOP240130 (10MW)', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'fd8c3fa6-128a-4118-bda4-fe7554321302', 'spot', NULL, 'CIF', 14293, 0.0, 'completed', 'M134: imp25-2024'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'KNK-TOP240130 (10MW)');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '6ee18ac7-1ad5-4471-b041-aa2cf58084b1', 'KNK-TOP240131 (20MW)', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'fd8c3fa6-128a-4118-bda4-fe7554321302', 'spot', NULL, 'CIF', 14650, 0.0, 'completed', 'M134: imp25-2024'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'KNK-TOP240131 (20MW)');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT 'd2738952-d8b8-47d5-afa3-b28aeeb03585', 'KNK-TOP240408 (1MW)', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'fd8c3fa6-128a-4118-bda4-fe7554321302', 'spot', NULL, 'CIF', 1520, 0.0, 'completed', 'M134: imp25-2024'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'KNK-TOP240408 (1MW)');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '29e06d4f-cf72-41c7-8467-ffdb0f056cac', 'MCKRJH25Q108', '99f0fc15-0555-4a41-a025-8bf3630a7947', '016ba1ef-cf58-4164-8adf-a048f2c54f3e', 'spot', NULL, 'CIF', 15768, 0.0, 'completed', 'M134: imp25-2025'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'MCKRJH25Q108');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '02312092-c146-44f1-a9fc-c0038dcbe588', 'MCKRJH25Q109', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '016ba1ef-cf58-4164-8adf-a048f2c54f3e', 'spot', NULL, 'CIF', 23622, 0.0, 'completed', 'M134: imp25-2025'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'MCKRJH25Q109');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '98b6737a-04b2-459f-b85d-98bbbfc4cfca', 'KNK-TOP250429', '99f0fc15-0555-4a41-a025-8bf3630a7947', '23171f0e-52d4-4475-bea3-5045778f4ed3', 'spot', NULL, 'CIF', 7812, 0.0, 'completed', 'M134: imp25-2025'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'KNK-TOP250429');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '7453a088-1e35-4981-af8f-409fda50d013', 'KNK-TOP250717', '99f0fc15-0555-4a41-a025-8bf3630a7947', '23171f0e-52d4-4475-bea3-5045778f4ed3', 'spot', NULL, 'CIF', 0, 0.0, 'completed', 'M134: imp25-2025'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'KNK-TOP250717');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '8683a887-2c9f-4a49-9b85-8efb5e219d4c', 'Lgi-UG-Sal-2507-3702-C012', '99f0fc15-0555-4a41-a025-8bf3630a7947', '30f5aae6-000e-4f6e-93af-076a246005a7', 'spot', NULL, 'CIF', 3096, 0.0, 'completed', 'M134: imp25-2025'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'Lgi-UG-Sal-2507-3702-C012');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '1dc71f82-347f-4fe4-be7a-999fbfbbbe50', 'LGi-UG-Sal-2508-3802-C012', 'a9c3c675-8ed5-4a33-80e7-190d25888e80', '30f5aae6-000e-4f6e-93af-076a246005a7', 'spot', NULL, 'CIF', 1588, 0.0, 'completed', 'M134: imp25-2025'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'LGi-UG-Sal-2508-3802-C012');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT 'e5c6c014-c132-47f5-8e3e-351444bd9a4b', 'PI TED-A11046-2507-TSI-09808-00', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'fe7728ec-2cf5-4c95-89f4-733934fb7fcb', 'spot', NULL, 'CIF', 7128, 0.0, 'completed', 'M134: imp25-2025'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'PI TED-A11046-2507-TSI-09808-00');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT 'ede49689-1e2b-4e48-a9da-6811c661e964', 'RS/KRS/KR-A-TOPSOLAR-25081401', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'ccc9937e-6214-45f8-8b48-26487bf1d0d7', 'spot', NULL, 'CIF', 15552, 0.0, 'completed', 'M134: imp25-2025'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'RS/KRS/KR-A-TOPSOLAR-25081401');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '0ce06589-5444-4d04-aa11-bf45975263f9', 'MCKRJH25Q301', '99f0fc15-0555-4a41-a025-8bf3630a7947', '016ba1ef-cf58-4164-8adf-a048f2c54f3e', 'spot', NULL, 'CIF', 94500, 0.0, 'completed', 'M134: imp25-2025'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'MCKRJH25Q301');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '31befb38-d733-421c-948f-ff74d68c2c26', 'MCKRJH25Q402', 'a9c3c675-8ed5-4a33-80e7-190d25888e80', '016ba1ef-cf58-4164-8adf-a048f2c54f3e', 'spot', NULL, 'CIF', 63000, 0.0, 'completed', 'M134: imp25-2025'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'MCKRJH25Q402');
INSERT INTO purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, total_qty, total_mw, status, memo)
SELECT '3ac663c7-f0c1-448b-9b89-230185486bed', 'Lgi-UG-Sal-2510-1898-C012', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '30f5aae6-000e-4f6e-93af-076a246005a7', 'spot', NULL, 'CIF', 1584, 0.0, 'completed', 'M134: imp25-2025'
WHERE NOT EXISTS(SELECT 1 FROM purchase_orders WHERE po_number = 'Lgi-UG-Sal-2510-1898-C012');

-- 4) view 재생성
CREATE OR REPLACE VIEW purchase_orders_ext AS
SELECT po.po_id,                                                                                                                                  
     po.po_number,                                                                                                                                  
     po.company_id,                                                                                                                                 
     po.manufacturer_id,                                                                                                                            
     po.contract_type,                                                                                                                              
     po.contract_date,                                                                                                                              
     po.incoterms,                                                                                                                                  
     po.payment_terms,                                                                                                                              
     po.total_qty,                                                                                                                                  
     po.total_mw,                                                                                                                                   
     po.contract_period_start,                                                                                                                      
     po.contract_period_end,                                                                                                                        
     po.status,                                                                                                                                     
     po.memo,                                                                                                                                       
     po.created_at,                                                                                                                                 
     po.updated_at,                                                                                                                                 
     po.parent_po_id,                                                                                                                               
     m.name_kr AS manufacturer_name,                                                                                                                
     m.name_en AS manufacturer_name_en,                                                                                                             
     first_line.spec_wp AS first_spec_wp,                                                                                                           
     first_line.product_name AS first_product_name,                                                                                                 
     first_line.product_code AS first_product_code,                                                                                                 
     COALESCE(line_agg.line_count, 0) AS line_count,                                                                                                
     COALESCE(line_agg.line_total_usd, 0::numeric) AS line_total_usd,                                                                               
     COALESCE(line_agg.line_total_wp, 0::numeric) AS line_total_wp,                                                                                 
     COALESCE(line_agg.line_extra_count, 0) AS line_extra_count,                                                                                    
     COALESCE(lc_agg.lc_count, 0) AS lc_count,                                                                                                      
     COALESCE(lc_agg.lc_total_usd, 0::numeric) AS lc_total_usd,                                                                                     
     COALESCE(lc_agg.lc_total_mw, 0::numeric) AS lc_total_mw,                                                                                       
     COALESCE(tt_agg.tt_count, 0) AS tt_count,                                                                                                      
     COALESCE(tt_agg.tt_completed_usd, 0::numeric) AS tt_completed_usd                                                                              
    FROM purchase_orders po                                                                                                                         
      LEFT JOIN manufacturers m ON po.manufacturer_id = m.manufacturer_id                                                                           
      LEFT JOIN LATERAL ( SELECT pr.spec_wp,                                                                                                        
             pr.product_name,                                                                                                                       
             pr.product_code                                                                                                                        
            FROM po_line_items pl                                                                                                                   
              LEFT JOIN products pr ON pl.product_id = pr.product_id                                                                                
           WHERE pl.po_id = po.po_id AND (pl.payment_type IS NULL OR pl.payment_type = 'paid'::text)                                                
           ORDER BY pl.created_at                                                                                                                   
          LIMIT 1) first_line ON true                                                                                                               
      LEFT JOIN LATERAL ( SELECT count(*)::integer AS line_count,                                                                                   
             COALESCE(sum(pl.total_amount_usd), 0::numeric) AS line_total_usd,                                                                      
             COALESCE(sum(pl.quantity * pr.spec_wp), 0::bigint)::numeric AS line_total_wp,                                                          
             GREATEST(count(*) - 1, 0::bigint)::integer AS line_extra_count                                                                         
            FROM po_line_items pl                                                                                                                   
              LEFT JOIN products pr ON pl.product_id = pr.product_id                                                                                
           WHERE pl.po_id = po.po_id AND (pl.payment_type IS NULL OR pl.payment_type = 'paid'::text)) line_agg ON true                              
      LEFT JOIN LATERAL ( SELECT count(*)::integer AS lc_count,                                                                                     
             COALESCE(sum(lc_records.amount_usd), 0::numeric) AS lc_total_usd,                                                                      
             COALESCE(sum(lc_records.target_mw), 0::numeric) AS lc_total_mw                                                                         
            FROM lc_records                                                                                                                         
           WHERE lc_records.po_id = po.po_id) lc_agg ON true                                                                                        
      LEFT JOIN LATERAL ( SELECT count(*)::integer AS tt_count,                                                                                     
             COALESCE(sum(tt_remittances.amount_usd) FILTER (WHERE tt_remittances.status::text = 'completed'::text), 0::numeric) AS tt_completed_usd
            FROM tt_remittances                                                                                                                     
           WHERE tt_remittances.po_id = po.po_id) tt_agg ON true;

INSERT INTO schema_migrations(filename) VALUES ('134_imp25_imp26_full_po_lc.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
