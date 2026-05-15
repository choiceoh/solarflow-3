-- M130: cost_details.incidental_cost 보강 — 부대비용/운송료 xlsx 적요에서 BL no 추출
BEGIN;
UPDATE cost_details SET 
  incidental_cost = 220000,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (220000원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'd68539b9-c039-4f13-bb91-36aa2fd870c0';
UPDATE cost_details SET 
  incidental_cost = 25883000,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (25883000원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'a4fd462a-0e95-4797-a663-291277453cf2';
UPDATE cost_details SET 
  incidental_cost = 41346096,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (41346096원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'd2b86738-12f3-4e02-a85f-e3e13924030d';
UPDATE cost_details SET 
  incidental_cost = 42442784,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (42442784원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'a1f3a8fb-5531-4b21-8012-ed092759308a';
UPDATE cost_details SET 
  incidental_cost = 75623920,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (75623920원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '846bf0a6-c44f-46ab-ae4e-3d0d521de9a6';
UPDATE cost_details SET 
  incidental_cost = 39223284,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (39223284원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'd99a20ae-a78e-4798-936e-d8c248942f4b';
UPDATE cost_details SET 
  incidental_cost = 57173470,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (57173470원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'cf600c96-3425-473f-8de4-28ba5232d502';
UPDATE cost_details SET 
  incidental_cost = 12309056,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (12309056원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'b1383d3f-948d-4cf8-87ba-a6973102e202';
UPDATE cost_details SET 
  incidental_cost = 48023890,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (48023890원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '45215462-4c20-47a5-888b-cd7be1e5d69b';
UPDATE cost_details SET 
  incidental_cost = 42984412,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (42984412원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '1d3fd34a-0180-4151-bd0a-2af217a0569a';
UPDATE cost_details SET 
  incidental_cost = 43469007,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (43469007원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'b3c2b084-fc93-4115-bc42-e5590fc475a6';
UPDATE cost_details SET 
  incidental_cost = 34017197,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (34017197원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'f32e2069-c210-4682-861a-a4db26fa897f';
UPDATE cost_details SET 
  incidental_cost = 22241255,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (22241255원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'cdde1eb3-a729-41a2-a85c-418a2b2c0bf9';
UPDATE cost_details SET 
  incidental_cost = 58361626,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (58361626원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '2e87b67d-b076-4fe6-87dd-f49f0cc92113';
UPDATE cost_details SET 
  incidental_cost = 38929045,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (38929045원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '886c1139-0237-4458-9377-6f0f60807601';
UPDATE cost_details SET 
  incidental_cost = 37383612,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (37383612원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '421ac220-81cd-4687-8468-409ef66a0d28';
UPDATE cost_details SET 
  incidental_cost = 29296051,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (29296051원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '7a51f7bb-c28b-4432-8d51-e93c8cd78d20';
UPDATE cost_details SET 
  incidental_cost = 38344480,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (38344480원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'e3e9ca11-8fae-4f06-b773-bc85ef4f0be7';
UPDATE cost_details SET 
  incidental_cost = 25537000,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (25537000원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'f6ac0f65-a375-482c-8b6a-99a6b6b8075e';
UPDATE cost_details SET 
  incidental_cost = 18096160,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (18096160원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'eb963bdd-4ab5-4008-b5b4-ea391753dedc';
UPDATE cost_details SET 
  incidental_cost = 58280,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (58280원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '4f8a5aa4-d749-46de-983d-4a7c33085ef2';
UPDATE cost_details SET 
  incidental_cost = 43710,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (43710원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '2968ae84-8eb4-4f11-810c-5fe79b8ad96b';
UPDATE cost_details SET 
  incidental_cost = 43710,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (43710원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '1081eb71-dd1f-4d07-9fce-184be2e1f063';
UPDATE cost_details SET 
  incidental_cost = 44031114,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (44031114원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '0d889ca8-4581-4916-9bb8-eeee0d19ecef';
UPDATE cost_details SET 
  incidental_cost = 26507324,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (26507324원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'd152ed61-3953-4cb5-8c0e-a4314ab8efd1';
UPDATE cost_details SET 
  incidental_cost = 12920631,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (12920631원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'c4c2677b-a46f-498c-bfe3-edeacfb9af3d';
UPDATE cost_details SET 
  incidental_cost = 51981080,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (51981080원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '5cbf70b2-615d-404b-b947-1d0410b02fd2';
UPDATE cost_details SET 
  incidental_cost = 30078487,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (30078487원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '8b6851ed-9aa3-4e7e-a8e6-fa33633cf561';
UPDATE cost_details SET 
  incidental_cost = 82162460,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (82162460원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'b14acc08-3ffa-4e45-9ebf-0d4c8102ddd7';
UPDATE cost_details SET 
  incidental_cost = 36555008,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (36555008원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'e9a970ae-f7a4-4d2d-8320-fc9854cef3bb';
UPDATE cost_details SET 
  incidental_cost = 60244489,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (60244489원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '6b894f2d-c35e-40b4-96e4-289011674b50';
UPDATE cost_details SET 
  incidental_cost = 40399476,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (40399476원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'cc6455da-8baa-45ca-b26f-42bafbc7d827';
UPDATE cost_details SET 
  incidental_cost = 16714423,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (16714423원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '38a9f431-8af5-4132-8aed-be150fbfd7ab';
UPDATE cost_details SET 
  incidental_cost = 62473920,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (62473920원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'd9dd33e2-215e-4474-97fb-f98528b42a5f';
UPDATE cost_details SET 
  incidental_cost = 42412047,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (42412047원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '8055e99a-2566-427e-ae7c-84c9b9d3c593';
UPDATE cost_details SET 
  incidental_cost = 6735680,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (6735680원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '3e757e18-bc31-4d29-8047-ae219312dfdc';
UPDATE cost_details SET 
  incidental_cost = 70012832,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (70012832원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'c72ecded-df6e-49ae-a101-22283a4a942f';
UPDATE cost_details SET 
  incidental_cost = 56590552,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (56590552원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '04288dce-0934-42df-9830-65a1d3209485';
UPDATE cost_details SET 
  incidental_cost = 37713966,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (37713966원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'ae897d0a-e4a7-45df-8fee-2b95dec95fe8';
UPDATE cost_details SET 
  incidental_cost = 13492815,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (13492815원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'dace1aa1-e15f-4df4-94d7-4f4a9b90c55d';
UPDATE cost_details SET 
  incidental_cost = 31934608,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (31934608원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'fbab0b8b-46d1-4a16-8a56-e18a0752de82';
UPDATE cost_details SET 
  incidental_cost = 6389454,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (6389454원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '57d5e189-ac6d-4522-870b-452a122010c0';
UPDATE cost_details SET 
  incidental_cost = 52694686,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (52694686원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'ced0c13a-e61a-4fe8-ac27-4eaf7795cc3b';
UPDATE cost_details SET 
  incidental_cost = 37302715,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (37302715원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '2ee6dfff-bf6f-4b68-9c55-9178cb0e4686';
UPDATE cost_details SET 
  incidental_cost = 33546296,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (33546296원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'd0b209c2-995e-4a88-bdd7-43ea3c92748c';
UPDATE cost_details SET 
  incidental_cost = 37926016,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (37926016원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = '1ed7d336-1062-4520-b290-7cc6f3bfa4be';
UPDATE cost_details SET 
  incidental_cost = 108706736,
  memo = COALESCE(NULLIF(cost_details.memo,''),'') || CASE WHEN COALESCE(cost_details.memo,'')='' THEN '' ELSE E'
' END || 'M130: 부대비용 xlsx 적요 매칭 (108706736원)'
  FROM import_declarations d WHERE cost_details.declaration_id = d.declaration_id AND d.bl_id = 'b2030a68-4c20-4f72-b13b-3e43878ebf6c';

-- landed_total_krw 재계산
UPDATE cost_details SET
  landed_total_krw = COALESCE(cif_total_krw,0) + COALESCE(tariff_amount,0) + COALESCE(vat_amount,0) + COALESCE(customs_fee,0) + COALESCE(incidental_cost,0)
WHERE incidental_cost IS NOT NULL AND incidental_cost > 0;

INSERT INTO schema_migrations(filename) VALUES ('130_backfill_cost_incidental.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
