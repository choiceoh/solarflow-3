-- M145: products.available_stock 자동 동기화 트리거 + 함수
-- 배경: inventory_snapshots 는 ERP export 1회 (25-12-31) 그대로, 자동 갱신 없음
--       → 26-04-08 까지 누적된 inventory_movements 480건이 가용재고에 미반영
--       → 가용재고 (262,324) ↔ 실재고 (~229,266) 33,058 갭
--
-- 해결: inventory_movements 가 정본 (운영자 ERP export). 행 추가/수정/삭제 시
-- 해당 product 의 (product_id, warehouse_id) 별 latest ending_qty 합계로
-- products.available_stock 을 즉시 갱신.
--
-- 함수 호출 비용: 한 product 단위로만 재계산하므로 O(warehouses_for_product).
-- 일반적으로 한 product 가 1~3개 창고에 있어 매우 가볍다.

BEGIN;

-- 1. 단일 product 의 available_stock 재계산 함수
CREATE OR REPLACE FUNCTION sf_sync_available_stock_for_product(p_product_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE products
  SET available_stock = COALESCE((
    SELECT SUM(ending_qty) FROM (
      SELECT DISTINCT ON (warehouse_id) ending_qty
      FROM inventory_movements
      WHERE product_id = p_product_id
      ORDER BY warehouse_id, movement_date DESC, movement_id DESC
    ) latest
  ), 0)
  WHERE product_id = p_product_id;
END;
$$ LANGUAGE plpgsql;

-- 2. 전체 product 재계산 함수 (수동 호출용 / cron 잡 후보)
CREATE OR REPLACE FUNCTION sf_recalculate_all_available_stock()
RETURNS integer AS $$
DECLARE
  v_count integer := 0;
  r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT product_id FROM inventory_movements LOOP
    PERFORM sf_sync_available_stock_for_product(r.product_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 3. inventory_movements 트리거 — INSERT/UPDATE/DELETE 시 자동 sync
CREATE OR REPLACE FUNCTION sf_trg_inv_movements_sync_avail()
RETURNS trigger AS $$
BEGIN
  -- DELETE 시 OLD, INSERT 시 NEW, UPDATE 시 NEW (product_id 가 바뀔 일 거의 없음)
  IF TG_OP = 'DELETE' THEN
    PERFORM sf_sync_available_stock_for_product(OLD.product_id);
    RETURN OLD;
  ELSE
    PERFORM sf_sync_available_stock_for_product(NEW.product_id);
    -- product_id 가 UPDATE 로 변경된 희귀 케이스: 이전 product 도 재계산
    IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
      PERFORM sf_sync_available_stock_for_product(OLD.product_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inv_movements_sync_avail ON inventory_movements;
CREATE TRIGGER trg_inv_movements_sync_avail
  AFTER INSERT OR UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION sf_trg_inv_movements_sync_avail();

-- 4. 초기 seed — 현재 inventory_movements 기준으로 products.available_stock 전면 갱신
-- 26-04-08 시점 누적 (~229,266 EA) 반영
SELECT sf_recalculate_all_available_stock() AS updated_products;

-- 5. 검증
SELECT 'products_with_available_stock', COUNT(*)
FROM products WHERE available_stock IS NOT NULL AND available_stock > 0;

SELECT 'available_stock_sum', SUM(available_stock)
FROM products WHERE product_kind='module';
-- expected: ~229,266 (이전 262,324 에서 갱신됨)

INSERT INTO schema_migrations(filename) VALUES ('145_auto_sync_available_stock.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
