-- @auto-apply: yes
-- 068_inventory_movements.sql
-- ERP 수불 시트(1,856행, 29컬럼) — 시계열 재고 LEDGER. 매일의 입출고/기초/기말 흐름.
-- 사용자 지시(D-064): 안전장치보다 데이터 살림. 모든 컬럼 누락 없이.

CREATE TABLE IF NOT EXISTS inventory_movements (
  movement_id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_date      date        NOT NULL,
  product_id         uuid        NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
  -- 창고/장소 (raw 보존 — warehouse_id FK 매칭 옵션)
  warehouse_id       uuid        REFERENCES warehouses(warehouse_id),
  warehouse_code     text,
  warehouse_name     text,
  location_code      text,
  location_name      text,
  -- 수불 분류
  movement_type      text,                       -- 수불구분 (재고조정/매입/매출/생산/이동)
  movement_subtype   text,                       -- 입출고구분 (기초/입고/출고)
  movement_type_code integer,                    -- 수불구분코드
  -- 거래처 (선택)
  partner_partner_id uuid        REFERENCES partners(partner_id),
  partner_code       text,
  partner_name       text,
  -- 수량 흐름
  beginning_qty      integer,
  inbound_qty        integer,
  outbound_qty       integer,
  ending_qty         integer,
  unit_factor        numeric,
  unit               text,
  ending_qty_mgmt    integer,
  -- ERP 카테고리 (4단)
  category_code      text,
  category_name      text,
  cat_l1_code        text,
  cat_l1_name        text,
  cat_l2_code        text,
  cat_l2_name        text,
  cat_l3_code        text,
  cat_l3_name        text,
  -- D-064: 29컬럼 zero-loss 보존
  source             text        NOT NULL DEFAULT 'erp_balance_sheet',
  source_payload     jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- 시간 + 품번 정렬 인덱스 (시계열 조회)
CREATE INDEX IF NOT EXISTS inventory_movements_date_product_idx
  ON inventory_movements (movement_date, product_id);
CREATE INDEX IF NOT EXISTS inventory_movements_product_date_idx
  ON inventory_movements (product_id, movement_date DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_warehouse_idx
  ON inventory_movements (warehouse_code);
CREATE INDEX IF NOT EXISTS inventory_movements_source_idx
  ON inventory_movements (source);

-- 멱등 backfill 키 — 같은 시트 행이 두 번 들어가지 않도록 erp_row 기반 partial UNIQUE
CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_erp_row_uidx
  ON inventory_movements ((source_payload ->> 'erp_row'), source)
  WHERE source_payload IS NOT NULL AND source_payload ? 'erp_row';

COMMENT ON TABLE inventory_movements IS
  '시계열 재고 movements (D-064 PR 25). ERP 수불 시트 + 추후 자체 트랜잭션 통합 LEDGER.';
COMMENT ON COLUMN inventory_movements.source_payload IS
  'ERP 수불 시트 29컬럼 zero-loss 보존. erp_row 기반 멱등 키.';

ALTER TABLE inventory_movements DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT ON TABLE inventory_movements TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE inventory_movements TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE inventory_movements TO service_role;
  END IF;
END $$;
