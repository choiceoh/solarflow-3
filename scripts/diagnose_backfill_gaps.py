"""광역 backfill 누락 진단 — 핵심 테이블의 주요 필드 채움률 점검."""
import os, psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL")
c = psycopg2.connect(DB_URL).cursor()


def hdr(t):
    print(f"\n=== {t} ===")


# 1. outbounds
hdr("outbounds — 핵심 필드 채움률")
c.execute("""
SELECT count(*) AS total,
  count(*) FILTER (WHERE capacity_kw IS NULL OR capacity_kw = 0) AS no_capacity,
  count(*) FILTER (WHERE site_name IS NULL OR site_name = '') AS no_site,
  count(*) FILTER (WHERE NOT EXISTS(SELECT 1 FROM outbound_bl_items obi WHERE obi.outbound_id = outbounds.outbound_id)) AS no_bl,
  count(*) FILTER (WHERE order_id IS NULL) AS no_order,
  count(*) FILTER (WHERE warehouse_id IS NULL) AS no_warehouse,
  count(*) FILTER (WHERE erp_outbound_no IS NULL) AS no_erp,
  count(*) FILTER (WHERE source_payload IS NULL) AS no_payload
FROM outbounds
""")
r = c.fetchone()
print(f"total={r[0]}, no_capacity={r[1]}, no_site={r[2]}, no_bl_link={r[3]}, no_order={r[4]}, no_warehouse={r[5]}, no_erp_no={r[6]}, no_payload={r[7]}")

# 2. sales
hdr("sales — 핵심 필드 채움률")
c.execute("""
SELECT count(*) AS total,
  count(*) FILTER (WHERE unit_price_wp IS NULL OR unit_price_wp = 0) AS no_wp,
  count(*) FILTER (WHERE supply_amount IS NULL OR supply_amount = 0) AS no_supply,
  count(*) FILTER (WHERE total_amount IS NULL OR total_amount = 0) AS no_total,
  count(*) FILTER (WHERE tax_invoice_date IS NULL) AS no_inv_date,
  count(*) FILTER (WHERE customer_id IS NULL) AS no_customer,
  count(*) FILTER (WHERE quantity IS NULL) AS no_qty,
  count(*) FILTER (WHERE capacity_kw IS NULL) AS no_kw,
  count(*) FILTER (WHERE outbound_id IS NULL AND order_id IS NULL) AS no_link
FROM sales
""")
r = c.fetchone()
print(f"total={r[0]}, no_wp={r[1]}, no_supply={r[2]}, no_total={r[3]}, no_inv_date={r[4]}, no_customer={r[5]}, no_qty={r[6]}, no_kw={r[7]}, no_link={r[8]}")

# 3. inbounds
hdr("inbounds — 핵심 필드 채움률")
c.execute("""
SELECT count(*) AS total,
  count(*) FILTER (WHERE supplier_partner_id IS NULL) AS no_supplier,
  count(*) FILTER (WHERE warehouse_id IS NULL) AS no_warehouse,
  count(*) FILTER (WHERE unit_price IS NULL OR unit_price = 0) AS no_unit_price,
  count(*) FILTER (WHERE total_amount IS NULL OR total_amount = 0) AS no_total,
  count(*) FILTER (WHERE capacity_kw IS NULL) AS no_kw,
  count(*) FILTER (WHERE currency IS NULL) AS no_currency
FROM inbounds
""")
r = c.fetchone()
print(f"total={r[0]}, no_supplier={r[1]}, no_warehouse={r[2]}, no_unit_price={r[3]}, no_total={r[4]}, no_kw={r[5]}, no_currency={r[6]}")

# 4. orders
hdr("orders — 핵심 필드 채움률")
c.execute("""
SELECT count(*) AS total,
  count(*) FILTER (WHERE customer_id IS NULL) AS no_customer,
  count(*) FILTER (WHERE product_id IS NULL) AS no_product,
  count(*) FILTER (WHERE quantity IS NULL OR quantity = 0) AS no_qty,
  count(*) FILTER (WHERE capacity_kw IS NULL OR capacity_kw = 0) AS no_kw,
  count(*) FILTER (WHERE unit_price_wp IS NULL OR unit_price_wp = 0) AS no_wp,
  count(*) FILTER (WHERE site_name IS NULL OR site_name = '') AS no_site,
  count(*) FILTER (WHERE source_payload->>'unit_price_estimated' = 'true') AS estimated_price
FROM orders
""")
r = c.fetchone()
print(f"total={r[0]}, no_customer={r[1]}, no_product={r[2]}, no_qty={r[3]}, no_kw={r[4]}, no_wp={r[5]}, no_site={r[6]}, est_price={r[7]}")

# 5. fifo_matches
hdr("fifo_matches — cross-link 채움률")
c.execute("""
SELECT count(*) AS total,
  count(*) FILTER (WHERE inbound_id IS NULL) AS no_inbound,
  count(*) FILTER (WHERE outbound_id IS NULL) AS no_outbound,
  count(*) FILTER (WHERE declaration_id IS NULL) AS no_declaration,
  count(*) FILTER (WHERE ea_unit_cost IS NULL OR ea_unit_cost = 0) AS no_cost,
  count(*) FILTER (WHERE sales_amount IS NULL OR sales_amount = 0) AS no_sale_amt,
  count(*) FILTER (WHERE profit_amount IS NULL) AS no_profit
FROM fifo_matches
""")
r = c.fetchone()
print(f"total={r[0]}, no_inbound={r[1]}, no_outbound={r[2]}, no_declaration={r[3]}, no_cost={r[4]}, no_sale_amt={r[5]}, no_profit={r[6]}")

# 6. products
hdr("products — 마스터 필드 채움률")
c.execute("""
SELECT count(*) AS total,
  count(*) FILTER (WHERE manufacturer_id IS NULL) AS no_manufacturer,
  count(*) FILTER (WHERE spec_wp IS NULL OR spec_wp = 0) AS no_spec_wp,
  count(*) FILTER (WHERE wattage_kw IS NULL OR wattage_kw = 0) AS no_wattage,
  count(*) FILTER (WHERE module_width_mm IS NULL OR module_width_mm = 0) AS no_width,
  count(*) FILTER (WHERE module_height_mm IS NULL OR module_height_mm = 0) AS no_height,
  count(*) FILTER (WHERE weight_kg IS NULL) AS no_weight,
  count(*) FILTER (WHERE safety_stock IS NULL OR safety_stock = 0) AS no_safety,
  count(*) FILTER (WHERE erp_code IS NULL) AS no_erp_code
FROM products
""")
r = c.fetchone()
print(f"total={r[0]}, no_manufacturer={r[1]}, no_spec_wp={r[2]}, no_wattage={r[3]}, no_width={r[4]}, no_height={r[5]}, no_weight={r[6]}, no_safety={r[7]}, no_erp_code={r[8]}")

# 7. partners
hdr("partners — 거래처 마스터")
c.execute("""
SELECT count(*) AS total,
  count(*) FILTER (WHERE partner_type IS NULL OR partner_type = 'unknown') AS unknown_type,
  count(*) FILTER (WHERE partner_type = 'customer') AS customer,
  count(*) FILTER (WHERE partner_type = 'supplier') AS supplier,
  count(*) FILTER (WHERE partner_type = 'both') AS both,
  count(*) FILTER (WHERE erp_code IS NULL) AS no_erp_code,
  count(*) FILTER (WHERE NOT is_active) AS inactive
FROM partners
""")
r = c.fetchone()
print(f"total={r[0]}, unknown_type={r[1]}, customer={r[2]}, supplier={r[3]}, both={r[4]}, no_erp_code={r[5]}, inactive={r[6]}")

# 8. import_declarations
hdr("import_declarations — 채움률")
c.execute("""
SELECT count(*) AS total,
  count(*) FILTER (WHERE product_id IS NULL) AS no_product,
  count(*) FILTER (WHERE supplier_name_kr IS NULL) AS no_supplier_kr,
  count(*) FILTER (WHERE cost_unit_price_wp IS NULL) AS no_cost_wp,
  count(*) FILTER (WHERE exchange_rate IS NULL) AS no_rate,
  count(*) FILTER (WHERE bl_id IS NULL) AS no_bl,
  count(*) FILTER (WHERE source_payload IS NULL) AS no_payload
FROM import_declarations
""")
r = c.fetchone()
print(f"total={r[0]}, no_product={r[1]}, no_supplier_kr={r[2]}, no_cost_wp={r[3]}, no_rate={r[4]}, no_bl={r[5]}, no_payload={r[6]}")

# 9. bl_shipments
hdr("bl_shipments — 채움률")
c.execute("""
SELECT count(*) AS total,
  count(*) FILTER (WHERE manufacturer_id IS NULL) AS no_manufacturer,
  count(*) FILTER (WHERE exchange_rate IS NULL) AS no_rate,
  count(*) FILTER (WHERE actual_arrival IS NULL) AS no_arrival,
  count(*) FILTER (WHERE port IS NULL) AS no_port,
  count(*) FILTER (WHERE invoice_number IS NULL) AS no_invoice,
  count(*) FILTER (WHERE warehouse_id IS NULL) AS no_warehouse
FROM bl_shipments
""")
r = c.fetchone()
print(f"total={r[0]}, no_manufacturer={r[1]}, no_rate={r[2]}, no_arrival={r[3]}, no_port={r[4]}, no_invoice={r[5]}, no_warehouse={r[6]}")

# 10. inventory_movements & inventory_snapshots — 시계열
hdr("inventory_movements / inventory_snapshots")
c.execute("SELECT count(*) FROM inventory_movements")
print(f"inventory_movements total={c.fetchone()[0]}")
c.execute("SELECT count(*) FROM inventory_snapshots")
print(f"inventory_snapshots total={c.fetchone()[0]}")
