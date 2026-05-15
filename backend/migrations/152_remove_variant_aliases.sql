-- M146: product_aliases 정정 — 변종 모델 alias 7건 제거
--
-- 배경 (운영자 확인):
--   "사이즈와 생산이 사실상 같은 제품이지만 일부 재료의 납품처가 달라지면 모듈의 품번이 달라져"
--   → S/S1/S2, 615M/615Ma, GHD/GHD10 등 끝자 변동은 재료 납품처 차이로 인한 별개 변종.
--   → alias 가 아니라 별개 product 로 영구 분리 추적해야 함 (FIFO 원가 / 재고 / 매출 단위 보존).
--
-- 운영자 가이드라인: "명확한 오타가 아니면 다 조금 다른 변종"
--
-- 분류:
--   ✅ 오타 (유지): V↔B 글자 오타, NEG↔NGE 순서 오타
--   ❌ 변종 (제거): -S/-S1/-S2, 615M/615Ma, GHD/GHD10, suffix 누락
--   ⚠️ 운영자 확인 (보류): "BDV-S(제품)" 한글 suffix — 의도 불명

BEGIN;

-- 변종 alias 7건 제거
DELETE FROM product_aliases pa WHERE (pa.canonical_product_id, pa.alias_product_id) IN (
  -- HS500WE-GHD (1등급) ↔ HS500WE-GHD10 (1등급) — GHD/GHD10 변종
  ('6109098d-6120-4121-aaf8-75181149e083'::uuid, '9484f017-b0f2-41a2-a0ca-1b5b8cc42db0'::uuid),
  -- JKM630N-78HL4-BDV-S ↔ JKM630N-78HL4-BDV — suffix 누락 (변종 추정)
  ('0050bc54-89a0-4dd1-bea4-4ef0b63235f4'::uuid, '3a4e2bb0-bf6c-48aa-a780-e4bad1e53e8c'::uuid),
  -- JKM635N-78HL4-BDV-S ↔ -S1 — 변종
  ('27526838-96b9-46d9-b02d-1f2bcb5091c8'::uuid, '4f5b41e3-aa8a-4cc3-a04a-75b0990a82b9'::uuid),
  -- JKM635N-78HL4-BDV-S ↔ -S2 — 변종
  ('27526838-96b9-46d9-b02d-1f2bcb5091c8'::uuid, '6a5d1377-f3e2-4e86-b3c4-cb2a6ba72450'::uuid),
  -- LR7-72HGD-615M ↔ 615Ma — 'a' suffix 변종
  ('8e04c71b-f309-449c-bd14-1e5e4716a7e8'::uuid, '1e7eae33-26ef-4a50-8d35-4e789c89ffe0'::uuid),
  -- TSM-710NEG21C.20K ↔ TSM-710NEG21C.20 — 'K' 누락 (변종 추정, ERP 표기 차이)
  ('d47a007a-1599-4c63-ba0d-b15349b9a060'::uuid, '61d2dfb5-11b4-4f87-8f6b-01a3c2f120db'::uuid),
  -- TSM-720NEG21C.20K ↔ TSM-720NEG21C.20 — 'K' 누락
  ('70e49056-ba4b-437b-9341-edcd6dd52ef4'::uuid, '597c3a8d-162b-496e-8994-e6b038b0c4a9'::uuid)
);

-- 유지되는 alias (참고용 — 명확한 오타):
--   JKM635N-78HL4-BDV-S ↔ JKM635N-78HL4-VDV-S (V↔B 인접 키 오타)
--   TSM-720NEG21C.20K ↔ TSM-720NGE21C.20K (NEG↔NGE 글자 순서 오타)
--
-- 보류되는 alias (운영자 확인 필요):
--   JKM630N-78HL4-BDV-S ↔ JKM630N-78HL4-BDV-S(제품) — 한글 suffix, ERP 메모 가능성

-- 검증
SELECT COUNT(*) AS remaining_aliases FROM product_aliases;
-- expected: 10 - 7 = 3 (V↔B 오타 + NGE↔NEG 오타 + (제품) 한글 suffix)

SELECT cp.product_code AS canonical, ap.product_code AS alias
FROM product_aliases pa
JOIN products cp ON cp.product_id = pa.canonical_product_id
JOIN products ap ON ap.product_id = pa.alias_product_id
ORDER BY cp.product_code;

INSERT INTO schema_migrations(filename) VALUES ('152_remove_variant_aliases.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
