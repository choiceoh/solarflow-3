-- 115_drop_outbounds_bl_id.sql
-- 레거시 outbounds.bl_id 컬럼 DROP + RPC 함수 재작성 + 동기화 트리거 제거
--
-- 배경:
--   M021 에서 outbound_bl_items 가 도입돼 source of truth 가 되었지만 M072 가
--   운영 누락으로 outbounds.bl_id 단축 컬럼을 복구. 이후 M113 백필로 매핑률
--   18% → 80% 회복했고 운영 진단 결과 conflict 0건 — 두 데이터가 사실상
--   일치. M114 가 영구 정합성 트리거를 도입했지만, 두 표현을 동시 유지하는
--   비용 (RPC 인자, Go/TS 모델, 동기화 트리거) 이 mirror 컬럼 가치보다 큼.
--   본 PR 에서 레거시를 완전히 제거.
--
-- 변경:
--   1. M114 의 sync 트리거 + 함수 DROP (이제 무의미)
--   2. sf_create_outbound 재작성: bl_id INSERT 라인 제거
--   3. sf_update_outbound 재작성: bl_id UPDATE 라인 제거
--   4. outbounds.bl_id 컬럼 DROP
--
-- 의존성:
--   - Go: backend/internal/domains/outbound/{model.go, handler.go} 동시 변경
--   - TS: frontend/src/types/outbound.ts 동시 변경
--   - PostgREST 스키마 캐시 갱신: apply_migrations.ts 가 NOTIFY pgrst, 'reload schema' 자동 발송
--
-- 데이터 영향 없음:
--   outbound_bl_items 가 정본이므로 BL 매핑 정보 100% 보존. bl_id 컬럼은
--   mirror 였으므로 정보 손실 0.

BEGIN;

-- 1) M114 의 트리거/함수 DROP (이제 outbounds.bl_id 가 없어지므로 필요 없음)
DROP TRIGGER IF EXISTS trg_sync_outbound_bl_id ON outbound_bl_items;
DROP FUNCTION IF EXISTS sync_outbound_bl_id();

-- 2) sf_create_outbound 재작성 (bl_id 처리 제거)
CREATE OR REPLACE FUNCTION public.sf_create_outbound(
  p_outbound_id uuid,
  p_outbound jsonb,
  p_bl_items jsonb DEFAULT '[]'::jsonb
)
RETURNS void LANGUAGE plpgsql AS $function$
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
$function$;

-- 3) sf_update_outbound 재작성 (bl_id 처리 제거)
CREATE OR REPLACE FUNCTION public.sf_update_outbound(
  p_outbound_id uuid,
  p_outbound jsonb,
  p_bl_items jsonb DEFAULT NULL::jsonb
)
RETURNS void LANGUAGE plpgsql AS $function$
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
$function$;

-- 4) 의존 뷰 DROP — outbounds_with_meta / outbounds_sale_unregistered 가
--    outbounds.bl_id 를 SELECT 만 하고 있어서 컬럼 DROP 전에 정리 필수.
--    CREATE OR REPLACE VIEW 는 컬럼 제거 미지원 → DROP 후 재생성.
DROP VIEW IF EXISTS outbounds_sale_unregistered;
DROP VIEW IF EXISTS outbounds_with_meta;

-- 5) outbounds.bl_id 컬럼 DROP
ALTER TABLE outbounds DROP COLUMN IF EXISTS bl_id;

-- 6) 의존 뷰 재생성 (bl_id 컬럼 제외, 그 외 동일)
CREATE VIEW outbounds_with_meta AS
SELECT o.outbound_id,
       o.outbound_date,
       o.company_id,
       o.product_id,
       o.quantity,
       o.capacity_kw,
       o.warehouse_id,
       o.usage_category,
       o.order_id,
       o.site_name,
       o.site_address,
       o.spare_qty,
       o.group_trade,
       o.target_company_id,
       o.erp_outbound_no,
       o.memo,
       o.created_at,
       o.updated_at,
       o.status,
       o.dispatch_route_id,
       o.tx_statement_ready,
       o.inspection_request_sent,
       o.approval_requested,
       o.tax_invoice_issued,
       o.source_payload,
       p.product_code,
       p.product_name,
       p.manufacturer_id AS product_manufacturer_id,
       ord.order_number,
       w.warehouse_name,
       tc.company_name AS target_company_name,
       tc.company_code AS target_company_code
  FROM outbounds o
  LEFT JOIN products p   ON p.product_id   = o.product_id
  LEFT JOIN orders ord   ON ord.order_id   = o.order_id
  LEFT JOIN warehouses w ON w.warehouse_id = o.warehouse_id
  LEFT JOIN companies tc ON tc.company_id  = o.target_company_id;

CREATE VIEW outbounds_sale_unregistered AS
SELECT outbound_id,
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
       memo,
       created_at,
       updated_at,
       status,
       dispatch_route_id,
       tx_statement_ready,
       inspection_request_sent,
       approval_requested,
       tax_invoice_issued,
       source_payload,
       product_code,
       product_name,
       product_manufacturer_id,
       order_number,
       warehouse_name,
       target_company_name,
       target_company_code
  FROM outbounds_with_meta om
 WHERE usage_category = ANY (ARRAY['sale'::varchar, 'sale_spare'::varchar])
   AND NOT EXISTS (
     SELECT 1 FROM sales s
      WHERE s.outbound_id = om.outbound_id
        AND s.status <> 'cancelled'
   );

-- 검증
SELECT 'bl_id_column_exists' AS metric, COUNT(*) AS value
FROM information_schema.columns
WHERE table_schema='public' AND table_name='outbounds' AND column_name='bl_id';

SELECT 'sync_trigger_exists' AS metric, COUNT(*) AS value
FROM information_schema.triggers
WHERE trigger_name = 'trg_sync_outbound_bl_id';

SELECT 'sync_function_exists' AS metric, COUNT(*) AS value
FROM pg_proc WHERE proname = 'sync_outbound_bl_id';

-- RPC 함수 시그니처 확인 (인자 3개 그대로, bl_id 처리만 빠짐)
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname IN ('sf_create_outbound', 'sf_update_outbound')
ORDER BY proname;

COMMIT;
