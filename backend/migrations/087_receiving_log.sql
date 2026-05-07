-- D-141 WMS Phase 3 — 입고 검수 로그 + 수량 차이 추적
--
-- 목적: 트럭 도착 → 검수자 → 수량/규격 확인 → 위치 배정 + 차이 추적.
-- module 계열(BL 라인) + BARO(intercompany_request) 양쪽 동일 패턴.
--
-- 두 흐름을 하나의 테이블로 통합 — receiving_logs (source_type 으로 분기).

-- ⚠️ 적용 절차:
--   psql -d solarflow -f backend/migrations/087_receiving_log.sql
--   launchctl stop com.solarflow.postgrest && launchctl start com.solarflow.postgrest

CREATE TABLE IF NOT EXISTS receiving_logs (
  receiving_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 입고 소스 (둘 중 하나만 채워짐)
  source_type text NOT NULL CHECK (source_type IN ('bl_line', 'intercompany', 'manual')),
  bl_line_id uuid,                                 -- module 측 BL 라인 (D-108)
  intercompany_request_id uuid,                    -- BARO 그룹내 매입 (D-039)
  -- 공통 정보 (snapshot — 원본 변경에 무관)
  warehouse_id uuid NOT NULL REFERENCES warehouses(warehouse_id),
  product_id uuid REFERENCES products(product_id),
  product_code_snapshot text,
  product_name_snapshot text,
  -- 검수
  quantity_expected integer NOT NULL,              -- BL/intercompany 명세 수량
  quantity_received integer NOT NULL,              -- 실제 입고 수량
  quantity_variance integer GENERATED ALWAYS AS (quantity_received - quantity_expected) STORED,
  -- 위치 배정 (D-139)
  location_id uuid REFERENCES warehouse_locations(location_id),
  location_code_snapshot text,
  -- 검수자 + 시간
  receiver_user_id uuid REFERENCES auth.users(id),
  received_at timestamptz NOT NULL DEFAULT NOW(),
  -- 차이 사유 (variance != 0 시 필수)
  variance_reason text CHECK (variance_reason IN (
    'shortage', 'overage', 'damaged', 'wrong_product', 'wrong_spec', 'other'
  ) OR variance_reason IS NULL),
  variance_note text,
  -- 사진 첨부 (attachments FK array — Postgres 배열)
  photo_attachment_ids uuid[],
  notes text
);
CREATE INDEX IF NOT EXISTS idx_receiving_logs_source
  ON receiving_logs(source_type, bl_line_id);
CREATE INDEX IF NOT EXISTS idx_receiving_logs_intercompany
  ON receiving_logs(intercompany_request_id) WHERE intercompany_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receiving_logs_warehouse
  ON receiving_logs(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_receiving_logs_receiver
  ON receiving_logs(receiver_user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_receiving_logs_variance
  ON receiving_logs(quantity_variance) WHERE quantity_variance != 0;
