"""ERP backfill 후 데이터 정합성 광역 분석.

검증 카테고리 (D-064):
A. 산식 정합성 — 한 행 안에서 컬럼 사이 산식 (supply+vat=total, qty×spec×wp=금액 등)
B. cross-table 매칭 — orphan FK, 누락된 cross-link
C. 합계 정합성 — 한 outbound 의 fifo allocated 합 = outbound.quantity 등
D. 마스터 중복/변종 — 같은 모듈의 product_code 변종, 거래처 alias 미정리
E. 시계열 LEDGER 정합성 — beginning + in - out = ending
"""
import os, psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL")
c = psycopg2.connect(DB_URL).cursor()


def hdr(t):
    print(f"\n{'='*60}\n{t}\n{'='*60}")


# ============================================================
# A. 산식 정합성 — 한 행 안에서
# ============================================================
hdr("A. 산식 정합성")

print("\n[A1] sales: supply + vat ≈ total (오차 5원 초과)")
c.execute("""
SELECT count(*) FROM sales
WHERE supply_amount IS NOT NULL AND vat_amount IS NOT NULL AND total_amount IS NOT NULL
  AND abs(supply_amount + vat_amount - total_amount) > 5
""")
print(f"  vat 합 mismatch: {c.fetchone()[0]} 행")

print("\n[A2] sales: unit_price_wp × spec_wp × qty ≈ supply (오차 1% 초과)")
c.execute("""
SELECT count(*) FROM sales s
JOIN outbounds o ON s.outbound_id = o.outbound_id
JOIN products p ON o.product_id = p.product_id
WHERE s.unit_price_wp > 0 AND s.supply_amount > 0 AND s.quantity > 0
  AND p.spec_wp > 0
  AND abs(s.unit_price_wp * p.spec_wp * s.quantity - s.supply_amount)
      / GREATEST(s.supply_amount, 1) > 0.01
""")
print(f"  단가/수량/금액 mismatch: {c.fetchone()[0]} 행")

print("\n[A3] inbounds: unit_price × qty ≈ total_amount")
c.execute("""
SELECT count(*) FROM inbounds
WHERE unit_price > 0 AND total_amount > 0 AND quantity > 0
  AND abs(unit_price * quantity - total_amount) / GREATEST(total_amount, 1) > 0.01
""")
print(f"  inbound 단가×수량 mismatch: {c.fetchone()[0]} 행")

print("\n[A4] fifo_matches: cost + profit ≈ sales_amount")
c.execute("""
SELECT count(*) FROM fifo_matches
WHERE cost_amount IS NOT NULL AND profit_amount IS NOT NULL AND sales_amount IS NOT NULL
  AND sales_amount > 0
  AND abs(cost_amount + profit_amount - sales_amount) / GREATEST(sales_amount, 1) > 0.01
""")
print(f"  fifo cost+profit≠sales: {c.fetchone()[0]} 행")

print("\n[A5] outbounds: capacity_kw ≈ qty × spec_wp / 1000 (오차 0.5%)")
c.execute("""
SELECT count(*) FROM outbounds o JOIN products p ON o.product_id = p.product_id
WHERE o.capacity_kw > 0 AND o.quantity > 0 AND p.spec_wp > 0
  AND abs(o.capacity_kw - o.quantity * p.spec_wp / 1000.0) / o.capacity_kw > 0.005
""")
print(f"  outbound capacity_kw mismatch: {c.fetchone()[0]} 행")

# ============================================================
# B. Cross-table 매칭 / orphan
# ============================================================
hdr("B. Cross-table 매칭 / orphan")

print("\n[B1] fifo_matches.outbound_id orphan (outbounds 에 없는 참조)")
c.execute("""
SELECT count(*) FROM fifo_matches fm
WHERE fm.outbound_id IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM outbounds o WHERE o.outbound_id = fm.outbound_id)
""")
print(f"  orphan outbound_id: {c.fetchone()[0]} (FK on delete set null 으로 자동 NULL 됐어야)")

print("\n[B2] fifo_matches.inbound_id orphan")
c.execute("""
SELECT count(*) FROM fifo_matches fm
WHERE fm.inbound_id IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM inbounds i WHERE i.inbound_id = fm.inbound_id)
""")
print(f"  orphan inbound_id: {c.fetchone()[0]}")

print("\n[B3] sales.outbound_id orphan (이전 1976 sales 모두 outbound_id 있다고 했음)")
c.execute("""
SELECT count(*) FROM sales s
WHERE s.outbound_id IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM outbounds o WHERE o.outbound_id = s.outbound_id)
""")
print(f"  orphan sales.outbound_id: {c.fetchone()[0]}")

print("\n[B4] outbounds 매출대상 (usage in sale/sale_spare) 중 sale 연결 안 된 행")
c.execute("""
SELECT count(*) FROM outbounds o
WHERE o.usage_category IN ('sale', 'sale_spare')
  AND o.status = 'active'
  AND NOT EXISTS(SELECT 1 FROM sales s WHERE s.outbound_id = o.outbound_id)
""")
print(f"  매출대상인데 sale 없는 outbound: {c.fetchone()[0]}")

print("\n[B5] inbounds 의 erp_inbound_no 가 fifo_matches.erp_inbound_no 와 매칭률")
c.execute("""
SELECT count(DISTINCT i.erp_inbound_no) AS inb_unique,
  count(DISTINCT i.erp_inbound_no) FILTER (WHERE EXISTS(
    SELECT 1 FROM fifo_matches fm WHERE fm.erp_inbound_no = i.erp_inbound_no
  )) AS matched_by_fifo
FROM inbounds i WHERE i.erp_inbound_no IS NOT NULL
""")
r = c.fetchone()
print(f"  inbounds erp_inbound_no UNIQUE: {r[0]}, fifo 와 매칭: {r[1]} ({r[1]*100//r[0] if r[0] else 0}%)")

print("\n[B6] declarations.erp_inbound_no vs inbounds — 면장 ↔ 입고")
c.execute("""
SELECT count(*) FROM import_declarations d WHERE d.erp_inbound_no IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM inbounds i WHERE i.erp_inbound_no = d.erp_inbound_no)
""")
print(f"  declaration.erp_inbound_no 가 inbounds 에 없는 행: {c.fetchone()[0]}")

# ============================================================
# C. 합계 정합성
# ============================================================
hdr("C. 합계 정합성")

print("\n[C1] outbound 1건의 fifo_matches.allocated_qty 합 vs outbound.quantity")
c.execute("""
SELECT count(*) FROM (
  SELECT o.outbound_id, o.quantity AS out_qty,
    (SELECT sum(allocated_qty) FROM fifo_matches WHERE outbound_id = o.outbound_id) AS fm_sum
  FROM outbounds o
  WHERE o.usage_category IN ('sale', 'sale_spare') AND o.status = 'active'
) t
WHERE fm_sum IS NOT NULL AND fm_sum != out_qty
""")
print(f"  fifo allocated 합 ≠ outbound 수량: {c.fetchone()[0]} (출고)")

print("\n[C2] product 별 inbound 누계 vs outbound 누계 (음수 잔량 이상)")
c.execute("""
WITH inb AS (
  SELECT product_id, sum(quantity) AS in_qty FROM inbounds GROUP BY product_id
), outb AS (
  SELECT product_id, sum(quantity) AS out_qty FROM outbounds
  WHERE status = 'active' GROUP BY product_id
)
SELECT count(*) FROM inb LEFT JOIN outb USING(product_id)
WHERE COALESCE(out_qty, 0) > COALESCE(in_qty, 0) * 1.05
""")
print(f"  출고 > 입고 ×1.05 인 product: {c.fetchone()[0]}")

print("\n[C3] declarations.paid_qty + free_qty = quantity")
c.execute("""
SELECT count(*) FROM import_declarations
WHERE paid_qty IS NOT NULL AND free_qty IS NOT NULL AND quantity IS NOT NULL
  AND paid_qty + free_qty != quantity
""")
print(f"  유상+무상 ≠ 총수량: {c.fetchone()[0]} 면장")

# ============================================================
# D. 마스터 중복/변종
# ============================================================
hdr("D. 마스터 중복/변종")

print("\n[D1] products: 같은 spec_wp 의 product_code 변종 (Top 10)")
c.execute("""
SELECT spec_wp, count(*), array_agg(product_code ORDER BY product_code) AS codes
FROM products
WHERE spec_wp > 0 AND is_active
GROUP BY spec_wp
HAVING count(*) > 1
ORDER BY count(*) DESC LIMIT 10
""")
for r in c.fetchall():
    print(f"  {r[0]}Wp: {r[1]}개 — {r[2][:5]}{'...' if r[1] > 5 else ''}")

print("\n[D2] partners: 정규화된 이름 중복 그룹")
c.execute("""
SELECT lower(replace(replace(replace(partner_name, '(주)', ''), '㈜', ''), ' ', '')) AS norm,
  count(*), array_agg(partner_name) AS names
FROM partners
GROUP BY norm
HAVING count(*) > 1
ORDER BY count(*) DESC LIMIT 10
""")
for r in c.fetchall():
    print(f"  {r[0]:.<25} {r[1]}개 — {r[2]}")

print("\n[D3] 같은 customer 가 여러 partner_id 로 sales 에 등장")
c.execute("""
WITH groups AS (
  SELECT lower(replace(replace(replace(p.partner_name, '(주)', ''), '㈜', ''), ' ', '')) AS norm,
    array_agg(DISTINCT s.customer_id) AS pids
  FROM sales s JOIN partners p ON s.customer_id = p.partner_id
  GROUP BY norm
)
SELECT count(*) FROM groups WHERE array_length(pids, 1) > 1
""")
print(f"  같은 거래처명인데 여러 partner_id 인 sales 그룹: {c.fetchone()[0]}")

# ============================================================
# E. 시계열 LEDGER 정합성
# ============================================================
hdr("E. 시계열 LEDGER 정합성")

print("\n[E1] inventory_movements: beginning + inbound - outbound = ending (행 단위)")
c.execute("""
SELECT count(*) FROM inventory_movements
WHERE beginning_qty IS NOT NULL AND ending_qty IS NOT NULL
  AND COALESCE(beginning_qty,0) + COALESCE(inbound_qty,0) - COALESCE(outbound_qty,0)
      != ending_qty
""")
print(f"  ledger 산식 mismatch: {c.fetchone()[0]} 행")

print("\n[E2] inventory_snapshots: 같은 product 의 (snapshot 누적) vs (movements 누적)")
c.execute("""
SELECT count(*) FROM (
  SELECT s.product_id, s.ending_qty AS snap_end,
    (SELECT max(im.ending_qty) FROM inventory_movements im
     WHERE im.product_id = s.product_id AND im.movement_date <= s.snapshot_date) AS mv_end
  FROM inventory_snapshots s
) t
WHERE snap_end IS NOT NULL AND mv_end IS NOT NULL AND snap_end != mv_end
""")
print(f"  snapshot vs movement 끝수량 불일치: {c.fetchone()[0]}")

# ============================================================
# F. 수입원가 정합성
# ============================================================
hdr("F. 수입원가 정합성")

print("\n[F1] declarations: cost_unit_price_wp × spec_wp × quantity ≈ paid_cif_krw")
c.execute("""
SELECT count(*) FROM import_declarations d JOIN products p ON d.product_id = p.product_id
WHERE d.cost_unit_price_wp > 0 AND d.paid_cif_krw > 0 AND d.paid_qty > 0 AND p.spec_wp > 0
  AND abs(d.cost_unit_price_wp * p.spec_wp * d.paid_qty - d.paid_cif_krw)
      / GREATEST(d.paid_cif_krw, 1) > 0.05
""")
print(f"  cost_wp × paid_qty mismatch (5% 초과): {c.fetchone()[0]} 면장")

print("\n[F2] cif_krw + customs + vat = total_landed (확인용)")
c.execute("""
SELECT count(*) FROM import_declarations
WHERE cif_krw > 0 AND customs_amount IS NOT NULL AND vat_amount IS NOT NULL
""")
print(f"  cif/customs/vat 모두 채움: {c.fetchone()[0]} / 100 면장")
