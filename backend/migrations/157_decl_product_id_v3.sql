-- M157: M156 잔여 매칭 보강 — 신규 모델 등록 + product_id 매핑 4건
--
-- 잔여 14건 PDF 분석 결과:
--   모듈 (모델명 PDF 명시): 4건 → M157 처리
--   Longi 경량모듈 (MONO SOLAR MODULE, 모델명 미상): 4건 → 운영자 확인
--   부속자재 (BLOCKS SHALL / T6 CONNECTOR): 6건 → 모듈 아님, product_id NULL 유지
--
-- 의존성: PR #857 (M148+M149+M150) 머지 후 적용

BEGIN;

-- 1단계: 신규 모델 INSERT (3 제조사 × 3 변종)
INSERT INTO products (product_id, product_code, product_name, manufacturer_id, spec_wp, product_kind, is_active, memo)
VALUES
  (gen_random_uuid(), 'CS1U-MS-1', 'CS1U-MS-1 415W', 'c0c0eb4d-3556-434f-8bbf-32c2c65651bc'::uuid, 415, 'module', true, 'M157: CSI 415W 변종, M154 미매칭에서 PDF 추출'),
  (gen_random_uuid(), 'CS7N-695TB-AG-1', 'CS7N-695TB-AG-1 695W', 'c0c0eb4d-3556-434f-8bbf-32c2c65651bc'::uuid, 695, 'module', true, 'M157: CSI 695W AG-1 변종'),
  (gen_random_uuid(), 'RSM156-9-635BNDG', 'RSM156-9-635BNDG 635W', 'ccc9937e-6214-45f8-8b48-26487bf1d0d7'::uuid, 635, 'module', true, 'M157: Risen 635W BNDG')
ON CONFLICT (product_code) DO NOTHING;

-- 2단계: import_declarations.product_id UPDATE (declaration_number 기준)
UPDATE import_declarations id SET product_id = p.product_id
FROM products p
WHERE id.declaration_number = '43635-24-601021M' AND p.product_code = 'CS1U-MS-1' AND id.product_id IS NULL;

UPDATE import_declarations id SET product_id = p.product_id
FROM products p
WHERE id.declaration_number = '43635-24-700400M' AND p.product_code = 'CS1U-MS-1' AND id.product_id IS NULL;

UPDATE import_declarations id SET product_id = p.product_id
FROM products p
WHERE id.declaration_number = '43635-24-701275M' AND p.product_code = 'CS7N-695TB-AG-1' AND id.product_id IS NULL;

UPDATE import_declarations id SET product_id = p.product_id
FROM products p
WHERE id.declaration_number = '43199-26-700188M' AND p.product_code = 'RSM156-9-635BNDG' AND id.product_id IS NULL;

-- 검증
SELECT 'new_modules' AS step, COUNT(*) FROM products WHERE product_code IN ('CS1U-MS-1','CS7N-695TB-AG-1','RSM156-9-635BNDG');
-- expected: 3

SELECT 'matched_decls', COUNT(*) FROM import_declarations
WHERE declaration_number IN ('43635-24-601021M','43635-24-700400M','43635-24-701275M','43199-26-700188M')
  AND product_id IS NOT NULL;
-- expected: 4 (PR #857 머지 후)

INSERT INTO schema_migrations(filename) VALUES ('157_decl_product_id_v3.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';

-- 운영자 확인 사항 (M157 후 잔여 10건):
--   A. Longi 경량모듈 4건 (MONO SOLAR MODULE, 모델명 미상):
--      - 43199-25-300766M / 43199-26-300462M / 43199-26-700180M / 43199-26-700182M
--      - BL: WXAE25070807, DFS815002448/450/451
--      - 단가 0.15-0.16 USD/Wp, 540W 추정 (PDF 에 정식 모델 코드 없음)
--      - 운영자가 모델명 확인 후 별도 마이그
--
--   B. 부속자재 6건 (모듈 아님, product_id NULL 유지):
--      - BLOCKS SHALL 5건 (Longi 부속): 43199-25-301173/186/210M, 43199-26-300314M, 300315M
--      - T6 CONNECTOR 1건 (CSI 커넥터): 43635-24-700391M
--      - 모듈 도메인 외 → 추후 accessory product_kind 도입 시 등록 가능
