"""미세 4건 정합성 행별 상세 분석."""
import os, psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL")
c = psycopg2.connect(DB_URL).cursor()

print("="*70)
print("[3] declarations: paid+free ≠ qty — 2건 + 다른 100건 패턴 확인")
print("="*70)
print("\n  미스매치 2건:")
c.execute("""
SELECT declaration_number, quantity, paid_qty, free_qty, paid_qty+free_qty AS sum,
  source_payload->>'erp_qty' AS erp_qty,
  source_payload->>'erp_paid_qty' AS erp_paid,
  source_payload->>'erp_free_qty' AS erp_free
FROM import_declarations
WHERE paid_qty IS NOT NULL AND free_qty IS NOT NULL AND quantity IS NOT NULL
  AND paid_qty + free_qty != quantity
""")
for r in c.fetchall(): print(f"    {r}")

print("\n  매칭하는 다른 100건 패턴 — quantity = paid (free=0?) vs quantity = paid+free?")
c.execute("""
SELECT
  count(*) FILTER (WHERE quantity = paid_qty AND free_qty = 0) AS paid_only,
  count(*) FILTER (WHERE quantity = paid_qty + free_qty AND free_qty > 0) AS sum_eq,
  count(*) FILTER (WHERE quantity = paid_qty AND free_qty > 0) AS qty_eq_paid_with_free,
  count(*) AS total
FROM import_declarations WHERE paid_qty IS NOT NULL
""")
print(f"    {c.fetchone()}")

print()
print("="*70)
print("[F1] declarations: cost_wp×spec×paid_qty ≠ paid_cif (5%) — 1건")
print("="*70)
c.execute("""
SELECT d.declaration_number, p.product_code, p.spec_wp,
  d.paid_qty, d.cost_unit_price_wp, d.paid_cif_krw,
  d.cost_unit_price_wp * p.spec_wp * d.paid_qty AS expected,
  abs(d.cost_unit_price_wp * p.spec_wp * d.paid_qty - d.paid_cif_krw) /
    GREATEST(d.paid_cif_krw, 1) * 100 AS pct
FROM import_declarations d JOIN products p ON d.product_id = p.product_id
WHERE d.cost_unit_price_wp > 0 AND d.paid_cif_krw > 0 AND d.paid_qty > 0 AND p.spec_wp > 0
  AND abs(d.cost_unit_price_wp * p.spec_wp * d.paid_qty - d.paid_cif_krw)
      / GREATEST(d.paid_cif_krw, 1) > 0.05
""")
for r in c.fetchall(): print(f"  {r}")

print()
print("="*70)
print("[A2] sales: unit_price_wp × spec × qty ≠ supply (1%) — 1건")
print("="*70)
c.execute("""
SELECT s.erp_sales_no, s.erp_line_no, p.product_code, p.spec_wp,
  s.quantity, s.unit_price_wp, s.unit_price_ea, s.supply_amount,
  s.unit_price_wp * p.spec_wp * s.quantity AS expected,
  s.source_payload->>'erp_unit_price' AS erp_unit,
  s.source_payload->>'erp_supply' AS erp_supply
FROM sales s JOIN outbounds o ON s.outbound_id = o.outbound_id
JOIN products p ON o.product_id = p.product_id
WHERE s.unit_price_wp > 0 AND s.supply_amount > 0 AND s.quantity > 0 AND p.spec_wp > 0
  AND abs(s.unit_price_wp * p.spec_wp * s.quantity - s.supply_amount)
      / GREATEST(s.supply_amount, 1) > 0.01
""")
for r in c.fetchall(): print(f"  {r}")

print()
print("="*70)
print("[A3] inbounds: unit_price × qty ≠ supply_amount (공급가, 1%) — 1건")
print("="*70)
c.execute("""
SELECT inbound_date, erp_inbound_no, currency, quantity, unit_price, supply_amount,
  unit_price * quantity AS expected,
  source_payload->>'erp_unit_price' AS erp_unit,
  source_payload->>'erp_supply' AS erp_supply,
  source_payload->>'erp_applied_avg_price' AS erp_avg_price
FROM inbounds
WHERE unit_price > 0 AND supply_amount > 0 AND quantity > 0
  AND abs(unit_price * quantity - supply_amount) / GREATEST(supply_amount, 1) > 0.01
""")
for r in c.fetchall(): print(f"  {r}")
