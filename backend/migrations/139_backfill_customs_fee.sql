-- M132: cost_details.customs_fee 백필 — D 회계 전표 (블루오션에어 CFS CHARGE / 통관) 기준
-- 소스: 2025년 운송료/2025년, 2026년 모듈 부대비용, 운송료 내역.xlsx 의 블루오션에어 시트
-- 적요에서 BL 번호 추출 → bl_id 매칭 → cost_details.customs_fee 업데이트
-- BL 1건당 cost_details 1+ 행 (다면장 BL 은 동일 금액 적용 — 운영자 확인 필요)

BEGIN;

UPDATE cost_details cd SET
  customs_fee = 70012832,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (70,012,832원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'EASED2539LK006')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 33546296,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (33,546,296원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'EASED2550LK056')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 37302715,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (37,302,715원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'EASEK2547SK0001')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 37926016,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (37,926,016원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'EASPH2539SK6006')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 108706736,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (108,706,736원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'EASPR2542LK016')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 38344480,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (38,344,480원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'HDMUSHAA28081200')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 13492815,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (13,492,815원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'HGHDCS02961')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 44031114,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (44,031,114원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'JWSH25070012')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 12920631,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (12,920,631원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SHADCM82253')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 37713966,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (37,713,966원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SHADDP34512')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 43710,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (43,710원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SHKWA25009166')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 51981080,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (51,981,080원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SHKWA25019106')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 26507324,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (26,507,324원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SHKWA25019107')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 30078487,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (30,078,487원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SHKWA25019109')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 31934608,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (31,934,608원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SNKO02N250500536')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 25537000,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (25,537,000원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SNKO03K250302336')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 58280,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (58,280원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SNKO03K250302342')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 43710,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (43,710원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SNKO03K250302344')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 18096160,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (18,096,160원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SNKO03K250302826')
  AND cd.customs_fee IS NULL;

UPDATE cost_details cd SET
  customs_fee = 56590552,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'\n' END || 'M132: customs_fee 백필 (56,590,552원, 블루오션 D전표)'
FROM import_declarations d
WHERE cd.declaration_id = d.declaration_id
  AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SNLFZGKL005117')
  AND cd.customs_fee IS NULL;

-- landed_total_krw 재계산
UPDATE cost_details SET
  landed_total_krw = COALESCE(cif_total_krw,0) + COALESCE(tariff_amount,0) + COALESCE(vat_amount,0) + COALESCE(customs_fee,0) + COALESCE(incidental_cost,0)
WHERE customs_fee IS NOT NULL;

-- 검증
SELECT COUNT(*) AS cd_with_customs_fee, ROUND(SUM(customs_fee)::numeric, 0) AS total_customs_krw
FROM cost_details WHERE customs_fee IS NOT NULL AND customs_fee > 0;
-- expected: ~20 rows, ~674,868,512원

INSERT INTO schema_migrations(filename) VALUES ('139_backfill_customs_fee.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
