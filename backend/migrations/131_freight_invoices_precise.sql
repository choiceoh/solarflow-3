-- M131: cost_details.incidental_cost 정밀 보강 — BL별 청구서 xlsx
-- M130 적요 매칭보다 청구서가 더 정확 → 청구서 값 우선
BEGIN;
UPDATE cost_details cd SET 
  incidental_cost = 38344480,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'
' END || 'M131: BL청구서 정밀 매칭 (38,344,480원)'
FROM import_declarations d 
WHERE cd.declaration_id = d.declaration_id AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'HDMUSHAA28081200');
UPDATE cost_details cd SET 
  incidental_cost = 25537000,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'
' END || 'M131: BL청구서 정밀 매칭 (25,537,000원)'
FROM import_declarations d 
WHERE cd.declaration_id = d.declaration_id AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SNKO03K250302336');
UPDATE cost_details cd SET 
  incidental_cost = 18096160,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'
' END || 'M131: BL청구서 정밀 매칭 (18,096,160원)'
FROM import_declarations d 
WHERE cd.declaration_id = d.declaration_id AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SNKO03K250302826');
UPDATE cost_details cd SET 
  incidental_cost = 27307400,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'
' END || 'M131: BL청구서 정밀 매칭 (27,307,400원)'
FROM import_declarations d 
WHERE cd.declaration_id = d.declaration_id AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SNKO03K250201371');
UPDATE cost_details cd SET 
  incidental_cost = 34784040,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'
' END || 'M131: BL청구서 정밀 매칭 (34,784,040원)'
FROM import_declarations d 
WHERE cd.declaration_id = d.declaration_id AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SNKO03K250201374');
UPDATE cost_details cd SET 
  incidental_cost = 30491214,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'
' END || 'M131: BL청구서 정밀 매칭 (30,491,214원)'
FROM import_declarations d 
WHERE cd.declaration_id = d.declaration_id AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SHKWA25009166');
UPDATE cost_details cd SET 
  incidental_cost = 31493160,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'
' END || 'M131: BL청구서 정밀 매칭 (31,493,160원)'
FROM import_declarations d 
WHERE cd.declaration_id = d.declaration_id AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SNKO03K250302342');
UPDATE cost_details cd SET 
  incidental_cost = 26174500,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'
' END || 'M131: BL청구서 정밀 매칭 (26,174,500원)'
FROM import_declarations d 
WHERE cd.declaration_id = d.declaration_id AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'SNKO03K250302344');
UPDATE cost_details cd SET 
  incidental_cost = 25045064,
  memo = COALESCE(NULLIF(cd.memo,''),'') || CASE WHEN COALESCE(cd.memo,'')='' THEN '' ELSE E'
' END || 'M131: BL청구서 정밀 매칭 (25,045,064원)'
FROM import_declarations d 
WHERE cd.declaration_id = d.declaration_id AND d.bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = 'JWSH25030014');

-- landed_total_krw 재계산
UPDATE cost_details SET
  landed_total_krw = COALESCE(cif_total_krw,0) + COALESCE(tariff_amount,0) + COALESCE(vat_amount,0) + COALESCE(customs_fee,0) + COALESCE(incidental_cost,0);

INSERT INTO schema_migrations(filename) VALUES ('131_freight_invoices_precise.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
