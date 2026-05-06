"""정합성 7개 문제 심층 분석 — C1/E2/D1/A3/B4/B6/C2."""
import os, psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL")
c = psycopg2.connect(DB_URL).cursor()


def hdr(t):
    print(f"\n{'='*70}\n{t}\n{'='*70}")


# ============================================================
hdr("[C1] 602 출고: FIFO allocated 합 ≠ outbound.quantity — 패턴 분석")
# ============================================================

print("\n[C1-a] 차이의 방향과 크기 분포")
c.execute("""
WITH t AS (
  SELECT o.outbound_id, o.quantity AS out_qty, o.usage_category, o.spare_qty,
    (SELECT sum(allocated_qty) FROM fifo_matches WHERE outbound_id = o.outbound_id) AS fm_sum
  FROM outbounds o
  WHERE o.usage_category IN ('sale', 'sale_spare') AND o.status = 'active'
)
SELECT
  count(*) FILTER (WHERE fm_sum < out_qty) AS fm_lt,
  count(*) FILTER (WHERE fm_sum > out_qty) AS fm_gt,
  count(*) FILTER (WHERE fm_sum IS NULL) AS no_fm,
  round(avg(out_qty - fm_sum) FILTER (WHERE fm_sum IS NOT NULL)::numeric, 2) AS avg_diff
FROM t WHERE fm_sum IS NOT NULL AND fm_sum != out_qty
""")
print(c.fetchone())

print("\n[C1-b] usage_category 별 mismatch 분포")
c.execute("""
WITH t AS (
  SELECT o.outbound_id, o.quantity AS out_qty, o.usage_category, o.spare_qty,
    (SELECT sum(allocated_qty) FROM fifo_matches WHERE outbound_id = o.outbound_id) AS fm_sum
  FROM outbounds o
  WHERE o.usage_category IN ('sale', 'sale_spare') AND o.status = 'active'
)
SELECT usage_category, count(*) FROM t WHERE fm_sum != out_qty GROUP BY usage_category
""")
for r in c.fetchall(): print(f"  {r[0]}: {r[1]}")

print("\n[C1-c] spare_qty 가 차이를 설명하는가? (out_qty + spare_qty = fm_sum?)")
c.execute("""
WITH t AS (
  SELECT o.outbound_id, o.quantity AS out_qty, COALESCE(o.spare_qty, 0) AS sp,
    (SELECT sum(allocated_qty) FROM fifo_matches WHERE outbound_id = o.outbound_id) AS fm_sum
  FROM outbounds o
  WHERE o.usage_category IN ('sale', 'sale_spare') AND o.status = 'active'
)
SELECT
  count(*) FILTER (WHERE fm_sum = out_qty + sp) AS eq_with_spare,
  count(*) FILTER (WHERE fm_sum = out_qty) AS eq_clean,
  count(*) FILTER (WHERE fm_sum != out_qty AND fm_sum != out_qty + sp) AS unexplained
FROM t WHERE fm_sum IS NOT NULL
""")
print(c.fetchone())

print("\n[C1-d] sample mismatch 행 5건")
c.execute("""
WITH t AS (
  SELECT o.outbound_id, o.outbound_date, o.quantity AS out_qty,
    o.usage_category, COALESCE(o.spare_qty, 0) AS sp, o.erp_outbound_no,
    (SELECT sum(allocated_qty) FROM fifo_matches WHERE outbound_id = o.outbound_id) AS fm_sum,
    (SELECT count(*) FROM fifo_matches WHERE outbound_id = o.outbound_id) AS fm_n
  FROM outbounds o
  WHERE o.usage_category IN ('sale', 'sale_spare') AND o.status = 'active'
)
SELECT outbound_date, erp_outbound_no, usage_category, out_qty, sp, fm_sum, fm_n
FROM t WHERE fm_sum != out_qty AND fm_sum IS NOT NULL
ORDER BY outbound_date LIMIT 5
""")
for r in c.fetchall(): print(f"  {r}")


# ============================================================
hdr("[E2] snapshot 44 vs movement 끝수량 불일치 — 어느 product")
# ============================================================
print("\n[E2-a] 불일치 product 와 차이 크기")
c.execute("""
SELECT s.product_id, p.product_code,
  s.snapshot_date, s.ending_qty AS snap,
  (SELECT max(im.ending_qty) FROM inventory_movements im
   WHERE im.product_id = s.product_id AND im.movement_date <= s.snapshot_date) AS mv,
  (s.ending_qty - (SELECT max(im.ending_qty) FROM inventory_movements im
   WHERE im.product_id = s.product_id AND im.movement_date <= s.snapshot_date)) AS diff
FROM inventory_snapshots s LEFT JOIN products p ON s.product_id = p.product_id
WHERE s.ending_qty IS NOT NULL
ORDER BY abs(s.ending_qty - COALESCE((SELECT max(im.ending_qty) FROM inventory_movements im
   WHERE im.product_id = s.product_id AND im.movement_date <= s.snapshot_date), 0)) DESC NULLS LAST
LIMIT 10
""")
for r in c.fetchall(): print(f"  {r}")


# ============================================================
hdr("[D1] product 변종 — 각 변종의 sales/outbounds 행수")
# ============================================================
print("\n[D1-a] 640Wp 12개 변종 — 사용량")
c.execute("""
SELECT p.product_code, p.manufacturer_id,
  (SELECT count(*) FROM outbounds WHERE product_id = p.product_id) AS ob_n,
  (SELECT count(*) FROM sales s JOIN outbounds o ON s.outbound_id=o.outbound_id WHERE o.product_id = p.product_id) AS sale_n,
  (SELECT count(*) FROM fifo_matches WHERE product_id = p.product_id) AS fm_n,
  (SELECT count(*) FROM inbounds WHERE product_id = p.product_id) AS in_n
FROM products p
WHERE p.spec_wp = 640 AND p.is_active
ORDER BY ob_n DESC
""")
for r in c.fetchall(): print(f"  {r}")

print("\n[D1-b] 720Wp 4개 변종 (TSM-720NEG21C.20 vs .20K)")
c.execute("""
SELECT p.product_code, p.manufacturer_id,
  (SELECT count(*) FROM outbounds WHERE product_id = p.product_id) AS ob_n,
  (SELECT count(*) FROM sales s JOIN outbounds o ON s.outbound_id=o.outbound_id WHERE o.product_id = p.product_id) AS sale_n,
  (SELECT count(*) FROM fifo_matches WHERE product_id = p.product_id) AS fm_n,
  (SELECT count(*) FROM inbounds WHERE product_id = p.product_id) AS in_n,
  p.erp_code
FROM products p
WHERE p.spec_wp = 720 AND p.is_active
ORDER BY ob_n DESC
""")
for r in c.fetchall(): print(f"  {r}")

print("\n[D1-c] 635Wp 5개 변종")
c.execute("""
SELECT p.product_code, p.manufacturer_id,
  (SELECT count(*) FROM outbounds WHERE product_id = p.product_id) AS ob_n,
  (SELECT count(*) FROM sales s JOIN outbounds o ON s.outbound_id=o.outbound_id WHERE o.product_id = p.product_id) AS sale_n,
  (SELECT count(*) FROM fifo_matches WHERE product_id = p.product_id) AS fm_n,
  (SELECT count(*) FROM inbounds WHERE product_id = p.product_id) AS in_n,
  p.erp_code
FROM products p
WHERE p.spec_wp = 635 AND p.is_active
ORDER BY ob_n DESC
""")
for r in c.fetchall(): print(f"  {r}")

print("\n[D1-d] 사용 0인 변종 (정리 후보)")
c.execute("""
SELECT p.spec_wp, p.product_code, p.erp_code
FROM products p
WHERE p.is_active
  AND NOT EXISTS(SELECT 1 FROM outbounds WHERE product_id = p.product_id)
  AND NOT EXISTS(SELECT 1 FROM sales s JOIN outbounds o ON s.outbound_id=o.outbound_id WHERE o.product_id = p.product_id)
  AND NOT EXISTS(SELECT 1 FROM fifo_matches WHERE product_id = p.product_id)
  AND NOT EXISTS(SELECT 1 FROM inbounds WHERE product_id = p.product_id)
ORDER BY p.spec_wp, p.product_code LIMIT 30
""")
for r in c.fetchall(): print(f"  {r}")


# ============================================================
hdr("[A3] inbounds 31 단가×수량 ≠ total_amount — 패턴")
# ============================================================
print("\n[A3-a] mismatch 차이의 분포")
c.execute("""
SELECT count(*) AS rows,
  round(avg(abs(unit_price * quantity - total_amount))::numeric, 2) AS avg_abs_diff,
  round(avg(abs(unit_price * quantity - total_amount) / GREATEST(total_amount, 1) * 100)::numeric, 2) AS avg_pct_diff
FROM inbounds
WHERE unit_price > 0 AND total_amount > 0
  AND abs(unit_price * quantity - total_amount) / GREATEST(total_amount, 1) > 0.01
""")
print(c.fetchone())

print("\n[A3-b] sample 5건 — 외화 환산 또는 부가세 포함 여부?")
c.execute("""
SELECT inbound_date, currency, quantity, unit_price, supply_amount, vat_amount, total_amount,
  source_payload->>'erp_supply' AS erp_supply,
  source_payload->>'erp_total' AS erp_total
FROM inbounds
WHERE unit_price > 0 AND total_amount > 0
  AND abs(unit_price * quantity - total_amount) / GREATEST(total_amount, 1) > 0.01
ORDER BY inbound_date LIMIT 5
""")
for r in c.fetchall(): print(f"  {r}")


# ============================================================
hdr("[B4] 24 매출대상 outbound 에 sale 없음 — 어떤 케이스")
# ============================================================
print("\n[B4-a] 월별/관리구분 분포")
c.execute("""
SELECT to_char(o.outbound_date, 'YYYY-MM') AS m, o.usage_category, count(*) AS n
FROM outbounds o
WHERE o.usage_category IN ('sale', 'sale_spare')
  AND o.status = 'active'
  AND NOT EXISTS(SELECT 1 FROM sales s WHERE s.outbound_id = o.outbound_id)
GROUP BY m, o.usage_category ORDER BY m
""")
for r in c.fetchall(): print(f"  {r}")

print("\n[B4-b] sample 5건 — 매출 시트에 같은 자연키가 있는지 (날짜+품번+수량)")
c.execute("""
SELECT o.outbound_date, o.erp_outbound_no, o.usage_category, o.quantity, p.product_code,
  (SELECT count(*) FROM sales s JOIN outbounds o2 ON s.outbound_id = o2.outbound_id
   WHERE o2.outbound_date = o.outbound_date AND o2.product_id = o.product_id
     AND o2.quantity = o.quantity AND s.unit_price_wp > 0) AS sale_candidates
FROM outbounds o JOIN products p ON o.product_id = p.product_id
WHERE o.usage_category IN ('sale', 'sale_spare') AND o.status = 'active'
  AND NOT EXISTS(SELECT 1 FROM sales s WHERE s.outbound_id = o.outbound_id)
ORDER BY o.outbound_date LIMIT 8
""")
for r in c.fetchall(): print(f"  {r}")


# ============================================================
hdr("[B6] 30 declaration.erp_inbound_no — inbounds 에 없는 케이스")
# ============================================================
print("\n[B6-a] sample 10건")
c.execute("""
SELECT d.declaration_number, d.erp_inbound_no, d.declaration_date, p.product_code, d.quantity,
  (SELECT array_agg(DISTINCT i.erp_inbound_no)
   FROM inbounds i WHERE i.product_id = d.product_id
     AND i.inbound_date BETWEEN d.declaration_date - INTERVAL '60 days' AND d.declaration_date + INTERVAL '60 days') AS nearby_inbounds
FROM import_declarations d LEFT JOIN products p ON d.product_id = p.product_id
WHERE d.erp_inbound_no IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM inbounds i WHERE i.erp_inbound_no = d.erp_inbound_no)
ORDER BY d.declaration_date LIMIT 10
""")
for r in c.fetchall(): print(f"  {r}")


# ============================================================
hdr("[C2] 2 product 출고 > 입고 ×1.05 — 어느 product")
# ============================================================
print("\n[C2-a] 어떤 product")
c.execute("""
WITH inb AS (
  SELECT product_id, sum(quantity) AS in_qty FROM inbounds GROUP BY product_id
), outb AS (
  SELECT product_id, sum(quantity) AS out_qty FROM outbounds
  WHERE status = 'active' GROUP BY product_id
)
SELECT p.product_code, p.spec_wp, COALESCE(inb.in_qty, 0) AS in_qty, outb.out_qty,
  outb.out_qty - COALESCE(inb.in_qty, 0) AS gap
FROM outb LEFT JOIN inb USING(product_id) LEFT JOIN products p USING(product_id)
WHERE COALESCE(outb.out_qty, 0) > COALESCE(inb.in_qty, 0) * 1.05
ORDER BY gap DESC
""")
for r in c.fetchall(): print(f"  {r}")
