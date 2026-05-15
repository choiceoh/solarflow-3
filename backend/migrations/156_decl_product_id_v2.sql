-- M156: M154 미매칭 20건 보강 — PDF 정규식 강화 + 신규 모델 등록
-- 1단계: 신규 모델 products INSERT (LR7-60HVHL-540M 등)
-- 2단계: 신규 모델 + 직접 매칭으로 import_declarations.product_id UPDATE
-- 의존성: PR #857 (M148+M149+M150) 머지 후 적용

BEGIN;

-- 1단계: 신규 모델 INSERT
-- (신규 등록할 모델 없음)

-- 2단계: import_declarations.product_id UPDATE

UPDATE import_declarations SET product_id = 'c1452102-86f2-4db7-abe4-08697c7e952e'::uuid
  WHERE declaration_number = '43635-24-700213M' AND product_id IS NULL;  -- LR5-72HGD-575M

UPDATE import_declarations SET product_id = 'a646480b-fcf1-4265-b283-552a1bf686f2'::uuid
  WHERE declaration_number = '43635-24-800121M' AND product_id IS NULL;  -- JKM625N-78HL4-BDV

UPDATE import_declarations SET product_id = 'a646480b-fcf1-4265-b283-552a1bf686f2'::uuid
  WHERE declaration_number = '43635-24-600278M' AND product_id IS NULL;  -- JKM625N-78HL4-BDV

UPDATE import_declarations SET product_id = '07c7a563-29de-4914-8d3a-f1b566682394'::uuid
  WHERE declaration_number = '43635-24-700723M' AND product_id IS NULL;  -- LR5-72HGD-580M

UPDATE import_declarations SET product_id = '884489d8-ed72-408c-96e6-a4ca8656ec06'::uuid
  WHERE declaration_number = '43635-24-600317M' AND product_id IS NULL;  -- CS7N-690TB-AG

UPDATE import_declarations SET product_id = '884489d8-ed72-408c-96e6-a4ca8656ec06'::uuid
  WHERE declaration_number = '43635-24-700606M' AND product_id IS NULL;  -- CS7N-690TB-AG

UPDATE import_declarations SET product_id = '463cf8a0-ad42-4782-8489-eaaf8f7d7c3c'::uuid
  WHERE declaration_number = '43635-24-800475M' AND product_id IS NULL;  -- JKM635N-78HL4

UPDATE import_declarations SET product_id = '07c7a563-29de-4914-8d3a-f1b566682394'::uuid
  WHERE declaration_number = '43635-24-700214M' AND product_id IS NULL;  -- LR5-72HGD-580M

UPDATE import_declarations SET product_id = '3a4e2bb0-bf6c-48aa-a780-e4bad1e53e8c'::uuid
  WHERE declaration_number = '43635-24-700736M' AND product_id IS NULL;  -- JKM630N-78HL4-BDV

UPDATE import_declarations SET product_id = '884489d8-ed72-408c-96e6-a4ca8656ec06'::uuid
  WHERE declaration_number = '43635-24-700322M' AND product_id IS NULL;  -- CS7N-690TB-AG

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-701434M' AND product_id IS NULL;  -- JKM630N-78HL4-BDV-S

UPDATE import_declarations SET product_id = '884489d8-ed72-408c-96e6-a4ca8656ec06'::uuid
  WHERE declaration_number = '43635-24-700411M' AND product_id IS NULL;  -- CS7N-690TB-AG

UPDATE import_declarations SET product_id = 'c1452102-86f2-4db7-abe4-08697c7e952e'::uuid
  WHERE declaration_number = '43635-24-700170M' AND product_id IS NULL;  -- LR5-72HGD-575M

UPDATE import_declarations SET product_id = '8e04c71b-f309-449c-bd14-1e5e4716a7e8'::uuid
  WHERE declaration_number = '43199-26-700183M' AND product_id IS NULL;  -- LR7-72HGD-615M

UPDATE import_declarations SET product_id = '884489d8-ed72-408c-96e6-a4ca8656ec06'::uuid
  WHERE declaration_number = '43635-24-700509M' AND product_id IS NULL;  -- CS7N-690TB-AG

-- 검증
SELECT COUNT(*) AS decls_with_product FROM import_declarations WHERE product_id IS NOT NULL;

INSERT INTO schema_migrations(filename) VALUES ('156_decl_product_id_v2.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
