-- M143: bl_shipments 신규 INSERT + import_declarations INSERT (M144 skip 분 PDF 메타 추출)
-- 소스: 면장 PDF 28개 — DB.bl_shipments 에 BL 자체가 없던 케이스
-- 제조사: supplier_name_en 매핑 (ZHEJIANG JINKO→징코, LONGI→론지 등)
-- 회사: PDF 의 납세의무자 식별 (탑솔라/디원/화신)

BEGIN;

-- 1단계: bl_shipments 신규 INSERT
INSERT INTO bl_shipments
  (bl_number, company_id, manufacturer_id, inbound_type, currency, exchange_rate,
   eta, actual_arrival, port, declaration_number, cif_amount_krw, status, memo)
SELECT x.bl_number, x.company_id::uuid, x.manufacturer_id::uuid,
       'import', 'USD', x.exchange_rate, x.eta::date, x.eta::date, x.port,
       x.declaration_number, x.cif_amount_krw::bigint, 'completed', x.memo
FROM (VALUES
  ('1061994729', '99f0fc15-0555-4a41-a025-8bf3630a7947', '016ba1ef-cf58-4164-8adf-a048f2c54f3e', 1331.56::numeric, '2024-10-01', 'KRPTK', '43635-24-701434M', 1065448266::numeric, 'M143: PDF 면장 메타 (supplier=ZHEJIANG JINKO SOLAR CO LTD)'),
  ('2945621851', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '30f5aae6-000e-4f6e-93af-076a246005a7', 1431.82::numeric, '2025-11-01', NULL, '43199-25-301173M', 5727280::numeric, 'M143: PDF 면장 메타 (supplier=LONGI SOLAR TECHNOLOGY CO LTD)'),
  ('2946413164', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '30f5aae6-000e-4f6e-93af-076a246005a7', 1431.82::numeric, '2025-11-06', NULL, '43199-25-301186M', 5727280::numeric, 'M143: PDF 면장 메타 (supplier=LONGI SOLAR TECHNOLOGY CO LTD)'),
  ('2947172826', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '30f5aae6-000e-4f6e-93af-076a246005a7', 1437.34::numeric, '2025-11-11', NULL, '43199-25-301210M', 17248080::numeric, 'M143: PDF 면장 메타 (supplier=LONGI SOLAR TECHNOLOGY CO LTD)'),
  ('9354691485', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '30f5aae6-000e-4f6e-93af-076a246005a7', 1492.56::numeric, '2026-03-24', NULL, '43199-26-300314M', 13433040::numeric, 'M143: PDF 면장 메타 (supplier=LONGI SOLAR TECHNOLOGY CO LTD)'),
  ('9354694996', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '30f5aae6-000e-4f6e-93af-076a246005a7', 1492.56::numeric, '2026-03-24', NULL, '43199-26-300315M', 28358640::numeric, 'M143: PDF 면장 메타 (supplier=LONGI SOLAR TECHNOLOGY CO LTD)'),
  ('DFS815002448', '99f0fc15-0555-4a41-a025-8bf3630a7947', '30f5aae6-000e-4f6e-93af-076a246005a7', 1479.34::numeric, '2026-04-19', 'KRKAN', '43199-26-300462M', 345100435::numeric, 'M143: PDF 면장 메타 (supplier=LONGI SOLAR TECHNOLOGY CO LTD)'),
  ('DFS815002450', '99f0fc15-0555-4a41-a025-8bf3630a7947', '30f5aae6-000e-4f6e-93af-076a246005a7', 1476.35::numeric, '2026-04-29', 'KRKAN', '43199-26-700180M', 70315597::numeric, 'M143: PDF 면장 메타 (supplier=LONGI SOLAR TECHNOLOGY CO LTD)'),
  ('DFS815002451', '99f0fc15-0555-4a41-a025-8bf3630a7947', '30f5aae6-000e-4f6e-93af-076a246005a7', 1476.35::numeric, '2026-04-29', 'KRKAN', '43199-26-700182M', 3166338917::numeric, 'M143: PDF 면장 메타 (supplier=LONGI SOLAR TECHNOLOGY CO LTD)'),
  ('EASHO2421NK232', '99f0fc15-0555-4a41-a025-8bf3630a7947', '016ba1ef-cf58-4164-8adf-a048f2c54f3e', 1360.68::numeric, '2024-05-26', 'KRKAN', '43635-24-700736M', 770672333::numeric, 'M143: PDF 면장 메타 (supplier=ZHEJIANG JINKO SOLAR CO LTD)'),
  ('HDMUNBOZK6Q52100', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'ccc9937e-6214-45f8-8b48-26487bf1d0d7', 1476.35::numeric, '2026-05-06', 'KRKAN', '43199-26-700188M', 2922424667::numeric, 'M143: PDF 면장 메타 (supplier=RISEN ENERGY CO LTD)'),
  ('JWSH24020155', '99f0fc15-0555-4a41-a025-8bf3630a7947', '016ba1ef-cf58-4164-8adf-a048f2c54f3e', 1334.14::numeric, '2024-03-01', 'KRPUS', '43635-24-600278M', 753035310::numeric, 'M143: PDF 면장 메타 (supplier=ZHEJIANG JINKO SOLAR CO LTD)'),
  ('JWSH24030082', '99f0fc15-0555-4a41-a025-8bf3630a7947', '016ba1ef-cf58-4164-8adf-a048f2c54f3e', 1332.54::numeric, '2024-03-16', 'KRKAN', '43635-24-800121M', 745356249::numeric, 'M143: PDF 면장 메타 (supplier=ZHEJIANG JINKO SOLAR CO LTD)'),
  ('LE00SH240345346H', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'c0c0eb4d-3556-434f-8bbf-32c2c65651bc', 1332.98::numeric, '2024-03-29', 'KRPUS', '43635-24-700391M', 5118642::numeric, 'M143: PDF 면장 메타 (supplier=CANADIAN SOLAR INTERNATIONAL L)'),
  ('NPSELHT242755', '99f0fc15-0555-4a41-a025-8bf3630a7947', '30f5aae6-000e-4f6e-93af-076a246005a7', 1331.43::numeric, '2024-02-13', 'KRPUS', '43635-24-700213M', 143508049::numeric, 'M143: PDF 면장 메타 (supplier=LONGI SOLAR TECHNOLOGY CO LTD)'),
  ('NPSELHT242756', '99f0fc15-0555-4a41-a025-8bf3630a7947', '30f5aae6-000e-4f6e-93af-076a246005a7', 1331.43::numeric, '2024-02-12', 'KRKAN', '43635-24-700214M', 356593914::numeric, 'M143: PDF 면장 메타 (supplier=LONGI SOLAR TECHNOLOGY CO LTD)'),
  ('NPSELHT245133', '99f0fc15-0555-4a41-a025-8bf3630a7947', '30f5aae6-000e-4f6e-93af-076a246005a7', 1334.02::numeric, '2024-02-04', 'KRPUS', '43635-24-700170M', 347193512::numeric, 'M143: PDF 면장 메타 (supplier=LONGI SOLAR TECHNOLOGY CO LTD)'),
  ('NPSELHT245468', '99f0fc15-0555-4a41-a025-8bf3630a7947', '30f5aae6-000e-4f6e-93af-076a246005a7', 1360.68::numeric, '2024-05-25', 'KRPUS', '43635-24-700723M', 1211331327::numeric, 'M143: PDF 면장 메타 (supplier=LONGI SOLAR TECHNOLOGY CO LTD)'),
  ('OE00XH240305344', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'c0c0eb4d-3556-434f-8bbf-32c2c65651bc', 1332.98::numeric, '2024-03-30', 'KRKAN', '43635-24-700400M', 316349211::numeric, 'M143: PDF 면장 메타 (supplier=CANADIAN SOLAR INTERNATIONAL L)'),
  ('OE00XH240705288', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'c0c0eb4d-3556-434f-8bbf-32c2c65651bc', 1379.6::numeric, '2024-08-06', 'KRKAN', '43635-24-601021M', 200432702::numeric, 'M143: PDF 면장 메타 (supplier=CANADIAN SOLAR INTERNATIONAL L)'),
  ('OE00XH240805173', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', 'c0c0eb4d-3556-434f-8bbf-32c2c65651bc', 1332.88::numeric, '2024-09-06', 'KRPUS', '43635-24-701275M', 53844193::numeric, 'M143: PDF 면장 메타 (supplier=CANADIAN SOLAR INTERNATIONAL L)'),
  ('SELHTZ265681', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '30f5aae6-000e-4f6e-93af-076a246005a7', 1476.35::numeric, '2026-04-30', 'KRPTK', '43199-26-700183M', 1044439998::numeric, 'M143: PDF 면장 메타 (supplier=LONGI SOLAR TECHNOLOGY CO LTD)'),
  ('WXAE25070807', '99f0fc15-0555-4a41-a025-8bf3630a7947', '30f5aae6-000e-4f6e-93af-076a246005a7', 1369.12::numeric, '2025-07-13', NULL, '43199-25-300766M', 474263::numeric, 'M143: PDF 면장 메타 (supplier=LONGI SOLAR TECHNOLOGY CO LTD)'),
  ('ZHC2402012', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'fd8c3fa6-128a-4118-bda4-fe7554321302', 1331.5::numeric, '2024-02-27', 'KRPTK', '43635-24-600317M', 864434086::numeric, 'M143: PDF 면장 메타 (supplier=KNK ENERGY PTE LTD)'),
  ('ZHC2402013', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'fd8c3fa6-128a-4118-bda4-fe7554321302', 1315.66::numeric, '2024-03-06', 'KRPTK', '43635-24-700322M', 882550253::numeric, 'M143: PDF 면장 메타 (supplier=KNK ENERGY PTE LTD)'),
  ('ZHC2403011', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'fd8c3fa6-128a-4118-bda4-fe7554321302', 1332.98::numeric, '2024-03-27', 'KRPTK', '43635-24-700411M', 1802906103::numeric, 'M143: PDF 면장 메타 (supplier=KNK ENERGY PTE LTD)'),
  ('ZHC2404001', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'fd8c3fa6-128a-4118-bda4-fe7554321302', 1355.88::numeric, '2024-04-19', 'KRPTK', '43635-24-700509M', 1745704828::numeric, 'M143: PDF 면장 메타 (supplier=KNK ENERGY PTE LTD)'),
  ('ZHC2404043', '99f0fc15-0555-4a41-a025-8bf3630a7947', 'fd8c3fa6-128a-4118-bda4-fe7554321302', 1378.02::numeric, '2024-05-01', 'KRINC', '43635-24-700606M', 192030394::numeric, 'M143: PDF 면장 메타 (supplier=KNK ENERGY PTE LTD)')
) AS x(bl_number, company_id, manufacturer_id, exchange_rate, eta, port, declaration_number, cif_amount_krw, memo)
WHERE NOT EXISTS (SELECT 1 FROM bl_shipments b WHERE b.bl_number = x.bl_number);

-- 검증 1
SELECT COUNT(*) AS new_bls FROM bl_shipments WHERE memo LIKE 'M143:%';
-- expected: 28 (28 신규 BL)

-- 2단계: 같은 BL 들의 import_declarations 신규 INSERT
INSERT INTO import_declarations
  (declaration_number, bl_id, company_id, declaration_date, arrival_date,
   hs_code, customs_office, port, supplier_name_en, lc_no,
   exchange_rate, cif_krw, incoterms, customs_rate, customs_amount, vat_amount,
   quantity, capacity_kw, contract_unit_price_usd_wp, memo)
SELECT x.declaration_number, b.bl_id, x.company_id::uuid, x.declaration_date::date, NULLIF(x.arrival_date,'')::date,
       NULLIF(x.hs_code,''), NULLIF(x.customs_office,''), NULLIF(x.port,''), NULLIF(x.supplier_name_en,''), NULLIF(x.lc_no,''),
       x.exchange_rate, x.cif_krw, x.incoterms, x.customs_rate, x.customs_amount, x.vat_amount,
       x.quantity, x.capacity_kw, x.contract_unit_price_usd_wp, 'M143: PDF 면장 INSERT (BL 신규 등록 동반)'
FROM (VALUES
  ('43635-24-701434M', '1061994729', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-10-02', '2024-10-01', '8541.43-0000', '016-C1', 'KRPTK', 'ZHEJIANG JINKO SOLAR CO LTD', 'M12MK2409NU00018업태', 1331.56::numeric, 1065448266::numeric, 'CIF', 0.0::numeric, 0::numeric, 106544826::numeric, 12096::numeric, 7620.48::numeric, 0.105::numeric),
  ('43199-25-301173M', '2945621851', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '2025-11-03', '2025-11-01', '7610.90-9000', '040-58', NULL, 'LONGI SOLAR TECHNOLOGY CO LTD', NULL, 1431.82::numeric, 5727280::numeric, 'CIF', NULL::numeric, NULL::numeric, 618546::numeric, NULL::numeric, NULL::numeric, NULL::numeric),
  ('43199-25-301186M', '2946413164', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '2025-11-06', '2025-11-06', '7610.90-9000', '040-58', NULL, 'LONGI SOLAR TECHNOLOGY CO LTD', NULL, 1431.82::numeric, 5727280::numeric, 'CIF', NULL::numeric, NULL::numeric, 618546::numeric, NULL::numeric, NULL::numeric, NULL::numeric),
  ('43199-25-301210M', '2947172826', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '2025-11-11', '2025-11-11', '7610.90-9000', '040-58', NULL, 'LONGI SOLAR TECHNOLOGY CO LTD', NULL, 1437.34::numeric, 17248080::numeric, 'CIF', NULL::numeric, NULL::numeric, 1862792::numeric, NULL::numeric, NULL::numeric, NULL::numeric),
  ('43199-26-300314M', '9354691485', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '2026-03-24', '2026-03-24', '7610.90-9000', '040-58', NULL, 'LONGI SOLAR TECHNOLOGY CO LTD', NULL, 1492.56::numeric, 13433040::numeric, 'CIF', NULL::numeric, NULL::numeric, 1450768::numeric, NULL::numeric, NULL::numeric, NULL::numeric),
  ('43199-26-300315M', '9354694996', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '2026-03-25', '2026-03-24', '7610.90-9000', '040-58', NULL, 'LONGI SOLAR TECHNOLOGY CO LTD', NULL, 1492.56::numeric, 28358640::numeric, 'CIF', NULL::numeric, NULL::numeric, 3062733::numeric, NULL::numeric, NULL::numeric, NULL::numeric),
  ('43199-26-300462M', 'DFS815002448', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2026-04-21', '2026-04-19', '8541.43-0000', '062-D9', 'KRKAN', 'LONGI SOLAR TECHNOLOGY CO LTD', NULL, 1479.34::numeric, 345100435::numeric, 'CIF', 0.0::numeric, 0::numeric, 34510043::numeric, 1555200::numeric, 1555.2::numeric, 0.15::numeric),
  ('43199-26-700180M', 'DFS815002450', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2026-05-04', '2026-04-29', '8541.43-0000', '062-D9', 'KRKAN', 'LONGI SOLAR TECHNOLOGY CO LTD', NULL, 1476.35::numeric, 70315597::numeric, 'CIF', 0.0::numeric, 0::numeric, 7031559::numeric, 317520::numeric, 317.52::numeric, 0.15::numeric),
  ('43199-26-700182M', 'DFS815002451', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2026-05-06', '2026-04-29', '8541.43-0000', '062-D9', 'KRKAN', 'LONGI SOLAR TECHNOLOGY CO LTD', NULL, 1476.35::numeric, 3166338917::numeric, 'CIF', 0.0::numeric, 0::numeric, 316633891::numeric, 14298050::numeric, 1827.36::numeric, 0.15::numeric),
  ('43635-24-700736M', 'EASHO2421NK232', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-05-30', '2024-05-26', '8541.43-0000', '062-D9', 'KRKAN', 'ZHEJIANG JINKO SOLAR CO LTD', 'M12MK2405NU00025업태', 1360.68::numeric, 770672333::numeric, 'CIF', 0.0::numeric, 0::numeric, 77067233::numeric, 7956::numeric, 5012.28::numeric, 0.113::numeric),
  ('43199-26-700188M', 'HDMUNBOZK6Q52100', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2026-05-07', '2026-05-06', '8541.43-0000', '062-D9', 'KRKAN', 'RISEN ENERGY CO LTD', NULL, 1476.35::numeric, 2922424667::numeric, 'CIF', 0.0::numeric, 0::numeric, 292242466::numeric, 23616::numeric, NULL::numeric, NULL::numeric),
  ('43635-24-600278M', 'JWSH24020155', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-02-29', '2024-03-01', '8541.43-0000', '030-C3', 'KRPUS', 'ZHEJIANG JINKO SOLAR CO LTD', 'M0215402NU00089업태', 1334.14::numeric, 753035310::numeric, 'CIF', 0.0::numeric, 0::numeric, 75303531::numeric, 4995000::numeric, 4995.0::numeric, 0.113::numeric),
  ('43635-24-800121M', 'JWSH24030082', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-03-15', '2024-03-16', '8541.43-0000', '062-D9', 'KRKAN', 'ZHEJIANG JINKO SOLAR CO LTD', 'M12MK2403NU00018업태', 1332.54::numeric, 745356249::numeric, 'CIF', 0.0::numeric, 0::numeric, 74535624::numeric, 7920::numeric, 4950.0::numeric, 0.113::numeric),
  ('43635-24-700391M', 'LE00SH240345346H', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-03-29', '2024-03-29', '8535.90-1000', '033-D9', 'KRPUS', 'CANADIAN SOLAR INTERNATIONAL LIMITED', NULL, 1332.98::numeric, 5118642::numeric, 'DDP', NULL::numeric, NULL::numeric, 552813::numeric, NULL::numeric, NULL::numeric, NULL::numeric),
  ('43635-24-700213M', 'NPSELHT242755', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-02-20', '2024-02-13', '8541.43-0000', '030-C2', 'KRPUS', 'LONGI SOLAR TECHNOLOGY CO LTD', 'M12MK2401NU00018업태', 1331.43::numeric, 143508049::numeric, 'CIF', 0.0::numeric, 0::numeric, 14350804::numeric, 848700::numeric, 848.7::numeric, 0.127::numeric),
  ('43635-24-700214M', 'NPSELHT242756', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-02-20', '2024-02-12', '8541.43-0000', '062-D9', 'KRKAN', 'LONGI SOLAR TECHNOLOGY CO LTD', 'M12MK2401NU00018업태', 1331.43::numeric, 356593914::numeric, 'CIF', 0.0::numeric, 0::numeric, 35659391::numeric, 2108880::numeric, 2108.88::numeric, 0.127::numeric),
  ('43635-24-700170M', 'NPSELHT245133', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-02-05', '2024-02-04', '8541.43-0000', '030-C2', 'KRPUS', 'LONGI SOLAR TECHNOLOGY CO LTD', NULL, 1334.02::numeric, 347193512::numeric, 'CIF', 0.0::numeric, 0::numeric, 34719351::numeric, 2049300::numeric, 2049.3::numeric, 0.127::numeric),
  ('43635-24-700723M', 'NPSELHT245468', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-05-29', '2024-05-25', '8541.43-0000', '030-C2', 'KRPUS', 'LONGI SOLAR TECHNOLOGY CO LTD', 'M12MK2405NU00018업태', 1360.68::numeric, 1211331327::numeric, 'CIF', 0.0::numeric, 0::numeric, 121133132::numeric, 13464::numeric, 7809.12::numeric, 0.114::numeric),
  ('43635-24-700400M', 'OE00XH240305344', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-03-29', '2024-03-30', '8541.43-0000', '062-D9', 'KRKAN', 'CANADIAN SOLAR INTERNATIONAL LIMITED', NULL, 1332.98::numeric, 316349211::numeric, 'CIF', 0.0::numeric, 0::numeric, 31634921::numeric, 1483280::numeric, 1483.28::numeric, 0.16::numeric),
  ('43635-24-601021M', 'OE00XH240705288', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-08-05', '2024-08-06', '8541.43-0000', '062-D9', 'KRKAN', 'CANADIAN SOLAR INTERNATIONAL LIMITED', NULL, 1379.6::numeric, 200432702::numeric, 'CIF', 0.0::numeric, 0::numeric, 20043270::numeric, 908020::numeric, 908.02::numeric, 0.16::numeric),
  ('43635-24-701275M', 'OE00XH240805173', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '2024-09-05', '2024-09-06', '8541.43-0000', '030-C2', 'KRPUS', 'CANADIAN SOLAR INTERNATIONAL LIMITED', NULL, 1332.88::numeric, 53844193::numeric, 'CIF', 0.0::numeric, 0::numeric, 5384419::numeric, 465::numeric, 321.09::numeric, 0.125::numeric),
  ('43199-26-700183M', 'SELHTZ265681', '84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c', '2026-05-06', '2026-04-30', '8541.43-0000', '016-C1', 'KRPTK', 'LONGI SOLAR TECHNOLOGY CO LTD', NULL, 1476.35::numeric, 1044439998::numeric, 'CIF', 0.0::numeric, 0::numeric, 104443999::numeric, 6072510::numeric, 6072.51::numeric, 0.1165::numeric),
  ('43199-25-300766M', 'WXAE25070807', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2025-07-14', '2025-07-13', '8541.43-0000', '040-C1', NULL, 'LONGI SOLAR TECHNOLOGY CO LTD', NULL, 1369.12::numeric, 474263::numeric, 'CIF', 0.0::numeric, 0::numeric, 47426::numeric, 2165::numeric, 1.62::numeric, 0.16::numeric),
  ('43635-24-600317M', 'ZHC2402012', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-03-08', '2024-02-27', '8541.43-0000', '016-C1', 'KRPTK', 'KNK ENERGY PTE LTD', NULL, 1331.5::numeric, 864434086::numeric, 'CFR', 0.0::numeric, 0::numeric, 86443408::numeric, 4918320::numeric, 4918.32::numeric, 0.132::numeric),
  ('43635-24-700322M', 'ZHC2402013', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-03-18', '2024-03-06', '8541.43-0000', '016-C1', 'KRPTK', 'KNK ENERGY PTE LTD', NULL, 1315.66::numeric, 882550253::numeric, 'CFR', 0.0::numeric, 0::numeric, 88255025::numeric, 4944050::numeric, 4943.85::numeric, 0.132::numeric),
  ('43635-24-700411M', 'ZHC2403011', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-03-29', '2024-03-27', '8541.43-0000', '016-C1', 'KRPTK', 'KNK ENERGY PTE LTD', NULL, 1332.98::numeric, 1802906103::numeric, 'CFR', 0.0::numeric, 0::numeric, 180290610::numeric, 10108700::numeric, 10108.5::numeric, 0.132::numeric),
  ('43635-24-700509M', 'ZHC2404001', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-04-18', '2024-04-19', '8541.43-0000', '016-C1', 'KRPTK', 'KNK ENERGY PTE LTD', NULL, 1355.88::numeric, 1745704828::numeric, 'CFR', 0.0::numeric, 0::numeric, 174570482::numeric, 9616040::numeric, 9615.84::numeric, 0.132::numeric),
  ('43635-24-700606M', 'ZHC2404043', '99f0fc15-0555-4a41-a025-8bf3630a7947', '2024-05-02', '2024-05-01', '8541.43-0000', '020-C1', 'KRINC', 'KNK ENERGY PTE LTD', NULL, 1378.02::numeric, 192030394::numeric, 'CFR', 0.0::numeric, 0::numeric, 19203039::numeric, 1048810::numeric, 1048.8::numeric, 0.132::numeric)
) AS x(declaration_number, bl_no, company_id, declaration_date, arrival_date,
       hs_code, customs_office, port, supplier_name_en, lc_no,
       exchange_rate, cif_krw, incoterms, customs_rate, customs_amount, vat_amount,
       quantity, capacity_kw, contract_unit_price_usd_wp)
JOIN bl_shipments b ON b.bl_number = x.bl_no
WHERE NOT EXISTS (
  SELECT 1 FROM import_declarations e WHERE e.declaration_number = x.declaration_number
);

-- 검증 2
SELECT COUNT(*) AS new_decls FROM import_declarations WHERE memo LIKE 'M143:%';
-- expected: 28 (M143 으로 신규 등록된 BL 의 면장)

INSERT INTO schema_migrations(filename) VALUES ('143_bl_shipments_and_decl_from_pdf.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
