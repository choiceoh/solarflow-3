-- 037: 감사 로그 + 운영 데이터 soft cancel
-- 목적: PO/LC/출고/매출의 생성·수정·삭제 요청자를 추적하고,
--       운영 데이터 DELETE는 실제 삭제 대신 취소 상태로 보존한다.

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  user_id uuid REFERENCES user_profiles(user_id) ON DELETE SET NULL,
  user_email text,
  request_method text,
  request_path text,
  old_data jsonb,
  new_data jsonb,
  note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT audit_logs_entity_type_check
    CHECK (entity_type IN ('purchase_orders', 'lc_records', 'outbounds', 'sales')),
  CONSTRAINT audit_logs_action_check
    CHECK (action IN ('create', 'update', 'delete'))
);

COMMENT ON TABLE audit_logs IS '감사 로그 — PO/LC/출고/매출 생성·수정·삭제 요청자와 변경 전후 JSON 보존';
COMMENT ON COLUMN audit_logs.action IS 'delete는 API 삭제 요청을 의미하며, 운영 테이블은 실제 삭제 대신 취소 상태로 보존';

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT ON TABLE audit_logs TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT ON TABLE audit_logs TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT ON TABLE audit_logs TO service_role;
  END IF;
END $$;

ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('draft', 'contracted', 'in_progress', 'shipping', 'completed', 'cancelled'));

ALTER TABLE lc_records
  DROP CONSTRAINT IF EXISTS lc_records_status_check;

ALTER TABLE lc_records
  ADD CONSTRAINT lc_records_status_check
  CHECK (status IN ('pending', 'opened', 'docs_received', 'settled', 'cancelled'));

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' NOT NULL;

ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_status_check;

ALTER TABLE sales
  ADD CONSTRAINT sales_status_check
  CHECK (status IN ('active', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

CREATE OR REPLACE FUNCTION sf_delete_outbound(p_outbound_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  SELECT order_id
    INTO v_order_id
    FROM outbounds
   WHERE outbound_id = p_outbound_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbound not found: %', p_outbound_id USING ERRCODE = 'P0002';
  END IF;

  UPDATE sales
     SET outbound_id = NULL
   WHERE outbound_id = p_outbound_id
     AND order_id IS NOT NULL;

  UPDATE sales
     SET status = 'cancelled'
   WHERE outbound_id = p_outbound_id
     AND order_id IS NULL;

  UPDATE outbounds
     SET status = 'cancelled'
   WHERE outbound_id = p_outbound_id;

  PERFORM sf_recalculate_order_progress(v_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION sf_delete_purchase_order(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE purchase_orders
     SET status = 'cancelled'
   WHERE po_id = p_po_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'purchase order not found: %', p_po_id USING ERRCODE = 'P0002';
  END IF;
END;
$$;
