-- @auto-apply: yes
-- 055_outbound_workflow_and_source.sql
-- 출고 워크플로우 상태(거래명세서/인수검수요청/결재요청/계산서발행) + 외부 양식 원본 보존(source_payload).
-- 탑솔라 그룹 카카오톡 양식의 체크박스 4개를 정식 컬럼으로 받고, 향후 어떤 외부 컬럼이든
-- source_payload(JSONB)에 통째로 첨부해 정보 손실 0을 보장한다.
--
-- 자동 적용 조건 만족: ALTER TABLE ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DEFAULT 가 있는 NOT NULL boolean 추가는 PG11+에서 metadata-only(빠름), 데이터 손실 위험 없음.

ALTER TABLE outbounds
  ADD COLUMN IF NOT EXISTS tx_statement_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inspection_request_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_invoice_issued boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_payload jsonb;

COMMENT ON COLUMN outbounds.tx_statement_ready IS
  '거래명세서 준비 완료 여부 — 탑솔라 그룹 양식의 ''거래명세서'' 체크박스 매핑';
COMMENT ON COLUMN outbounds.inspection_request_sent IS
  '인수검수요청서 발송 여부 — 탑솔라 그룹 양식의 ''인수검수요청서'' 체크박스 매핑';
COMMENT ON COLUMN outbounds.approval_requested IS
  '결재 요청 여부 — 탑솔라 그룹 양식의 ''결재요청'' 체크박스 매핑';
COMMENT ON COLUMN outbounds.tax_invoice_issued IS
  '계산서 발행 여부 — 탑솔라 그룹 양식의 ''계산서발행'' 체크박스 매핑';
COMMENT ON COLUMN outbounds.source_payload IS
  '외부 양식 변환 시 원본 행 전체를 보존하는 메타 필드. SolarFlow 표준 컬럼에 매핑되지 않은 정보(부가 태그, 시간 표기 등)도 영구 보존하여 정보 손실 0을 보장. 표준 등록 시 NULL.';

-- 워크플로우 진행률 추적 인덱스 (계산서 미발행 또는 결재 대기 출고 빠르게 조회)
CREATE INDEX IF NOT EXISTS outbounds_workflow_pending_idx
  ON outbounds (tax_invoice_issued, approval_requested)
  WHERE NOT tax_invoice_issued OR NOT approval_requested;

-- ============================================================
-- sf_create_outbound — 새 5개 필드를 INSERT 에 포함하도록 재정의
-- ============================================================

CREATE OR REPLACE FUNCTION sf_create_outbound(
  p_outbound_id uuid,
  p_outbound jsonb,
  p_bl_items jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  v_order_id := NULLIF(p_outbound->>'order_id', '')::uuid;

  INSERT INTO outbounds (
    outbound_id,
    outbound_date,
    company_id,
    product_id,
    quantity,
    capacity_kw,
    warehouse_id,
    usage_category,
    order_id,
    site_name,
    site_address,
    spare_qty,
    group_trade,
    target_company_id,
    erp_outbound_no,
    status,
    memo,
    bl_id,
    tx_statement_ready,
    inspection_request_sent,
    approval_requested,
    tax_invoice_issued,
    source_payload
  )
  VALUES (
    p_outbound_id,
    (p_outbound->>'outbound_date')::date,
    (p_outbound->>'company_id')::uuid,
    (p_outbound->>'product_id')::uuid,
    (p_outbound->>'quantity')::integer,
    NULLIF(p_outbound->>'capacity_kw', '')::numeric,
    (p_outbound->>'warehouse_id')::uuid,
    p_outbound->>'usage_category',
    v_order_id,
    p_outbound->>'site_name',
    p_outbound->>'site_address',
    NULLIF(p_outbound->>'spare_qty', '')::integer,
    (p_outbound->>'group_trade')::boolean,
    NULLIF(p_outbound->>'target_company_id', '')::uuid,
    p_outbound->>'erp_outbound_no',
    COALESCE(NULLIF(p_outbound->>'status', ''), 'active'),
    p_outbound->>'memo',
    NULLIF(p_outbound->>'bl_id', '')::uuid,
    COALESCE((p_outbound->>'tx_statement_ready')::boolean, false),
    COALESCE((p_outbound->>'inspection_request_sent')::boolean, false),
    COALESCE((p_outbound->>'approval_requested')::boolean, false),
    COALESCE((p_outbound->>'tax_invoice_issued')::boolean, false),
    CASE
      WHEN p_outbound ? 'source_payload' AND jsonb_typeof(p_outbound->'source_payload') = 'object'
        THEN p_outbound->'source_payload'
      ELSE NULL
    END
  );

  PERFORM sf_insert_outbound_bl_items(p_outbound_id, p_bl_items);
  PERFORM sf_recalculate_order_progress(v_order_id);
END;
$$;

-- ============================================================
-- sf_update_outbound — 새 5개 필드를 UPDATE 에 포함하도록 재정의
-- ============================================================

CREATE OR REPLACE FUNCTION sf_update_outbound(
  p_outbound_id uuid,
  p_outbound jsonb,
  p_bl_items jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_order_id uuid;
  v_new_order_id uuid;
  v_rows integer;
BEGIN
  SELECT order_id
    INTO v_prev_order_id
    FROM outbounds
   WHERE outbound_id = p_outbound_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbound not found: %', p_outbound_id USING ERRCODE = 'P0002';
  END IF;

  UPDATE outbounds
     SET outbound_date = CASE WHEN p_outbound ? 'outbound_date' THEN (p_outbound->>'outbound_date')::date ELSE outbound_date END,
         company_id = CASE WHEN p_outbound ? 'company_id' THEN (p_outbound->>'company_id')::uuid ELSE company_id END,
         product_id = CASE WHEN p_outbound ? 'product_id' THEN (p_outbound->>'product_id')::uuid ELSE product_id END,
         quantity = CASE WHEN p_outbound ? 'quantity' THEN (p_outbound->>'quantity')::integer ELSE quantity END,
         capacity_kw = CASE WHEN p_outbound ? 'capacity_kw' THEN NULLIF(p_outbound->>'capacity_kw', '')::numeric ELSE capacity_kw END,
         warehouse_id = CASE WHEN p_outbound ? 'warehouse_id' THEN (p_outbound->>'warehouse_id')::uuid ELSE warehouse_id END,
         usage_category = CASE WHEN p_outbound ? 'usage_category' THEN p_outbound->>'usage_category' ELSE usage_category END,
         order_id = CASE WHEN p_outbound ? 'order_id' THEN NULLIF(p_outbound->>'order_id', '')::uuid ELSE order_id END,
         site_name = CASE WHEN p_outbound ? 'site_name' THEN p_outbound->>'site_name' ELSE site_name END,
         site_address = CASE WHEN p_outbound ? 'site_address' THEN p_outbound->>'site_address' ELSE site_address END,
         spare_qty = CASE WHEN p_outbound ? 'spare_qty' THEN NULLIF(p_outbound->>'spare_qty', '')::integer ELSE spare_qty END,
         group_trade = CASE WHEN p_outbound ? 'group_trade' THEN (p_outbound->>'group_trade')::boolean ELSE group_trade END,
         target_company_id = CASE WHEN p_outbound ? 'target_company_id' THEN NULLIF(p_outbound->>'target_company_id', '')::uuid ELSE target_company_id END,
         erp_outbound_no = CASE WHEN p_outbound ? 'erp_outbound_no' THEN p_outbound->>'erp_outbound_no' ELSE erp_outbound_no END,
         status = CASE WHEN p_outbound ? 'status' THEN p_outbound->>'status' ELSE status END,
         memo = CASE WHEN p_outbound ? 'memo' THEN p_outbound->>'memo' ELSE memo END,
         bl_id = CASE WHEN p_outbound ? 'bl_id' THEN NULLIF(p_outbound->>'bl_id', '')::uuid ELSE bl_id END,
         tx_statement_ready = CASE WHEN p_outbound ? 'tx_statement_ready' THEN COALESCE((p_outbound->>'tx_statement_ready')::boolean, false) ELSE tx_statement_ready END,
         inspection_request_sent = CASE WHEN p_outbound ? 'inspection_request_sent' THEN COALESCE((p_outbound->>'inspection_request_sent')::boolean, false) ELSE inspection_request_sent END,
         approval_requested = CASE WHEN p_outbound ? 'approval_requested' THEN COALESCE((p_outbound->>'approval_requested')::boolean, false) ELSE approval_requested END,
         tax_invoice_issued = CASE WHEN p_outbound ? 'tax_invoice_issued' THEN COALESCE((p_outbound->>'tax_invoice_issued')::boolean, false) ELSE tax_invoice_issued END,
         source_payload = CASE
           WHEN p_outbound ? 'source_payload' THEN
             CASE
               WHEN jsonb_typeof(p_outbound->'source_payload') = 'object' THEN p_outbound->'source_payload'
               ELSE NULL
             END
           ELSE source_payload
         END
   WHERE outbound_id = p_outbound_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'outbound not found: %', p_outbound_id USING ERRCODE = 'P0002';
  END IF;

  IF p_bl_items IS NOT NULL AND jsonb_typeof(p_bl_items) = 'array' THEN
    DELETE FROM outbound_bl_items
     WHERE outbound_id = p_outbound_id;

    PERFORM sf_insert_outbound_bl_items(p_outbound_id, p_bl_items);
  END IF;

  SELECT order_id
    INTO v_new_order_id
    FROM outbounds
   WHERE outbound_id = p_outbound_id;

  PERFORM sf_recalculate_order_progress(v_prev_order_id);

  IF v_new_order_id IS DISTINCT FROM v_prev_order_id THEN
    PERFORM sf_recalculate_order_progress(v_new_order_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION sf_create_outbound(uuid, jsonb, jsonb) TO anon;
    GRANT EXECUTE ON FUNCTION sf_update_outbound(uuid, jsonb, jsonb) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION sf_create_outbound(uuid, jsonb, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION sf_update_outbound(uuid, jsonb, jsonb) TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION sf_create_outbound(uuid, jsonb, jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION sf_update_outbound(uuid, jsonb, jsonb) TO service_role;
  END IF;
END $$;
