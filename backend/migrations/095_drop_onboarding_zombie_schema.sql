-- @auto-apply: no
-- 095_drop_onboarding_zombie_schema.sql
-- Onboarding 시스템(053/054) revert (PR #361, 2026-05-03) 의 잔존 schema 청소.
--
-- PR #361 이 053_onboarding_sandbox.sql / 054_onboarding_sandbox_view.sql 파일은
-- 삭제했지만 운영 DB 의 is_sandbox 컬럼·partial index·view 컬럼은 그대로 남았다.
-- 또한 baro 핸들러 2곳에 .Eq("is_sandbox","false") 필터가 함께 deprecate 됐다.
--
-- 본 마이그는 그 잔존을 제거한다 — 9개 테이블의 is_sandbox 컬럼 + 의존 partial index 7개 +
-- purchase_orders_ext view 재생성 (084 aggregate 컬럼은 보존).
--
-- ⚠️ DROP COLUMN — auto-apply 로 들어가지 않도록 헤더 명시. 운영자가:
--    psql -d ... -f backend/migrations/095_drop_onboarding_zombie_schema.sql
--
-- 사전 검증: 모든 9개 테이블에서 is_sandbox = true 인 row 가 0개임을 확인 완료
-- (2026-05-12 prod query). 데이터 손실 없음.

BEGIN;

-- 1) view 제거 (purchase_orders.is_sandbox 에 의존)
DROP VIEW IF EXISTS purchase_orders_ext;

-- 2) is_sandbox 컬럼 9개 제거. partial index (idx_*_real) 는 DROP COLUMN 으로 자동 CASCADE.
ALTER TABLE partners              DROP COLUMN IF EXISTS is_sandbox;
ALTER TABLE purchase_orders       DROP COLUMN IF EXISTS is_sandbox;
ALTER TABLE po_line_items         DROP COLUMN IF EXISTS is_sandbox;
ALTER TABLE lc_records            DROP COLUMN IF EXISTS is_sandbox;
ALTER TABLE lc_line_items         DROP COLUMN IF EXISTS is_sandbox;
ALTER TABLE bl_shipments          DROP COLUMN IF EXISTS is_sandbox;
ALTER TABLE bl_line_items         DROP COLUMN IF EXISTS is_sandbox;
ALTER TABLE import_declarations   DROP COLUMN IF EXISTS is_sandbox;
ALTER TABLE cost_details          DROP COLUMN IF EXISTS is_sandbox;

-- 3) view 재생성 — is_sandbox 컬럼만 빠지고 084 의 aggregate 컬럼은 그대로.
CREATE VIEW purchase_orders_ext AS
SELECT
  po.po_id,
  po.po_number,
  po.company_id,
  po.manufacturer_id,
  po.contract_type,
  po.contract_date,
  po.incoterms,
  po.payment_terms,
  po.total_qty,
  po.total_mw,
  po.contract_period_start,
  po.contract_period_end,
  po.status,
  po.memo,
  po.created_at,
  po.updated_at,
  po.parent_po_id,
  m.name_kr AS manufacturer_name,
  m.name_en AS manufacturer_name_en,
  first_line.spec_wp AS first_spec_wp,
  first_line.product_name AS first_product_name,
  first_line.product_code AS first_product_code,
  COALESCE(line_agg.line_count, 0) AS line_count,
  COALESCE(line_agg.line_total_usd, 0::numeric) AS line_total_usd,
  COALESCE(line_agg.line_total_wp, 0::numeric) AS line_total_wp,
  COALESCE(line_agg.line_extra_count, 0) AS line_extra_count,
  COALESCE(lc_agg.lc_count, 0) AS lc_count,
  COALESCE(lc_agg.lc_total_usd, 0::numeric) AS lc_total_usd,
  COALESCE(lc_agg.lc_total_mw, 0::numeric) AS lc_total_mw,
  COALESCE(tt_agg.tt_count, 0) AS tt_count,
  COALESCE(tt_agg.tt_completed_usd, 0::numeric) AS tt_completed_usd
FROM purchase_orders po
  LEFT JOIN manufacturers m ON po.manufacturer_id = m.manufacturer_id
  LEFT JOIN LATERAL (
    SELECT pr.spec_wp, pr.product_name, pr.product_code
    FROM po_line_items pl
      LEFT JOIN products pr ON pl.product_id = pr.product_id
    WHERE pl.po_id = po.po_id AND (pl.payment_type IS NULL OR pl.payment_type = 'paid')
    ORDER BY pl.created_at
    LIMIT 1
  ) first_line ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS line_count,
      COALESCE(sum(pl.total_amount_usd), 0::numeric) AS line_total_usd,
      COALESCE(sum(pl.quantity * pr.spec_wp), 0::bigint)::numeric AS line_total_wp,
      GREATEST(count(*) - 1, 0::bigint)::integer AS line_extra_count
    FROM po_line_items pl
      LEFT JOIN products pr ON pl.product_id = pr.product_id
    WHERE pl.po_id = po.po_id AND (pl.payment_type IS NULL OR pl.payment_type = 'paid')
  ) line_agg ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS lc_count,
      COALESCE(sum(amount_usd), 0::numeric) AS lc_total_usd,
      COALESCE(sum(target_mw), 0::numeric) AS lc_total_mw
    FROM lc_records
    WHERE lc_records.po_id = po.po_id
  ) lc_agg ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS tt_count,
      COALESCE(sum(amount_usd) FILTER (WHERE status = 'completed'), 0::numeric) AS tt_completed_usd
    FROM tt_remittances
    WHERE tt_remittances.po_id = po.po_id
  ) tt_agg ON true;

-- 4) view GRANT 재부여 (DROP+CREATE 로 권한 휘발). 기존 운영 권한 그대로 (anon 포함).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT ALL ON purchase_orders_ext TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT ALL ON purchase_orders_ext TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON purchase_orders_ext TO service_role;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
