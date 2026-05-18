-- M155: BL 오타 4건 정정 — FK 의존 행 재할당 후 오타 BL 삭제
--
-- 배경 (운영자 수기 입력 오타):
--   HGHDC502961   (오타) ← S/5 오타 → HGHDCS02961 (정본)
--   SHKWA25019109 (오타) ← 끝자리 7/9   → SHKWA25019107 (정본)
--   JWSH25070021  (오타) ← 다른 BL      → JWSH25070013 (정본)
--   SHAA28081200  (오타) ← HDMU prefix 누락 → HDMUSHAA28081200 (정본)
--
-- 처리 단계 (각 BL 별):
--   1. bl_line_items: 같은 product 충돌 → quantity 합산 + typo bli DELETE / 비충돌 UPDATE
--   2. import_declarations: bl_id 단순 UPDATE (정본 BL 의 면장은 0~1건이라 충돌 가능성 검토)
--   3. outbound_bl_items: 같은 outbound 충돌 → quantity 합산 + typo obi DELETE / 비충돌 UPDATE
--   4. incidental_expenses: bl_id 단순 UPDATE (unique 없음)
--   5. typo BL DELETE
--
-- 충돌 매트릭스:
--   HGHDC502961:  obi conflict=0, bli conflict 가능 (typo bli=0 → 충돌 없음)
--   SHKWA25019109: obi conflict=0, bli typo=1/canon=1 (product 충돌 가능성)
--   JWSH25070021:  obi conflict=2, bli typo=1/canon=1
--   SHAA28081200:  obi conflict=4, bli typo=1/canon=0, canon decl=1 (typo decl=1, declaration_number 빈값이면 OK)

BEGIN;

-- ============================================================
-- 공통 처리 함수: typo BL → canon BL FK 재할당 + 삭제
-- ============================================================
CREATE OR REPLACE FUNCTION sf_merge_typo_bl(p_typo_id uuid, p_canon_id uuid, p_typo_no text, p_canon_no text)
RETURNS void AS $$
BEGIN
  -- 1. bl_line_items: 같은 (canon_bl, product_id, item_type) 이미 있으면 합산 후 typo 삭제, 아니면 UPDATE
  UPDATE bl_line_items c
  SET quantity = c.quantity + t.quantity,
      capacity_kw = COALESCE(c.capacity_kw, 0) + COALESCE(t.capacity_kw, 0),
      memo = COALESCE(NULLIF(c.memo,''),'') || E'\n[M155 merge from typo ' || p_typo_no || ']'
  FROM bl_line_items t
  WHERE c.bl_id = p_canon_id AND t.bl_id = p_typo_id
    AND c.product_id = t.product_id
    AND COALESCE(c.item_type,'') = COALESCE(t.item_type,'');

  DELETE FROM bl_line_items t
  WHERE t.bl_id = p_typo_id
    AND EXISTS (SELECT 1 FROM bl_line_items c WHERE c.bl_id = p_canon_id
                AND c.product_id = t.product_id AND COALESCE(c.item_type,'') = COALESCE(t.item_type,''));

  UPDATE bl_line_items SET bl_id = p_canon_id WHERE bl_id = p_typo_id;

  -- 2. import_declarations: bl_id UPDATE (declaration_number 정확히 동일한 경우만 unique 충돌 가능, 일반적으로 별개)
  UPDATE import_declarations SET bl_id = p_canon_id WHERE bl_id = p_typo_id;

  -- 3. outbound_bl_items: 같은 (canon_bl, outbound_id) 이미 있으면 합산 후 typo 삭제, 아니면 UPDATE
  UPDATE outbound_bl_items c
  SET quantity = c.quantity + t.quantity
  FROM outbound_bl_items t
  WHERE c.bl_id = p_canon_id AND t.bl_id = p_typo_id
    AND c.outbound_id = t.outbound_id;

  DELETE FROM outbound_bl_items t
  WHERE t.bl_id = p_typo_id
    AND EXISTS (SELECT 1 FROM outbound_bl_items c WHERE c.bl_id = p_canon_id AND c.outbound_id = t.outbound_id);

  UPDATE outbound_bl_items SET bl_id = p_canon_id WHERE bl_id = p_typo_id;

  -- 4. incidental_expenses: bl_id UPDATE (충돌 가드 없음 — 동일 (bl, month, vendor, amount) 합치지 않음)
  UPDATE incidental_expenses SET bl_id = p_canon_id WHERE bl_id = p_typo_id;

  -- 5. inventory_allocations, fifo_matches 등 다른 잠재 FK 도 UPDATE (운영상 빈테이블이지만 안전)
  UPDATE inventory_allocations SET bl_id = p_canon_id WHERE bl_id = p_typo_id;
  -- fifo_matches.bl_id 컬럼 없음 (declaration_id 매개) — 직접 영향 없음

  -- 6. typo BL DELETE
  DELETE FROM bl_shipments WHERE bl_id = p_typo_id;

  RAISE NOTICE 'M155 merged: % → % done', p_typo_no, p_canon_no;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4 BL 정정 실행
-- ============================================================
SELECT sf_merge_typo_bl(
  '49b0e639-ef43-40bf-8964-edd99db0828c'::uuid,  -- HGHDC502961 (typo)
  'dace1aa1-e15f-4df4-94d7-4f4a9b90c55d'::uuid,  -- HGHDCS02961 (canon)
  'HGHDC502961', 'HGHDCS02961'
);

SELECT sf_merge_typo_bl(
  '8b6851ed-9aa3-4e7e-a8e6-fa33633cf561'::uuid,  -- SHKWA25019109 (typo)
  'd152ed61-3953-4cb5-8c0e-a4314ab8efd1'::uuid,  -- SHKWA25019107 (canon)
  'SHKWA25019109', 'SHKWA25019107'
);

SELECT sf_merge_typo_bl(
  'b1383d3f-948d-4cf8-87ba-a6973102e202'::uuid,  -- JWSH25070021 (typo)
  'd99a20ae-a78e-4798-936e-d8c248942f4b'::uuid,  -- JWSH25070013 (canon)
  'JWSH25070021', 'JWSH25070013'
);

SELECT sf_merge_typo_bl(
  '37565cec-2c14-46de-93bd-c9d841c4e1c6'::uuid,  -- SHAA28081200 (typo)
  'e3e9ca11-8fae-4f06-b773-bc85ef4f0be7'::uuid,  -- HDMUSHAA28081200 (canon)
  'SHAA28081200', 'HDMUSHAA28081200'
);

-- 검증
SELECT '검증 1: 오타 BL 모두 삭제됐는지' AS step,
       COUNT(*) AS remaining_typo_bls
FROM bl_shipments
WHERE bl_number IN ('HGHDC502961','SHKWA25019109','JWSH25070021','SHAA28081200');
-- expected: 0

SELECT '검증 2: 정본 BL FK 카운트' AS step,
       b.bl_number,
       (SELECT COUNT(*) FROM bl_line_items WHERE bl_id = b.bl_id) AS bli,
       (SELECT COUNT(*) FROM import_declarations WHERE bl_id = b.bl_id) AS decl,
       (SELECT COUNT(*) FROM outbound_bl_items WHERE bl_id = b.bl_id) AS obi,
       (SELECT COUNT(*) FROM incidental_expenses WHERE bl_id = b.bl_id) AS incid
FROM bl_shipments b
WHERE b.bl_number IN ('HGHDCS02961','SHKWA25019107','JWSH25070013','HDMUSHAA28081200')
ORDER BY b.bl_number;

INSERT INTO schema_migrations(filename) VALUES ('155_fix_bl_typo_merge.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
