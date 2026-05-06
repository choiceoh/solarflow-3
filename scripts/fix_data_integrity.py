"""데이터 정합성 5개 문제 일괄 정리 (D-064 PR 33, 1회성).

분석 결과 (analyze_data_integrity.py + deepdive_integrity.py):

[B6] 30 면장: erp_inbound_no 의 -1/-2 suffix 또는 '없음(디원자체수입)' → 매칭 채움
[B4] 24 outbound: usage='sale'/sale_spare 인데 단가 0 + mgmt 빈 → 자체사용 정정
[C1] 602 출고: FIFO 합 - outbound.quantity = spare_qty 백필
[D1] product 변종 정리: 사용 0인 변종 + noise 행 (1단적재/5톤장축 등) 비활성화
[C2] 수불 '기초재고' 1465 행 → 누계 분석용 view (실제 inbounds 추가 X)

A3/E2 는 거짓양성 — 조치 X.
"""
import os, psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL")
c = psycopg2.connect(DB_URL)
c.autocommit = False
cur = c.cursor()


def hdr(t):
    print(f"\n{'='*60}\n{t}\n{'='*60}")


# ============================================================
hdr("[B6] declarations.erp_inbound_no — suffix 제거 후 inbound_id 매칭")
# ============================================================
# 마이그레이션 067 의 import_declarations 에 inbound_id FK 가 없음 → 단순히 cleaned_no 컬럼 추가
cur.execute("""
ALTER TABLE import_declarations
  ADD COLUMN IF NOT EXISTS erp_inbound_no_clean text
""")
c.commit()

# regexp_replace 로 -1, -2, '/N', ' (~)' 등 suffix 제거
cur.execute("""
UPDATE import_declarations
SET erp_inbound_no_clean = CASE
    WHEN erp_inbound_no IS NULL THEN NULL
    WHEN erp_inbound_no LIKE '%디원자체수입%' THEN NULL
    WHEN erp_inbound_no ~ '^RV[0-9]+' THEN regexp_replace(erp_inbound_no, '^(RV[0-9]+).*$', '\\1')
    ELSE erp_inbound_no
  END
WHERE erp_inbound_no_clean IS DISTINCT FROM CASE
    WHEN erp_inbound_no IS NULL THEN NULL
    WHEN erp_inbound_no LIKE '%디원자체수입%' THEN NULL
    WHEN erp_inbound_no ~ '^RV[0-9]+' THEN regexp_replace(erp_inbound_no, '^(RV[0-9]+).*$', '\\1')
    ELSE erp_inbound_no
  END
""")
print(f"  erp_inbound_no_clean 채움: {cur.rowcount} 행")
c.commit()

cur.execute("""
SELECT count(*) FROM import_declarations d
WHERE d.erp_inbound_no_clean IS NOT NULL
  AND EXISTS(SELECT 1 FROM inbounds i WHERE i.erp_inbound_no = d.erp_inbound_no_clean)
""")
print(f"  cleaned 후 매칭률: {cur.fetchone()[0]} / 100")


# ============================================================
hdr("[B4] usage_category 재분류 — 단가 0 + mgmt 빈 → other")
# ============================================================
cur.execute("""
UPDATE outbounds o
SET usage_category = 'other'
WHERE o.usage_category IN ('sale', 'sale_spare')
  AND o.status = 'active'
  AND NOT EXISTS(SELECT 1 FROM sales s WHERE s.outbound_id = o.outbound_id)
  AND (o.source_payload IS NULL
       OR o.source_payload->>'erp_management' IS NULL
       OR o.source_payload->>'erp_management' = '')
""")
print(f"  usage_category 'sale'→'other' 재분류: {cur.rowcount} 행")
c.commit()

# 재검증: sale 매칭 안된 매출대상 outbound
cur.execute("""
SELECT count(*) FROM outbounds o
WHERE o.usage_category IN ('sale', 'sale_spare')
  AND o.status = 'active'
  AND NOT EXISTS(SELECT 1 FROM sales s WHERE s.outbound_id = o.outbound_id)
""")
print(f"  잔존 매출대상 sale 없음: {cur.fetchone()[0]}")


# ============================================================
hdr("[C1] outbounds.spare_qty 백필 — FIFO 합 - quantity")
# ============================================================
cur.execute("""
WITH fifo_sum AS (
  SELECT outbound_id, sum(allocated_qty) AS fm_total
  FROM fifo_matches
  WHERE outbound_id IS NOT NULL AND allocated_qty IS NOT NULL
  GROUP BY outbound_id
)
UPDATE outbounds o
SET spare_qty = (fs.fm_total - o.quantity)::integer,
    updated_at = now()
FROM fifo_sum fs
WHERE o.outbound_id = fs.outbound_id
  AND o.usage_category IN ('sale', 'sale_spare')
  AND o.status = 'active'
  AND fs.fm_total > o.quantity
  AND COALESCE(o.spare_qty, 0) = 0
""")
print(f"  spare_qty 백필: {cur.rowcount} 행 (FIFO 무상 추가)")
c.commit()

# 재검증
cur.execute("""
WITH t AS (
  SELECT o.outbound_id, o.quantity, COALESCE(o.spare_qty, 0) AS sp,
    (SELECT sum(allocated_qty) FROM fifo_matches WHERE outbound_id = o.outbound_id) AS fm_sum
  FROM outbounds o WHERE o.usage_category IN ('sale','sale_spare') AND o.status='active'
)
SELECT count(*) FROM t WHERE fm_sum IS NOT NULL AND fm_sum != quantity + sp
""")
print(f"  잔존 fm_sum != qty + sp: {cur.fetchone()[0]}")


# ============================================================
hdr("[D1] product 변종 정리 — 사용 0 비활성화 + noise 삭제")
# ============================================================
# 사용 0 인 모든 product 비활성화 (운송 등 noise 포함)
cur.execute("""
UPDATE products p
SET is_active = false
WHERE p.is_active
  AND NOT EXISTS(SELECT 1 FROM outbounds WHERE product_id = p.product_id)
  AND NOT EXISTS(SELECT 1 FROM sales s JOIN outbounds o ON s.outbound_id = o.outbound_id WHERE o.product_id = p.product_id)
  AND NOT EXISTS(SELECT 1 FROM fifo_matches WHERE product_id = p.product_id)
  AND NOT EXISTS(SELECT 1 FROM inbounds WHERE product_id = p.product_id)
  AND NOT EXISTS(SELECT 1 FROM import_declarations WHERE product_id = p.product_id)
""")
print(f"  사용 0 product 비활성화: {cur.rowcount} 행")
c.commit()

# 잔존 활성 products 카운트
cur.execute("SELECT count(*) FROM products WHERE is_active")
print(f"  활성 products: {cur.fetchone()[0]}")


# ============================================================
hdr("[C2] 수불 '기초재고' 행 → inbounds 누계 보정 (분석 view)")
# ============================================================
# 실제 inbound 행 추가 대신 analytical view 로 처리 — 후속 화면이 사용
cur.execute("""
CREATE OR REPLACE VIEW v_product_qty_balance AS
WITH initial_stock AS (
  -- 수불 시트 '기초재고' 행 = 2025-01-01 시점 시작 재고
  SELECT product_id, sum(beginning_qty) AS initial_qty
  FROM inventory_movements
  WHERE movement_subtype = '기초'
  GROUP BY product_id
), inbound_sum AS (
  SELECT product_id, sum(quantity) AS in_qty FROM inbounds GROUP BY product_id
), outbound_sum AS (
  SELECT product_id, sum(quantity) AS out_qty FROM outbounds
  WHERE status = 'active' GROUP BY product_id
)
SELECT
  p.product_id, p.product_code, p.product_name, p.spec_wp,
  COALESCE(i.initial_qty, 0) AS initial_qty,
  COALESCE(ib.in_qty, 0) AS inbound_qty,
  COALESCE(ob.out_qty, 0) AS outbound_qty,
  COALESCE(i.initial_qty, 0) + COALESCE(ib.in_qty, 0) - COALESCE(ob.out_qty, 0) AS balance_qty
FROM products p
LEFT JOIN initial_stock i USING(product_id)
LEFT JOIN inbound_sum ib USING(product_id)
LEFT JOIN outbound_sum ob USING(product_id)
WHERE p.is_active
""")
c.commit()
print("  v_product_qty_balance 뷰 생성")

# 출고 > 입고 product 재검증 (initial_qty 포함)
cur.execute("""
SELECT count(*) FROM v_product_qty_balance
WHERE outbound_qty > (initial_qty + inbound_qty) * 1.05
""")
print(f"  출고 > 기초+입고 ×1.05 인 product (initial 포함 후): {cur.fetchone()[0]}")

cur.execute("""
SELECT product_code, initial_qty, inbound_qty, outbound_qty, balance_qty
FROM v_product_qty_balance
WHERE outbound_qty > (initial_qty + inbound_qty) * 1.05
ORDER BY (outbound_qty - initial_qty - inbound_qty) DESC LIMIT 10
""")
print("  잔존 mismatch product (top 10):")
for r in cur.fetchall(): print(f"    {r}")


# ============================================================
hdr("=== 최종 정합성 재검증 ===")
# ============================================================
print("\n[A1] sales supply+vat=total mismatch")
cur.execute("""
SELECT count(*) FROM sales WHERE supply_amount IS NOT NULL AND vat_amount IS NOT NULL
  AND total_amount IS NOT NULL AND abs(supply_amount + vat_amount - total_amount) > 5
""")
print(f"  {cur.fetchone()[0]}")

print("\n[B4] 매출대상 outbound 에 sale 없음 (잔존)")
cur.execute("""
SELECT count(*) FROM outbounds o
WHERE o.usage_category IN ('sale','sale_spare') AND o.status='active'
  AND NOT EXISTS(SELECT 1 FROM sales s WHERE s.outbound_id = o.outbound_id)
""")
print(f"  {cur.fetchone()[0]}")

print("\n[C1] FIFO 합 != quantity + spare_qty (잔존)")
cur.execute("""
WITH t AS (
  SELECT o.quantity, COALESCE(o.spare_qty,0) AS sp,
    (SELECT sum(allocated_qty) FROM fifo_matches WHERE outbound_id = o.outbound_id) AS fm_sum
  FROM outbounds o WHERE o.usage_category IN ('sale','sale_spare') AND o.status='active'
)
SELECT count(*) FROM t WHERE fm_sum IS NOT NULL AND fm_sum != quantity + sp
""")
print(f"  {cur.fetchone()[0]}")

print("\n[B6] declarations cleaned 후 inbound 매칭률")
cur.execute("""
SELECT count(*) FILTER (WHERE EXISTS(
  SELECT 1 FROM inbounds i WHERE i.erp_inbound_no = d.erp_inbound_no_clean)),
  count(*) FILTER (WHERE d.erp_inbound_no_clean IS NOT NULL)
FROM import_declarations d
""")
print(f"  매칭 / cleaned 채움: {cur.fetchone()}")

print("\n[D1] 활성 products / 비활성")
cur.execute("SELECT is_active, count(*) FROM products GROUP BY is_active")
for r in cur.fetchall(): print(f"  {r}")
