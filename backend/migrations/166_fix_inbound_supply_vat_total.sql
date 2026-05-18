-- @auto-apply: yes
-- M163: inbounds.total_amount/vat_amount 산식 mismatch 50건 정리
--
-- 배경 (운영자 확인 2026-05-18):
--   /admin/db-integrity 의 산식 검증 'inbounds: supply+vat=total' 이 50건 fail.
--   전부 KRW 통화, 전부 `supply + vat > total` (diff = vat). 검증식:
--     abs(supply_amount + vat_amount - total_amount) > 5
--
--   원인 추적 (직접 prod 조회):
--     - 전 50건 모두 supply_amount = total_amount, vat_amount = round(supply * 0.1)
--     - 즉 supply 와 total 은 동일한 VAT 미포함 금액이고 vat 만 별도 입력돼 있음
--     - 이 패턴은 M126_inbounds_supply_derive 의 두 번째 UPDATE 가 만든 잔재:
--         (1) supply_amount UPDATE — unit × spec × qty 로 도출
--         (2) vat_amount UPDATE — round(supply * 0.1) (단 vat IS NULL 또는 0 일 때)
--         (3) total_amount UPDATE — supply + vat (단 total IS NULL 또는 0 일 때)
--       (3) 의 가드 (total IS NULL OR total = 0) 때문에 이미 채워진 total
--       (= ERP 원본의 erp_supply 값) 는 업데이트되지 않음 → triplet 불일치.
--
--   두 분기 (source_payload.erp_vat 로 판별, dry-run 결과 30 + 20 = 50 정확히 일치):
--     A. erp_vat > 0 (30건, 전부 KRW): ERP 원본은 supply+vat=total 정상.
--        DB 의 total_amount 가 supply_amount 와 동일하게 잘못 적재됨.
--        → UPDATE total_amount = supply_amount + vat_amount.
--        검증: source_payload.erp_total 과 일치하는지 확인.
--     B. erp_vat = 0 (20건, USD 면장 기반): ERP 원본은 VAT 없음.
--        M126 의 (2) 가 vat_amount = supply * 0.1 을 잘못 추가.
--        → UPDATE vat_amount = 0.
--
-- 사후 영향:
--   - 50건의 정합성 fail → 0
--   - 산식 view 외 사용처: sales/margin 계산은 fifo_matches/sales 의 자체 금액을
--     참조하므로 inbound triplet 변경 영향 없음 (engine grep 결과 spare_qty/inbound
--     supply 참조 0)
--   - 부대비용/landed cost: cost_details.landed_total_krw 정본 (M116 백필 후) 사용

BEGIN;

-- ───── 분기 A: 30건 — total_amount 를 supply + vat 로 정정 (KRW, erp_vat > 0)
WITH targets AS (
  SELECT inbound_id, supply_amount + vat_amount AS new_total
  FROM inbounds
  WHERE supply_amount IS NOT NULL AND vat_amount IS NOT NULL AND total_amount IS NOT NULL
    AND abs(supply_amount + vat_amount - total_amount) > 5
    AND (source_payload->>'erp_vat')::numeric > 0
)
UPDATE inbounds i
SET total_amount = t.new_total,
    source_payload = COALESCE(i.source_payload, '{}'::jsonb)
      || jsonb_build_object('m163_total_corrected_from', i.total_amount,
                            'm163_migration', '166_fix_inbound_supply_vat_total')
FROM targets t
WHERE i.inbound_id = t.inbound_id;

-- ───── 분기 B: 20건 — vat_amount 를 0 으로 정정 (USD, M126 가 잘못 추가한 VAT)
WITH targets AS (
  SELECT inbound_id, vat_amount AS old_vat
  FROM inbounds
  WHERE supply_amount IS NOT NULL AND vat_amount IS NOT NULL AND total_amount IS NOT NULL
    AND abs(supply_amount + vat_amount - total_amount) > 5
    AND ((source_payload->>'erp_vat')::numeric = 0 OR source_payload->>'erp_vat' IS NULL)
)
UPDATE inbounds i
SET vat_amount = 0,
    source_payload = COALESCE(i.source_payload, '{}'::jsonb)
      || jsonb_build_object('m163_vat_reverted_from', t.old_vat,
                            'm163_migration', '166_fix_inbound_supply_vat_total')
FROM targets t
WHERE i.inbound_id = t.inbound_id;

-- ───── 검증
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM inbounds
  WHERE supply_amount IS NOT NULL AND vat_amount IS NOT NULL AND total_amount IS NOT NULL
    AND abs(supply_amount + vat_amount - total_amount) > 5;
  RAISE NOTICE '[166] inbound supply+vat≠total 잔존: % (기대 0)', v_remaining;
  IF v_remaining > 0 THEN
    RAISE WARNING '[166] 잔존 %건 — source_payload.erp_vat 분기 가정 위반 가능. 수기 확인 필요.', v_remaining;
  END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
