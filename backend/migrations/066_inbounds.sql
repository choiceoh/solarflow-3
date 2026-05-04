-- @auto-apply: yes
-- 066_inbounds.sql
-- ERP 입고 시트(118행) 자료를 보존하기 위한 inbounds 테이블 신규 생성 (D-064 PR 23).
-- 사용자 지시: 안전장치보다 데이터 살림. outbounds 와 대칭 구조 — 발주/공장에서 창고로 들어온 트랜잭션.

CREATE TABLE IF NOT EXISTS inbounds (
  inbound_id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_date        date        NOT NULL,
  supplier_partner_id uuid        REFERENCES partners(partner_id),
  product_id          uuid        NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
  quantity            integer     NOT NULL CHECK (quantity > 0),
  capacity_kw         numeric,
  warehouse_id        uuid        REFERENCES warehouses(warehouse_id),
  location            text,
  status              text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  -- D-064: ERP 입고 식별 + 원자료 보존
  erp_inbound_no      text,
  erp_line_no         integer,
  currency            text,
  unit_price          numeric,
  unit_price_wp       numeric,
  supply_amount       numeric,
  vat_amount          numeric,
  total_amount        numeric,
  source_payload      jsonb,
  memo                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbounds_date_idx
  ON inbounds (inbound_date DESC);
CREATE INDEX IF NOT EXISTS inbounds_product_idx
  ON inbounds (product_id);
CREATE INDEX IF NOT EXISTS inbounds_supplier_idx
  ON inbounds (supplier_partner_id);
-- partial UNIQUE — ERP 입고 식별 키 멱등 보장 (PR 21/22 패턴 동일)
CREATE UNIQUE INDEX IF NOT EXISTS inbounds_erp_no_line_uidx
  ON inbounds (erp_inbound_no, erp_line_no)
  WHERE erp_inbound_no IS NOT NULL;

COMMENT ON TABLE inbounds IS
  'ERP 입고 트랜잭션 (D-064 PR 23). outbounds 와 대칭 — 공급사 → 우리 창고 입고.';
COMMENT ON COLUMN inbounds.erp_inbound_no IS
  'ERP 입고번호 (예: RV2501000010). PR 23 backfill 식별 키.';
COMMENT ON COLUMN inbounds.source_payload IS
  'ERP 입고 시트 원자료 보존 — 단가/외화/관리구분/프로젝트/창고/장소 등 zero-loss.';

-- RLS 정합성 (다른 마스터 테이블과 동일 패턴)
ALTER TABLE inbounds DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT ON TABLE inbounds TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE inbounds TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE inbounds TO service_role;
  END IF;
END $$;

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_inbounds_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_inbounds_updated_at ON inbounds;
CREATE TRIGGER trg_inbounds_updated_at
  BEFORE UPDATE ON inbounds
  FOR EACH ROW EXECUTE FUNCTION update_inbounds_updated_at();
