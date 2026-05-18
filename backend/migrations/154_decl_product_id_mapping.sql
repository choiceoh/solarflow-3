-- M154: import_declarations.product_id 매핑 — M149/M150 으로 신규 등록된 70 declarations 중 50건
-- 소스: PDF 면장 추출 model_code → products.product_code 매칭
-- 의존성: PR #857 (M148+M149+M150) 머지 후 적용 (WHERE 절 안전 가드)
--
-- 매칭 성공 50건 (exact + fuzzy)
-- 매칭 실패 20건 운영자 확인 사항:
--   * model_code PDF 추출 실패 13건 (납부영수증 양식 등) → 정규식 보강 별도
--   * 신규 모델 (LR7-60HVHL-540M 등) DB 미등록 4건 → products INSERT 별도
--   * 모델 코드 불완전 (JKM635N-78HL4-BD) 3건 → 운영자 확인

BEGIN;

UPDATE import_declarations SET product_id = '27526838-96b9-46d9-b02d-1f2bcb5091c8'::uuid
  WHERE declaration_number = '43052-25-091971M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '27526838-96b9-46d9-b02d-1f2bcb5091c8'::uuid
  WHERE declaration_number = '43199-25-300793M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '8e04c71b-f309-449c-bd14-1e5e4716a7e8'::uuid
  WHERE declaration_number = '43199-26-700160M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '8e04c71b-f309-449c-bd14-1e5e4716a7e8'::uuid
  WHERE declaration_number = '43199-26-700161M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '8e04c71b-f309-449c-bd14-1e5e4716a7e8'::uuid
  WHERE declaration_number = '43199-26-700183M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = 'a646480b-fcf1-4265-b283-552a1bf686f2'::uuid
  WHERE declaration_number = '43635-24-600278M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = 'c6aef0c7-350e-44f7-8435-9c053c762ac7'::uuid
  WHERE declaration_number = '43635-24-601435M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-601631M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-601681M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = 'c1452102-86f2-4db7-abe4-08697c7e952e'::uuid
  WHERE declaration_number = '43635-24-700170M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = 'c1452102-86f2-4db7-abe4-08697c7e952e'::uuid
  WHERE declaration_number = '43635-24-700213M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '07c7a563-29de-4914-8d3a-f1b566682394'::uuid
  WHERE declaration_number = '43635-24-700214M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = 'a646480b-fcf1-4265-b283-552a1bf686f2'::uuid
  WHERE declaration_number = '43635-24-700507M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '07c7a563-29de-4914-8d3a-f1b566682394'::uuid
  WHERE declaration_number = '43635-24-700723M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '3a4e2bb0-bf6c-48aa-a780-e4bad1e53e8c'::uuid
  WHERE declaration_number = '43635-24-700736M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '07c7a563-29de-4914-8d3a-f1b566682394'::uuid
  WHERE declaration_number = '43635-24-700881M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '07c7a563-29de-4914-8d3a-f1b566682394'::uuid
  WHERE declaration_number = '43635-24-701132M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-701246M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '07c7a563-29de-4914-8d3a-f1b566682394'::uuid
  WHERE declaration_number = '43635-24-701254M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = 'c6aef0c7-350e-44f7-8435-9c053c762ac7'::uuid
  WHERE declaration_number = '43635-24-701380M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '07c7a563-29de-4914-8d3a-f1b566682394'::uuid
  WHERE declaration_number = '43635-24-701381M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-701388M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-701434M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-701435M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-701468M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '27526838-96b9-46d9-b02d-1f2bcb5091c8'::uuid
  WHERE declaration_number = '43635-24-701479M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-701585M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '07c7a563-29de-4914-8d3a-f1b566682394'::uuid
  WHERE declaration_number = '43635-24-701593M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-701607M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-701608M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '27526838-96b9-46d9-b02d-1f2bcb5091c8'::uuid
  WHERE declaration_number = '43635-24-701679M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-701710M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-701711M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-701716M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-701717M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-701718M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '8e04c71b-f309-449c-bd14-1e5e4716a7e8'::uuid
  WHERE declaration_number = '43635-24-701794M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '27526838-96b9-46d9-b02d-1f2bcb5091c8'::uuid
  WHERE declaration_number = '43635-24-701836M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = 'a646480b-fcf1-4265-b283-552a1bf686f2'::uuid
  WHERE declaration_number = '43635-24-800121M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '3a4e2bb0-bf6c-48aa-a780-e4bad1e53e8c'::uuid
  WHERE declaration_number = '43635-24-800366M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-800464M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-800466M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = 'a646480b-fcf1-4265-b283-552a1bf686f2'::uuid
  WHERE declaration_number = '43635-24-900038M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '07c7a563-29de-4914-8d3a-f1b566682394'::uuid
  WHERE declaration_number = '43635-24-900098M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '07c7a563-29de-4914-8d3a-f1b566682394'::uuid
  WHERE declaration_number = '43635-24-900129M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '07c7a563-29de-4914-8d3a-f1b566682394'::uuid
  WHERE declaration_number = '43635-24-900214M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-900307M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-900308M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-900309M' AND product_id IS NULL;

UPDATE import_declarations SET product_id = '0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid
  WHERE declaration_number = '43635-24-900348M' AND product_id IS NULL;

-- 검증
SELECT COUNT(*) AS decls_with_product FROM import_declarations WHERE product_id IS NOT NULL;
SELECT COUNT(*) AS decls_without_product FROM import_declarations WHERE product_id IS NULL;

INSERT INTO schema_migrations(filename) VALUES ('154_decl_product_id_mapping.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
