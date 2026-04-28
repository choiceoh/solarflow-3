-- 038: LC 본문과 라인아이템 저장을 Postgres 함수 1회 호출로 묶어 부분 성공을 방지한다.

CREATE OR REPLACE FUNCTION sf_create_lc_with_lines(
  p_lc jsonb,
  p_lines jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_lc lc_records%ROWTYPE;
BEGIN
  INSERT INTO lc_records (
    po_id,
    lc_number,
    bank_id,
    company_id,
    open_date,
    amount_usd,
    target_qty,
    target_mw,
    usance_days,
    usance_type,
    maturity_date,
    settlement_date,
    repayment_date,
    repaid,
    status,
    memo
  )
  VALUES (
    (p_lc->>'po_id')::uuid,
    NULLIF(p_lc->>'lc_number', ''),
    (p_lc->>'bank_id')::uuid,
    (p_lc->>'company_id')::uuid,
    NULLIF(p_lc->>'open_date', '')::date,
    (p_lc->>'amount_usd')::numeric,
    NULLIF(p_lc->>'target_qty', '')::int,
    NULLIF(p_lc->>'target_mw', '')::numeric,
    NULLIF(p_lc->>'usance_days', '')::int,
    NULLIF(p_lc->>'usance_type', ''),
    NULLIF(p_lc->>'maturity_date', '')::date,
    NULLIF(p_lc->>'settlement_date', '')::date,
    NULLIF(p_lc->>'repayment_date', '')::date,
    COALESCE((p_lc->>'repaid')::boolean, false),
    COALESCE(NULLIF(p_lc->>'status', ''), 'pending'),
    NULLIF(p_lc->>'memo', '')
  )
  RETURNING * INTO v_lc;

  INSERT INTO lc_line_items (
    lc_id,
    po_line_id,
    product_id,
    quantity,
    capacity_kw,
    amount_usd,
    unit_price_usd_wp,
    item_type,
    payment_type,
    memo
  )
  SELECT
    v_lc.lc_id,
    NULLIF(line.po_line_id, '')::uuid,
    line.product_id::uuid,
    line.quantity,
    line.capacity_kw,
    line.amount_usd,
    line.unit_price_usd_wp,
    COALESCE(NULLIF(line.item_type, ''), 'main'),
    COALESCE(NULLIF(line.payment_type, ''), 'paid'),
    NULLIF(line.memo, '')
  FROM jsonb_to_recordset(
    CASE
      WHEN p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN '[]'::jsonb
      ELSE p_lines
    END
  ) AS line (
    po_line_id text,
    product_id text,
    quantity int,
    capacity_kw numeric,
    amount_usd numeric,
    unit_price_usd_wp numeric,
    item_type text,
    payment_type text,
    memo text
  );

  UPDATE purchase_orders
     SET status = 'in_progress'
   WHERE po_id = v_lc.po_id
     AND status = 'contracted';

  RETURN to_jsonb(v_lc);
END;
$$;

CREATE OR REPLACE FUNCTION sf_update_lc_with_lines(
  p_lc_id uuid,
  p_lc jsonb,
  p_lines jsonb DEFAULT '[]'::jsonb,
  p_replace_lines boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_lc lc_records%ROWTYPE;
BEGIN
  UPDATE lc_records
     SET lc_number = CASE WHEN p_lc ? 'lc_number' THEN NULLIF(p_lc->>'lc_number', '') ELSE lc_number END,
         po_id = CASE WHEN p_lc ? 'po_id' THEN (p_lc->>'po_id')::uuid ELSE po_id END,
         bank_id = CASE WHEN p_lc ? 'bank_id' THEN (p_lc->>'bank_id')::uuid ELSE bank_id END,
         company_id = CASE WHEN p_lc ? 'company_id' THEN (p_lc->>'company_id')::uuid ELSE company_id END,
         open_date = CASE WHEN p_lc ? 'open_date' THEN NULLIF(p_lc->>'open_date', '')::date ELSE open_date END,
         amount_usd = CASE WHEN p_lc ? 'amount_usd' THEN (p_lc->>'amount_usd')::numeric ELSE amount_usd END,
         target_qty = CASE WHEN p_lc ? 'target_qty' THEN NULLIF(p_lc->>'target_qty', '')::int ELSE target_qty END,
         target_mw = CASE WHEN p_lc ? 'target_mw' THEN NULLIF(p_lc->>'target_mw', '')::numeric ELSE target_mw END,
         usance_days = CASE WHEN p_lc ? 'usance_days' THEN NULLIF(p_lc->>'usance_days', '')::int ELSE usance_days END,
         usance_type = CASE WHEN p_lc ? 'usance_type' THEN NULLIF(p_lc->>'usance_type', '') ELSE usance_type END,
         maturity_date = CASE WHEN p_lc ? 'maturity_date' THEN NULLIF(p_lc->>'maturity_date', '')::date ELSE maturity_date END,
         settlement_date = CASE WHEN p_lc ? 'settlement_date' THEN NULLIF(p_lc->>'settlement_date', '')::date ELSE settlement_date END,
         repayment_date = CASE WHEN p_lc ? 'repayment_date' THEN NULLIF(p_lc->>'repayment_date', '')::date ELSE repayment_date END,
         repaid = CASE WHEN p_lc ? 'repaid' THEN (p_lc->>'repaid')::boolean ELSE repaid END,
         status = CASE WHEN p_lc ? 'status' THEN p_lc->>'status' ELSE status END,
         memo = CASE WHEN p_lc ? 'memo' THEN NULLIF(p_lc->>'memo', '') ELSE memo END
   WHERE lc_id = p_lc_id
   RETURNING * INTO v_lc;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lc not found: %', p_lc_id USING ERRCODE = 'P0002';
  END IF;

  IF p_replace_lines THEN
    DELETE FROM lc_line_items
     WHERE lc_id = p_lc_id;

    INSERT INTO lc_line_items (
      lc_id,
      po_line_id,
      product_id,
      quantity,
      capacity_kw,
      amount_usd,
      unit_price_usd_wp,
      item_type,
      payment_type,
      memo
    )
    SELECT
      p_lc_id,
      NULLIF(line.po_line_id, '')::uuid,
      line.product_id::uuid,
      line.quantity,
      line.capacity_kw,
      line.amount_usd,
      line.unit_price_usd_wp,
      COALESCE(NULLIF(line.item_type, ''), 'main'),
      COALESCE(NULLIF(line.payment_type, ''), 'paid'),
      NULLIF(line.memo, '')
    FROM jsonb_to_recordset(
      CASE
        WHEN p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN '[]'::jsonb
        ELSE p_lines
      END
    ) AS line (
      po_line_id text,
      product_id text,
      quantity int,
      capacity_kw numeric,
      amount_usd numeric,
      unit_price_usd_wp numeric,
      item_type text,
      payment_type text,
      memo text
    );
  END IF;

  RETURN to_jsonb(v_lc);
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION sf_create_lc_with_lines(jsonb, jsonb) TO anon;
    GRANT EXECUTE ON FUNCTION sf_update_lc_with_lines(uuid, jsonb, jsonb, boolean) TO anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION sf_create_lc_with_lines(jsonb, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION sf_update_lc_with_lines(uuid, jsonb, jsonb, boolean) TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION sf_create_lc_with_lines(jsonb, jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION sf_update_lc_with_lines(uuid, jsonb, jsonb, boolean) TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
