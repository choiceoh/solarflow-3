-- @auto-apply: yes
-- 070_fifo_matches.sql
-- ERP FIFO 시트(디원화신fifo 728행 + 탑솔라Fifo_복사본 2,615행 = 3,343행) — 입고 LOT ↔ 출고 배분 매칭.
-- 사용자 지시(D-064): 안전장치보다 데이터 살림. 모든 컬럼 누락 없이 보존.
-- FIFO 한 행 = 한 출고가 어떤 입고 LOT 으로부터 얼마나 배분됐는지.

CREATE TABLE IF NOT EXISTS fifo_matches (
  match_id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 입고 식별
  erp_inbound_no      text,
  erp_inbound_line_no integer,
  inbound_id          uuid        REFERENCES inbounds(inbound_id) ON DELETE SET NULL,
  inbound_date        date,
  inbound_kind        text,                       -- DOMESTIC / IMPORT / 기초재고
  supplier_name       text,
  -- 출고 식별
  erp_outbound_no     text,
  outbound_id         uuid        REFERENCES outbounds(outbound_id) ON DELETE SET NULL,
  outbound_date       date,
  customer_name       text,
  -- 품번
  product_id          uuid        NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
  -- 수량
  lot_inbound_qty     integer,                    -- 입고 LOT 수량
  outbound_qty_origin integer,                    -- 출고수량원본
  allocated_qty       integer,                    -- 배분수량 (이 행의 핵심)
  -- 단가/금액
  wp_unit_price       numeric,                    -- Wp단가(원/Wp)
  ea_unit_cost        numeric,                    -- EA원가(원)
  cost_amount         numeric,                    -- 원가금액
  sales_unit_price_ea numeric,                    -- 판매단가(원/EA)
  sales_amount        numeric,                    -- 판매금액
  profit_amount       numeric,                    -- 이익금액
  profit_ratio        numeric,                    -- 이익률(%)
  -- ERP 메타
  usage_category_raw  text,                       -- 관리구분 raw
  project             text,
  procurement_type    text,                       -- 조달구분 (국내매입/기초재고/수입)
  corporation         text,                       -- 법인 (디원/탑솔라)
  manufacturer_name_kr text,
  manufacturer_name_en text,
  -- 통관 cross-key
  declaration_id      uuid        REFERENCES import_declarations(declaration_id) ON DELETE SET NULL,
  declaration_number  text,
  bl_number           text,
  lc_number           text,
  category_no         text,                       -- 분류번호
  po_number           text,                       -- 발주PO번호
  -- D-064: 30~40 컬럼 zero-loss
  source              text        NOT NULL,       -- 'fifo_topsolar' | 'fifo_diwon'
  source_payload      jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fifo_matches_inbound_idx
  ON fifo_matches (erp_inbound_no, erp_inbound_line_no);
CREATE INDEX IF NOT EXISTS fifo_matches_outbound_idx
  ON fifo_matches (erp_outbound_no);
CREATE INDEX IF NOT EXISTS fifo_matches_product_idx
  ON fifo_matches (product_id);
CREATE INDEX IF NOT EXISTS fifo_matches_outdate_idx
  ON fifo_matches (outbound_date DESC);
CREATE INDEX IF NOT EXISTS fifo_matches_corporation_idx
  ON fifo_matches (corporation);

-- 멱등 키: 같은 시트 한 행이 두 번 들어가지 않도록 erp_row + source partial UNIQUE
CREATE UNIQUE INDEX IF NOT EXISTS fifo_matches_erp_row_uidx
  ON fifo_matches ((source_payload ->> 'erp_row'), source)
  WHERE source_payload IS NOT NULL AND source_payload ? 'erp_row';

COMMENT ON TABLE fifo_matches IS
  'ERP FIFO 매칭 (D-064 PR 26). 입고 LOT 한 건이 어떤 출고에 어떤 비율로 배분됐는지 추적.';
COMMENT ON COLUMN fifo_matches.allocated_qty IS
  '배분수량 — 이 입고 LOT 중 이번 출고에 흘러간 수량 (FIFO 핵심).';
COMMENT ON COLUMN fifo_matches.source IS
  '''fifo_topsolar''(탑솔라(주)) 또는 ''fifo_diwon''(디원화신).';

ALTER TABLE fifo_matches DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT ON TABLE fifo_matches TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE fifo_matches TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE fifo_matches TO service_role;
  END IF;
END $$;
