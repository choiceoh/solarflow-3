-- 061_master_usage_counts.sql
-- 마스터(제조사/품번/거래처/창고) 행마다 "이 코드로 등록된 거래/연결 건수"를 한 번에 집계.
-- 비유: 명함첩 옆에 "이 거래처와 거래 N건" 도장을 자동으로 찍어주는 장치.
--
-- 적용:
--   psql $SUPABASE_DB_URL -f backend/migrations/061_master_usage_counts.sql
--   psql $SUPABASE_DB_URL -c "NOTIFY pgrst, 'reload schema';"

-- 1) 제조사 — 품번 수, 매입(PO) 건수
CREATE OR REPLACE FUNCTION sf_manufacturer_usage_counts()
RETURNS TABLE (
  manufacturer_id uuid,
  products        bigint,
  purchases       bigint
) LANGUAGE sql STABLE AS $$
  SELECT
    m.manufacturer_id,
    COALESCE(p.cnt, 0)  AS products,
    COALESCE(po.cnt, 0) AS purchases
  FROM manufacturers m
  LEFT JOIN (
    SELECT manufacturer_id, COUNT(*) AS cnt
    FROM products
    GROUP BY manufacturer_id
  ) p  ON p.manufacturer_id = m.manufacturer_id
  LEFT JOIN (
    SELECT manufacturer_id, COUNT(*) AS cnt
    FROM purchase_orders
    GROUP BY manufacturer_id
  ) po ON po.manufacturer_id = m.manufacturer_id;
$$;

COMMENT ON FUNCTION sf_manufacturer_usage_counts() IS
  '마스터 화면 — 제조사 행별 품번 수 / 매입(PO) 건수 집계.';

-- 2) 품번 — 매입 라인 건수, 출고 건수(취소 제외)
CREATE OR REPLACE FUNCTION sf_product_usage_counts()
RETURNS TABLE (
  product_id uuid,
  purchases  bigint,
  outbounds  bigint
) LANGUAGE sql STABLE AS $$
  SELECT
    p.product_id,
    COALESCE(pl.cnt, 0) AS purchases,
    COALESCE(ob.cnt, 0) AS outbounds
  FROM products p
  LEFT JOIN (
    SELECT product_id, COUNT(*) AS cnt
    FROM po_line_items
    GROUP BY product_id
  ) pl ON pl.product_id = p.product_id
  LEFT JOIN (
    SELECT product_id, COUNT(*) AS cnt
    FROM outbounds
    WHERE status = 'active'
    GROUP BY product_id
  ) ob ON ob.product_id = p.product_id;
$$;

COMMENT ON FUNCTION sf_product_usage_counts() IS
  '마스터 화면 — 품번 행별 매입라인 / 출고(active) 건수 집계.';

-- 3) 거래처 — 매출 건수(active), 입금 건수
CREATE OR REPLACE FUNCTION sf_partner_usage_counts()
RETURNS TABLE (
  partner_id uuid,
  sales      bigint,
  receipts   bigint
) LANGUAGE sql STABLE AS $$
  SELECT
    pa.partner_id,
    COALESCE(s.cnt, 0) AS sales,
    COALESCE(r.cnt, 0) AS receipts
  FROM partners pa
  LEFT JOIN (
    SELECT customer_id AS partner_id, COUNT(*) AS cnt
    FROM sales
    WHERE status = 'active'
    GROUP BY customer_id
  ) s ON s.partner_id = pa.partner_id
  LEFT JOIN (
    SELECT customer_id AS partner_id, COUNT(*) AS cnt
    FROM receipts
    GROUP BY customer_id
  ) r ON r.partner_id = pa.partner_id;
$$;

COMMENT ON FUNCTION sf_partner_usage_counts() IS
  '마스터 화면 — 거래처 행별 매출(active) / 입금 건수 집계.';

-- 4) 창고 — 입고(B/L) 건수, 출고 건수(active)
CREATE OR REPLACE FUNCTION sf_warehouse_usage_counts()
RETURNS TABLE (
  warehouse_id uuid,
  inbounds     bigint,
  outbounds    bigint
) LANGUAGE sql STABLE AS $$
  SELECT
    w.warehouse_id,
    COALESCE(b.cnt,  0) AS inbounds,
    COALESCE(ob.cnt, 0) AS outbounds
  FROM warehouses w
  LEFT JOIN (
    SELECT warehouse_id, COUNT(*) AS cnt
    FROM bl_shipments
    WHERE warehouse_id IS NOT NULL
    GROUP BY warehouse_id
  ) b  ON b.warehouse_id = w.warehouse_id
  LEFT JOIN (
    SELECT warehouse_id, COUNT(*) AS cnt
    FROM outbounds
    WHERE status = 'active'
    GROUP BY warehouse_id
  ) ob ON ob.warehouse_id = w.warehouse_id;
$$;

COMMENT ON FUNCTION sf_warehouse_usage_counts() IS
  '마스터 화면 — 창고 행별 입고(B/L) / 출고(active) 건수 집계.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION sf_manufacturer_usage_counts() TO anon;
    GRANT EXECUTE ON FUNCTION sf_product_usage_counts()      TO anon;
    GRANT EXECUTE ON FUNCTION sf_partner_usage_counts()      TO anon;
    GRANT EXECUTE ON FUNCTION sf_warehouse_usage_counts()    TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION sf_manufacturer_usage_counts() TO authenticated;
    GRANT EXECUTE ON FUNCTION sf_product_usage_counts()      TO authenticated;
    GRANT EXECUTE ON FUNCTION sf_partner_usage_counts()      TO authenticated;
    GRANT EXECUTE ON FUNCTION sf_warehouse_usage_counts()    TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION sf_manufacturer_usage_counts() TO service_role;
    GRANT EXECUTE ON FUNCTION sf_product_usage_counts()      TO service_role;
    GRANT EXECUTE ON FUNCTION sf_partner_usage_counts()      TO service_role;
    GRANT EXECUTE ON FUNCTION sf_warehouse_usage_counts()    TO service_role;
  END IF;
END $$;
